/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * A place to play. Each example is a query built with the DSL. Running this file prints, for every
 * example, the ES|QL it compiles to, whether it checks, the elaborated Core with a type on every
 * expression, and what is known about the columns it reads. Edit the examples and run:
 *
 *   node scripts/jest.js --config src/platform/packages/shared/esql/kbn_esql_dsl/jest.config.js \
 *     src/platform/packages/shared/esql/kbn_esql_dsl/src/playground.test.ts --runInBand
 */
import {
  add,
  typecheck,
  avg,
  compile,
  count,
  desc,
  eq,
  from,
  gt,
  lit,
  max,
  param,
  Print,
  sum,
} from '.';
import type { TypecheckOptions, QueryAst } from '.';
import { candidates } from './elaboration/solve/guidance';
import { standardLibrary } from './core/polymorphism/standard/standard';

interface Doc {
  '@timestamp': 'date';
  'host.name': 'keyword';
  message: 'text';
  bytes: 'long';
  risk: 'double';
  status: 'integer';
}

const schema = {
  '@timestamp': 'date',
  'host.name': 'keyword',
  message: 'text',
  bytes: 'long',
  risk: 'double',
  status: 'integer',
} as const;

interface Example {
  readonly title: string;
  readonly ast: QueryAst;
  readonly options?: TypecheckOptions;
}

const examples: readonly Example[] = [
  {
    title: 'A typed query: every type is known',
    ast: from<Doc>('logs-*')
      .where((c) => gt(c.bytes, lit.long(1024)))
      .stats(
        (c) => ({ total: sum(c.bytes), worst: max(c.risk), n: count(c.status) }),
        (c) => ({ host: c['host.name'] })
      )
      .sort((c) => [desc(c.total)])
      .limit(10).ast,
    options: { schema },
  },
  {
    title:
      'The same idea with no schema: the types of the columns are inferred from how they are used',
    ast: from('logs-*')
      .where((c) => gt(c.bytes, lit.long(1024)))
      .stats((c) => ({ total: sum(c.bytes), mean: avg(c.risk) })).ast,
  },
  {
    title: 'Date arithmetic with a parameter: add takes a date and a time quantity',
    ast: from<Doc>('logs-*')
      .eval('later', (c) => add(c['@timestamp'], param('window', 'time_duration')))
      .keep('later', 'host.name').ast,
    options: { schema },
  },
  {
    title: 'A mistake with a schema: summing a keyword column',
    ast: from('logs-*').stats((c) => ({ total: sum(c['host.name']) })).ast,
    options: { schema },
  },
  {
    title: 'The same mistake with no schema: not an error yet, only guidance',
    ast: from('logs-*')
      .where((c) => eq(c.host, lit.str('a')))
      .stats((c) => ({ total: sum(c.host) })).ast,
  },
];

const describeExample = ({ title, ast, options }: Example): string => {
  const analysis = typecheck(ast, options);
  const explain = (type: Parameters<typeof candidates>[2]) => {
    const types = candidates(standardLibrary, analysis.solution, type);
    const shown = types.map(Print.esqlType).join(', ');
    return type.tag === 'meta' ? `?${type.meta} could be {${shown}}` : shown;
  };
  return [
    `==== ${title}`,
    '',
    compile(analysis.core).print('pipe-multiline'),
    '',
    analysis.ok
      ? 'checks: ok'
      : [
          'problems:',
          ...analysis.diagnostics.map((d) => `  ${d.location.path}: ${d.message}`),
        ].join('\n'),
    '',
    'columns read:',
    ...(analysis.required.size === 0 ? ['  none that the checker had to infer'] : []),
    ...[...analysis.required].map(
      ([name, types]) =>
        `  ${name}: ${
          types.length === 1
            ? Print.esqlType(types[0])
            : `{${types.map(Print.esqlType).join(', ')}}`
        }${types.length === 0 ? '  (nothing satisfies every use)' : ''}`
    ),
    '',
    `principal type: ${Print.principal(standardLibrary, analysis.principal)}`,
    '',
    'elaborated Core:',
    Print.core(analysis.core, analysis.solution, { explain }),
    '',
  ].join('\n');
};

describe('playground', () => {
  it('compiles and checks every example', () => {
    const output = examples.map(describeExample).join('\n');
    process.stdout.write(`\n${output}\n`);
    // the examples must at least compile to text the parser accepts
    examples.forEach((example) =>
      expect(compile(typecheck(example.ast, example.options).core).print('basic')).toContain('FROM')
    );
  });
});

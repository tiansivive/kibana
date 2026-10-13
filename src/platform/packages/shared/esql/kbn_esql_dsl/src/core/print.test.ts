/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { add, typecheck, desc, from, gt, lit, Print, sum } from '..';
import { standardLibrary } from './polymorphism/standard/standard';

interface Doc {
  bytes: 'long';
  risk: 'double';
}

describe('Print.core', () => {
  it('shows every expression with its type and every call with the instances it needed', () => {
    const q = from<Doc>('logs-*')
      .where((c) => gt(c.bytes, lit.long(100)))
      .eval('both', (c) => add(c.bytes, c.bytes))
      .stats((c) => ({ total: sum(c.bytes) }))
      .sort((c) => [desc(c.total)]);
    const a = typecheck(q.ast, { schema: { bytes: 'long', risk: 'double' } });
    expect(Print.core(a.core, a.solution, { library: standardLibrary })).toBe(
      [
        'FROM logs-*',
        'WHERE',
        '  greater_than : ES.boolean   [Comparable(ES.long, ES.long)]',
        '    col bytes : ES.long',
        '    lit 100 : ES.long',
        'EVAL both =',
        '  add : ES.long   [Arith(ES.long, ES.long, ES.long)]',
        '    col bytes : ES.long',
        '    col bytes : ES.long',
        'STATS',
        '  total =',
        '    sum : ES.long   [SignedNumeric(ES.long); Wide(ES.long, ES.long)]',
        '      col bytes : ES.long',
        'SORT',
        '  DESC',
        '    col total : ES.long',
      ].join('\n')
    );
  });

  it('shows a type that is not known yet as its meta, or as the explanation it is given', () => {
    const a = typecheck(from<Doc>('i').where((c) => gt(c.bytes, lit.long(1))).ast);
    expect(Print.core(a.core, a.solution)).toContain('col bytes : ?src:bytes');
    expect(
      Print.core(a.core, a.solution, { explain: (type) => `unknown(${JSON.stringify(type)})` })
    ).toContain('col bytes : unknown(');
  });
});

describe('Print.ty', () => {
  const signature = (name: string) => {
    const fn = standardLibrary.functions.get(name);
    return fn ? Print.ty(fn.type) : undefined;
  };

  it('shows a function type with its quantified variables and protocol facts', () => {
    expect(signature('sum')).toBe('forall a b. (SignedNumeric a, Wide a b) => a -> b');
    expect(signature('add')).toBe('forall a b c. Arith a b c => (a, b) -> c');
  });

  it('shows ES|QL types with their prefix, and no quantifier when nothing varies', () => {
    expect(signature('and')).toBe('(ES.boolean, ES.boolean) -> ES.boolean');
    expect(signature('top')).toBe(
      'forall a b. (Orderable a, Norm a b) => (a, ES.integer, ES.keyword) -> b'
    );
  });

  it('shows how a function may be used beside its type', () => {
    const top = standardLibrary.functions.get('top');
    expect(top && Print.fn(top)).toBe(
      'top :: forall a b. (Orderable a, Norm a b) => (a, ES.integer, ES.keyword) -> b  -- agg; constant parameters 1, 2'
    );
  });
});

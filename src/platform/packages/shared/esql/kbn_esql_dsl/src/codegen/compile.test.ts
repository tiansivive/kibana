/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Parser } from '@elastic/esql';
import {
  abs,
  add,
  typecheck,
  and,
  avg,
  compile,
  count,
  desc,
  eq,
  from,
  gt,
  isNotNull,
  isNull,
  kql,
  lit,
  max,
  or,
  param,
  round,
  sum,
  toBase64,
  toKeyword,
  top,
  typed,
} from '..';
import type { QueryAst } from '..';

const printed = (ast: QueryAst): string => compile(typecheck(ast).core).print('basic');

interface Doc {
  '@timestamp': 'date';
  'host.name': 'keyword';
  bytes: 'long';
  risk: 'double';
  status: 'integer';
}

const logs = () => from<Doc>('logs-*');

describe('compile: commands', () => {
  it('prints the source, filters and limits', () => {
    expect(
      printed(
        logs()
          .where((c) => gt(c.bytes, lit.long(100)))
          .limit(10).ast
      )
    ).toBe('FROM logs-* | WHERE bytes > 100::LONG | LIMIT 10');
  });

  it('prints several sources', () => {
    expect(printed(from<Doc>('logs-*', 'metrics').limit(1).ast)).toBe(
      'FROM logs-*, metrics | LIMIT 1'
    );
  });

  it('prints EVAL, STATS with grouping, and SORT with directions', () => {
    expect(
      printed(
        logs()
          .eval('doubled', (c) => add(c.risk, c.risk))
          .stats(
            (c) => ({ total: sum(c.bytes), n: count(c.status) }),
            (c) => ({ host: c['host.name'] })
          )
          .sort((c) => [desc(c.total), c.host]).ast
      )
    ).toBe(
      'FROM logs-* | EVAL doubled = risk + risk | STATS total = SUM(bytes), n = COUNT(status) BY host = host.name | SORT total DESC, host ASC'
    );
  });

  it('prints STATS without grouping, KEEP and DROP', () => {
    expect(printed(logs().stats((c) => ({ top: max(c.bytes) })).ast)).toBe(
      'FROM logs-* | STATS top = MAX(bytes)'
    );
    expect(printed(logs().keep('bytes', 'host.name').drop('bytes').ast)).toBe(
      'FROM logs-* | KEEP bytes, host.name | DROP bytes'
    );
  });
});

describe('compile: rename, null checks, conversions and KQL', () => {
  it('prints RENAME with the old name first', () => {
    expect(printed(logs().rename('bytes', 'size').rename('risk', 'rating').ast)).toBe(
      'FROM logs-* | RENAME bytes AS size | RENAME risk AS rating'
    );
  });

  it('prints IS NULL and IS NOT NULL after their operand', () => {
    expect(printed(logs().where((c) => and(isNotNull(c.risk), isNull(c['host.name']))).ast)).toBe(
      'FROM logs-* | WHERE risk IS NOT NULL AND host.name IS NULL'
    );
  });

  it('prints the conversions, KQL and the weighted sum as calls', () => {
    expect(
      printed(
        logs()
          .where(() => kql(lit.str('bytes > 1')))
          .eval('k', (c) => toKeyword(c.risk))
          .eval('b', (c) => toBase64(c['host.name'])).ast
      )
    ).toBe(
      'FROM logs-* | WHERE KQL("bytes > 1") | EVAL k = TO_STRING(risk) | EVAL b = TO_BASE64(host.name)'
    );
  });
});

describe('compile: expressions', () => {
  const where = (build: Parameters<ReturnType<typeof logs>['where']>[0]) =>
    printed(logs().where(build).ast);

  it('keeps the parentheses the tree needs', () => {
    expect(where((c) => gt(add(c.bytes, c.bytes), c.bytes))).toBe(
      'FROM logs-* | WHERE bytes + bytes > bytes'
    );
    expect(
      printed(logs().eval('r', (c) => add(add(c.risk, c.risk), add(c.risk, c.risk))).ast)
    ).toBe('FROM logs-* | EVAL r = risk + risk + (risk + risk)');
    expect(
      where((c) =>
        and(or(gt(c.bytes, lit.long(1)), eq(c.status, lit.int(2))), eq(c.status, lit.int(3)))
      )
    ).toBe('FROM logs-* | WHERE (bytes > 1::LONG OR status == 2) AND status == 3');
  });

  it('prints calls by name', () => {
    expect(
      printed(
        logs().stats((c) => ({
          a: avg(c.risk),
          b: sum(abs(c.bytes)),
          c: count(c.bytes),
          t: top(c.bytes, lit.int(3), lit.str('desc')),
        })).ast
      )
    ).toBe(
      'FROM logs-* | STATS a = AVG(risk), b = SUM(ABS(bytes)), c = COUNT(bytes), t = TOP(bytes, 3, "desc")'
    );
    expect(printed(logs().eval('r', (c) => round(c.risk)).ast)).toBe(
      'FROM logs-* | EVAL r = ROUND(risk)'
    );
  });

  it('prints each literal as the type it was written with', () => {
    const literals = printed(
      logs()
        .eval('a', () => lit.int(2))
        .eval('b', () => lit.long(2))
        .eval('c', () => lit.double(2))
        .eval('d', () => lit.double(2.5))
        .eval('e', () => lit.str('he said "hi"'))
        .eval('f', () => lit.bool(true))
        .eval('g', () => lit.date('2024-01-01T00:00:00Z')).ast
    );
    expect(literals).toBe(
      'FROM logs-* | EVAL a = 2 | EVAL b = 2::LONG | EVAL c = 2.0 | EVAL d = 2.5 | EVAL e = "he said \\"hi\\"" | EVAL f = TRUE | EVAL g = "2024-01-01T00:00:00Z"::DATETIME'
    );
  });

  it('prints parameters by name and a declaration as the expression it declares', () => {
    expect(printed(from('i').where((c) => gt(c.a, param('since', 'long'))).ast)).toBe(
      'FROM i | WHERE a > ?since'
    );
    expect(printed(from('i').where((c) => gt(typed('long', c.a), lit.long(1))).ast)).toBe(
      'FROM i | WHERE a > 1::LONG'
    );
  });

  it('quotes names that are not plain identifiers', () => {
    expect(printed(from('i').keep('host name', '1abc', '@timestamp').ast)).toBe(
      'FROM i | KEEP `host name`, `1abc`, @timestamp'
    );
  });

  it('prints a typed query the parser accepts back unchanged', () => {
    const query = compile(
      typecheck(
        logs()
          .where((c) => and(gt(c.bytes, lit.long(1)), eq(c['host.name'], lit.str('a'))))
          .stats(
            (c) => ({ total: sum(c.bytes) }),
            (c) => ({ host: c['host.name'] })
          )
          .sort((c) => [desc(c.total)])
          .limit(5).ast
      ).core
    ).print('basic');
    const parsed = Parser.parse(query);
    expect(parsed.errors).toEqual([]);
  });
});

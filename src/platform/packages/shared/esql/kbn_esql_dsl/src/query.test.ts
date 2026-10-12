/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { add, and, avg, count, eq, from, gt, lit, round, sum, where } from '.';

interface Doc {
  'host.name': 'keyword';
  bytes: 'long';
  risk: 'double';
}

describe('query construction', () => {
  it('builds an immutable AST', () => {
    const base = from<Doc>('logs-*');
    const filtered = base.where((c) => gt(c.bytes, lit.long(100)));

    expect(base.ast.pipe).toHaveLength(0);
    expect(filtered.ast.pipe).toEqual([
      {
        tag: 'where',
        cond: {
          tag: 'call',
          fn: 'greater_than',
          args: [
            { tag: 'col', name: 'bytes' },
            { tag: 'lit', ty: 'long', value: 100 },
          ],
        },
      },
    ]);
  });

  it('records every command in order', () => {
    const q = from<Doc>('logs-*')
      .where((c) => and(gt(c.bytes, lit.long(1)), eq(c['host.name'], lit.str('a'))))
      .stats(
        (c) => ({ total: sum(c.bytes), avgRisk: round(avg(c.risk), lit.int(2)), n: count() }),
        (c) => ({ host: c['host.name'] })
      )
      .eval('doubled', (c) => add(c.total, c.total))
      .limit(10);

    expect(q.ast.pipe.map((cmd) => cmd.tag)).toEqual(['where', 'stats', 'eval', 'limit']);
    expect(q.ast.source).toEqual({ tag: 'from', indices: ['logs-*'] });
  });

  it('accepts stages built independently of a query', () => {
    const recent = where<Doc>((c) => gt(c.bytes, lit.long(1)));
    expect(from<Doc>('a').pipe(recent).ast.pipe).toHaveLength(1);
  });

  it('rejects non-integer literals where an integer is required', () => {
    expect(() => lit.int(1.5)).toThrow(/integer/);
    expect(() => from<Doc>('a').limit(-1)).toThrow(/limit/);
  });
});

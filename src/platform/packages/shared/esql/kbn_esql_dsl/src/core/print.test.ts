/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { add, typecheck, desc, from, gt, lit, printCore, sum } from '..';
import { standardLibrary } from './polymorphism/standard/standard';

interface Doc {
  bytes: 'long';
  risk: 'double';
}

describe('printCore', () => {
  it('shows every expression with its type and every call with the instances it needed', () => {
    const q = from<Doc>('logs-*')
      .where((c) => gt(c.bytes, lit.long(100)))
      .eval('both', (c) => add(c.bytes, c.bytes))
      .stats((c) => ({ total: sum(c.bytes) }))
      .sort((c) => [desc(c.total)]);
    const a = typecheck(q.ast, { schema: { bytes: 'long', risk: 'double' } });
    expect(printCore(a.core, a.solution, { library: standardLibrary })).toBe(
      [
        'FROM logs-*',
        'WHERE',
        '  greater_than : boolean   [Comparable(long, long)]',
        '    col bytes : long',
        '    lit 100 : long',
        'EVAL both =',
        '  add : long   [Arith(long, long, long)]',
        '    col bytes : long',
        '    col bytes : long',
        'STATS',
        '  total =',
        '    sum : long   [SignedNumeric(long); Wide(long, long)]',
        '      col bytes : long',
        'SORT',
        '  DESC',
        '    col total : long',
      ].join('\n')
    );
  });

  it('shows a type that is not known yet as its meta, or as the explanation it is given', () => {
    const a = typecheck(from<Doc>('i').where((c) => gt(c.bytes, lit.long(1))).ast);
    expect(printCore(a.core, a.solution)).toContain('col bytes : ?src:bytes');
    expect(
      printCore(a.core, a.solution, { explain: (type) => `unknown(${JSON.stringify(type)})` })
    ).toContain('col bytes : unknown(');
  });
});

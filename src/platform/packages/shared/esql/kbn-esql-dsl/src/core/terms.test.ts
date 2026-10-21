/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { add, typecheck, from, gt, lit, param, resolve, sum, typed } from '..';
import type { CoreExpr } from '..';
import { expressionsOf } from './terms';

const firstExpr = (a: ReturnType<typeof typecheck>): CoreExpr => {
  const cmd = a.core.pipe[0];
  if (cmd.tag === 'eval') {
    return cmd.expr;
  }
  if (cmd.tag === 'where') {
    return cmd.cond;
  }
  throw new Error(`unexpected command ${cmd.tag}`);
};

describe('the Core, with types looked up in the solution on demand', () => {
  it('keeps the type a call was built with and resolves it by lookup', () => {
    const a = typecheck(
      from('i').eval('r', () => add(param('a', 'integer'), param('b', 'long'))).ast
    );
    const expr = firstExpr(a);
    // the Core holds a meta for the result of `add`, and nothing rewrote it
    expect(expr.type).toEqual({ tag: 'meta', meta: 'pipe[0].eval.expr$c' });
    expect(resolve(a.solution, expr.type)).toEqual({ tag: 'esql', esql: 'long' });
    if (expr.tag === 'call') {
      expect(expressionsOf(expr.args).map((x) => resolve(a.solution, x.type))).toEqual([
        { tag: 'esql', esql: 'integer' },
        { tag: 'esql', esql: 'long' },
      ]);
    }
  });

  it('records which instance each placeholder is', () => {
    const a = typecheck(
      from('i').eval('r', () => add(param('a', 'date'), param('b', 'date_period'))).ast
    );
    const expr = firstExpr(a);
    expect(expr.tag === 'call' ? expr.instances : []).toHaveLength(1);
    expect([...a.solution.instances.values()]).toEqual([['date', 'date_period', 'date']]);
  });

  it('gives the same Core with or without a schema, and the lookup says what differs', () => {
    const q = from('i').where((c) => gt(c.a, lit.long(1)));
    const open = typecheck(q.ast);
    const closed = typecheck(q.ast, { schema: { a: 'integer' } });
    expect(open.core).toEqual(closed.core);

    const column = (a: ReturnType<typeof typecheck>) => {
      const expr = firstExpr(a);
      return expr.tag === 'call' ? expressionsOf(expr.args)[0]?.type : undefined;
    };
    expect(column(open)).toEqual({ tag: 'meta', meta: 'src:a' });
    expect(resolve(open.solution, { tag: 'meta', meta: 'src:a' })).toEqual({
      tag: 'meta',
      meta: 'src:a',
    });
    expect(resolve(closed.solution, { tag: 'meta', meta: 'src:a' })).toEqual({
      tag: 'esql',
      esql: 'integer',
    });
  });

  it('resolves an aggregate over a declared column', () => {
    const a = typecheck(from('i').stats((c) => ({ total: sum(typed('integer', c.a)) })).ast);
    const cmd = a.core.pipe[0];
    expect(cmd.tag === 'stats' ? resolve(a.solution, cmd.aggs[0].expr.type) : undefined).toEqual({
      tag: 'esql',
      esql: 'long',
    });
  });
});

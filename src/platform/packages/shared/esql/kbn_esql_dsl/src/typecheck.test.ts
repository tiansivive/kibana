/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Typechecked } from '.';
import { abs, typecheck, and, avg, count, eq, fromOpen, gt, lit, max, sum, top, typed } from '.';

const required = (a: Typechecked) => Object.fromEntries(a.required);
const output = (a: Typechecked) => Object.fromEntries(a.output.columns);
const codes = (a: Typechecked) => a.diagnostics.map((d) => d.code);

describe('typecheck: inferring column types from usage', () => {
  it('narrows a column to the types its comparison allows', () => {
    const a = typecheck(fromOpen('i').where((c) => gt(c.a, lit.long(1))).ast);
    expect(a.ok).toBe(true);
    expect(required(a)).toEqual({ a: ['integer', 'long', 'double'] });
  });

  it('gives guidance per constraint, without carrying a narrowing from one column to another', () => {
    const a = typecheck(
      fromOpen('i')
        .where((c) => gt(c.a, c.b))
        .stats((c) => ({ total: sum(c.a) })).ast
    );
    expect(a.ok).toBe(true);
    expect(required(a).a).toEqual(['integer', 'long', 'double']);
    // b is only constrained by being comparable with an unknown a, so it keeps every comparable type
    expect(required(a).b).toContain('keyword');
    expect(required(a).b).toContain('long');
  });

  it('keeps the result type tied to the signature that is chosen', () => {
    const a = typecheck(fromOpen('i').stats((c) => ({ total: sum(c.a) })).ast);
    expect(output(a)).toEqual({ total: ['long', 'double'] });

    const narrowed = typecheck(
      fromOpen('i').stats((c) => ({ total: sum(typed('integer', c.a)) })).ast
    );
    expect(output(narrowed)).toEqual({ total: ['long'] });
  });

  it('leaves a column ambiguous when its uses do not decide, and carries the ambiguity to the output', () => {
    const a = typecheck(fromOpen('i').eval('r', (c) => abs(c.x)).ast);
    expect(required(a)).toEqual({ x: ['integer', 'long', 'unsigned_long', 'double'] });
    expect(output(a).r).toEqual(required(a).x);
  });

  it('resolves a column with an annotation', () => {
    const a = typecheck(fromOpen('i').eval('r', (c) => abs(typed('long', c.x))).ast);
    expect(required(a)).toEqual({ x: ['long'] });
    expect(output(a).r).toEqual(['long']);
  });

  it('shows no candidate type for a column whose uses cannot all hold, without calling it an error', () => {
    const q = fromOpen('i')
      .where((c) => eq(c.host, lit.str('a')))
      .stats((c) => ({ total: sum(c.host) }));
    const a = typecheck(q.ast);
    expect(a.ok).toBe(true);
    expect(required(a).host).toEqual([]);
  });

  it('reports the same query as an error once the schema gives the column a type', () => {
    const q = fromOpen('i')
      .where((c) => eq(c.host, lit.str('a')))
      .stats((c) => ({ total: sum(c.host) }));
    const a = typecheck(q.ast, { schema: { host: 'keyword' } });
    expect(codes(a)).toEqual(['no_instance']);
    expect(a.diagnostics[0].origin.path).toBe('pipe[1].stats.aggs.total');
  });

  it('does not depend on the order independent constraints are applied in', () => {
    const first = fromOpen('i')
      .where((c) => gt(c.a, lit.long(1)))
      .where((c) => gt(c.a, c.b))
      .where((c) => gt(c.b, lit.double(0.5)));
    const second = fromOpen('i')
      .where((c) => gt(c.b, lit.double(0.5)))
      .where((c) => gt(c.a, c.b))
      .where((c) => gt(c.a, lit.long(1)));
    expect(required(typecheck(first.ast))).toEqual(required(typecheck(second.ast)));
  });

  it('checks the same conditions inside a single expression whatever the argument order', () => {
    const one = typecheck(fromOpen('i').where((c) => and(gt(c.a, lit.long(1)), eq(c.b, c.a))).ast);
    const two = typecheck(fromOpen('i').where((c) => and(eq(c.b, c.a), gt(c.a, lit.long(1)))).ast);
    expect(required(one)).toEqual(required(two));
  });
});

describe('typecheck: Norm', () => {
  it('maps text to keyword and leaves other types alone', () => {
    const open = typecheck(fromOpen('i').stats((c) => ({ m: max(c.x) })).ast);
    expect(output(open).m).not.toContain('text');
    expect(output(open).m).toContain('keyword');
    expect(required(open).x).toContain('text');

    const text = typecheck(fromOpen('i').stats((c) => ({ m: max(typed('text', c.x)) })).ast);
    expect(output(text)).toEqual({ m: ['keyword'] });

    const long = typecheck(fromOpen('i').stats((c) => ({ m: max(typed('long', c.x)) })).ast);
    expect(output(long)).toEqual({ m: ['long'] });
  });

  it('keeps top as a constant-parameter aggregate over Norm', () => {
    const a = typecheck(
      fromOpen('i').stats((c) => ({ t: top(typed('text', c.x), lit.int(3), lit.str('desc')) })).ast
    );
    expect(a.ok).toBe(true);
    expect(output(a)).toEqual({ t: ['keyword'] });
  });
});

describe('typecheck: rows', () => {
  it('passes untouched source columns through an open row', () => {
    const a = typecheck(fromOpen('i').where((c) => gt(c.a, lit.long(1))).ast);
    expect(a.output.open).toBe(true);
    expect(Object.keys(output(a))).toEqual(['a']);
  });

  it('closes the row after STATS and KEEP', () => {
    const afterStats = typecheck(fromOpen('i').stats((c) => ({ n: count(c.a) })).ast);
    expect(afterStats.output.open).toBe(false);

    const afterKeep = typecheck(fromOpen('i').keep('a', 'b').ast);
    expect(afterKeep.output.open).toBe(false);
    expect(Object.keys(output(afterKeep))).toEqual(['a', 'b']);
  });

  it('rejects reading a column the previous stage removed', () => {
    const q = fromOpen('i')
      .keep('a')
      // @ts-expect-error `b` is not in the schema after KEEP, and the analyzer agrees
      .where((c) => gt(c.b, lit.long(1)));
    const a = typecheck(q.ast);
    expect(codes(a)).toEqual(['unknown_column']);
    expect(a.diagnostics[0].message).toContain('available: a');
  });

  it('rejects reading a dropped column of an open row', () => {
    const q = fromOpen('i')
      .drop('x')
      .where((c) => gt(c.x, lit.long(1)));
    const a = typecheck(q.ast);
    expect(codes(a)).toEqual(['dropped_column']);
    expect(a.output.lacks).toEqual(['x']);
  });

  it('lets EVAL redefine a dropped column and shadow an existing one', () => {
    const redefined = typecheck(
      fromOpen('i')
        .drop('x')
        .eval('x', () => lit.long(1))
        .where((c) => gt(c.x, lit.long(0))).ast
    );
    expect(redefined.ok).toBe(true);

    const shadowed = typecheck(
      fromOpen('i')
        .where((c) => eq(c.k, lit.str('a')))
        .eval('k', () => lit.long(1))
        .where((c) => gt(c.k, lit.long(0))).ast
    );
    expect(shadowed.ok).toBe(true);
    expect(required(shadowed)).toEqual({ k: ['keyword', 'text'] });
    expect(output(shadowed).k).toEqual(['long']);
  });
});

describe('typecheck: kinds and constants', () => {
  it('rejects aggregates outside STATS and per-row values inside it', () => {
    const inWhere = typecheck(
      fromOpen('i')
        // @ts-expect-error an aggregate cannot appear in WHERE
        .where((c) => gt(avg(c.a), lit.long(1))).ast
    );
    expect(codes(inWhere)).toContain('aggregate_in_scalar_context');

    // @ts-expect-error a bare column is not an aggregate
    const bare = typecheck(fromOpen('i').stats((c) => ({ x: c.a })).ast);
    expect(codes(bare)).toEqual(['not_aggregate']);
  });

  it('rejects nested aggregates', () => {
    // @ts-expect-error aggregates cannot be nested
    const a = typecheck(fromOpen('i').stats((c) => ({ x: avg(max(c.a)) })).ast);
    expect(codes(a)).toContain('nested_aggregate');
  });

  it('requires a constant where ES|QL does', () => {
    // @ts-expect-error the limit must be a constant
    const a = typecheck(fromOpen('i').stats((c) => ({ t: top(c.a, c.b, lit.str('desc')) })).ast);
    expect(codes(a)).toEqual(['constant_required']);
  });
});

describe('typecheck: against a known schema', () => {
  const q = fromOpen('i').stats((c) => ({ total: sum(c.a) }));

  it('accepts a column of a compatible type and resolves the output', () => {
    const a = typecheck(q.ast, { schema: { a: 'integer' } });
    expect(a.ok).toBe(true);
    expect(output(a)).toEqual({ total: ['long'] });
  });

  it('rejects a column whose declared type no signature accepts', () => {
    const a = typecheck(q.ast, { schema: { a: 'keyword' } });
    expect(codes(a)).toEqual(['no_instance']);
    expect(a.diagnostics[0].message).toBe('SignedNumeric has no instance for (keyword)');
  });

  it('rejects arguments that are individually fine but jointly have no signature', () => {
    const pair = fromOpen('i').where((c) => gt(c.a, c.b));
    const a = typecheck(pair.ast, { schema: { a: 'keyword', b: 'long' } });
    expect(codes(a)).toEqual(['no_instance']);
  });

  it('rejects a column the schema does not have', () => {
    const a = typecheck(q.ast, { schema: { b: 'long' } });
    expect(codes(a)).toEqual(['unknown_column']);
    expect(a.diagnostics[0].message).toContain('available: b');
  });
});

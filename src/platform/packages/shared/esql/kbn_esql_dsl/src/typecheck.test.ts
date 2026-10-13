/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Typechecked } from '.';
import {
  abs,
  typecheck,
  and,
  avg,
  coalesce,
  concat,
  count,
  eq,
  from,
  gt,
  lit,
  max,
  Print,
  round,
  substring,
  sum,
  top,
  typed,
} from '.';
import { call } from './dsl/expr';
import { standardLibrary } from './core/polymorphism/standard/standard';

const required = (a: Typechecked) => Object.fromEntries(a.required);
const output = (a: Typechecked) => Object.fromEntries(a.output.columns);
const codes = (a: Typechecked) => a.diagnostics.map((d) => d.code);

describe('typecheck: inferring column types from usage', () => {
  it('narrows a column to the types its comparison allows', () => {
    const a = typecheck(from('i').where((c) => gt(c.a, lit.long(1))).ast);
    expect(a.ok).toBe(true);
    expect(required(a)).toEqual({ a: ['integer', 'long', 'double'] });
  });

  it('gives guidance per constraint, without carrying a narrowing from one column to another', () => {
    const a = typecheck(
      from('i')
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
    const a = typecheck(from('i').stats((c) => ({ total: sum(c.a) })).ast);
    expect(output(a)).toEqual({ total: ['long', 'double'] });

    const narrowed = typecheck(from('i').stats((c) => ({ total: sum(typed('integer', c.a)) })).ast);
    expect(output(narrowed)).toEqual({ total: ['long'] });
  });

  it('leaves a column ambiguous when its uses do not decide, and carries the ambiguity to the output', () => {
    const a = typecheck(from('i').eval('r', (c) => abs(c.x)).ast);
    expect(required(a)).toEqual({ x: ['integer', 'long', 'unsigned_long', 'double'] });
    expect(output(a).r).toEqual(required(a).x);
  });

  it('resolves a column with an annotation', () => {
    const a = typecheck(from('i').eval('r', (c) => abs(typed('long', c.x))).ast);
    expect(required(a)).toEqual({ x: ['long'] });
    expect(output(a).r).toEqual(['long']);
  });

  it('shows no candidate type for a column whose uses cannot all hold, without calling it an error', () => {
    const q = from('i')
      .where((c) => eq(c.host, lit.str('a')))
      .stats((c) => ({ total: sum(c.host) }));
    const a = typecheck(q.ast);
    expect(a.ok).toBe(true);
    expect(required(a).host).toEqual([]);
  });

  it('reports the same query as an error once the schema gives the column a type', () => {
    const q = from('i')
      .where((c) => eq(c.host, lit.str('a')))
      .stats((c) => ({ total: sum(c.host) }));
    const a = typecheck(q.ast, { schema: { host: 'keyword' } });
    expect(codes(a)).toEqual(['no_instance']);
    expect(a.diagnostics[0].location.path).toBe('pipe[1].stats.aggs.total');
  });

  it('does not depend on the order independent constraints are applied in', () => {
    const first = from('i')
      .where((c) => gt(c.a, lit.long(1)))
      .where((c) => gt(c.a, c.b))
      .where((c) => gt(c.b, lit.double(0.5)));
    const second = from('i')
      .where((c) => gt(c.b, lit.double(0.5)))
      .where((c) => gt(c.a, c.b))
      .where((c) => gt(c.a, lit.long(1)));
    expect(required(typecheck(first.ast))).toEqual(required(typecheck(second.ast)));
  });

  it('checks the same conditions inside a single expression whatever the argument order', () => {
    const one = typecheck(from('i').where((c) => and(gt(c.a, lit.long(1)), eq(c.b, c.a))).ast);
    const two = typecheck(from('i').where((c) => and(eq(c.b, c.a), gt(c.a, lit.long(1)))).ast);
    expect(required(one)).toEqual(required(two));
  });
});

describe('typecheck: Norm', () => {
  it('maps text to keyword and leaves other types alone', () => {
    const open = typecheck(from('i').stats((c) => ({ m: max(c.x) })).ast);
    expect(output(open).m).not.toContain('text');
    expect(output(open).m).toContain('keyword');
    expect(required(open).x).toContain('text');

    const text = typecheck(from('i').stats((c) => ({ m: max(typed('text', c.x)) })).ast);
    expect(output(text)).toEqual({ m: ['keyword'] });

    const long = typecheck(from('i').stats((c) => ({ m: max(typed('long', c.x)) })).ast);
    expect(output(long)).toEqual({ m: ['long'] });
  });

  it('keeps top as a constant-parameter aggregate over Norm', () => {
    const a = typecheck(
      from('i').stats((c) => ({ t: top(typed('text', c.x), lit.int(3), lit.str('desc')) })).ast
    );
    expect(a.ok).toBe(true);
    expect(output(a)).toEqual({ t: ['keyword'] });
  });
});

describe('typecheck: rows', () => {
  it('passes untouched source columns through an open row', () => {
    const a = typecheck(from('i').where((c) => gt(c.a, lit.long(1))).ast);
    expect(a.output.open).toBe(true);
    expect(Object.keys(output(a))).toEqual(['a']);
  });

  it('closes the row after STATS and KEEP', () => {
    const afterStats = typecheck(from('i').stats((c) => ({ n: count(c.a) })).ast);
    expect(afterStats.output.open).toBe(false);

    const afterKeep = typecheck(from('i').keep('a', 'b').ast);
    expect(afterKeep.output.open).toBe(false);
    expect(Object.keys(output(afterKeep))).toEqual(['a', 'b']);
  });

  it('rejects reading a column the previous stage removed', () => {
    const q = from('i')
      .keep('a')
      // @ts-expect-error `b` is not in the schema after KEEP, and the analyzer agrees
      .where((c) => gt(c.b, lit.long(1)));
    const a = typecheck(q.ast);
    expect(codes(a)).toEqual(['unknown_column']);
    expect(a.diagnostics[0].message).toContain('available: a');
  });

  it('rejects reading a dropped column of an open row, even where the types allow it', () => {
    const q = from('i')
      .drop('x')
      // @ts-expect-error the types already reject this, and the checker is for queries that bypass them
      .where((c) => gt(c.x, lit.long(1)));
    const a = typecheck(q.ast);
    expect(codes(a)).toEqual(['dropped_column']);
    expect(a.output.lacks).toEqual(['x']);
  });

  it('lets EVAL redefine a dropped column and shadow an existing one', () => {
    const redefined = typecheck(
      from('i')
        .drop('x')
        .eval('x', () => lit.long(1))
        .where((c) => gt(c.x, lit.long(0))).ast
    );
    expect(redefined.ok).toBe(true);

    const shadowed = typecheck(
      from('i')
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
      from('i')
        // @ts-expect-error an aggregate cannot appear in WHERE
        .where((c) => gt(avg(c.a), lit.long(1))).ast
    );
    expect(codes(inWhere)).toContain('aggregate_in_scalar_context');

    // @ts-expect-error a bare column is not an aggregate
    const bare = typecheck(from('i').stats((c) => ({ x: c.a })).ast);
    expect(codes(bare)).toEqual(['not_aggregate']);
  });

  it('rejects nested aggregates', () => {
    // @ts-expect-error aggregates cannot be nested
    const a = typecheck(from('i').stats((c) => ({ x: avg(max(c.a)) })).ast);
    expect(codes(a)).toContain('nested_aggregate');
  });

  it('requires a constant where ES|QL does', () => {
    // @ts-expect-error the limit must be a constant
    const a = typecheck(from('i').stats((c) => ({ t: top(c.a, c.b, lit.str('desc')) })).ast);
    expect(codes(a)).toEqual(['constant_required']);
  });
});

describe('typecheck: against a known schema', () => {
  const q = from('i').stats((c) => ({ total: sum(c.a) }));

  it('accepts a column of a compatible type and resolves the output', () => {
    const a = typecheck(q.ast, { schema: { a: 'integer' } });
    expect(a.ok).toBe(true);
    expect(output(a)).toEqual({ total: ['long'] });
  });

  it('rejects a column whose declared type no signature accepts', () => {
    const a = typecheck(q.ast, { schema: { a: 'keyword' } });
    expect(codes(a)).toEqual(['no_instance']);
    expect(a.diagnostics[0].message).toBe('SignedNumeric has no instance for (ES.keyword)');
  });

  it('rejects arguments that are individually fine but jointly have no signature', () => {
    const pair = from('i').where((c) => gt(c.a, c.b));
    const a = typecheck(pair.ast, { schema: { a: 'keyword', b: 'long' } });
    expect(codes(a)).toEqual(['no_instance']);
  });

  it('rejects a column the schema does not have', () => {
    const a = typecheck(q.ast, { schema: { b: 'long' } });
    expect(codes(a)).toEqual(['unknown_column']);
    expect(a.diagnostics[0].message).toContain('available: b');
  });
});

describe('typecheck: optional parameters', () => {
  const schema = { x: 'double', d: 'long', s: 'text', n: 'keyword' } as const;

  it('takes a function with or without its optional parameters', () => {
    const without = typecheck(from('i').eval('r', (c) => round(c.x)).ast, { schema });
    const withDecimals = typecheck(from('i').eval('r', (c) => round(c.x, lit.int(2))).ast, {
      schema,
    });
    expect([without.ok, output(without)]).toEqual([
      true,
      { x: ['double'], d: ['long'], s: ['text'], n: ['keyword'], r: ['double'] },
    ]);
    expect(withDecimals.ok).toBe(true);
    expect(output(withDecimals).r).toEqual(['double']);
  });

  it('requires nothing of an optional parameter that is left out', () => {
    const a = typecheck(from('i').eval('r', (c) => round(c.x)).ast);
    expect(Print.principal(standardLibrary, a.principal)).toBe(
      'forall a. Numeric a => { x: a, ... } -> { r: a, x: a, ... }'
    );
  });

  it('checks the optional parameter when it is given', () => {
    const a = typecheck(from('i').eval('r', (c) => round(c.x, c.n)).ast, { schema });
    expect(codes(a)).toEqual(['no_instance']);
    expect(a.diagnostics[0].message).toBe('SignedNumeric has no instance for (ES.keyword)');
    expect(typecheck(from('i').eval('r', (c) => round(c.x, c.d)).ast, { schema }).ok).toBe(true);
  });

  it('gives substring the result of its text argument as keyword', () => {
    const a = typecheck(from('i').eval('r', (c) => substring(c.s, lit.int(1), lit.int(3))).ast, {
      schema,
    });
    expect(a.ok).toBe(true);
    expect(output(a).r).toEqual(['keyword']);
    expect(
      typecheck(from('i').eval('r', (c) => substring(c.s, lit.int(1))).ast, { schema }).ok
    ).toBe(true);
    expect(
      codes(typecheck(from('i').eval('r', (c) => substring(c.x, lit.int(1))).ast, { schema }))
    ).toEqual(['no_instance']);
  });

  it('reports a wrong number of arguments with the numbers the function takes', () => {
    const message = (fn: string, given: number) => {
      const a = typecheck(
        from('i').eval('r', () =>
          call<'long', 'scalar'>(fn, ...Array.from({ length: given }, () => lit.int(1)))
        ).ast
      );
      return [codes(a), a.diagnostics[0]?.message];
    };
    expect(message('round', 0)).toEqual([['arity'], 'round takes 1 to 2 arguments, got 0']);
    expect(message('round', 3)).toEqual([['arity'], 'round takes 1 to 2 arguments, got 3']);
    expect(message('substring', 1)).toEqual([['arity'], 'substring takes 2 to 3 arguments, got 1']);
    expect(message('abs', 2)).toEqual([['arity'], 'abs takes 1 argument, got 2']);
  });
});

describe('typecheck: variadic parameters', () => {
  const schema = { a: 'text', b: 'keyword', c: 'text', l: 'long', i: 'integer' } as const;

  it('takes text and keyword together in coalesce, since both are keyword once normalised', () => {
    const a = typecheck(from('i').eval('r', (c) => coalesce(c.a, c.b, c.c)).ast, { schema });
    expect(a.ok).toBe(true);
    expect(output(a).r).toEqual(['keyword']);
  });

  it('gives coalesce the type of its arguments, with text as keyword', () => {
    const same = typecheck(from('i').eval('r', (c) => coalesce(c.b, lit.str('x'))).ast, { schema });
    expect(same.ok).toBe(true);
    expect(output(same).r).toEqual(['keyword']);
    const texts = typecheck(from('i').eval('r', (c) => coalesce(c.a, c.c)).ast, { schema });
    expect(output(texts).r).toEqual(['keyword']);
  });

  it('rejects arguments of coalesce that differ in type', () => {
    const a = typecheck(from('i').eval('r', (c) => coalesce(c.l, c.i)).ast, { schema });
    expect(codes(a)).toEqual(['no_instance']);
    expect(a.diagnostics[0].message).toBe('Norm has no instance for (ES.integer, ES.long)');
  });

  it('ties the normal forms of the arguments of coalesce together while the columns are unknown', () => {
    const a = typecheck(from('i').eval('r', (c) => coalesce(c.p, c.q, c.u)).ast);
    expect(a.ok).toBe(true);
    expect(Print.principal(standardLibrary, a.principal)).toContain(
      '(Norm a d, Norm b d, Norm c d) =>'
    );
  });

  it('takes any mix of text and keyword in concat, and nothing else', () => {
    const mixed = typecheck(
      from('i').eval('r', (c) => concat(c.a, c.b, c.c, c.b, lit.str('!'))).ast,
      { schema }
    );
    expect(mixed.ok).toBe(true);
    expect(output(mixed).r).toEqual(['keyword']);
    const number = typecheck(from('i').eval('r', (c) => concat(c.a, c.b, c.l)).ast, { schema });
    expect(codes(number)).toEqual(['no_instance']);
    expect(number.diagnostics[0].location.path).toBe('pipe[0].eval.expr');
    expect(number.diagnostics[0].message).toBe('Norm has no instance for (ES.long, ES.keyword)');
  });

  it('needs an instance for each further argument', () => {
    const a = typecheck(from('i').eval('r', (c) => concat(c.a, c.b, c.c, c.l)).ast, { schema });
    expect(a.ok).toBe(false);
    expect(typecheck(from('i').eval('r', (c) => concat(c.a, c.b)).ast, { schema }).ok).toBe(true);
  });

  it('reports too few arguments', () => {
    const none = typecheck(from('i').eval('r', () => call<'keyword', 'scalar'>('coalesce')).ast);
    expect(none.diagnostics[0].message).toBe('coalesce takes at least 1 argument, got 0');
    const one = typecheck(
      from('i').eval('r', () => call<'keyword', 'scalar'>('concat', lit.str('a'))).ast
    );
    expect(one.diagnostics[0].message).toBe('concat takes at least 2 arguments, got 1');
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { add, count, eq, fromOpen, lit, Print, sum, typecheck } from '../..';

const principalOf = (...args: Parameters<typeof typecheck>) =>
  Print.principal(typecheck(...args).principal);

describe('principal type', () => {
  it('has no variables when a schema closes the source', () => {
    const q = fromOpen('i').stats((c) => ({ total: sum(c.a) }));
    expect(principalOf(q.ast, { schema: { a: 'integer' } })).toBe('{} -> { total: ES.long }');
  });

  it('shows the facts that couple a column to a result', () => {
    const q = fromOpen('i').stats((c) => ({ total: sum(c.a) }));
    expect(principalOf(q.ast)).toBe(
      'forall a b. (SignedNumeric a, Wide a b) => { a: a, ... } -> { total: b }'
    );
  });

  it('keeps a column that two functions constrain differently as one variable', () => {
    const q = fromOpen('i')
      .where((c) => eq(c.host, lit.str('a')))
      .stats((c) => ({ n: count(c.host), total: sum(c.host) }));
    expect(principalOf(q.ast)).toContain('Equatable a ES.keyword');
    expect(principalOf(q.ast)).toContain('SignedNumeric a');
  });

  it('leaves an intermediate result in the context when it is not in either row', () => {
    const q = fromOpen('i').stats((c) => ({ total: sum(add(add(c.a, c.b), c.c)) }));
    const text = principalOf(q.ast);
    expect(text).toContain('(Arith a b e, Arith e c f, SignedNumeric f, Wide f d)');
    expect(text).toContain('{ a: a, b: b, c: c, ... } -> { total: d }');
  });

  it('is an ES|QL type where the query fixes it', () => {
    const q = fromOpen('i').where((c) => eq(c.a, lit.long(1)));
    expect(typecheck(q.ast).principal.requires.length).toBeGreaterThan(0);
  });
});

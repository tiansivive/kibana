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

  it('shows the kind signature under the type, unless it is turned off', () => {
    const top = standardLibrary.functions.get('top');
    expect(top && Print.fn(standardLibrary, top, { dependencies: false })).toBe(
      [
        'top :: forall a b. (Orderable a, Norm a b) => (a, ES.integer, ES.keyword) -> b',
        '    :: (scalar, const, const) -> agg',
      ].join('\n')
    );
    const addition = standardLibrary.functions.get('add');
    expect(addition && Print.fn(standardLibrary, addition, { kinds: false })).toBe(
      ['add :: forall a b c. Arith a b c => (a, b) -> c', '    where Arith a b c | a b -> c'].join(
        '\n'
      )
    );
  });

  it('shows the dependency of every required protocol that has one, by default', () => {
    const summation = standardLibrary.functions.get('sum');
    expect(summation && Print.fn(standardLibrary, summation)).toBe(
      [
        'sum :: forall a b. (SignedNumeric a, Wide a b) => a -> b',
        '    :: scalar -> agg',
        '    where Wide a b | a -> b',
      ].join('\n')
    );
    const abs = standardLibrary.functions.get('abs');
    expect(abs && Print.fn(standardLibrary, abs, { kinds: false })).toBe(
      'abs :: forall a. Numeric a => a -> a'
    );
  });
});

describe('Print.protocol', () => {
  it('writes a protocol with a dependency the way the dependency reads', () => {
    const text = Print.protocol(standardLibrary, 'Arith');
    expect(text.split('\n')[0]).toBe('protocol Arith a b c | a b -> c');
    expect(text).toContain('  (ES.integer, ES.long) -> ES.long');
    expect(text).toContain('  (ES.date, ES.date_period) -> ES.date');
  });

  it('writes a unary protocol as one line of types, and a relation as pairs', () => {
    expect(Print.protocol(standardLibrary, 'Orderable').split('\n')).toEqual([
      'protocol Orderable a',
      expect.stringContaining('ES.keyword'),
    ]);
    expect(Print.protocol(standardLibrary, 'Norm')).toContain('  ES.text -> ES.keyword');
    expect(Print.protocol(standardLibrary, 'Comparable')).toContain('  (ES.long, ES.long)');
  });

  it('lists only the instances that mention a type', () => {
    const text = Print.protocol(standardLibrary, 'Arith', { containing: 'date' });
    expect(text).toContain('(ES.date, ES.date_period) -> ES.date');
    expect(text).not.toContain('(ES.integer, ES.integer)');
  });
});

describe('Print.protocolsOf', () => {
  it('shows every protocol a type takes part in', () => {
    const text = Print.protocolsOf(standardLibrary, 'keyword');
    expect(text).toContain('protocol Orderable a');
    expect(text).toContain('protocol Norm a b | a -> b');
    expect(text).not.toContain('protocol Numeric');
  });
});

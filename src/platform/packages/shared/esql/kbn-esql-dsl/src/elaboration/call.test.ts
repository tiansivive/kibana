/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { standardLibrary } from '../core/polymorphism/standard/standard';
import { fn, many, one, optional, requires, slot } from '../core/polymorphism/library';
import type { Library } from '../core/polymorphism/library';
import { expressionsOf } from '../core/terms';
import { esqlType, varType } from '../core/type';
import { call, lit, param } from '../dsl/expr';
import { from } from '../dsl/query';
import { elaborate } from './bidir';
import { solve } from './solve/solve';

/**
 * Calls checked against functions that the standard library does not have, to cover the
 * parameter shapes it has no example of: a leading optional parameter, a run of optionals, and a
 * function with two sequences.
 */

const a = varType('a');
const w = varType('w');
const integer = esqlType('integer');
const keyword = esqlType('keyword');

const library: Library = {
  ...standardLibrary,
  functions: new Map([
    ...standardLibrary.functions,
    ...[
      // `log(?base, number)`
      fn('log', [optional(a), one(a)], keyword, [requires('Numeric', a)]),
      // `top(field, limit, ?order, ?outputField)`
      fn('top2', [one(a), one(integer), optional(keyword), optional(keyword)], keyword, []),
      // two sequences, each with its own element type
      fn('both', [many(0, slot(a)), many(0, slot(w))], keyword, [
        requires('Numeric', a),
        requires('Norm', w, keyword),
      ]),
    ].map((f) => [f.name, f] as const),
  ]),
};

const check =
  (...args: Parameters<typeof call>[1][]) =>
  (name: string) => {
    const ast = from('i').eval('r', () => call<'keyword', 'scalar'>(name, ...args)).ast;
    const elaboration = elaborate(library, ast, undefined);
    const solution = solve(library, elaboration.emit.constraints);
    const diagnostics = [...elaboration.emit.diagnostics, ...solution.diagnostics];
    const command = elaboration.core.pipe[0];
    return {
      messages: diagnostics.map((d) => d.message),
      codes: diagnostics.map((d) => d.code),
      paths: diagnostics.map((d) => d.location.path),
      core: command.tag === 'eval' && command.expr.tag === 'call' ? command.expr : undefined,
    };
  };

const x = param('x', 'double');
const n = param('n', 'long');
const text = param('t', 'text');
const key = lit.str('k');
const one_ = lit.int(1);

describe('a leading optional parameter', () => {
  it('is given or undefined, and the call has an argument for it either way', () => {
    expect(check(undefined, x)('log').codes).toEqual([]);
    expect(check(n, n)('log').codes).toEqual([]);
    const present = check(n, n)('log').core;
    expect(present && expressionsOf(present.args)).toHaveLength(2);
    expect(check(undefined, x)('log').core?.args[0]).toBeUndefined();
  });

  it('is not left off, because the arguments line up with the parameters', () => {
    const result = check(x)('log');
    expect(result.codes).toEqual(['arity']);
    expect(result.messages).toEqual(['log takes (a?, a)']);
  });
});

describe('a run of optional parameters', () => {
  it('fills from the left', () => {
    expect(check(x, one_)('top2').codes).toEqual([]);
    expect(check(x, one_, key)('top2').codes).toEqual([]);
    expect(check(x, one_, key, key)('top2').codes).toEqual([]);
    const skipped = check(x, one_, undefined, key)('top2');
    expect(skipped.codes).toEqual(['gap']);
    expect(skipped.messages).toEqual([
      'top2 is given argument 4 after an optional argument that is left out',
    ]);
  });
});

describe('a function with two sequences', () => {
  it('checks each element of each against its own sequence', () => {
    expect(check([lit.int(1), lit.double(2)], [lit.str('a'), text])('both').codes).toEqual([]);
    expect(check([], [])('both').codes).toEqual([]);
    expect(check(undefined, undefined)('both').codes).toEqual([]);
  });

  it('reports the element that does not fit', () => {
    expect(check([lit.str('a')], [])('both').codes).toEqual(['no_instance']);
    expect(check([], [lit.int(1)])('both').codes).toEqual(['no_instance']);
  });

  it('keeps the sequences in the Core, with an instance for each element', () => {
    const { core } = check([lit.int(1), lit.double(2)], [lit.str('a')])('both');
    expect(core?.args).toHaveLength(2);
    expect(new Set(core?.instances.map((i) => i.hole)).size).toBe(3);
  });
});

describe('a call that cannot be checked', () => {
  it('locates the problems in its arguments where they are in the AST', () => {
    const result = check([[x, call('abs', key)]])('nope');
    expect(result.codes).toEqual(['unknown_function', 'no_instance']);
    expect(result.paths).toContain('pipe[0].eval.expr.args[0][0][1]');
  });
});

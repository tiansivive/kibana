/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { standardLibrary } from '../core/polymorphism/standard/standard';
import { lit } from './expr';
import * as dsl from './functions';

/**
 * The TypeScript functions and the standard library are written separately, so this checks that
 * they describe the same functions. Each exported function builds a call of a library function,
 * takes as many parameters as the library function's type has, and passes on an argument for each
 * of them. Every library function has an exported function.
 */

const notFunctions = ['typed'];

const exported = Object.entries(dsl)
  .filter(([name]) => !notFunctions.includes(name))
  .map(([name, f]) => ({ name, f }));

const x = lit.int(0);

/** Sequences are given as arrays, so these functions are not called with one expression per parameter. */
const arguments_: Record<string, readonly unknown[]> = {
  coalesce: [x, [x]],
  concat: [[x, x]],
  caseOf: [[[x, x]], x],
};

interface Called {
  readonly fn: string;
  readonly args: number;
}

const callOf = (name: string, f: (...args: never[]) => unknown): Called | undefined => {
  const built: unknown = Reflect.apply(
    f,
    undefined,
    arguments_[name] ?? Array.from({ length: f.length }, () => x)
  );
  const node = typeof built === 'object' && built !== null && 'node' in built ? built.node : null;
  return typeof node === 'object' &&
    node !== null &&
    'fn' in node &&
    'args' in node &&
    typeof node.fn === 'string' &&
    Array.isArray(node.args)
    ? { fn: node.fn, args: node.args.length }
    : undefined;
};

describe('the DSL functions agree with the standard library', () => {
  it.each(exported)(
    '$name builds a call of a library function with the same parameters',
    ({ name, f }) => {
      const called = callOf(name, f);
      const library = called && standardLibrary.functions.get(called.fn);
      expect(library).toBeDefined();
      if (library && called) {
        expect(f.length).toBe(library.type.params.length);
        expect(called.args).toBe(library.type.params.length);
      }
    }
  );

  it('has an exported function for every library function', () => {
    const called = exported.map(({ name, f }) => callOf(name, f)?.fn);
    expect([...standardLibrary.functions.keys()].filter((name) => !called.includes(name))).toEqual(
      []
    );
  });
});

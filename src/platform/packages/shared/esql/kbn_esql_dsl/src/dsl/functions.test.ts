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
 * takes as many parameters as the library function's type has, and passes on only the arguments
 * it is given. Every library function has an exported function.
 */

const notFunctions = ['typed'];

const exported = Object.entries(dsl)
  .filter(([name]) => !notFunctions.includes(name))
  .map(([name, f]) => ({ name, f }));

interface Called {
  readonly fn: string;
  readonly args: number;
}

const callWith = (f: (...args: never[]) => unknown, count: number): Called | undefined => {
  const built: unknown = Reflect.apply(
    f,
    undefined,
    Array.from({ length: count }, () => lit.int(0))
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
    ({ f }) => {
      const called = callWith(f, f.length);
      const library = called && standardLibrary.functions.get(called.fn);
      expect(library).toBeDefined();
      if (library) {
        expect(f.length).toBe(library.type.params.length);
        expect(callWith(f, library.type.required)?.args).toBe(library.type.required);
      }
    }
  );

  it('has an exported function for every library function', () => {
    const called = exported.map(({ f }) => callWith(f, f.length)?.fn);
    expect([...standardLibrary.functions.keys()].filter((name) => !called.includes(name))).toEqual(
      []
    );
  });
});

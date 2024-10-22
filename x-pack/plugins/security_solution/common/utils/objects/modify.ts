/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fp from 'lodash/fp';
import type { IsEqual } from 'type-fest';

type ModifierFn<O extends object, K extends keyof O, V extends O[K], T> = (
  val: IsEqual<O[K], unknown> extends true ? never : V
) => IsEqual<O[K], unknown> extends true ? never : T;

export type Modify<O extends object, K extends keyof O, T> = {
  [_K in keyof O]: _K extends K ? T : O[_K];
};

/**
 * Proxy for lodash fp `update` with better type inference.
 * Overloaded to support both imperative and point free style.
 */
function modify<O extends object, K extends keyof O, V extends O[K], T>(
  path: K,
  modifier: ModifierFn<O, K, V, T>
): (obj: O) => IsEqual<O[K], unknown> extends true ? unknown : Modify<O, K, T>;

function modify<O extends object, K extends keyof O, V extends O[K], T>(
  obj: O,
  path: K,
  modifier: ModifierFn<O, K, V, T>
): IsEqual<O[K], unknown> extends true ? unknown : Modify<O, K, T>;

function modify<O extends object, K extends keyof O, V extends O[K], T>(
  ...args: [K, ModifierFn<O, K, V, T>] | [O, K, ModifierFn<O, K, V, T>]
) {
  if (args.length === 3) {
    const [obj, path, modifier] = args;
    return fp.update(path)(modifier)(obj);
  }
  const [path, modifier] = args;
  return fp.update(path)(modifier);
}

export { modify };

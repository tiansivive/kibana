/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fp from 'lodash/fp';

import type { IsEqual, Get } from 'type-fest';

type Path = string | readonly string[];

/** Proxy for lodash fp `set` with better type inference. Overloaded to support both imperative and point free style.
 *
 * If an invalid path is passed, the type of the `value` parameter is `never` which should cause a type error.
 * Do **not** do an `as never` assertion to get around this, but instead make sure that the path is correct.
 *
 * Dynamic paths is supported if an array is passed as `path`.
 * If an array is passed as `path`, it needs to be `const`: `["foo", "bar"] as const`
 */
function set<T extends object, P extends Path, V extends Get<T, P>>(
  path: P,
  value: IsEqual<Get<T, P>, unknown> extends true ? never : V
): (obj: T) => IsEqual<Get<T, P>, unknown> extends true ? unknown : T;

function set<T extends object, P extends Path, V extends Get<T, P>>(
  obj: T,
  path: P,
  value: IsEqual<Get<T, P>, unknown> extends true ? never : V
): IsEqual<Get<T, P>, unknown> extends true ? unknown : T;

function set<T extends object, P extends Path, V extends Get<T, P>>(...args: [P, V] | [T, P, V]) {
  if (args.length === 3) {
    const [obj, path, value] = args;
    return fp.set(path)(value)(obj);
  }
  const [path, value] = args;
  return fp.set(path)(value);
}

/** A version of `set` where the object argument is allowed to be `undefined`.
 *
 * When the object argument is defined, this function works like `set`. When the object is `undefined`,
 * `undefined` is also returned. This ensures that we don't accidentally create invalid partial objects.
 */
function maybeSet<T extends object, P extends Path, V extends Get<NonNullable<T>, P>>(
  path: P,
  value: IsEqual<Get<NonNullable<T>, P>, unknown> extends true ? never : V
): (obj: T | undefined) => IsEqual<Get<T, P>, unknown> extends true ? unknown : T | undefined;

function maybeSet<T extends object, P extends Path, V extends Get<NonNullable<T>, P>>(
  obj: T | undefined,
  path: P,
  value: IsEqual<Get<NonNullable<T>, P>, unknown> extends true ? never : V
): IsEqual<Get<NonNullable<T>, P>, unknown> extends true ? unknown : T | undefined;

function maybeSet<T extends object, P extends Path, V extends Get<T, P>>(
  ...args: [P, V] | [T | undefined, P, V]
) {
  if (args.length === 3) {
    const [obj, path, value] = args;
    return obj ? fp.set(path)(value)(obj) : undefined;
  }
  const [path, value] = args;
  return (obj: T | undefined) => (obj ? fp.set(path)(value)(obj) : undefined);
}

export { maybeSet, set };

/** Like `set` but with different argument order. Returns a function that accepts a new value at `path` and returns a new object */
export const setIn =
  <T extends object, P extends Path, V extends Get<NonNullable<T>, P>>(obj: T, path: P) =>
  (value: V) =>
    fp.set(path)(value)(obj);

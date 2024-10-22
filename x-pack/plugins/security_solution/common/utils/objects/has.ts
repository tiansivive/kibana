/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SetRequired } from 'type-fest';

import { isDefined } from '../nullable';

import type { FlattenType, SetNonNullable } from './types';

type Has<Obj, Keys extends keyof Obj> = FlattenType<
  SetNonNullable<SetRequired<Pick<Obj, Keys>, Keys>, Keys>
>;

export function has<O extends object, K extends keyof O>(
  k: K | K[]
): (object: O) => object is O & Has<O, K>;
export function has<O extends object, K extends keyof O>(
  object: O,
  keys: K[]
): object is O & Has<O, K>;
export function has<O extends object, K extends keyof O>(...args: [O, K[]] | [K[]] | [K]) {
  if (args.length === 2) {
    const [object, keys] = args;
    return check(object, keys);
  }

  const [_keys] = args;
  const keys = Array.isArray(_keys) ? _keys : [_keys];
  return (object: O) => check(object, keys);
}

export const check = <O extends object, K extends keyof O>(obj: O, ks: K[]): obj is O & Has<O, K> =>
  ks.every((k) => isDefined(obj[k]));

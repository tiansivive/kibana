/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fp from 'lodash/fp';

import type { FlattenType } from './types';

type Obj = Record<string, unknown>;

/** Proxy for lodash fp `pick` with better type inference. */
function pick<O extends Obj, K extends keyof O>(keys: K[]): (obj: O) => FlattenType<Pick<O, K>>;

function pick<O extends Obj, K extends keyof O>(obj: O, keys: K[]): FlattenType<Pick<O, K>>;

function pick<O extends Obj, K extends keyof O>(...args: [O, K[]] | [K[]]) {
  if (args.length === 2) {
    const [obj, keys] = args;
    return fp.pick(keys)(obj);
  }
  const [keys] = args;
  return (obj: O) => fp.pick(keys)(obj);
}

export { pick };

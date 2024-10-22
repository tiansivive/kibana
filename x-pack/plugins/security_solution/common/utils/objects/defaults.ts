/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fp from 'lodash/fp';
import type { SetRequired } from 'type-fest';

interface Defaults {
  <T extends object>(source: Partial<T>): (obj: T) => SetRequired<T, keyof typeof obj>;
  <T extends object>(obj: T, source: Partial<T>): SetRequired<T, keyof typeof obj>;
}
export const defaults: Defaults = <T>(...args: [Partial<T>] | [T, Partial<T>]) => {
  if (args.length === 2) {
    const [obj, source] = args;
    return fp.defaultsDeep(source, obj);
  }
  const [source] = args;
  return (obj) => fp.defaultsDeep(source, obj);
};

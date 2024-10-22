/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Wrapper around `Object.entries` that preserves strongly typed keys */
export const entries = <T extends object>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>;

/** Wrapper around `Object.fromEntries` that preserves strongly typed keys */
export const fromEntries = <E extends Array<[string | number | symbol, unknown]>>(obj: E) =>
  Object.fromEntries(obj) as Record<E[number][0], E[number][1]>;

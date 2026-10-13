/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** Immutable map update. Queries are small, so copying is cheaper than the cleverness it replaces. */
export const withEntry = <K, V>(m: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> =>
  new Map([...m, [key, value]]);

export const withoutKey = <K, V>(m: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> =>
  new Map([...m].filter(([k]) => k !== key));

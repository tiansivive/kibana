/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Ty } from './types';

/**
 * Signature tables. Each is the single source for both the TypeScript signature and the runtime
 * check in `tables.test.ts`, which compares them with `@elastic/esql-definitions`.
 * Rows read `first argument -> second argument -> result`.
 */

export const ADD = {
  date: { date_period: 'date', time_duration: 'date' },
  date_nanos: { date_period: 'date_nanos', time_duration: 'date_nanos' },
  date_period: { date: 'date', date_nanos: 'date_nanos', date_period: 'date_period' },
  double: { double: 'double', integer: 'double', long: 'double' },
  integer: { double: 'double', integer: 'integer', long: 'long' },
  long: { double: 'double', integer: 'long', long: 'long' },
  time_duration: { date: 'date', date_nanos: 'date_nanos', time_duration: 'time_duration' },
  unsigned_long: { unsigned_long: 'unsigned_long' },
} as const;

export const GREATER_THAN = {
  date: { date: 'boolean', date_nanos: 'boolean' },
  date_nanos: { date: 'boolean', date_nanos: 'boolean' },
  double: { double: 'boolean', integer: 'boolean', long: 'boolean' },
  integer: { double: 'boolean', integer: 'boolean', long: 'boolean' },
  ip: { ip: 'boolean' },
  keyword: { keyword: 'boolean', text: 'boolean' },
  long: { double: 'boolean', integer: 'boolean', long: 'boolean' },
  text: { keyword: 'boolean', text: 'boolean' },
  unsigned_long: { unsigned_long: 'boolean' },
  version: { version: 'boolean' },
} as const;

export const EQUALS = {
  ...GREATER_THAN,
  boolean: { boolean: 'boolean' },
  geo_point: { geo_point: 'boolean' },
} as const;

/** Unary tables: argument type -> result type. */
export const ABS = {
  double: 'double',
  integer: 'integer',
  long: 'long',
  unsigned_long: 'unsigned_long',
} as const;

export const AVG = { double: 'double', integer: 'double', long: 'double' } as const;
export const SUM = { double: 'double', integer: 'long', long: 'long' } as const;

export const MAX = {
  boolean: 'boolean',
  date: 'date',
  date_nanos: 'date_nanos',
  double: 'double',
  integer: 'integer',
  ip: 'ip',
  keyword: 'keyword',
  long: 'long',
  text: 'keyword',
  unsigned_long: 'unsigned_long',
  version: 'version',
} as const;

/** `TOP(field, limit, order)`: the three-argument form. */
export const TOP = {
  boolean: 'boolean',
  date: 'date',
  double: 'double',
  integer: 'integer',
  ip: 'ip',
  keyword: 'keyword',
  long: 'long',
  text: 'keyword',
} as const;

export type BinaryTable = { readonly [A in Ty]?: { readonly [B in Ty]?: Ty } };
export type UnaryTable = { readonly [A in Ty]?: Ty };

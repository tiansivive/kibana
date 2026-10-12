/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** ES|QL value types covered by the DSL. Signatures mentioning other types are out of scope. */
export const TYS = [
  'boolean',
  'keyword',
  'text',
  'ip',
  'version',
  'date',
  'date_nanos',
  'integer',
  'long',
  'unsigned_long',
  'double',
  'geo_point',
  'date_period',
  'time_duration',
] as const;

export type Ty = (typeof TYS)[number];

/**
 * Where an expression may appear.
 * - `const`: a literal or foldable expression, accepted where ES|QL requires a constant parameter.
 * - `scalar`: evaluated per row.
 * - `agg`: an aggregate, valid only in the aggregation position of `STATS`.
 * - `grouping`: a grouping function such as `BUCKET`, valid only in `BY`.
 */
export type Kind = 'const' | 'scalar' | 'agg' | 'grouping';
export type Operand = Exclude<Kind, 'grouping'>;
export type Scalarish = 'const' | 'scalar';

interface JoinTable {
  const: { const: 'const'; scalar: 'scalar'; agg: 'agg' };
  scalar: { const: 'scalar'; scalar: 'scalar'; agg: never };
  agg: { const: 'agg'; scalar: never; agg: 'agg' };
}

/** Kind of an expression combining operands of kinds `A` and `B`. Mixing `scalar` with `agg` has no kind. */
export type Join<A extends Operand, B extends Operand> = JoinTable[A][B];

/** Kinds that may be combined with an operand of kind `A`. Used as a constraint so mismatches are reported at the offending argument. */
export type CompatibleWith<A extends Operand> = A extends 'const'
  ? Operand
  : A extends 'scalar'
  ? Scalarish
  : 'const' | 'agg';

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

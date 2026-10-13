/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Kind } from '../kind';

export type Operand = Exclude<Kind, 'grouping'>;
export type Scalarish = 'const' | 'scalar';

/** Kind of an expression combining operands of kinds `A` and `B`. Mixing `scalar` with `agg` has no kind. */
export type Join<A extends Operand, B extends Operand> = JoinTable[A][B];

interface JoinTable {
  const: { const: 'const'; scalar: 'scalar'; agg: 'agg' };
  scalar: { const: 'scalar'; scalar: 'scalar'; agg: never };
  agg: { const: 'agg'; scalar: never; agg: 'agg' };
}

/** Kinds that may be combined with an operand of kind `A`. Used as a constraint so mismatches are reported at the offending argument. */
export type CompatibleWith<A extends Operand> = A extends 'const'
  ? Operand
  : A extends 'scalar'
  ? Scalarish
  : 'const' | 'agg';

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

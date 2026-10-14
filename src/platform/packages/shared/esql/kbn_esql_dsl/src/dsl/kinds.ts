/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Kind } from '../vocabulary/kind';
import type { AnyExpr, Expr } from './expr';
import type { ExprType } from './inferred';

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

/**
 * The kind of a call that takes the kinds `R` after one of kind `K`. A list whose length is not
 * known, such as a spread array, joins all its kinds at once.
 */
export type JoinAll<K extends Operand, R extends readonly Operand[]> = number extends R['length']
  ? Join<K, R[number]>
  : R extends readonly [infer H extends Operand, ...infer Tail extends readonly Operand[]]
  ? JoinAll<Join<K, H>, Tail>
  : K;

/** The ES|QL types of a list of expressions. */
export type TypesOf<E extends readonly AnyExpr[]> = {
  readonly [I in keyof E]: E[I] extends Expr<infer T, Kind> ? T : never;
};

/** The kinds of a list of expressions. */
export type KindsOf<E extends readonly AnyExpr[]> = {
  readonly [I in keyof E]: E[I] extends Expr<ExprType, infer K extends Operand> ? K : never;
};

/** The further arguments of a variadic call: one expression of type `T` for each kind in `R`. */
export type Rest<T extends ExprType, R extends readonly Operand[]> = {
  readonly [I in keyof R]: Expr<T, R[I]>;
};

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

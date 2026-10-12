/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnyExpr, Expr } from './expr';
import { call } from './expr';
import type { ABS, ADD, AVG, EQUALS, GREATER_THAN, MAX, SUM, TOP } from './tables';
import type { CompatibleWith, Join, Operand, Scalarish, Ty } from './types';

/** Second-argument types accepted after a first argument of type `A`, and the result type for `(A, B)`. */
type Second<T, A extends keyof T> = Extract<keyof T[A], Ty>;
type Result<T, A extends keyof T, B> = Extract<
  T[A] extends infer R ? (B extends keyof R ? R[B] : never) : never,
  Ty
>;

/**
 * Binary operands are typed with separate kind parameters so inference never unions them.
 * `KB` is constrained by `KA`, which reports a `scalar` / `agg` mix at the second argument.
 */

export const add = <
  A extends keyof typeof ADD,
  B extends Second<typeof ADD, A>,
  KA extends Operand,
  KB extends CompatibleWith<KA>
>(
  l: Expr<A, KA>,
  r: Expr<B, KB>
): Expr<Result<typeof ADD, A, B>, Join<KA, KB>> => call('add', l, r);

export const gt = <
  A extends keyof typeof GREATER_THAN,
  B extends Second<typeof GREATER_THAN, A>,
  KA extends Operand,
  KB extends CompatibleWith<KA>
>(
  l: Expr<A, KA>,
  r: Expr<B, KB>
): Expr<'boolean', Join<KA, KB>> => call('greater_than', l, r);

export const eq = <
  A extends keyof typeof EQUALS,
  B extends Second<typeof EQUALS, A>,
  KA extends Operand,
  KB extends CompatibleWith<KA>
>(
  l: Expr<A, KA>,
  r: Expr<B, KB>
): Expr<'boolean', Join<KA, KB>> => call('equals', l, r);

export const and = <KA extends Operand, KB extends CompatibleWith<KA>>(
  l: Expr<'boolean', KA>,
  r: Expr<'boolean', KB>
): Expr<'boolean', Join<KA, KB>> => call('and', l, r);

export const or = <KA extends Operand, KB extends CompatibleWith<KA>>(
  l: Expr<'boolean', KA>,
  r: Expr<'boolean', KB>
): Expr<'boolean', Join<KA, KB>> => call('or', l, r);

export const abs = <T extends keyof typeof ABS, K extends Operand>(
  e: Expr<T, K>
): Expr<(typeof ABS)[T], K> => call('abs', e);

/** `decimals` is a constant parameter: a column is rejected. */
export const round = <T extends keyof typeof ABS, K extends Operand>(
  e: Expr<T, K>,
  decimals?: Expr<'integer' | 'long', 'const'>
): Expr<T, K> => call('round', ...(decimals ? [e, decimals] : [e]));

/** Aggregates take per-row arguments, so an aggregate nested in an aggregate is rejected. */
export const avg = <T extends keyof typeof AVG>(
  e: Expr<T, Scalarish>
): Expr<(typeof AVG)[T], 'agg'> => call('avg', e);

export const sum = <T extends keyof typeof SUM>(
  e: Expr<T, Scalarish>
): Expr<(typeof SUM)[T], 'agg'> => call('sum', e);

export const max = <T extends keyof typeof MAX>(
  e: Expr<T, Scalarish>
): Expr<(typeof MAX)[T], 'agg'> => call('max', e);

export const count = (e?: Expr<Ty, Scalarish>): Expr<'long', 'agg'> =>
  call('count', ...(e ? [e] : []));

export const top = <T extends keyof typeof TOP>(
  field: Expr<T, Scalarish>,
  limit: Expr<'integer', 'const'>,
  order: Expr<'keyword', 'const'>
): Expr<(typeof TOP)[T], 'agg'> => call('top', field, limit, order);

export type { AnyExpr };

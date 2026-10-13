/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ABS,
  ADD,
  AVG,
  EQUALS,
  GREATER_THAN,
  MAX,
  SUM,
  TOP,
} from '../core/polymorphism/standard/tables';
import type { EsqlType } from '../vocabulary/esql_type';
import type { Kind } from '../vocabulary/kind';
import type { AnyExpr, Expr } from './expr';
import { call, mk } from './expr';
import type { CompatibleWith, Join, Operand, Scalarish } from './kinds';

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

export const round = <T extends keyof typeof ABS, K extends Operand>(e: Expr<T, K>): Expr<T, K> =>
  call('round', e);

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

export const count = (e: Expr<EsqlType, Scalarish>): Expr<'long', 'agg'> => call('count', e);

export const top = <T extends keyof typeof TOP>(
  field: Expr<T, Scalarish>,
  limit: Expr<'integer', 'const'>,
  order: Expr<'keyword', 'const'>
): Expr<(typeof TOP)[T], 'agg'> => call('top', field, limit, order);

/** Declares the type of a column whose type is not known statically. The analyzer enforces it. */
export const typed = <T extends EsqlType, K extends Kind>(ty: T, e: Expr<never, K>): Expr<T, K> =>
  mk({ tag: 'ann', ty, expr: e.node });

/**
 * Second-argument types accepted after a first argument of type `A`, and the result type for `(A, B)`.
 * `never` marks a column whose type is not known statically. It is accepted everywhere and yields
 * `never`, leaving the check to `analyze`.
 */
type Second<T, A extends keyof T> = [A] extends [never] ? EsqlType : Extract<keyof T[A], EsqlType>;

type Result<T, A extends keyof T, B> = [A] extends [never]
  ? never
  : [B] extends [never]
  ? never
  : Extract<T[A] extends infer R ? (B extends keyof R ? R[B] : never) : never, EsqlType>;

export type { AnyExpr };

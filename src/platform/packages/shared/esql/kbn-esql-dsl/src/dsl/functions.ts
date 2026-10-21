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
  STRING,
  SUM,
  TOP,
} from '../core/polymorphism/standard/tables';
import type { EsqlType } from '../vocabulary/esql_type';
import type { Kind } from '../vocabulary/kind';
import type { AnyExpr, Expr } from './expr';
import { call, mk } from './expr';
import type { ExprType, Inferred, Lookup } from './inferred';
import type {
  CompatibleWith,
  Join,
  JoinAll,
  KindsOf,
  Operand,
  Rest,
  Scalarish,
  TypesOf,
} from './kinds';

/**
 * Binary operands are typed with separate kind parameters so inference never unions them.
 * `KB` is constrained by `KA`, which reports a `scalar` / `agg` mix at the second argument.
 */

/**
 * Binary operators that take any number of operands fold to the left, so `add(a, b, c)` is
 * `(a + b) + c`, which ES|QL prints and reads as `a + b + c`. The operands after the first two
 * must suit the type of the sum so far and the kind of the operands before them. The two-operand
 * form is its own signature because most calls are binary and the variadic one costs more to check.
 */
export function add<
  A extends keyof typeof ADD | Inferred,
  B extends Second<typeof ADD, A>,
  KA extends Operand,
  KB extends CompatibleWith<KA>
>(l: Expr<A, KA>, r: Expr<B, KB>): Expr<Result<typeof ADD, A, B>, Join<KA, KB>>;
export function add<
  A extends keyof typeof ADD | Inferred,
  B extends Second<typeof ADD, A>,
  KA extends Operand,
  KB extends CompatibleWith<KA>,
  E extends readonly [
    Expr<Second<typeof ADD, Result<typeof ADD, A, B>>, CompatibleWith<Join<KA, KB>>>,
    ...Expr<Second<typeof ADD, Result<typeof ADD, A, B>>, CompatibleWith<Join<KA, KB>>>[]
  ]
>(
  l: Expr<A, KA>,
  r: Expr<B, KB>,
  ...rest: E
): Expr<SumOf<A | B | TypesOf<E>[number]>, JoinAll<Join<KA, KB>, KindsOf<E>>>;
export function add(l: AnyExpr, r: AnyExpr, ...rest: readonly AnyExpr[]): unknown {
  return fold('add', [l, r, ...rest]);
}

export const gt = <
  A extends keyof typeof GREATER_THAN | Inferred,
  B extends Second<typeof GREATER_THAN, A>,
  KA extends Operand,
  KB extends CompatibleWith<KA>
>(
  l: Expr<A, KA>,
  r: Expr<B, KB>
): Expr<'boolean', Join<KA, KB>> => call('greater_than', l, r);

export const eq = <
  A extends keyof typeof EQUALS | Inferred,
  B extends Second<typeof EQUALS, A>,
  KA extends Operand,
  KB extends CompatibleWith<KA>
>(
  l: Expr<A, KA>,
  r: Expr<B, KB>
): Expr<'boolean', Join<KA, KB>> => call('equals', l, r);

export const and = <
  KA extends Operand,
  KB extends CompatibleWith<KA>,
  R extends readonly CompatibleWith<Join<KA, KB>>[]
>(
  l: Expr<Condition, KA>,
  r: Expr<Condition, KB>,
  ...rest: Rest<Condition, R>
): Expr<'boolean', JoinAll<Join<KA, KB>, R>> => fold('and', [l, r, ...rest]);

export const or = <
  KA extends Operand,
  KB extends CompatibleWith<KA>,
  R extends readonly CompatibleWith<Join<KA, KB>>[]
>(
  l: Expr<Condition, KA>,
  r: Expr<Condition, KB>,
  ...rest: Rest<Condition, R>
): Expr<'boolean', JoinAll<Join<KA, KB>, R>> => fold('or', [l, r, ...rest]);

export const abs = <T extends keyof typeof ABS | Inferred, K extends Operand>(
  e: Expr<T, K>
): Expr<Lookup<typeof ABS, T>, K> => call('abs', e);

export const round = <
  T extends keyof typeof ABS | Inferred,
  K extends Operand,
  KD extends CompatibleWith<K> | 'const' = 'const'
>(
  e: Expr<T, K>,
  decimals?: Expr<keyof typeof AVG | Inferred, KD>
): Expr<T, Join<K, KD>> => call('round', e, decimals);

export const substring = <
  T extends keyof typeof STRING | Inferred,
  K extends Operand,
  KS extends CompatibleWith<K>,
  KL extends CompatibleWith<Join<K, KS>> | 'const' = 'const'
>(
  s: Expr<T, K>,
  start: Expr<'integer', KS>,
  length?: Expr<'integer', KL>
): Expr<Lookup<typeof STRING, T>, Join<Join<K, KS>, KL>> => call('substring', s, start, length);

/** Every argument has the type of the first, where `text` and `keyword` count as the same. */
export const coalesce = <
  T extends EsqlType | Inferred,
  K extends Operand,
  R extends readonly CompatibleWith<K>[]
>(
  first: Expr<T, K>,
  rest?: Rest<Alike<T>, R>
): Expr<NormalForm<T>, JoinAll<K, R>> => call('coalesce', first, rest);

/** Each argument is `keyword` or `text`, in any order, and there are at least two. */
export const concat = <
  KA extends Operand,
  KB extends CompatibleWith<KA>,
  R extends readonly CompatibleWith<Join<KA, KB>>[]
>(
  items: readonly [Expr<Text, KA>, Expr<Text, KB>, ...Rest<Text, R>]
): Expr<'keyword', JoinAll<Join<KA, KB>, R>> => call('concat', items);

/**
 * `CASE`: each branch is a condition and the value used when it holds, and `otherwise` is used
 * when none does. Every value has the type of the first, where `text` and `keyword` count as the
 * same, and a call with no `otherwise` is null when no condition holds.
 */
export const caseOf = <
  T extends EsqlType | Inferred,
  KC extends Operand,
  KV extends CompatibleWith<KC>,
  R extends readonly Branch<T, Join<KC, KV>>[],
  KE extends CompatibleWith<Join<KC, KV>> | 'const' = 'const'
>(
  branches: readonly [readonly [Expr<Condition, KC>, Expr<T, KV>], ...R],
  otherwise?: Expr<Alike<T>, KE>
): Expr<NormalForm<T>, JoinAll<Join<KC, KV>, [...BranchKinds<R>, KE]>> =>
  call('case', branches, otherwise);

export const isNull = <K extends Operand>(e: Expr<ExprType, K>): Expr<'boolean', K> =>
  call('is_null', e);

export const isNotNull = <K extends Operand>(e: Expr<ExprType, K>): Expr<'boolean', K> =>
  call('is_not_null', e);

/** `TO_STRING`, which is what `x::keyword` means. */
export const toKeyword = <K extends Operand>(e: Expr<ExprType, K>): Expr<'keyword', K> =>
  call('to_string', e);

export const toBase64 = <K extends Operand>(
  e: Expr<keyof typeof STRING | Inferred, K>
): Expr<'keyword', K> => call('to_base64', e);

/** The query is a constant string. The columns it names are not checked. */
export const kql = (
  query: Expr<keyof typeof STRING | Inferred, 'const'>
): Expr<'boolean', 'scalar'> => call('kql', query);

export const mvPseriesWeightedSum = <T extends keyof typeof ABS | Inferred, K extends Operand>(
  values: Expr<T, K>,
  p: Expr<'double', 'const'>
): Expr<'double', K> => call('mv_pseries_weighted_sum', values, p);

/** Aggregates take per-row arguments, so an aggregate nested in an aggregate is rejected. */
export const avg = <T extends keyof typeof AVG | Inferred>(
  e: Expr<T, Scalarish>
): Expr<Lookup<typeof AVG, T>, 'agg'> => call('avg', e);

export const sum = <T extends keyof typeof SUM | Inferred>(
  e: Expr<T, Scalarish>
): Expr<Lookup<typeof SUM, T>, 'agg'> => call('sum', e);

export const max = <T extends keyof typeof MAX | Inferred>(
  e: Expr<T, Scalarish>
): Expr<Lookup<typeof MAX, T>, 'agg'> => call('max', e);

export const count = (e: Expr<ExprType, Scalarish>): Expr<'long', 'agg'> => call('count', e);

export const top = <T extends keyof typeof TOP | Inferred>(
  field: Expr<T, Scalarish>,
  limit: Expr<'integer', 'const'>,
  order: Expr<'keyword', 'const'>
): Expr<Lookup<typeof TOP, T>, 'agg'> => call('top', field, limit, order);

/** Declares the type of a column whose type is not known statically. The analyzer enforces it. */
export const typed = <T extends EsqlType, K extends Kind>(
  ty: T,
  e: Expr<Inferred, K>
): Expr<T, K> => mk({ tag: 'ann', ty, expr: e.node });

/** Applies a binary function of the library to a list of operands from the left. */
const fold = <T extends ExprType, K extends Kind>(
  fn: string,
  operands: readonly AnyExpr[]
): Expr<T, K> => {
  const [first, ...others] = operands;
  return mk(others.reduce<AnyExpr>((folded, next) => call(fn, folded, next), first).node);
};

/**
 * The type of a sum of three or more operands. It is the widest number among them, or the type
 * of the time value that quantities are added to, and it does not follow the order of the
 * operands, so a combination that is not valid has some type here and is reported by `typecheck`.
 * A fold over the table of `add` gives the same answer for valid operands, but costs far more to
 * check, because TypeScript expands a recursive type over the whole table to check its signature.
 */
type SumOf<U extends ExprType> = [U] extends [EsqlType]
  ? [U] extends ['integer' | 'long' | 'double']
    ? 'double' extends U
      ? 'double'
      : 'long' extends U
      ? 'long'
      : 'integer'
    : [U] extends ['unsigned_long']
    ? 'unsigned_long'
    : 'date' extends U
    ? 'date'
    : 'date_nanos' extends U
    ? 'date_nanos'
    : Inferred
  : Inferred;

/**
 * Second-argument types accepted after a first argument of type `A`, and the result type for `(A, B)`.
 * `Inferred` marks a column whose type is not known statically. It is accepted everywhere and
 * yields `Inferred`, leaving the check to `typecheck`.
 */
type Second<Table, A> = A extends keyof Table
  ? Extract<keyof Table[A], EsqlType> | Inferred
  : ExprType;

type Text = keyof typeof STRING | Inferred;

/** What `and` and `or` take: a boolean, or a column whose type is not known yet. */
type Condition = 'boolean' | Inferred;

/**
 * What may follow an argument of type `T` where all must have the same normal form. A column of
 * unknown type could be anything, so it takes any.
 */
type Alike<T> = T extends Inferred
  ? ExprType
  : (NormalForm<T> extends 'keyword' ? 'keyword' | 'text' : T) | Inferred;

/** A condition and a value of the same type as the others, in kinds that combine with `K`. */
type Branch<T extends ExprType, K extends Operand> = readonly [
  Expr<Condition, CompatibleWith<K>>,
  Expr<Alike<T>, CompatibleWith<K>>
];

/** The kinds of the conditions and values of branches, in order. */
type BranchKinds<R extends readonly (readonly [AnyExpr, AnyExpr])[]> = R extends readonly [
  readonly [Expr<ExprType, infer KC extends Operand>, Expr<ExprType, infer KV extends Operand>],
  ...infer Tail extends readonly (readonly [AnyExpr, AnyExpr])[]
]
  ? [KC, KV, ...BranchKinds<Tail>]
  : [];

type NormalForm<T> = T extends 'text' ? 'keyword' : T;

type Result<Table, A, B> = A extends keyof Table
  ? B extends keyof Table[A]
    ? Extract<Table[A][B], EsqlType>
    : Inferred
  : Inferred;

export type { AnyExpr };

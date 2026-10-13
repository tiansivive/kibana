/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CommandNode, Named, QueryAst, SortSpec } from '../surface/query';
import type { AnyExpr, Expr, TyOf } from './expr';
import { mk } from './expr';
import type { ExprType, Inferred } from './inferred';
import type { Scalarish, Simplify } from './kinds';

declare const schemaBrand: unique symbol;
declare const lacksBrand: unique symbol;
declare const droppedBrand: unique symbol;

/**
 * An immutable query. `G` is the schema of the rows flowing out of the last stage.
 * Methods are sugar over the stage functions below; `pipe` applies a stage built elsewhere.
 */
export interface Q<G extends object> {
  readonly [schemaBrand]?: G;
  readonly ast: QueryAst;
  /** Low level: appends a command and declares the resulting schema. Stages are the supported entry point. */
  append<B extends object>(command: CommandNode): Q<B>;
  pipe<B extends object>(stage: Stage<G, B>): Q<B>;
  where(f: (c: Cols<G>) => Expr<'boolean', Scalarish>): Q<G>;
  eval<N extends string, T extends ExprType>(
    name: N,
    f: (c: Cols<G>) => Expr<T, Scalarish>
  ): Q<Extend<G, N, T>>;
  stats<
    A extends Record<string, Expr<ExprType, 'agg'>>,
    B extends Record<string, Expr<ExprType, 'scalar' | 'grouping'>> = {}
  >(
    aggs: (c: Cols<G>) => A,
    by?: (c: Cols<G>) => B
  ): Q<Simplify<TyOf<A> & TyOf<B>>>;
  keep<K extends keyof G & string>(...columns: K[]): Q<Simplify<Pick<G, K>>>;
  drop<K extends keyof G & string>(...columns: K[]): Q<Remove<G, K>>;
  sort(f: (c: Cols<G>) => ReadonlyArray<Expr<ExprType, Scalarish> | SortKey>): Q<G>;
  limit(n: number): Q<G>;
}

/**
 * The columns visible to a stage's callback. Each is a scalar expression of the column's type. A
 * column dropped from an open row is `Dropped`, which no function accepts.
 */
export type Cols<G> = {
  readonly [K in keyof G & string]: [G[K]] extends [ExprType] ? Expr<G[K], 'scalar'> : never;
} & { readonly [K in Lacked<G>]: Dropped };

export type Stage<A extends object, B extends object> = (q: Q<A>) => Q<B>;

/**
 * The source of a query. Without a schema the columns are open: any name can be read and its type
 * is `Inferred`, and `typecheck` works out the types from how the columns are used.
 */
export const from = <G extends Record<keyof G, ExprType> = OpenSchema>(
  ...indices: string[]
): Q<G> => makeQ<G>({ source: { tag: 'from', indices }, pipe: [] });

/** Schema of a source whose columns are not known statically. */
export interface OpenSchema {
  readonly [column: string]: Inferred;
}

/** A column dropped from an open row. Reading it is a type error, as it is an error in ES|QL. */
export interface Dropped {
  readonly [droppedBrand]: true;
}

/** A row's schema after `EVAL` adds or replaces the column `N`. */
type Extend<G, N extends string, T extends ExprType> = Simplify<
  Omit<G, N | typeof lacksBrand> & Record<N, T> & Lacking<Exclude<Lacked<G>, N>>
>;

/**
 * A row's schema after `DROP`. A closed row loses the column. An open row cannot, since it is any
 * column, so it remembers the columns it lacks.
 */
type Remove<G, K extends string> = string extends keyof G
  ? Simplify<Omit<G, K | typeof lacksBrand> & Lacking<Lacked<G> | K>>
  : Simplify<Omit<G, K>>;

type Lacked<G> = G extends { readonly [lacksBrand]: infer L extends string } ? L : never;

type Lacking<L extends string> = [L] extends [never] ? {} : { readonly [lacksBrand]: L };

export const where =
  <G extends object>(f: (c: Cols<G>) => Expr<'boolean', Scalarish>): Stage<G, G> =>
  (q) =>
    q.append({ tag: 'where', cond: f(cols<G>()).node });

export const evalAs =
  <G extends object, N extends string, T extends ExprType>(
    name: N,
    f: (c: Cols<G>) => Expr<T, Scalarish>
  ): Stage<G, Extend<G, N, T>> =>
  (q) =>
    q.append({ tag: 'eval', name, expr: f(cols<G>()).node });

export const stats =
  <
    G extends object,
    A extends Record<string, Expr<ExprType, 'agg'>>,
    B extends Record<string, Expr<ExprType, 'scalar' | 'grouping'>> = {}
  >(
    aggs: (c: Cols<G>) => A,
    by?: (c: Cols<G>) => B
  ): Stage<G, Simplify<TyOf<A> & TyOf<B>>> =>
  (q) =>
    q.append({
      tag: 'stats',
      aggs: entriesOf(aggs(cols<G>())),
      by: by ? entriesOf(by(cols<G>())) : [],
    });

export const keep =
  <G extends object, K extends keyof G & string>(...columns: K[]): Stage<G, Simplify<Pick<G, K>>> =>
  (q) =>
    q.append({ tag: 'keep', cols: columns });

export const drop =
  <G extends object, K extends keyof G & string>(...columns: K[]): Stage<G, Remove<G, K>> =>
  (q) =>
    q.append({ tag: 'drop', cols: columns });

export const sort =
  <G extends object>(
    f: (c: Cols<G>) => ReadonlyArray<Expr<ExprType, Scalarish> | SortKey>
  ): Stage<G, G> =>
  (q) =>
    q.append({
      tag: 'sort',
      keys: f(cols<G>()).map(
        (k): SortSpec => (isSortKey(k) ? k.sort : { expr: k.node, dir: 'asc' })
      ),
    });

export const limit =
  <G extends object>(n: number): Stage<G, G> =>
  (q) => {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`limit must be a non-negative integer, got ${n}`);
    }
    return q.append({ tag: 'limit', n });
  };

export const asc = (e: Expr<ExprType, Scalarish>): SortKey => ({
  sort: { expr: e.node, dir: 'asc' },
});

export const desc = (e: Expr<ExprType, Scalarish>): SortKey => ({
  sort: { expr: e.node, dir: 'desc' },
});

export interface SortKey {
  readonly sort: SortSpec;
}

const makeQ = <G extends object>(ast: QueryAst): Q<G> => {
  const q: Q<G> = {
    ast,
    append: (command) => makeQ({ source: ast.source, pipe: [...ast.pipe, command] }),
    pipe: (stage) => stage(q),
    where: (f) => stage(where(f)),
    eval: (name, f) => stage(evalAs(name, f)),
    stats: (aggs, by) => stage(stats(aggs, by)),
    keep: (...columns) => stage(keep(...columns)),
    drop: (...columns) => stage(drop(...columns)),
    sort: (f) => stage(sort(f)),
    limit: (n) => stage(limit(n)),
  };
  const stage = <B extends object>(s: Stage<G, B>): Q<B> => s(q);
  return q;
};

const cols = <G>(): Cols<G> =>
  new Proxy<Cols<G>>(Object.create(null), {
    get: (_target, name) => (typeof name === 'string' ? mk({ tag: 'col', name }) : undefined),
  });

const entriesOf = (record: Record<string, AnyExpr>): Named[] =>
  Object.entries(record).map(([name, e]) => ({ name, expr: e.node }));

const isSortKey = (x: Expr<ExprType, Scalarish> | SortKey): x is SortKey => 'sort' in x;

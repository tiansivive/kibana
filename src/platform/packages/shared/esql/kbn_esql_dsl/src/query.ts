/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnyExpr, Expr, ExprNode, TyOf } from './expr';
import { mk } from './expr';
import type { Scalarish, Simplify, Ty } from './types';

export interface Named {
  readonly name: string;
  readonly expr: ExprNode;
}

export interface SortSpec {
  readonly expr: ExprNode;
  readonly dir: 'asc' | 'desc';
}

export type CommandNode =
  | { readonly tag: 'where'; readonly cond: ExprNode }
  | { readonly tag: 'eval'; readonly name: string; readonly expr: ExprNode }
  | { readonly tag: 'stats'; readonly aggs: readonly Named[]; readonly by: readonly Named[] }
  | { readonly tag: 'keep'; readonly cols: readonly string[] }
  | { readonly tag: 'drop'; readonly cols: readonly string[] }
  | { readonly tag: 'sort'; readonly keys: readonly SortSpec[] }
  | { readonly tag: 'limit'; readonly n: number };

export interface QueryAst {
  readonly source: { readonly tag: 'from'; readonly indices: readonly string[] };
  readonly pipe: readonly CommandNode[];
}

/** The columns visible to a stage's callback. Each is a scalar expression of the column's type. */
export type Cols<G> = {
  readonly [K in keyof G & string]: G[K] extends Ty ? Expr<G[K], 'scalar'> : never;
};

declare const schemaBrand: unique symbol;

export type Stage<A extends object, B extends object> = (q: Q<A>) => Q<B>;

const cols = <G>(): Cols<G> =>
  new Proxy<Cols<G>>(Object.create(null), {
    get: (_target, name) => (typeof name === 'string' ? mk({ tag: 'col', name }) : undefined),
  });

const entriesOf = (record: Record<string, AnyExpr>): Named[] =>
  Object.entries(record).map(([name, e]) => ({ name, expr: e.node }));

/**
 * An immutable query. `G` is the schema of the rows flowing out of the last stage.
 * Methods are sugar over the stage functions below; `pipe` applies a stage built elsewhere.
 */
export class Q<G extends object> {
  declare readonly [schemaBrand]?: G;

  constructor(public readonly ast: QueryAst) {}

  /** Low level: appends a command and declares the resulting schema. Stages are the supported entry point. */
  append<B extends object>(command: CommandNode): Q<B> {
    return new Q<B>({ source: this.ast.source, pipe: [...this.ast.pipe, command] });
  }

  pipe<B extends object>(stage: Stage<G, B>): Q<B> {
    return stage(this);
  }

  where(f: (c: Cols<G>) => Expr<'boolean', Scalarish>): Q<G> {
    return this.pipe(where(f));
  }

  eval<N extends string, T extends Ty>(
    name: N,
    f: (c: Cols<G>) => Expr<T, Scalarish>
  ): Q<Simplify<Omit<G, N> & Record<N, T>>> {
    return this.pipe(evalAs(name, f));
  }

  stats<
    A extends Record<string, Expr<Ty, 'agg'>>,
    B extends Record<string, Expr<Ty, 'scalar' | 'grouping'>> = {}
  >(aggs: (c: Cols<G>) => A, by?: (c: Cols<G>) => B): Q<Simplify<TyOf<A> & TyOf<B>>> {
    return this.pipe(stats(aggs, by));
  }

  keep<K extends keyof G & string>(...columns: K[]): Q<Simplify<Pick<G, K>>> {
    return this.pipe(keep(...columns));
  }

  drop<K extends keyof G & string>(...columns: K[]): Q<Simplify<Omit<G, K>>> {
    return this.pipe(drop(...columns));
  }

  sort(f: (c: Cols<G>) => ReadonlyArray<Expr<Ty, Scalarish> | SortKey>): Q<G> {
    return this.pipe(sort(f));
  }

  limit(n: number): Q<G> {
    return this.pipe(limit(n));
  }
}

export interface SortKey {
  readonly sort: SortSpec;
}

export const asc = (e: Expr<Ty, Scalarish>): SortKey => ({ sort: { expr: e.node, dir: 'asc' } });
export const desc = (e: Expr<Ty, Scalarish>): SortKey => ({ sort: { expr: e.node, dir: 'desc' } });

export const from = <G extends Record<keyof G, Ty>>(...indices: string[]): Q<G> =>
  new Q<G>({ source: { tag: 'from', indices }, pipe: [] });

export const where =
  <G extends object>(f: (c: Cols<G>) => Expr<'boolean', Scalarish>): Stage<G, G> =>
  (q) =>
    q.append({ tag: 'where', cond: f(cols<G>()).node });

export const evalAs =
  <G extends object, N extends string, T extends Ty>(
    name: N,
    f: (c: Cols<G>) => Expr<T, Scalarish>
  ): Stage<G, Simplify<Omit<G, N> & Record<N, T>>> =>
  (q) =>
    q.append({ tag: 'eval', name, expr: f(cols<G>()).node });

export const stats =
  <
    G extends object,
    A extends Record<string, Expr<Ty, 'agg'>>,
    B extends Record<string, Expr<Ty, 'scalar' | 'grouping'>> = {}
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
  <G extends object, K extends keyof G & string>(...columns: K[]): Stage<G, Simplify<Omit<G, K>>> =>
  (q) =>
    q.append({ tag: 'drop', cols: columns });

const isSortKey = (x: Expr<Ty, Scalarish> | SortKey): x is SortKey => 'sort' in x;

export const sort =
  <G extends object>(
    f: (c: Cols<G>) => ReadonlyArray<Expr<Ty, Scalarish> | SortKey>
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

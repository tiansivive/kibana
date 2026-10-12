/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Kind, Ty } from './types';

export type ExprNode =
  | { readonly tag: 'col'; readonly name: string }
  | {
      readonly tag: 'lit';
      readonly ty: Ty;
      readonly value: string | number | boolean;
    }
  | { readonly tag: 'param'; readonly name: string; readonly ty: Ty }
  | { readonly tag: 'call'; readonly fn: string; readonly args: readonly ExprNode[] };

export declare const exprBrand: unique symbol;

/**
 * A typed expression. `T` is its ES|QL type and `K` says where it may appear.
 * The brand makes both parameters structural, so `Expr<'long', K>` and `Expr<'keyword', K>` are distinct.
 */
export interface Expr<T extends Ty, K extends Kind> {
  readonly node: ExprNode;
  readonly [exprBrand]?: { readonly ty: T; readonly kind: K };
}

export type AnyExpr = Expr<Ty, Kind>;

export type TyOf<R> = {
  [P in keyof R]: R[P] extends Expr<infer T extends Ty, Kind> ? T : never;
};

export const mk = <T extends Ty, K extends Kind>(node: ExprNode): Expr<T, K> => ({ node });

export const call = <T extends Ty, K extends Kind>(
  fn: string,
  ...args: readonly AnyExpr[]
): Expr<T, K> => mk({ tag: 'call', fn, args: args.map((a) => a.node) });

const integral = (n: number, what: string): number => {
  if (!Number.isInteger(n)) {
    throw new Error(`${what} literal must be an integer, got ${n}`);
  }
  return n;
};

/** Literals are explicit about their ES|QL type because JS cannot tell `2` from `2.0`. */
export const lit = {
  int: (n: number): Expr<'integer', 'const'> =>
    mk({ tag: 'lit', ty: 'integer', value: integral(n, 'integer') }),
  long: (n: number): Expr<'long', 'const'> =>
    mk({ tag: 'lit', ty: 'long', value: integral(n, 'long') }),
  double: (n: number): Expr<'double', 'const'> => mk({ tag: 'lit', ty: 'double', value: n }),
  str: (s: string): Expr<'keyword', 'const'> => mk({ tag: 'lit', ty: 'keyword', value: s }),
  bool: (b: boolean): Expr<'boolean', 'const'> => mk({ tag: 'lit', ty: 'boolean', value: b }),
  date: (iso: string): Expr<'date', 'const'> => mk({ tag: 'lit', ty: 'date', value: iso }),
};

export const param = <T extends Ty>(name: string, ty: T): Expr<T, 'const'> =>
  mk({ tag: 'param', name, ty });

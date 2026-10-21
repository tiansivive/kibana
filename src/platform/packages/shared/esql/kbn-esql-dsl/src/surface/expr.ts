/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../vocabulary/esql_type';

export type ExprNode =
  | { readonly tag: 'col'; readonly name: string }
  | {
      readonly tag: 'lit';
      readonly ty: EsqlType;
      readonly value: string | number | boolean;
    }
  | { readonly tag: 'param'; readonly name: string; readonly ty: EsqlType }
  | { readonly tag: 'ann'; readonly ty: EsqlType; readonly expr: ExprNode }
  | { readonly tag: 'call'; readonly fn: string; readonly args: readonly ArgNode[] };

/**
 * An argument of a call, for the parameter at the same position of the function's type: an
 * expression for a required parameter, an expression or `undefined` for an optional one, and a
 * list for a sequence, of expressions where each repetition has one element and of lists of
 * expressions where it has several.
 */
export type ArgNode = ExprNode | undefined | readonly ArgNode[];

export const isExpr = (a: unknown): a is ExprNode =>
  typeof a === 'object' && a !== null && 'tag' in a;

/** Every expression in the arguments, in order. */
export const expressionsOf = (args: readonly ArgNode[]): readonly ExprNode[] =>
  args.flatMap((a) => (a === undefined ? [] : isExpr(a) ? [a] : expressionsOf(a)));

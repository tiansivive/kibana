/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../vocabulary/esql_type';

/** What the checker knows about a value's type: an ES|QL type, a meta not known yet, or in a function's type a variable. */
export type Type = Mono | Poly;

export type Mono =
  | { readonly tag: 'esql'; readonly esql: EsqlType }
  | { readonly tag: 'var'; readonly name: string }
  | { readonly tag: 'meta'; readonly meta: Meta };

/**
 * The type of a function: `forall vars. requires => params -> result`. Only functions are
 * polymorphic, so the arrow and the qualified type are one record, and every variable is
 * quantified at the front.
 *
 * `params` lists every positional parameter and the last `params.length - required` of them are
 * optional. A function with `rest` also takes any number of further arguments of that type. A
 * variable that occurs only in `rest` and in `requires` stands for each further argument
 * separately, so `concat` can take `text` and `keyword` in any order.
 */
export interface Poly {
  readonly tag: 'poly';
  readonly requires: readonly Requires[];
  readonly params: readonly Mono[];
  readonly required: number;
  readonly result: Mono;
  readonly rest?: Mono;
}

/** The types of `args` must be the types of one instance of `protocol`. */
export interface Requires {
  readonly protocol: string;
  readonly args: readonly Mono[];
}

/**
 * A meta stands for a type that is not known yet. Metas are named, not numbered, so elaboration
 * needs no counter. A source column is `src:<name>`, every other meta is the AST path of the node
 * that produces it, and a variable of a function's type at a call at `path` is `path$name`. A
 * name ending in `!` stands for an expression that could not be typed.
 */
export type Meta = string;

/** Names a place in the Core where an instance is needed. Solving records which instance it is. */
export type Hole = string;

export const esqlType = (esql: EsqlType): Mono => ({ tag: 'esql', esql });

export const metaType = (meta: Meta): Mono => ({ tag: 'meta', meta });

export const varType = (name: string): Mono => ({ tag: 'var', name });

export const sourceMeta = (name: string): Meta => `src:${name}`;

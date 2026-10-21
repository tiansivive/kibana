/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../vocabulary/esql_type';
import type { ParamKind, ResultKind } from '../vocabulary/kind';

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
 * Each parameter has a shape. A `one` parameter is required and an `optional` one is given or
 * not. A `many` parameter is a sequence of tuples of its elements, with a minimum length: a
 * condition and its value for `case`. Where a parameter is says nothing about its shape. Every
 * element has a type and a kind, and the function has the kind of its result. A variable that
 * occurs in the elements of one `many` parameter and nowhere else stands for each tuple of the
 * sequence separately, so `concat` can take `text` and `keyword` in any order.
 */
export interface Poly {
  readonly tag: 'poly';
  readonly requires: readonly Requires[];
  readonly params: readonly Param[];
  readonly result: Mono;
  readonly kind: ResultKind;
}

export type Param =
  | { readonly tag: 'one'; readonly slots: readonly [Slot] }
  | { readonly tag: 'optional'; readonly slots: readonly [Slot] }
  | { readonly tag: 'many'; readonly slots: readonly Slot[]; readonly min: number };

/** One element of a parameter: its type, and the kinds an argument for it may have. */
export interface Slot {
  readonly type: Mono;
  readonly kind: ParamKind;
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

/** The types of the elements of a parameter. */
export const typesOf = (p: { readonly slots: readonly Slot[] }): readonly Mono[] =>
  p.slots.map((slot) => slot.type);

/** The names of the variables among `types`. */
export const variableNames = (types: readonly Mono[]): readonly string[] =>
  types.flatMap((t) => (t.tag === 'var' ? [t.name] : []));

/**
 * The variables that stand for each tuple of a sequence separately, by name, with the position of
 * the sequence: those that occur in one `many` parameter and in no other parameter or the result.
 */
export const ownVariables = ({ params, result }: Poly): ReadonlyMap<string, number> => {
  const named = params.map((p) => variableNames(typesOf(p)));
  const inResult = variableNames([result]);
  return new Map(
    params.flatMap((p, i): [string, number][] =>
      p.tag === 'many'
        ? named[i]
            .filter(
              (name) =>
                !inResult.includes(name) &&
                named.every((others, j) => j === i || !others.includes(name))
            )
            .map((name) => [name, i])
        : []
    )
  );
};

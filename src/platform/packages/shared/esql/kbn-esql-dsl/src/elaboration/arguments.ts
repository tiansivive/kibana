/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { typesOf, variableNames } from '../core/type';
import type { Mono, Param, Poly, Slot } from '../core/type';
import { isExpr } from '../surface/expr';
import type { ArgNode, ExprNode } from '../surface/expr';

/**
 * The arguments of a call placed against the parameters of the function's type: each parameter
 * with what it was given. A trailing optional parameter that is left off is absent, and a
 * missing sequence is empty.
 */
type Placed =
  | { readonly tag: 'one'; readonly slots: readonly [Slot]; readonly node: ExprNode }
  | { readonly tag: 'optional'; readonly slots: readonly [Slot]; readonly node?: ExprNode }
  | { readonly tag: 'many'; readonly slots: readonly Slot[]; readonly items: readonly Tuple[] };

type Tuple = readonly ExprNode[];

/** Places the arguments, or says they do not fit: the wrong shape, too short a sequence, too many. */
export const place = (
  { params }: Poly,
  args: readonly ArgNode[]
): readonly Placed[] | undefined => {
  const placed = params.map((param, i) => placeOne(param, args[i]));
  return args.length > params.length || placed.some((p) => p === undefined)
    ? undefined
    : placed.flatMap((p) => (p ? [p] : []));
};

const placeOne = (param: Param, arg: ArgNode): Placed | undefined => {
  switch (param.tag) {
    case 'one':
      return isExpr(arg) ? { tag: 'one', slots: param.slots, node: arg } : undefined;
    case 'optional':
      return arg === undefined || isExpr(arg)
        ? { tag: 'optional', slots: param.slots, node: arg }
        : undefined;
    case 'many': {
      const tuples = arg === undefined ? [] : isExpr(arg) ? undefined : arg.map(tupleOf);
      return tuples !== undefined &&
        tuples.length >= param.min &&
        tuples.every((tuple) => tuple?.length === param.slots.length)
        ? {
            tag: 'many',
            slots: param.slots,
            items: tuples.flatMap((tuple) => (tuple ? [tuple] : [])),
          }
        : undefined;
    }
  }
};

/** A repetition of a sequence: a list of expressions, or the expression itself when it has one element. */
const tupleOf = (item: ArgNode): Tuple | undefined =>
  isExpr(item) ? [item] : item !== undefined && item.every(isExpr) ? item : undefined;

/**
 * The positions of the optional parameters that are given after one left out in their run of
 * optionals: a call fills a run from the left, as ES|QL reads `top(x, 1, undefined, field)` as
 * `top(x, 1, field)`.
 */
export const gaps = (placed: readonly Placed[]): readonly number[] =>
  placed.flatMap((p, i) => {
    const run = placed.slice(placed.findLastIndex((q, j) => j < i && q.tag !== 'optional') + 1, i);
    return given(p) && run.some((q) => !given(q)) ? [i] : [];
  });

const given = (p: Placed): boolean => p.tag === 'optional' && p.node !== undefined;

/** Variables that only an optional parameter left out of a call mentions, which need nothing. */
export const absentOnlyVariables = (
  placed: readonly Placed[],
  result: Mono
): ReadonlySet<string> => {
  const left = (p: Placed) => p.tag === 'optional' && p.node === undefined;
  const used = new Set([
    ...variableNames([result]),
    ...placed.filter((p) => !left(p)).flatMap((p) => variableNames(typesOf(p))),
  ]);
  return new Set(
    placed
      .filter(left)
      .flatMap((p) => variableNames(typesOf(p)))
      .filter((name) => !used.has(name))
  );
};

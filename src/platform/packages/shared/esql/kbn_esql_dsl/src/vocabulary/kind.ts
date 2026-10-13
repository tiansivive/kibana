/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Where an expression may appear.
 * - `const`: a literal or foldable expression, accepted where ES|QL requires a constant parameter.
 * - `scalar`: evaluated per row.
 * - `agg`: an aggregate, valid only in the aggregation position of `STATS`.
 * - `grouping`: a grouping function such as `BUCKET`, valid only in `BY`.
 */
export type Kind = 'const' | 'scalar' | 'agg' | 'grouping';

/**
 * How a function uses kinds, written beside its type. Each parameter is `const` (must be a
 * constant), `scalar` (a per-row or constant value, never an aggregate) or `k` (any kind). The
 * result is `agg`, `grouping`, or `k`, the join of the arguments given to the `k` parameters. A
 * scalar function is `(k, k) -> k`, an aggregate is `(scalar, const) -> agg`. A function that
 * takes further arguments says what kind they are in `rest`.
 */
export interface KindSignature {
  readonly params: readonly ParamKind[];
  readonly result: ResultKind;
  readonly rest?: ParamKind;
}

export type ParamKind = 'const' | 'scalar' | 'k';
export type ResultKind = 'agg' | 'grouping' | 'k';

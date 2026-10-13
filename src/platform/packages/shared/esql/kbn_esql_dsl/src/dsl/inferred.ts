/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../vocabulary/esql_type';

declare const inferredBrand: unique symbol;

/**
 * The type of a column whose type the DSL does not know, because the source has no declared
 * schema. Every function accepts it and a result computed from it is `Inferred` again. `typecheck`
 * works out the real type from how the column is used. It is an interface so that errors and hovers
 * show its name.
 */
export interface Inferred {
  readonly [inferredBrand]: true;
}

/** What an expression's type can be: an ES|QL type, or `Inferred` when it is not known yet. */
export type ExprType = EsqlType | Inferred;

/** The entry of a signature table for `T`, or `Inferred` when `T` is. */
export type Lookup<Table, T> = T extends keyof Table ? Table[T] : Inferred;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type { Expr, AnyExpr } from './dsl/expr';
export { lit, param } from './dsl/expr';
export type { ExprType, Inferred } from './dsl/inferred';
export type { Operand, Scalarish } from './dsl/kinds';
export type { ExprNode } from './surface/expr';
export type { EsqlType } from './vocabulary/esql_type';
export type { Kind } from './vocabulary/kind';
export {
  abs,
  add,
  and,
  avg,
  count,
  eq,
  gt,
  max,
  or,
  round,
  sum,
  top,
  typed,
} from './dsl/functions';
export type { Typechecked, TypecheckOptions } from './typecheck';
export { typecheck } from './typecheck';
export { compile } from './codegen/compile';
export type { Core, CoreCommand, CoreExpr } from './core/terms';
export * as Print from './core/print';
export type { Principal } from './elaboration/solve/principal';
export type { Solution } from './elaboration/solve/solution';
export { resolve } from './elaboration/solve/solution';
export type { Diagnostic, DiagnosticCode } from './diagnostics/diagnostic';
export type { Location } from './diagnostics/location';
export type { CommandNode, QueryAst, SortSpec } from './surface/query';
export type { Cols, Dropped, OpenSchema, Q, SortKey, Stage } from './dsl/query';
export { asc, desc, drop, evalAs, from, keep, limit, sort, stats, where } from './dsl/query';

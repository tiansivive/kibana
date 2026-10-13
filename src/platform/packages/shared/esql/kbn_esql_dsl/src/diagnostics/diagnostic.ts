/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Origin } from './origin';

export type DiagnosticCode =
  | 'unknown_column'
  | 'dropped_column'
  | 'type_conflict'
  | 'no_instance'
  | 'unknown_function'
  | 'arity'
  | 'nested_aggregate'
  | 'mixed_kinds'
  | 'constant_required'
  | 'aggregate_in_scalar_context'
  | 'not_aggregate'
  | 'invalid_grouping';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly origin: Origin;
  /** Other constraints that contributed to the failure. */
  readonly related: readonly Origin[];
}

export const diagnostic = (
  code: DiagnosticCode,
  message: string,
  origin: Origin,
  related: readonly Origin[] = []
): Diagnostic => ({ code, message, origin, related });

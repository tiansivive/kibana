/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Location } from './location';

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
  | 'invalid_grouping'
  | 'unmapped_column'
  | 'conflicting_field_types'
  | 'unsupported_field_type';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly location: Location;
  /** Other constraints that contributed to the failure. */
  readonly related: readonly Location[];
  /** The source column the problem is about, when it is about one. */
  readonly column?: string;
}

export const diagnostic = (
  code: DiagnosticCode,
  message: string,
  location: Location,
  related: readonly Location[] = [],
  column?: string
): Diagnostic => ({
  code,
  message,
  location,
  related,
  ...(column === undefined ? {} : { column }),
});

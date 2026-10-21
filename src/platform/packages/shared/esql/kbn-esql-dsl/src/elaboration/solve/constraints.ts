/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { diagnostic } from '../../diagnostics/diagnostic';
import type { Diagnostic, DiagnosticCode } from '../../diagnostics/diagnostic';
import type { Location } from '../../diagnostics/location';
import type { Hole, Mono } from '../../core/type';

export type Constraint = Equal | Wanted;

/** The type that was found must be the type that was expected. */
export interface Equal {
  readonly tag: 'equal';
  readonly found: Mono;
  readonly expected: Mono;
  readonly location: Location;
  readonly note: string;
}

/** The types of `args` must be the types of one instance of `protocol`. */
export interface Wanted {
  readonly tag: 'wanted';
  readonly hole: Hole;
  readonly protocol: string;
  readonly args: readonly Mono[];
  readonly location: Location;
}

/** What elaborating a piece of the query produces. Pieces combine with `merge`. */
export interface Emit {
  readonly constraints: readonly Constraint[];
  readonly diagnostics: readonly Diagnostic[];
  /** Source columns read, in first-read order. */
  readonly sources: readonly string[];
}

export const none: Emit = { constraints: [], diagnostics: [], sources: [] };

export const merge = (...parts: readonly Emit[]): Emit => ({
  constraints: parts.flatMap((p) => p.constraints),
  diagnostics: parts.flatMap((p) => p.diagnostics),
  sources: parts.flatMap((p) => p.sources),
});

export const constrain = (...constraints: readonly Constraint[]): Emit => ({
  ...none,
  constraints,
});

export const report = (...diagnostics: readonly Diagnostic[]): Emit => ({ ...none, diagnostics });

/** One problem at one place. */
export const problem = (
  code: DiagnosticCode,
  message: string,
  location: Location,
  column?: string
): Emit => report(diagnostic(code, message, location, [], column));

export const equal = (found: Mono, expected: Mono, location: Location, note: string): Equal => ({
  tag: 'equal',
  found,
  expected,
  location,
  note,
});

export const wanted = (
  hole: Hole,
  protocol: string,
  args: readonly Mono[],
  location: Location
): Wanted => ({ tag: 'wanted', hole, protocol, args, location });

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { diagnostic } from '../diagnostics/diagnostic';
import type { Origin } from '../diagnostics/origin';
import type { Kind } from '../kind';
import type { LibraryFunction } from '../core/polymorphism/library';
import { none, report } from './solve/constraints';
import type { Emit } from './solve/constraints';

/**
 * Kinds are checked beside the types and not through them. Every expression has a kind that is
 * known from its parts, so nothing is inferred: a function's kind signature says what each
 * argument may be and what the call is, and these functions apply it.
 */

/** The kind of a call and the problems with its arguments' kinds. */
export const callKind = (
  fn: LibraryFunction,
  kinds: readonly Kind[],
  origin: Origin
): { kind: Kind; emit: Emit } => {
  const { params, result } = fn.kinds;
  const argumentsFor = (wanted: string) => kinds.filter((_, i) => params[i] === wanted);
  const open = argumentsFor('k');
  const constants = params.flatMap((p, i) =>
    p === 'const' && i < kinds.length && kinds[i] !== 'const'
      ? [diagnostic('constant_required', `argument ${i} of ${fn.name} must be a constant`, origin)]
      : []
  );
  const nested = argumentsFor('scalar').includes('agg')
    ? [diagnostic('nested_aggregate', `${fn.name} cannot take an aggregate as an argument`, origin)]
    : [];
  const mixed =
    open.includes('agg') && open.includes('scalar')
      ? [diagnostic('mixed_kinds', `${fn.name} mixes an aggregate with a per-row value`, origin)]
      : [];
  return {
    kind: result === 'k' ? joined(open) : result,
    emit: report(...constants, ...nested, ...mixed),
  };
};

/** Commands that take a value per row, such as `WHERE`, reject an aggregate. */
export const expectScalar = (kind: Kind, what: string, origin: Origin): Emit =>
  kind === 'const' || kind === 'scalar'
    ? none
    : report(diagnostic('aggregate_in_scalar_context', `${what} cannot use an aggregate`, origin));

/** An aggregation of `STATS` must be an aggregate. */
export const expectAggregate = (kind: Kind, name: string, origin: Origin): Emit =>
  kind === 'agg'
    ? none
    : report(diagnostic('not_aggregate', `${name} must be an aggregate function in STATS`, origin));

/** A key of `STATS ... BY` cannot be an aggregate. */
export const rejectAggregateKey = (kind: Kind, name: string, origin: Origin): Emit =>
  kind === 'agg'
    ? report(diagnostic('invalid_grouping', `${name} cannot group by an aggregate`, origin))
    : none;

const joined = (kinds: readonly Kind[]): Kind =>
  kinds.includes('agg') ? 'agg' : kinds.includes('scalar') ? 'scalar' : 'const';

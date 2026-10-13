/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { instancesOf } from '../../core/polymorphism/library';
import type { Library } from '../../core/polymorphism/library';
import type { Meta, Mono } from '../../core/type';
import { ESQL_TYPES } from '../../vocabulary/esql_type';
import type { EsqlType } from '../../vocabulary/esql_type';
import type { Wanted } from './constraints';
import { resolve } from './solution';
import type { Solution } from './solution';

/**
 * Guidance for a type that is not known: the types that every undecided constraint on it still
 * allows, each considered on its own. It is a hint for the person writing the query, not a
 * decision, and an empty list says no type satisfies the constraints together.
 */
export const candidates = (
  library: Library,
  solution: Solution,
  type: Mono
): readonly EsqlType[] => {
  const resolved = resolve(solution, type);
  if (resolved.tag === 'esql') {
    return [resolved.esql];
  }
  if (resolved.tag === 'var') {
    return [];
  }
  const { meta } = resolved;
  return ESQL_TYPES.filter((ty) =>
    solution.residual
      .filter((w) => mentions(solution, w, meta))
      .every((w) => allows(library, solution, w, meta, ty))
  );
};

/** Whether `ty` is a possible type for `meta` as far as one undecided constraint is concerned. */
const allows = (
  library: Library,
  solution: Solution,
  w: Wanted,
  meta: Meta,
  ty: EsqlType
): boolean => {
  const args = w.args.map((a) => resolve(solution, a));
  return instancesOf(library, w.protocol).some((instance) =>
    args.every((arg, i) =>
      arg.tag === 'esql'
        ? instance[i] === arg.esql
        : arg.tag === 'meta' && arg.meta === meta
        ? instance[i] === ty
        : true
    )
  );
};

const mentions = (solution: Solution, w: Wanted, meta: Meta): boolean =>
  w.args.some((a) => {
    const r = resolve(solution, a);
    return r.tag === 'meta' && r.meta === meta;
  });

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Diagnostic } from '../../diagnostics/diagnostic';
import type { EsqlType } from '../../esql_type';
import type { Hole, Meta, Mono } from '../../core/type';
import type { Wanted } from './constraints';

/**
 * What solving recorded. `links` says what each unified meta was unified with: another meta, or a
 * type. `instances` says which instance each placeholder is. `residual` are the constraints that
 * could not be decided yet. Nothing is rewritten: types are read by lookup.
 */
export interface Solution {
  readonly links: ReadonlyMap<Meta, Mono>;
  readonly instances: ReadonlyMap<Hole, readonly EsqlType[]>;
  readonly residual: readonly Wanted[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Follows a type through the recorded links to an ES|QL type, or to the meta that stands for it. */
export const resolve = (solution: Pick<Solution, 'links'>, type: Mono): Mono => {
  if (type.tag !== 'meta') {
    return type;
  }
  const next = solution.links.get(type.meta);
  return next === undefined ? type : resolve(solution, next);
};

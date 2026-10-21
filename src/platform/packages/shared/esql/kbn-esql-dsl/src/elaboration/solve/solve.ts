/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Library } from '../../core/polymorphism/library';
import type { Constraint, Equal, Wanted } from './constraints';
import { decide } from './decide';
import type { Solution } from './solution';
import { unify } from './unify';

/**
 * Unifies the equalities, then decides the wanted constraints with the protocols' instances and
 * dependencies. Wanted constraints that stay undecided are not an error: they say what an unknown
 * type must satisfy, and a schema turns them into answers.
 */
export const solve = (library: Library, constraints: readonly Constraint[]): Solution => {
  const unified = constraints
    .filter(isEqual)
    .reduce<Solution>((s, c) => unify(s, c.found, c.expected, c.location, c.note), {
      links: new Map(),
      instances: new Map(),
      residual: [],
      diagnostics: [],
    });
  return settle(library, unified, constraints.filter(isWanted));
};

/** Decides wanted constraints, over and over, until none can be decided further. */
const settle = (library: Library, solution: Solution, pending: readonly Wanted[]): Solution => {
  const next = pending.reduce<{ solution: Solution; stuck: readonly Wanted[] }>(
    (acc, w) => {
      const decided = decide(library, acc.solution, w);
      return {
        solution: decided.solution,
        stuck: decided.stuck ? [...acc.stuck, w] : acc.stuck,
      };
    },
    { solution, stuck: [] }
  );
  return progress(solution, next.solution) && next.stuck.length > 0
    ? settle(library, next.solution, next.stuck)
    : { ...next.solution, residual: next.stuck };
};

const progress = (before: Solution, after: Solution): boolean =>
  before.links.size !== after.links.size ||
  before.instances.size !== after.instances.size ||
  before.diagnostics.length !== after.diagnostics.length;

const isEqual = (c: Constraint): c is Equal => c.tag === 'equal';

const isWanted = (c: Constraint): c is Wanted => c.tag === 'wanted';

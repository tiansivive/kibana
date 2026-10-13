/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Print from '../../core/print';
import { diagnostic } from '../../diagnostics/diagnostic';
import type { Location } from '../../diagnostics/location';
import { withEntry } from '../../utils/immutable';
import type { Meta, Mono } from '../../core/type';
import { resolve } from './solution';
import type { Solution } from './solution';

/** Records that two types are the same. Two different ES|QL types are an error. */
export const unify = (
  solution: Solution,
  found: Mono,
  expected: Mono,
  location: Location,
  note: string
): Solution => {
  const a = resolve(solution, found);
  const b = resolve(solution, expected);
  if (a.tag === 'esql' && b.tag === 'esql') {
    return a.esql === b.esql
      ? solution
      : {
          ...solution,
          diagnostics: [
            ...solution.diagnostics,
            diagnostic(
              'type_conflict',
              `${note} ${Print.esqlType(b.esql)}, found ${Print.esqlType(a.esql)}`,
              location
            ),
          ],
        };
  }
  if (a.tag === 'meta' && b.tag === 'meta') {
    // A source column stays the representative, so its type is found by one lookup.
    return a.meta === b.meta
      ? solution
      : isSource(a.meta) && !isSource(b.meta)
      ? { ...solution, links: withEntry(solution.links, b.meta, a) }
      : { ...solution, links: withEntry(solution.links, a.meta, b) };
  }
  return a.tag === 'meta'
    ? { ...solution, links: withEntry(solution.links, a.meta, b) }
    : b.tag === 'meta'
    ? { ...solution, links: withEntry(solution.links, b.meta, a) }
    : solution;
};

const isSource = (meta: Meta): boolean => meta.startsWith('src:');

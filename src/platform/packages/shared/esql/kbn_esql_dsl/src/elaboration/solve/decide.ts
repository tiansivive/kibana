/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { diagnostic } from '../../diagnostics/diagnostic';
import { withEntry } from '../../immutable';
import type { EsqlType } from '../../esql_type';
import type { Mono } from '../../core/type';
import { instancesOf } from '../../core/polymorphism/library';
import type { Library } from '../../core/polymorphism/library';
import type { Wanted } from './constraints';
import { resolve } from './solution';
import type { Solution } from './solution';
import { unify } from './unify';

/**
 * Decides one wanted constraint as far as it can. All arguments known: the instance exists or it
 * does not. The arguments a dependency says determine the rest known: the matching instance
 * fixes the rest. Anything else waits.
 */
export const decide = (
  library: Library,
  solution: Solution,
  w: Wanted
): { solution: Solution; stuck: boolean } => {
  const args = w.args.map((a) => resolve(solution, a));
  const instances = instancesOf(library, w.protocol);
  const known = args.flatMap((a, i) => (a.tag === 'esql' ? [i] : []));

  if (known.length === args.length) {
    const found = instances.find((inst) => matches(inst, args, known));
    return found
      ? {
          solution: { ...solution, instances: withEntry(solution.instances, w.hole, found) },
          stuck: false,
        }
      : { solution: noInstance(solution, w, args), stuck: false };
  }

  const determinedBy = library.protocols.get(w.protocol)?.determinedBy;
  if (determinedBy !== undefined && determinedBy.every((i) => known.includes(i))) {
    const found = instances.find((inst) => matches(inst, args, determinedBy));
    if (found === undefined) {
      return { solution: noInstance(solution, w, args), stuck: false };
    }
    const improved = args.reduce(
      (s, arg, i) =>
        arg.tag === 'meta'
          ? unify(s, { tag: 'esql', esql: found[i] }, arg, w.origin, w.protocol)
          : s,
      solution
    );
    return {
      solution: { ...improved, instances: withEntry(improved.instances, w.hole, found) },
      stuck: false,
    };
  }

  return { solution, stuck: true };
};

/** One failure per place: once a call has been reported, its other requirements stay quiet. */
const noInstance = (solution: Solution, w: Wanted, args: readonly Mono[]): Solution =>
  solution.diagnostics.some((d) => d.origin.path === w.origin.path)
    ? solution
    : {
        ...solution,
        diagnostics: [
          ...solution.diagnostics,
          diagnostic(
            'no_instance',
            `${w.protocol} has no instance for (${args.map(show).join(', ')})`,
            w.origin
          ),
        ],
      };

const matches = (
  instance: readonly EsqlType[],
  args: readonly Mono[],
  positions: readonly number[]
): boolean =>
  positions.every((i) => {
    const arg = args[i];
    return arg.tag === 'esql' && instance[i] === arg.esql;
  });

const show = (type: Mono): string => (type.tag === 'esql' ? type.esql : '?');

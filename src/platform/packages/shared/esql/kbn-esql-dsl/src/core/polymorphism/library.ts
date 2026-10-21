/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../../vocabulary/esql_type';
import type { ParamKind, ResultKind } from '../../vocabulary/kind';
import { ownVariables, variableNames } from '../type';
import type { Mono, Param, Poly, Requires, Slot } from '../type';
import type { Instance, Protocol } from './protocol';

export interface Library {
  readonly protocols: ReadonlyMap<string, Protocol>;
  readonly instances: ReadonlyMap<string, readonly (readonly EsqlType[])[]>;
  /** Every function has exactly one type. */
  readonly functions: ReadonlyMap<string, LibraryFunction>;
}

export interface LibraryFunction {
  readonly name: string;
  readonly type: Poly;
}

/** Builds a library, rejecting instances of undeclared protocols or of the wrong arity. */
export const makeLibrary = (
  protocols: readonly Protocol[],
  instances: readonly Instance[],
  functions: readonly LibraryFunction[]
): Library => {
  const declared = new Map(protocols.map((p) => [p.name, p]));
  const problems = [
    ...instances.flatMap((i) => {
      const p = declared.get(i.protocol);
      return !p
        ? [`instance of undeclared protocol ${i.protocol}`]
        : p.arity !== i.types.length
        ? [`${i.protocol} has arity ${p.arity}, got ${i.types.length} types`]
        : [];
    }),
    ...functions.flatMap((f) =>
      f.type.requires
        .filter((r) => declared.get(r.protocol)?.arity !== r.args.length)
        .map((r) => `${f.name} requires ${r.protocol} with the wrong arity or without declaring it`)
    ),
    ...functions
      .filter((f) => sharedBySequences(f.type))
      .map((f) => `${f.name} requires a protocol over the variables of two sequences`),
    ...functions
      .filter((f, i) => functions.findIndex((other) => other.name === f.name) !== i)
      .map((f) => `${f.name} has more than one type`),
  ];
  if (problems.length > 0) {
    throw new Error(problems.join('; '));
  }
  return {
    protocols: declared,
    instances: new Map(
      [...groupBy(instances, (i) => i.protocol)].map(
        ([name, group]): [string, readonly (readonly EsqlType[])[]] => [
          name,
          group.map((i) => i.types),
        ]
      )
    ),
    functions: new Map(functions.map((f) => [f.name, f])),
  };
};

export const instancesOf = (library: Library, protocol: string): readonly (readonly EsqlType[])[] =>
  library.instances.get(protocol) ?? [];

/** The protocols a type takes part in, each with the instances that mention it. */
export const instancesWith = (
  library: Library,
  type: EsqlType
): readonly { protocol: Protocol; instances: readonly (readonly EsqlType[])[] }[] =>
  [...library.protocols.values()]
    .map((protocol) => ({
      protocol,
      instances: instancesOf(library, protocol.name).filter((instance) => instance.includes(type)),
    }))
    .filter(({ instances }) => instances.length > 0);

/**
 * Instances of a protocol that violate its declared dependency: two instances that agree on the
 * determining positions and differ elsewhere.
 */
export const dependencyViolations = (
  library: Library
): readonly { protocol: string; first: readonly EsqlType[]; second: readonly EsqlType[] }[] =>
  [...library.protocols.values()].flatMap((p) => {
    const rows = instancesOf(library, p.name);
    const key = (row: readonly EsqlType[]) => (p.determinedBy ?? []).map((i) => row[i]).join(',');
    return p.determinedBy
      ? rows.flatMap((first, i) =>
          rows
            .slice(i + 1)
            .filter((second) => key(first) === key(second) && first.join() !== second.join())
            .map((second) => ({ protocol: p.name, first, second }))
        )
      : [];
  });

const groupBy = <K, V>(items: readonly V[], key: (item: V) => K): ReadonlyMap<K, readonly V[]> =>
  items.reduce<ReadonlyMap<K, readonly V[]>>(
    (m, item) => new Map([...m, [key(item), [...(m.get(key(item)) ?? []), item]]]),
    new Map()
  );

/** Whether a requirement mentions the variables that stand for the elements of two sequences. */
const sharedBySequences = (type: Poly): boolean => {
  const own = ownVariables(type);
  return type.requires.some(
    (r) => new Set(variableNames(r.args).flatMap((name) => own.get(name) ?? [])).size > 1
  );
};

/**
 * Helpers to declare a function's type. A parameter is `one` (required), `optional` (given or
 * not) or `many` (a sequence of tuples, at least `min`), and each
 * element has a type and a kind, `k` (any) unless given.
 */

export const fn = (
  name: string,
  params: readonly Param[],
  result: Mono,
  needs: readonly Requires[],
  kind: ResultKind = 'k'
): LibraryFunction => ({
  name,
  type: { tag: 'poly', requires: needs, params, result, kind },
});

export const requires = (protocol: string, ...args: readonly Mono[]): Requires => ({
  protocol,
  args,
});

export const slot = (type: Mono, kind: ParamKind = 'k'): Slot => ({ type, kind });

export const one = (type: Mono, kind: ParamKind = 'k'): Param => ({
  tag: 'one',
  slots: [slot(type, kind)],
});

export const optional = (type: Mono, kind: ParamKind = 'k'): Param => ({
  tag: 'optional',
  slots: [slot(type, kind)],
});

export const many = (min: number, ...slots: readonly Slot[]): Param => ({
  tag: 'many',
  min,
  slots,
});

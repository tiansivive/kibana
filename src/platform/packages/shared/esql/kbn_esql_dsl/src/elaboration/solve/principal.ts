/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metaType, sourceMeta } from '../../core/type';
import type { Mono, Requires } from '../../core/type';
import type { Wanted } from './constraints';
import { resolve } from './solution';
import type { Solution } from './solution';

/**
 * The type of a whole query over an open source, `forall vars. requires => input -> output`. The
 * variables are the metas still unknown, `requires` are the protocol facts that couple them, and
 * a column type is an ES|QL type once it is known. A closed schema leaves no variables.
 */
export interface Principal {
  /** Source columns the query reads, in first-read order. */
  readonly input: {
    readonly columns: ReadonlyMap<string, Mono>;
    /** True when the source may hold further columns the query never mentions. */
    readonly open: boolean;
  };
  readonly output: {
    readonly columns: ReadonlyMap<string, Mono>;
    /** True when the output holds further source columns the query never mentions. */
    readonly open: boolean;
  };
  /** Undecided protocol facts. `FieldType` on a source column is left out, and repeats are dropped. */
  readonly requires: readonly Requires[];
}

export const principal = (
  solution: Solution,
  input: { readonly names: readonly string[]; readonly open: boolean },
  output: { readonly columns: ReadonlyMap<string, Mono>; readonly open: boolean }
): Principal => ({
  input: {
    columns: new Map(
      input.names.map((name): [string, Mono] => [
        name,
        resolve(solution, metaType(sourceMeta(name))),
      ])
    ),
    open: input.open,
  },
  output: {
    columns: new Map([...output.columns].map(([name, type]) => [name, resolve(solution, type)])),
    open: output.open,
  },
  requires: distinct(
    solution.residual.filter(isInformative).map((w) => ({
      protocol: w.protocol,
      args: w.args.map((a) => resolve(solution, a)),
    }))
  ),
});

const isInformative = (w: Wanted): boolean => w.protocol !== 'FieldType';

const distinct = (requires: readonly Requires[]): readonly Requires[] =>
  requires.filter((r, i) => requires.findIndex((other) => key(other) === key(r)) === i);

const key = (r: Requires): string => JSON.stringify([r.protocol, r.args]);

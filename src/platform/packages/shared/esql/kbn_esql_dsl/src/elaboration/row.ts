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
import type { EsqlType } from '../vocabulary/esql_type';
import { withEntry, withoutKey } from '../utils/immutable';
import { esqlType, metaType, sourceMeta } from '../core/type';
import type { Mono } from '../core/type';
import { constrain, equal, none, report, wanted } from './solve/constraints';
import type { Emit } from './solve/constraints';

/**
 * The columns visible after a stage. `fields` are columns the query has named. `tail` says what
 * else the row may hold: nothing (`closed`), or any other column of the source except the ones in
 * `lacks` (`open`). A source column read from an open tail is the meta `src:<name>`, so every
 * stage sees the same meta for the same source column without a shared table.
 */
export interface Row {
  readonly fields: ReadonlyMap<string, Mono>;
  readonly tail:
    | { readonly tag: 'closed' }
    | { readonly tag: 'open'; readonly lacks: ReadonlySet<string> };
}

export const openRow: Row = { fields: new Map(), tail: { tag: 'open', lacks: new Set() } };

export const schemaRow = (
  schema: Readonly<Record<string, EsqlType>>
): { row: Row; emit: Emit } => ({
  row: {
    fields: new Map(
      Object.keys(schema).map((name): [string, Mono] => [name, metaType(sourceMeta(name))])
    ),
    tail: { tag: 'closed' },
  },
  emit: constrain(
    ...Object.entries(schema).map(([name, ty]) =>
      equal(
        metaType(sourceMeta(name)),
        esqlType(ty),
        { path: `schema.${name}` },
        'the schema declares'
      )
    )
  ),
});

export interface Demanded {
  readonly type: Mono;
  readonly emit: Emit;
}

/** Looks a column up. A name only the source can supply becomes a requirement on the source. */
export const demand = (row: Row, name: string, origin: Origin): Demanded => {
  const local = row.fields.get(name);
  if (local !== undefined) {
    return { type: local, emit: none };
  }
  if (row.tail.tag === 'open') {
    return row.tail.lacks.has(name)
      ? failed(
          name,
          origin,
          report(diagnostic('dropped_column', `column ${name} was dropped earlier`, origin))
        )
      : {
          type: metaType(sourceMeta(name)),
          emit: {
            ...constrain(
              wanted(
                `${origin.path}#field.${name}`,
                'FieldType',
                [metaType(sourceMeta(name))],
                origin
              )
            ),
            sources: [name],
          },
        };
  }
  const available = [...row.fields.keys()];
  return failed(
    name,
    origin,
    report(
      diagnostic(
        'unknown_column',
        `unknown column ${name}; available: ${available.length ? available.join(', ') : '(none)'}`,
        origin
      )
    )
  );
};

/** A column that could not be read gets a type nothing constrains, so nothing built on it reports again. */
const failed = (name: string, origin: Origin, emit: Emit): Demanded => ({
  type: metaType(`${origin.path}!${name}`),
  emit,
});

/** `EVAL` and `STATS` outputs replace a column of the same name, which also clears an earlier lack. */
export const define = (row: Row, name: string, type: Mono): Row => ({
  fields: withEntry(row.fields, name, type),
  tail:
    row.tail.tag === 'open'
      ? { tag: 'open', lacks: new Set([...row.tail.lacks].filter((l) => l !== name)) }
      : row.tail,
});

export const drop = (row: Row, names: readonly string[]): Row => ({
  fields: names.reduce(withoutKey, row.fields),
  tail:
    row.tail.tag === 'open'
      ? { tag: 'open', lacks: new Set([...row.tail.lacks, ...names]) }
      : row.tail,
});

export const closedRow = (fields: ReadonlyMap<string, Mono>): Row => ({
  fields,
  tail: { tag: 'closed' },
});

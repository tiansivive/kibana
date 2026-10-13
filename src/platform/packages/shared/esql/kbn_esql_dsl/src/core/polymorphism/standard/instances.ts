/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ESQL_TYPES, isEsqlType } from '../../../esql_type';
import type { EsqlType } from '../../../esql_type';
import type { Instance } from '../protocol';
import { ABS, ADD, AVG, EQUALS, GREATER_THAN, MAX, SUM } from './tables';
import type { BinaryTable } from './tables';

export const instances: readonly Instance[] = [
  // Types a source column can have. Value-only types such as durations are not field types.
  ...members(
    'FieldType',
    ESQL_TYPES.filter((ty) => ty !== 'date_period' && ty !== 'time_duration')
  ),
  ...members('Numeric', keysOf(ABS)),
  ...members('SignedNumeric', keysOf(AVG)),
  ...members('Orderable', keysOf(MAX)),
  // `text` comes back as `keyword`, everything else is unchanged.
  ...ESQL_TYPES.map((ty): Instance => ({ protocol: 'Norm', types: [ty, norm(ty)] })),
  ...instancesFrom(
    'Wide',
    Object.entries(SUM).map(([from, to]) => [from, to].filter(isEsqlType))
  ),
  ...instancesFrom('Arith', rowsOf(ADD)),
  ...instancesFrom(
    'Comparable',
    rowsOf(GREATER_THAN).map((row) => row.slice(0, 2))
  ),
  ...instancesFrom(
    'Equatable',
    rowsOf(EQUALS).map((row) => row.slice(0, 2))
  ),
];

function keysOf(table: Readonly<Record<string, unknown>>): EsqlType[] {
  return Object.keys(table).filter(isEsqlType);
}

function members(protocol: string, types: readonly EsqlType[]): Instance[] {
  return types.map((ty) => ({ protocol, types: [ty] }));
}

function rowsOf(table: BinaryTable): (readonly EsqlType[])[] {
  return Object.entries(table).flatMap(([a, row]) =>
    Object.entries(row ?? {}).map(([b, result]) => [a, b, result].filter(isEsqlType))
  );
}

function instancesFrom(protocol: string, rows: readonly (readonly EsqlType[])[]): Instance[] {
  return rows.map((types) => ({ protocol, types }));
}

function norm(ty: EsqlType): EsqlType {
  return ty === 'text' ? 'keyword' : ty;
}

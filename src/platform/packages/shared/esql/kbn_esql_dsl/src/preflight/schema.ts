/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FieldCapsResponse } from '@elastic/elasticsearch/lib/api/types';
import type { DiagnosticCode } from '../diagnostics/diagnostic';
import { isEsqlType } from '../vocabulary/esql_type';
import type { EsqlType } from '../vocabulary/esql_type';

/** The schema a `field_caps` response gives the columns a query reads, and what could not be typed. */
export interface DerivedSchema {
  readonly schema: Readonly<Record<string, EsqlType>>;
  readonly problems: readonly FieldProblem[];
}

export interface FieldProblem {
  readonly column: string;
  readonly code: Extract<
    DiagnosticCode,
    'unmapped_column' | 'conflicting_field_types' | 'unsupported_field_type'
  >;
  readonly message: string;
}

/**
 * Types each column from the mappings in `response`. A column with one ES|QL type goes into the
 * schema. A column that is not mapped, has types that differ between indices, or has a type
 * ES|QL does not read as one of the covered types is a problem and stays out of the schema.
 * ES|QL rejects a column whose types differ between indices, `text` and `keyword` included.
 */
export const schemaFromFieldCaps = (
  response: FieldCapsResponse,
  columns: readonly string[],
  indices: readonly string[]
): DerivedSchema => {
  const typed = columns.map((column) => typeColumn(column, response.fields[column], indices));
  return {
    schema: Object.fromEntries(
      typed.flatMap((t) => (t.tag === 'typed' ? [[t.column, t.type] as const] : []))
    ),
    problems: typed.flatMap((t) => (t.tag === 'problem' ? [t.problem] : [])),
  };
};

type Typed =
  | { readonly tag: 'typed'; readonly column: string; readonly type: EsqlType }
  | { readonly tag: 'problem'; readonly problem: FieldProblem };

type Mapped =
  | Readonly<Record<string, { readonly indices?: string | readonly string[] }>>
  | undefined;

const typeColumn = (column: string, mapped: Mapped, indices: readonly string[]): Typed => {
  const found = Object.entries(mapped ?? {});
  const unsupported = found.filter(([type]) => !ES_TYPES.has(type)).map(([type]) => type);
  const types = [...new Set(found.flatMap(([type]) => ES_TYPES.get(type) ?? []))];
  const problem = (code: FieldProblem['code'], message: string): Typed => ({
    tag: 'problem',
    problem: { column, code, message },
  });
  if (found.length === 0) {
    return problem('unmapped_column', `${column} is not mapped in ${indices.join(', ')}`);
  }
  if (unsupported.length > 0) {
    return problem(
      'unsupported_field_type',
      `${column} has the type ${unsupported.join(
        ', '
      )}, which a query cannot read as a covered type`
    );
  }
  return types.length === 1
    ? { tag: 'typed', column, type: types[0] }
    : problem(
        'conflicting_field_types',
        `${column} has conflicting types: ${found
          .map(([esType, capability]) => `${esType} in ${where(capability.indices)}`)
          .join('; ')}`
      );
};

const where = (indices: string | readonly string[] | undefined): string =>
  indices === undefined ? 'the other indices' : [indices].flat().join(', ');

/** How ES mapping types read in ES|QL. A type that is not here is not covered. */
const ES_TYPES: ReadonlyMap<string, EsqlType> = new Map(
  Object.entries({
    keyword: 'keyword',
    constant_keyword: 'keyword',
    wildcard: 'keyword',
    text: 'text',
    match_only_text: 'text',
    long: 'long',
    integer: 'integer',
    short: 'integer',
    byte: 'integer',
    double: 'double',
    float: 'double',
    half_float: 'double',
    scaled_float: 'double',
    unsigned_long: 'unsigned_long',
    date: 'date',
    date_nanos: 'date_nanos',
    boolean: 'boolean',
    ip: 'ip',
    version: 'version',
    geo_point: 'geo_point',
  }).flatMap(([esType, esqlType]) => (isEsqlType(esqlType) ? [[esType, esqlType] as const] : []))
);

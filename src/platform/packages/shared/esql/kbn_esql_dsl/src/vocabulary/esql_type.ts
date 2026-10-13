/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** ES|QL value types covered by the DSL. Signatures mentioning other types are out of scope. */
export const ESQL_TYPES = [
  'boolean',
  'keyword',
  'text',
  'ip',
  'version',
  'date',
  'date_nanos',
  'integer',
  'long',
  'unsigned_long',
  'double',
  'geo_point',
  'date_period',
  'time_duration',
] as const;

export type EsqlType = (typeof ESQL_TYPES)[number];

export const isEsqlType = (s: string): s is EsqlType => ESQL_TYPES.some((t) => t === s);

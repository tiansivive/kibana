/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FieldCapsRequest, FieldCapsResponse } from '@elastic/elasticsearch/lib/api/types';
import { diagnostic } from '../diagnostics/diagnostic';
import type { Diagnostic } from '../diagnostics/diagnostic';
import type { QueryAst } from '../surface/query';
import { typecheck } from '../typecheck';
import type { EsqlType } from '../vocabulary/esql_type';
import { schemaFromFieldCaps } from './schema';

/**
 * What preflight needs of an Elasticsearch client. Kibana's `ElasticsearchClient` and the
 * `Client` of `@elastic/elasticsearch` both have it.
 */
export interface EsClient {
  fieldCaps(request: FieldCapsRequest): Promise<FieldCapsResponse>;
}

export interface Preflight {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /** The types the mappings give the columns the query reads. */
  readonly schema: Readonly<Record<string, EsqlType>>;
  /** One entry for each source column the query reads. */
  readonly columns: readonly ColumnCheck[];
}

export interface ColumnCheck {
  readonly column: string;
  /** The ES|QL type the mappings give it, if they give it one. */
  readonly mapped: EsqlType | undefined;
  /** The types the query allows, worked out from how it uses the column. */
  readonly needs: readonly EsqlType[];
  /** Whether the mapped type is one the query allows. */
  readonly fits: boolean;
}

/**
 * Checks a query against the mappings of the indices it reads. It works out which source columns
 * the query reads, asks Elasticsearch for the mappings of those columns, and type checks the
 * query against them. A failure of the request is not caught.
 */
export const preflight = async (
  query: { readonly ast: QueryAst },
  esClient: EsClient
): Promise<Preflight> => {
  const { indices } = query.ast.source;
  const needed = typecheck(query.ast).required;
  const columns = [...needed.keys()];
  const response: FieldCapsResponse =
    columns.length > 0
      ? await esClient.fieldCaps({ index: [...indices], fields: columns })
      : { indices: [], fields: {} };
  const { schema, problems } = schemaFromFieldCaps(response, columns, indices);
  const checked = typecheck(query.ast, { schema });
  const explained = new Map(problems.map((p) => [p.column, p]));
  const reported = new Set<string>();
  const diagnostics = checked.diagnostics.flatMap((d) => {
    const found = d.code === 'unknown_column' && d.column ? explained.get(d.column) : undefined;
    if (!found) {
      return [d];
    }
    const first = !reported.has(found.column);
    reported.add(found.column);
    return first
      ? [diagnostic(found.code, found.message, d.location, d.related, found.column)]
      : [];
  });
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    schema,
    columns: columns.map((column) => {
      const needs = needed.get(column) ?? [];
      const mapped = schema[column];
      return { column, mapped, needs, fits: mapped !== undefined && needs.includes(mapped) };
    }),
  };
};

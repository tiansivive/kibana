/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { uniq } from 'lodash';

import type { Datatable } from '@kbn/expressions-plugin/public';
import { ESQL_TABLE_TYPE } from '@kbn/data-plugin/common';
import type { ActiveCursorSyncOption, DateHistogramSyncOption } from './types';
import type { ActiveCursorPayload } from './types';

function isDateHistogramSyncOption(
  syncOption?: ActiveCursorSyncOption
): syncOption is DateHistogramSyncOption {
  return Boolean(syncOption && 'isDateHistogram' in syncOption);
}

const parseDatatable = (dataTables: Datatable[]) => {
  const isEsqlMode = dataTables.some((t) => t?.meta?.type === ESQL_TABLE_TYPE);

  if (isEsqlMode) {
    return {
      isDateHistogram:
        Boolean(dataTables.length) &&
        dataTables.every((t) => t.columns.some((c) => c.meta.type === 'date')),
      accessors: [],
    };
  }
  const isDateHistogram =
    Boolean(dataTables.length) &&
    dataTables.every((dataTable) =>
      dataTable.columns.some((c) => Boolean(c.meta.sourceParams?.appliedTimeRange))
    );

  const accessors = uniq(
    dataTables
      .map((dataTable) => {
        const column = dataTable.columns.find((c) => c.meta.index && c.meta.field);

        if (column?.meta.index) {
          return `${column.meta.index}:${column.meta.field}`;
        }
      })
      .filter(Boolean) as string[]
  );
  return { isDateHistogram, accessors };
};

/** @internal **/
export const parseSyncOptions = (
  syncOptions: ActiveCursorSyncOption
): Partial<ActiveCursorPayload> =>
  isDateHistogramSyncOption(syncOptions)
    ? {
        isDateHistogram: syncOptions.isDateHistogram,
      }
    : parseDatatable(syncOptions.datatables);

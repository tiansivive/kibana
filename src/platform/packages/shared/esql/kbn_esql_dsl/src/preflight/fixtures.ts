/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  FieldCapsFieldCapability,
  FieldCapsResponse,
} from '@elastic/elasticsearch/lib/api/types';

/** A `field_caps` response written by hand, in the shape Elasticsearch returns. */
export const capability = (type: string, indices?: string[]): FieldCapsFieldCapability => ({
  type,
  searchable: true,
  aggregatable: true,
  ...(indices ? { indices } : {}),
});

export const response = (
  fields: Readonly<Record<string, Readonly<Record<string, FieldCapsFieldCapability>>>>
): FieldCapsResponse => ({ indices: ['logs-a', 'logs-b'], fields });

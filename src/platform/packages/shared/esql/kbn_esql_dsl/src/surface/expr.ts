/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../esql_type';

export type ExprNode =
  | { readonly tag: 'col'; readonly name: string }
  | {
      readonly tag: 'lit';
      readonly ty: EsqlType;
      readonly value: string | number | boolean;
    }
  | { readonly tag: 'param'; readonly name: string; readonly ty: EsqlType }
  | { readonly tag: 'ann'; readonly ty: EsqlType; readonly expr: ExprNode }
  | { readonly tag: 'call'; readonly fn: string; readonly args: readonly ExprNode[] };

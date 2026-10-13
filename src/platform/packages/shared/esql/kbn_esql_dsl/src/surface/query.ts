/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ExprNode } from './expr';

export interface QueryAst {
  readonly source: { readonly tag: 'from'; readonly indices: readonly string[] };
  readonly pipe: readonly CommandNode[];
}

export type CommandNode =
  | { readonly tag: 'where'; readonly cond: ExprNode }
  | { readonly tag: 'eval'; readonly name: string; readonly expr: ExprNode }
  | { readonly tag: 'stats'; readonly aggs: readonly Named[]; readonly by: readonly Named[] }
  | { readonly tag: 'keep'; readonly cols: readonly string[] }
  | { readonly tag: 'drop'; readonly cols: readonly string[] }
  | { readonly tag: 'rename'; readonly from: string; readonly to: string }
  | { readonly tag: 'sort'; readonly keys: readonly SortSpec[] }
  | { readonly tag: 'limit'; readonly n: number };

export interface Named {
  readonly name: string;
  readonly expr: ExprNode;
}

export interface SortSpec {
  readonly expr: ExprNode;
  readonly dir: 'asc' | 'desc';
}

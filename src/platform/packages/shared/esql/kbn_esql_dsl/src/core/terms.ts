/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../vocabulary/esql_type';
import type { SortSpec } from '../surface/query';
import type { Hole, Mono } from './type';

/**
 * The elaborated query. It is the AST with a type on every expression and a placeholder for every
 * instance a call needs. A type that is not known yet is a meta. Nothing here is rewritten once
 * the types are solved: whatever needs a type looks the meta up in the recorded solution.
 */
export type CoreExpr =
  | { readonly tag: 'col'; readonly name: string; readonly type: Mono }
  | {
      readonly tag: 'lit';
      readonly ty: EsqlType;
      readonly value: string | number | boolean;
      readonly type: Mono;
    }
  | { readonly tag: 'param'; readonly name: string; readonly ty: EsqlType; readonly type: Mono }
  | { readonly tag: 'ann'; readonly expr: CoreExpr; readonly type: Mono }
  | {
      readonly tag: 'call';
      readonly fn: string;
      readonly args: readonly CoreExpr[];
      readonly type: Mono;
      /** The instances this call needs, by placeholder. The solution says which they are. */
      readonly instances: readonly Needed[];
    };

/** An instance of `protocol` a call needs, named by the placeholder that records which it is. */
export interface Needed {
  readonly hole: Hole;
  readonly protocol: string;
}

export interface CoreNamed {
  readonly name: string;
  readonly expr: CoreExpr;
}

export interface CoreSort {
  readonly expr: CoreExpr;
  readonly dir: SortSpec['dir'];
}

export type CoreCommand =
  | { readonly tag: 'where'; readonly cond: CoreExpr }
  | { readonly tag: 'eval'; readonly name: string; readonly expr: CoreExpr }
  | {
      readonly tag: 'stats';
      readonly aggs: readonly CoreNamed[];
      readonly by: readonly CoreNamed[];
    }
  | { readonly tag: 'keep'; readonly cols: readonly string[] }
  | { readonly tag: 'drop'; readonly cols: readonly string[] }
  | { readonly tag: 'sort'; readonly keys: readonly CoreSort[] }
  | { readonly tag: 'limit'; readonly n: number };

export interface Core {
  readonly source: { readonly tag: 'from'; readonly indices: readonly string[] };
  readonly pipe: readonly CoreCommand[];
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Protocol } from '../protocol';

export const protocols: readonly Protocol[] = [
  { name: 'FieldType', arity: 1 },
  { name: 'Numeric', arity: 1 },
  { name: 'SignedNumeric', arity: 1 },
  { name: 'Orderable', arity: 1 },
  // the normal form of a type, and the type a numeric aggregates in
  { name: 'Norm', arity: 2, determinedBy: [0] },
  { name: 'Wide', arity: 2, determinedBy: [0] },
  // how two types combine arithmetically, and what results: numbers widen to their least upper
  // bound, and a time value combines with a time quantity
  { name: 'Arith', arity: 3, determinedBy: [0, 1] },
  // pairs of types that can be compared, with and without an ordering
  { name: 'Comparable', arity: 2 },
  { name: 'Equatable', arity: 2 },
];

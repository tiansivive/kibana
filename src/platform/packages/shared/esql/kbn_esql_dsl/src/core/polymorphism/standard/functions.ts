/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { esqlType, varType } from '../../type';
import type { Mono, Requires } from '../../type';
import type { LibraryFunction } from '../library';

/**
 * The functions the DSL knows. It grows one function at a time: a new function adds its type,
 * and a protocol with instances only when no existing protocol describes its parameters.
 *
 * A protocol states a fact about types, true whether or not any function uses it. Where ES|QL's
 * accepted set for one function matches no such fact, the function uses the nearest general
 * protocol. The DSL may accept a query ES rejects, but must not reject one ES accepts.
 */

const a = varType('a');
const b = varType('b');
const c = varType('c');
const boolean = esqlType('boolean');
const integer = esqlType('integer');
const keyword = esqlType('keyword');
const double = esqlType('double');
const long = esqlType('long');

const requires = (protocol: string, ...args: readonly Mono[]): Requires => ({ protocol, args });

const fn = (
  name: string,
  kind: LibraryFunction['kind'],
  params: readonly Mono[],
  result: Mono,
  required: readonly Requires[] = [],
  constParams: readonly number[] = []
): LibraryFunction => ({
  name,
  kind,
  constParams,
  type: { tag: 'poly', requires: required, params, result },
});

export const functions: readonly LibraryFunction[] = [
  fn('abs', 'scalar', [a], a, [requires('Numeric', a)]),
  fn('round', 'scalar', [a], a, [requires('Numeric', a)]),
  fn('add', 'scalar', [a, b], c, [requires('Arith', a, b, c)]),
  fn('greater_than', 'scalar', [a, b], boolean, [requires('Comparable', a, b)]),
  fn('equals', 'scalar', [a, b], boolean, [requires('Equatable', a, b)]),
  fn('and', 'scalar', [boolean, boolean], boolean),
  fn('or', 'scalar', [boolean, boolean], boolean),
  fn('avg', 'agg', [a], double, [requires('SignedNumeric', a)]),
  fn('sum', 'agg', [a], b, [requires('SignedNumeric', a), requires('Wide', a, b)]),
  fn('max', 'agg', [a], b, [requires('Orderable', a), requires('Norm', a, b)]),
  fn('count', 'agg', [a], long),
  fn(
    'top',
    'agg',
    [a, integer, keyword],
    b,
    [requires('Orderable', a), requires('Norm', a, b)],
    [1, 2]
  ),
];

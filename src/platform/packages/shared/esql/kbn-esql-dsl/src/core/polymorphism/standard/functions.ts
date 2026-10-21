/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { esqlType, varType } from '../../type';
import { fn, many, one, optional, requires, slot } from '../library';
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
const s = varType('s');
const u = varType('u');
const v = varType('v');

export const functions: readonly LibraryFunction[] = [
  fn('abs', [one(a)], a, [requires('Numeric', a)]),
  fn('round', [one(a), optional(b)], a, [requires('Numeric', a), requires('SignedNumeric', b)]),
  fn('substring', [one(s), one(integer), optional(integer)], keyword, [
    requires('Norm', s, keyword),
  ]),
  // every argument has the same normal form, so `text` and `keyword` can be mixed
  fn('coalesce', [one(a), many(0, slot(u))], b, [requires('Norm', a, b), requires('Norm', u, b)]),
  fn('concat', [many(2, slot(u))], keyword, [requires('Norm', u, keyword)]),
  // each condition is followed by its value, and a last value is used when no condition holds
  fn('case', [many(1, slot(boolean), slot(u)), optional(v)], b, [
    requires('Norm', u, b),
    requires('Norm', v, b),
  ]),
  fn('is_null', [one(a)], boolean, []),
  fn('is_not_null', [one(a)], boolean, []),
  // `x::keyword` is TO_STRING, which takes every type
  fn('to_string', [one(a)], keyword, []),
  fn('to_base64', [one(s)], keyword, [requires('Norm', s, keyword)]),
  fn('kql', [one(s, 'const')], boolean, [requires('Norm', s, keyword)], 'scalar'),
  fn('mv_pseries_weighted_sum', [one(a), one(double, 'const')], double, [requires('Numeric', a)]),
  fn('add', [one(a), one(b)], c, [requires('Arith', a, b, c)]),
  fn('greater_than', [one(a), one(b)], boolean, [requires('Comparable', a, b)]),
  fn('equals', [one(a), one(b)], boolean, [requires('Equatable', a, b)]),
  fn('and', [one(boolean), one(boolean)], boolean, []),
  fn('or', [one(boolean), one(boolean)], boolean, []),
  fn('avg', [one(a, 'scalar')], double, [requires('SignedNumeric', a)], 'agg'),
  fn('sum', [one(a, 'scalar')], b, [requires('SignedNumeric', a), requires('Wide', a, b)], 'agg'),
  fn('max', [one(a, 'scalar')], b, [requires('Orderable', a), requires('Norm', a, b)], 'agg'),
  fn('count', [one(a, 'scalar')], long, [], 'agg'),
  fn(
    'top',
    [one(a, 'scalar'), one(integer, 'const'), one(keyword, 'const')],
    b,
    [requires('Orderable', a), requires('Norm', a, b)],
    'agg'
  ),
];

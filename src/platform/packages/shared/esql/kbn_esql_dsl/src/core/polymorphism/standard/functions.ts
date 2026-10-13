/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KindSignature, ParamKind } from '../../../vocabulary/kind';
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
const s = varType('s');
const t = varType('t');
const u = varType('u');

const requires = (protocol: string, ...args: readonly Mono[]): Requires => ({ protocol, args });

/** How many parameters must be given, and the type of any further arguments. */
interface Arity {
  readonly required?: number;
  readonly rest?: Mono;
}

const fn = (
  name: string,
  params: readonly Mono[],
  result: Mono,
  needs: readonly Requires[],
  kinds: KindSignature,
  arity: Arity = {}
): LibraryFunction => ({
  name,
  type: {
    tag: 'poly',
    requires: needs,
    params,
    required: arity.required ?? params.length,
    result,
    ...(arity.rest ? { rest: arity.rest } : {}),
  },
  kinds,
});

/** A scalar function takes any kind and is as aggregate as its arguments are. */
const scalar = (...params: readonly ParamKind[]): KindSignature => ({ params, result: 'k' });

const aggregate = (...params: readonly ParamKind[]): KindSignature => ({ params, result: 'agg' });

/** The kind of every argument after the listed parameters. */
const variadic = (kinds: KindSignature, rest: ParamKind): KindSignature => ({ ...kinds, rest });

export const functions: readonly LibraryFunction[] = [
  fn('abs', [a], a, [requires('Numeric', a)], scalar('k')),
  fn('round', [a, b], a, [requires('Numeric', a), requires('SignedNumeric', b)], scalar('k', 'k'), {
    required: 1,
  }),
  fn(
    'substring',
    [s, integer, integer],
    keyword,
    [requires('Norm', s, keyword)],
    scalar('k', 'k', 'k'),
    {
      required: 2,
    }
  ),
  // every argument has the same normal form, so `text` and `keyword` can be mixed
  fn(
    'coalesce',
    [a],
    b,
    [requires('Norm', a, b), requires('Norm', u, b)],
    variadic(scalar('k'), 'k'),
    {
      rest: u,
    }
  ),
  fn(
    'concat',
    [s, t],
    keyword,
    [requires('Norm', s, keyword), requires('Norm', t, keyword), requires('Norm', u, keyword)],
    variadic(scalar('k', 'k'), 'k'),
    { rest: u }
  ),
  fn('add', [a, b], c, [requires('Arith', a, b, c)], scalar('k', 'k')),
  fn('greater_than', [a, b], boolean, [requires('Comparable', a, b)], scalar('k', 'k')),
  fn('equals', [a, b], boolean, [requires('Equatable', a, b)], scalar('k', 'k')),
  fn('and', [boolean, boolean], boolean, [], scalar('k', 'k')),
  fn('or', [boolean, boolean], boolean, [], scalar('k', 'k')),
  fn('avg', [a], double, [requires('SignedNumeric', a)], aggregate('scalar')),
  fn('sum', [a], b, [requires('SignedNumeric', a), requires('Wide', a, b)], aggregate('scalar')),
  fn('max', [a], b, [requires('Orderable', a), requires('Norm', a, b)], aggregate('scalar')),
  fn('count', [a], long, [], aggregate('scalar')),
  fn(
    'top',
    [a, integer, keyword],
    b,
    [requires('Orderable', a), requires('Norm', a, b)],
    aggregate('scalar', 'const', 'const')
  ),
];

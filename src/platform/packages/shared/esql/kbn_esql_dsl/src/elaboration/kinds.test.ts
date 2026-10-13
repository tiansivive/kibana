/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { makeLibrary } from '../core/polymorphism/library';
import { standardLibrary } from '../core/polymorphism/standard/standard';
import type { Kind } from '../vocabulary/kind';
import { callKind } from './kinds';

const origin = { path: 'call' };

const call = (name: string, ...kinds: Kind[]) => {
  const fn = standardLibrary.functions.get(name);
  if (!fn) {
    throw new Error(`no function ${name}`);
  }
  const { kind, emit } = callKind(fn, kinds, origin);
  return { kind, codes: emit.diagnostics.map((d) => d.code) };
};

describe('callKind', () => {
  it('gives a scalar function the join of its arguments', () => {
    expect(call('add', 'const', 'const')).toEqual({ kind: 'const', codes: [] });
    expect(call('add', 'const', 'scalar')).toEqual({ kind: 'scalar', codes: [] });
    expect(call('add', 'agg', 'const')).toEqual({ kind: 'agg', codes: [] });
    expect(call('abs', 'agg')).toEqual({ kind: 'agg', codes: [] });
  });

  it('rejects an aggregate mixed with a per-row value', () => {
    expect(call('add', 'agg', 'scalar').codes).toEqual(['mixed_kinds']);
  });

  it('makes an aggregate function an aggregate, whatever its arguments', () => {
    expect(call('count', 'scalar')).toEqual({ kind: 'agg', codes: [] });
    expect(call('count', 'const')).toEqual({ kind: 'agg', codes: [] });
    expect(call('sum', 'agg')).toEqual({ kind: 'agg', codes: ['nested_aggregate'] });
  });

  it('requires a constant where the kind signature says const', () => {
    expect(call('top', 'scalar', 'const', 'const').codes).toEqual([]);
    expect(call('top', 'scalar', 'scalar', 'const').codes).toEqual(['constant_required']);
  });
});

describe('kind signatures in a library', () => {
  it('have as many parameters as the function has', () => {
    standardLibrary.functions.forEach((fn) =>
      expect([fn.name, fn.kinds.params.length]).toEqual([fn.name, fn.type.params.length])
    );
  });

  it('are rejected when the number of parameters differs', () => {
    const sum = standardLibrary.functions.get('sum');
    expect(() =>
      makeLibrary([], [], sum ? [{ ...sum, kinds: { params: [], result: 'agg' } }] : [])
    ).toThrow('sum has a kind signature with a different number of parameters');
  });
});

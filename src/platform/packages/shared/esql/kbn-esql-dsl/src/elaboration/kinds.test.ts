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

const location = { path: 'call' };

const call = (name: string, ...kinds: Kind[]) => {
  const fn = standardLibrary.functions.get(name);
  if (!fn) {
    throw new Error(`no function ${name}`);
  }
  const { kind, emit } = callKind(fn, kinds, location);
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

describe('callKind: results that are always per row', () => {
  it('gives KQL a per-row value even from a constant, and requires a constant query', () => {
    expect(call('kql', 'const')).toEqual({ kind: 'scalar', codes: [] });
    expect(call('kql', 'scalar').codes).toEqual(['constant_required']);
  });

  it('keeps the weight of a weighted sum constant and takes the kind of its values', () => {
    expect(call('mv_pseries_weighted_sum', 'agg', 'const')).toEqual({ kind: 'agg', codes: [] });
    expect(call('mv_pseries_weighted_sum', 'agg', 'scalar').codes).toEqual(['constant_required']);
  });
});

describe('callKind: further arguments', () => {
  it('gives the further arguments of a variadic function the kind of its rest', () => {
    expect(call('coalesce', 'const', 'const', 'const')).toEqual({ kind: 'const', codes: [] });
    expect(call('coalesce', 'scalar', 'const', 'scalar')).toEqual({ kind: 'scalar', codes: [] });
    expect(call('coalesce', 'agg', 'const')).toEqual({ kind: 'agg', codes: [] });
    expect(call('concat', 'scalar', 'scalar', 'agg').codes).toEqual(['mixed_kinds']);
  });

  it('reads optional parameters the same way', () => {
    expect(call('round', 'scalar')).toEqual({ kind: 'scalar', codes: [] });
    expect(call('round', 'scalar', 'const')).toEqual({ kind: 'scalar', codes: [] });
    expect(call('substring', 'agg', 'const', 'scalar').codes).toEqual(['mixed_kinds']);
  });
});

describe('kind signatures in a library', () => {
  it('have as many parameters as the function has', () => {
    standardLibrary.functions.forEach((fn) =>
      expect([fn.name, fn.kinds.params.length]).toEqual([fn.name, fn.type.params.length])
    );
  });

  it('are rejected when they disagree with the type about further arguments', () => {
    const coalesce = standardLibrary.functions.get('coalesce');
    expect(() =>
      makeLibrary([], [], coalesce ? [{ ...coalesce, kinds: { params: ['k'], result: 'k' } }] : [])
    ).toThrow('coalesce has a kind signature that disagrees with its type about further arguments');
  });

  it('are rejected when a function requires more parameters than it has', () => {
    const round = standardLibrary.functions.get('round');
    expect(() =>
      makeLibrary([], [], round ? [{ ...round, type: { ...round.type, required: 3 } }] : [])
    ).toThrow('round requires 3 of 2 parameters');
  });

  it('are rejected when the number of parameters differs', () => {
    const sum = standardLibrary.functions.get('sum');
    expect(() =>
      makeLibrary([], [], sum ? [{ ...sum, kinds: { params: [], result: 'agg' } }] : [])
    ).toThrow('sum has a kind signature with a different number of parameters');
  });
});

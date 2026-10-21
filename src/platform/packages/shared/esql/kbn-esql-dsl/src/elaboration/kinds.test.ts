/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fn, makeLibrary, many, requires, slot } from '../core/polymorphism/library';
import { standardLibrary } from '../core/polymorphism/standard/standard';
import { esqlType, varType } from '../core/type';
import type { Requires } from '../core/type';
import type { Kind } from '../vocabulary/kind';
import { callKind } from './kinds';

const location = { path: 'call' };

/** Arguments are checked against the function's elements in order, cycling for a sequence. */
const call = (name: string, ...kinds: Kind[]) => {
  const f = standardLibrary.functions.get(name);
  if (!f) {
    throw new Error(`no function ${name}`);
  }
  const slots = f.type.params.flatMap((p) => p.slots);
  const { kind, emit } = callKind(
    f,
    kinds.map((k, i) => ({ kind: k, expects: slots[i % slots.length]?.kind ?? 'k' })),
    location
  );
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

describe('callKind: optional parameters and sequences', () => {
  it('gives each element of a sequence the kind of its slot', () => {
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

describe('parameters in a library', () => {
  const u = varType('u');
  const w = varType('w');
  const library = (...needs: Requires[]) =>
    makeLibrary(
      [{ name: 'Related', arity: 2 }],
      [],
      [fn('f', [many(0, slot(u)), many(0, slot(w))], esqlType('keyword'), needs)]
    );

  it('are rejected when a protocol mentions the variables of two sequences', () => {
    expect(() => library(requires('Related', u, w))).toThrow(
      'f requires a protocol over the variables of two sequences'
    );
  });

  it('accept a protocol over the variables of one sequence and a shared variable', () => {
    expect(() => library(requires('Related', u, varType('r')))).not.toThrow();
  });
});

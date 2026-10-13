/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { call, param } from '../../../dsl/expr';
import type { AnyExpr } from '../../../dsl/expr';
import { from } from '../../../dsl/query';
import { ESQL_TYPES } from '../../../vocabulary/esql_type';
import type { EsqlType } from '../../../vocabulary/esql_type';
import { typecheck } from '../../../typecheck';
import { standardLibrary } from './standard';
import { ABS, ADD, AVG, EQUALS, GREATER_THAN, MAX, STRING, SUM, TOP } from './tables';

/**
 * The standard library against the published tables, for every combination of types. A table
 * says what ES|QL accepts. The library must accept at least that, and where a function matches a
 * general protocol exactly it must accept nothing more.
 */

const lookup = (table: Readonly<Record<string, unknown>>, ...keys: readonly string[]): unknown =>
  keys.reduce<unknown>(
    (acc, key) =>
      typeof acc === 'object' && acc !== null && key in acc ? Reflect.get(acc, key) : undefined,
    table
  );

const scalarResult = (
  fn: string,
  ...types: readonly EsqlType[]
): readonly EsqlType[] | undefined => {
  const args: AnyExpr[] = types.map((ty, i) => param(`p${i}`, ty));
  const analysis = typecheck(from('i').eval('r', () => call<EsqlType, 'scalar'>(fn, ...args)).ast);
  return analysis.ok ? analysis.output.columns.get('r') : undefined;
};

const aggregateResult = (
  fn: string,
  ...types: readonly EsqlType[]
): readonly EsqlType[] | undefined => {
  const args: AnyExpr[] = types.map((ty, i) => param(`p${i}`, ty));
  const analysis = typecheck(
    from('i').stats(() => ({ r: call<EsqlType, 'agg'>(fn, ...args) })).ast
  );
  return analysis.ok ? analysis.output.columns.get('r') : undefined;
};

const pairs: readonly (readonly [EsqlType, EsqlType])[] = ESQL_TYPES.flatMap((a) =>
  ESQL_TYPES.map((b): readonly [EsqlType, EsqlType] => [a, b])
);

describe('standard library against the published tables', () => {
  it.each([
    ['add', ADD],
    ['greater_than', GREATER_THAN],
    ['equals', EQUALS],
  ])('%s accepts exactly the published pairs and gives the published result', (fn, table) => {
    pairs.forEach(([a, b]) => {
      const published = lookup(table, a, b);
      const result = scalarResult(fn, a, b);
      expect({ fn, a, b, result }).toEqual({
        fn,
        a,
        b,
        result: typeof published === 'string' ? [published] : undefined,
      });
    });
  });

  it('abs accepts exactly the published types and returns the same type', () => {
    ESQL_TYPES.forEach((ty) => {
      expect({ ty, result: scalarResult('abs', ty) }).toEqual({
        ty,
        result: lookup(ABS, ty) === undefined ? undefined : [ty],
      });
    });
  });

  it('avg accepts exactly the published types', () => {
    ESQL_TYPES.forEach((ty) => {
      expect({ ty, result: aggregateResult('avg', ty) }).toEqual({
        ty,
        result: lookup(AVG, ty) === undefined ? undefined : ['double'],
      });
    });
  });

  it('sum accepts exactly the published types and widens integral types to long', () => {
    ESQL_TYPES.forEach((ty) => {
      const published = lookup(SUM, ty);
      expect({ ty, result: aggregateResult('sum', ty) }).toEqual({
        ty,
        result: typeof published === 'string' ? [published] : undefined,
      });
    });
  });

  it('max accepts exactly the published types and normalises text to keyword', () => {
    ESQL_TYPES.forEach((ty) => {
      const published = lookup(MAX, ty);
      expect({ ty, result: aggregateResult('max', ty) }).toEqual({
        ty,
        result: typeof published === 'string' ? [published] : undefined,
      });
    });
  });

  it('top accepts at least the published types and normalises text to keyword', () => {
    Object.entries(TOP).forEach(([ty, published]) => {
      const type = ESQL_TYPES.find((candidate) => candidate === ty);
      expect(type).toBeDefined();
      if (type) {
        expect({ ty, result: aggregateResult('top', type, 'integer', 'keyword') }).toEqual({
          ty,
          result: [published],
        });
      }
    });
  });

  it('count accepts any type, and round takes a numeric value', () => {
    ESQL_TYPES.forEach((ty) => expect(aggregateResult('count', ty)).toEqual(['long']));
    ESQL_TYPES.forEach((ty) => {
      expect({ ty, result: scalarResult('round', ty) }).toEqual({
        ty,
        result: lookup(ABS, ty) === undefined ? undefined : [ty],
      });
    });
  });
});

describe('standard library: optional and further parameters', () => {
  const textual = ESQL_TYPES.filter((ty) => lookup(STRING, ty) !== undefined);

  it('round accepts a numeric value with an optional signed numeric count of decimals', () => {
    pairs.forEach(([a, b]) => {
      const accepted = lookup(ABS, a) !== undefined && lookup(AVG, b) !== undefined;
      expect({ a, b, result: scalarResult('round', a, b) }).toEqual({
        a,
        b,
        result: accepted ? [a] : undefined,
      });
    });
  });

  it('substring accepts text with a start and an optional length', () => {
    ESQL_TYPES.forEach((ty) => {
      const expected = lookup(STRING, ty) === undefined ? undefined : ['keyword'];
      expect(scalarResult('substring', ty, 'integer')).toEqual(expected);
      expect(scalarResult('substring', ty, 'integer', 'integer')).toEqual(expected);
    });
  });

  it('concat accepts any number of text and keyword values in any order', () => {
    pairs.forEach(([a, b]) => {
      const accepted = textual.includes(a) && textual.includes(b);
      expect(scalarResult('concat', a, b)).toEqual(accepted ? ['keyword'] : undefined);
    });
    expect(scalarResult('concat', 'text', 'keyword', 'text', 'keyword', 'text')).toEqual([
      'keyword',
    ]);
    expect(scalarResult('concat', 'text', 'keyword', 'long')).toBeUndefined();
  });

  it('coalesce gives every argument one type, normalised', () => {
    ESQL_TYPES.forEach((ty) => {
      const expected = [ty === 'text' ? 'keyword' : ty];
      expect(scalarResult('coalesce', ty)).toEqual(expected);
      expect(scalarResult('coalesce', ty, ty, ty)).toEqual(expected);
    });
    expect(scalarResult('coalesce', 'long', 'double')).toBeUndefined();
    expect(scalarResult('coalesce', 'text', 'keyword', 'text')).toEqual(['keyword']);
  });
});

describe('standard library: null checks, conversions, KQL and the weighted sum', () => {
  it('null checks and TO_STRING take every type', () => {
    ESQL_TYPES.forEach((ty) => {
      expect(scalarResult('is_null', ty)).toEqual(['boolean']);
      expect(scalarResult('is_not_null', ty)).toEqual(['boolean']);
      expect(scalarResult('to_string', ty)).toEqual(['keyword']);
    });
  });

  it('TO_BASE64 and KQL take keyword and text only', () => {
    ESQL_TYPES.forEach((ty) => {
      const text = lookup(STRING, ty) !== undefined;
      expect(scalarResult('to_base64', ty)).toEqual(text ? ['keyword'] : undefined);
      expect(scalarResult('kql', ty)).toEqual(text ? ['boolean'] : undefined);
    });
  });

  it('the weighted sum takes a number and a double weight, and gives double', () => {
    ESQL_TYPES.forEach((ty) => {
      expect(scalarResult('mv_pseries_weighted_sum', ty, 'double')).toEqual(
        lookup(ABS, ty) === undefined ? undefined : ['double']
      );
    });
    expect(scalarResult('mv_pseries_weighted_sum', 'double', 'keyword')).toBeUndefined();
  });
});

describe('arithmetic is one fact about types', () => {
  const rows = (protocol: string): readonly string[] =>
    (standardLibrary.instances.get(protocol) ?? []).map((row) => row.join(','));

  it('Arith holds exactly the published rows of addition', () => {
    const published = Object.entries(ADD).flatMap(([a, row]) =>
      Object.entries(row).map(([b, c]) => [a, b, c].join(','))
    );
    expect([...rows('Arith')].toSorted()).toEqual([...new Set(published)].toSorted());
  });

  it('numeric rows give the least upper bound along integer < long < double', () => {
    const chain: readonly EsqlType[] = ['integer', 'long', 'double'];
    const lub = (a: EsqlType, b: EsqlType): EsqlType =>
      chain[Math.max(chain.indexOf(a), chain.indexOf(b))];
    const numeric = (standardLibrary.instances.get('Arith') ?? []).filter((row) =>
      row.every((ty) => chain.includes(ty))
    );
    expect(numeric).toHaveLength(9);
    numeric.forEach(([a, b, c]) => expect(c).toBe(lub(a, b)));
  });

  it('comparison pairs are symmetric, and equality takes everything ordering takes', () => {
    const comparable = new Set(rows('Comparable'));
    const equatable = new Set(rows('Equatable'));
    [...comparable].forEach((pair) => {
      const [a, b] = pair.split(',');
      expect(comparable.has(`${b},${a}`)).toBe(true);
      expect(equatable.has(pair)).toBe(true);
    });
  });
});

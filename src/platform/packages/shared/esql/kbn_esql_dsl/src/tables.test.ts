/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { functionDefinitions } from '@elastic/esql-definitions/functions';
import { operatorDefinitions } from '@elastic/esql-definitions/operators';
import { ABS, ADD, AVG, EQUALS, GREATER_THAN, MAX, SUM, TOP } from './tables';
import type { BinaryTable, UnaryTable } from './tables';
import { TYS } from './types';

/**
 * The tables drive both the TypeScript signatures and the runtime checks, so they must agree
 * exactly with the published definitions, restricted to the types the DSL covers.
 */

const inScope = (t: string): boolean => (TYS as readonly string[]).includes(t);

const findFunction = (name: string) => {
  const def = [...functionDefinitions, ...operatorDefinitions].find((d) => d.name === name);
  if (!def) {
    throw new Error(`no definition named ${name}`);
  }
  return def;
};

const expandBinary = (table: BinaryTable): string[] =>
  Object.entries(table)
    .flatMap(([a, row]) => Object.entries(row ?? {}).map(([b, r]) => `${a},${b}->${r}`))
    .sort();

const expandUnary = (table: UnaryTable): string[] =>
  Object.entries(table)
    .map(([a, r]) => `${a}->${r}`)
    .sort();

const binaryRows = (name: string): string[] =>
  findFunction(name)
    .signatures.filter(
      (s) => s.params.length === 2 && [...s.params.map((p) => p.type), s.returnType].every(inScope)
    )
    .map((s) => `${s.params[0].type},${s.params[1].type}->${s.returnType}`)
    .sort();

const unaryRows = (name: string, arity = 1): string[] =>
  findFunction(name)
    .signatures.filter(
      (s) =>
        s.params.length === arity &&
        s.params.every((p) => !p.optional) &&
        [s.params[0].type, s.returnType].every(inScope)
    )
    .map((s) => `${s.params[0].type}->${s.returnType}`)
    .sort();

describe('signature tables match @elastic/esql-definitions', () => {
  it.each([
    ['add', ADD],
    ['greater_than', GREATER_THAN],
    ['equals', EQUALS],
  ])('%s', (name, table) => {
    expect(expandBinary(table)).toEqual(binaryRows(name));
  });

  it.each([
    ['abs', ABS],
    ['avg', AVG],
    ['sum', SUM],
    ['max', MAX],
  ])('%s', (name, table) => {
    expect(expandUnary(table)).toEqual(unaryRows(name));
  });

  it('top (field, limit, order)', () => {
    const rows = findFunction('top')
      .signatures.filter(
        (s) =>
          s.params.length === 3 &&
          s.params[1].type === 'integer' &&
          s.params[1].hint?.kind === 'constant' &&
          s.params[2].type === 'keyword' &&
          s.params[2].hint?.kind === 'constant' &&
          inScope(s.params[0].type) &&
          inScope(s.returnType)
      )
      .map((s) => `${s.params[0].type}->${s.returnType}`)
      .sort();
    expect(expandUnary(TOP)).toEqual(rows);
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Locate from './locate';

describe('Locate', () => {
  it('names the places of a query as paths into its AST', () => {
    const stats = Locate.command(1, 'stats');
    expect(stats.path).toBe('pipe[1].stats');
    expect(Locate.aggregate(stats, 'total').path).toBe('pipe[1].stats.aggs.total');
    expect(Locate.groupKey(stats, 'host').path).toBe('pipe[1].stats.by.host');
    expect(Locate.arg(Locate.aggregate(stats, 'total'), 0).path).toBe(
      'pipe[1].stats.aggs.total.args[0]'
    );
    expect(Locate.sortKey(Locate.command(0, 'sort'), 2).path).toBe('pipe[0].sort.keys[2]');
    expect(Locate.field(Locate.command(0, 'where'), 'cond').path).toBe('pipe[0].where.cond');
    expect(Locate.schema('host').path).toBe('schema.host');
  });

  it('derives the names of metas and holes from a place', () => {
    const call = Locate.arg(Locate.command(0, 'eval'), 0);
    expect(Locate.typeVariable(call, 'a')).toBe('pipe[0].eval.args[0]$a');
    expect(Locate.instance(call, 1)).toBe('pipe[0].eval.args[0]#1');
    expect(Locate.restVariable(call, 'u', 3)).toBe('pipe[0].eval.args[0]$u[3]');
    expect(Locate.restInstance(call, 2, 3)).toBe('pipe[0].eval.args[0]#2[3]');
    expect(Locate.untyped(call)).toBe('pipe[0].eval.args[0]!');
    expect(Locate.untyped(call, 'host')).toBe('pipe[0].eval.args[0]!host');
    expect(Locate.orderable(call)).toBe('pipe[0].eval.args[0]#orderable');
    expect(Locate.fieldType(call, 'host')).toBe('pipe[0].eval.args[0]#field.host');
  });
});

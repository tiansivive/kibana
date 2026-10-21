/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { count, from, gt, lit, sum } from '..';
import { capability, response } from './fixtures';
import { preflight } from './preflight';

const clientOf = (fields: Parameters<typeof response>[0]) => ({
  fieldCaps: jest.fn(async () => response(fields)),
});

describe('preflight', () => {
  const query = from('logs-*').where((c) => gt(c.bytes, lit.long(1)));

  it('asks for the columns the query reads in the indices it reads', async () => {
    const esClient = clientOf({ bytes: { long: capability('long') } });
    await preflight(query, esClient);
    expect(esClient.fieldCaps).toHaveBeenCalledWith({ index: ['logs-*'], fields: ['bytes'] });
  });

  it('passes a query the mappings satisfy, and shows how each column fits', async () => {
    const result = await preflight(query, clientOf({ bytes: { long: capability('long') } }));
    expect(result.ok).toBe(true);
    expect(result.schema).toEqual({ bytes: 'long' });
    expect(result.columns).toEqual([
      { column: 'bytes', mapped: 'long', needs: ['integer', 'long', 'double'], fits: true },
    ]);
  });

  it('reports a mapping the query cannot use, at the place it is used', async () => {
    const result = await preflight(query, clientOf({ bytes: { keyword: capability('keyword') } }));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => [d.code, d.location.path])).toEqual([
      ['no_instance', 'pipe[0].where.cond'],
    ]);
    expect(result.columns).toEqual([
      { column: 'bytes', mapped: 'keyword', needs: ['integer', 'long', 'double'], fits: false },
    ]);
  });

  it('reports a column that is not mapped once, where it is first read', async () => {
    const twice = from('logs-*')
      .where((c) => gt(c.bytes, lit.long(1)))
      .stats((c) => ({ total: sum(c.bytes) }));
    const result = await preflight(twice, clientOf({}));
    expect(result.diagnostics.map((d) => [d.code, d.column, d.location.path])).toEqual([
      ['unmapped_column', 'bytes', 'pipe[0].where.cond.args[0]'],
    ]);
    expect(result.diagnostics[0].message).toBe('bytes is not mapped in logs-*');
  });

  it('reports conflicting mappings with the indices that differ', async () => {
    const result = await preflight(
      query,
      clientOf({
        bytes: { long: capability('long', ['logs-a']), keyword: capability('keyword', ['logs-b']) },
      })
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(['conflicting_field_types']);
    expect(result.diagnostics[0].message).toBe(
      'bytes has conflicting types: long in logs-a; keyword in logs-b'
    );
  });

  it('makes no request for a query that reads no source column', async () => {
    const esClient = clientOf({});
    const result = await preflight(
      from('logs-*').stats(() => ({ n: count(lit.int(1)) })),
      esClient
    );
    expect(result.ok).toBe(true);
    expect(esClient.fieldCaps).not.toHaveBeenCalled();
  });

  it('still reports what is wrong with the query itself', async () => {
    const result = await preflight(
      // @ts-expect-error an aggregate is not a per-row value
      from('logs-*').where((c) => gt(sum(c.bytes), lit.long(1))),
      clientOf({ bytes: { long: capability('long') } })
    );
    expect(result.diagnostics.map((d) => d.code)).toContain('aggregate_in_scalar_context');
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { capability, response } from './fixtures';
import { schemaFromFieldCaps } from './schema';

const derive = (fields: Parameters<typeof response>[0], columns: string[]) =>
  schemaFromFieldCaps(response(fields), columns, ['logs-a', 'logs-b']);

describe('schemaFromFieldCaps', () => {
  it('reads each mapping type as the ES|QL type ES|QL gives it', () => {
    const { schema, problems } = derive(
      {
        host: { keyword: capability('keyword') },
        tag: { constant_keyword: capability('constant_keyword') },
        message: { text: capability('text') },
        small: { short: capability('short') },
        ratio: { float: capability('float') },
        bytes: { long: capability('long') },
        at: { date_nanos: capability('date_nanos') },
      },
      ['host', 'tag', 'message', 'small', 'ratio', 'bytes', 'at']
    );
    expect(problems).toEqual([]);
    expect(schema).toEqual({
      host: 'keyword',
      tag: 'keyword',
      message: 'text',
      small: 'integer',
      ratio: 'double',
      bytes: 'long',
      at: 'date_nanos',
    });
  });

  it('asks only for the columns it is given', () => {
    const { schema } = derive(
      { a: { long: capability('long') }, b: { long: capability('long') } },
      ['a']
    );
    expect(schema).toEqual({ a: 'long' });
  });

  it('reports a column that no index maps', () => {
    const { schema, problems } = derive({}, ['missing']);
    expect(schema).toEqual({});
    expect(problems).toEqual([
      {
        column: 'missing',
        code: 'unmapped_column',
        message: 'missing is not mapped in logs-a, logs-b',
      },
    ]);
  });

  it('reports types that differ between indices, naming the indices', () => {
    const { schema, problems } = derive(
      {
        size: { long: capability('long', ['logs-a']), keyword: capability('keyword', ['logs-b']) },
      },
      ['size']
    );
    expect(schema).toEqual({});
    expect(problems).toEqual([
      {
        column: 'size',
        code: 'conflicting_field_types',
        message: 'size has conflicting types: long in logs-a; keyword in logs-b',
      },
    ]);
  });

  it('reports text in one index and keyword in another, as ES|QL rejects it', () => {
    const { schema, problems } = derive(
      {
        name: { text: capability('text', ['logs-a']), keyword: capability('keyword', ['logs-b']) },
      },
      ['name']
    );
    expect(schema).toEqual({});
    expect(problems.map((p) => p.code)).toEqual(['conflicting_field_types']);
  });

  it('reads types that differ in the mapping but not in ES|QL as one type', () => {
    const { schema, problems } = derive(
      {
        tag: {
          keyword: capability('keyword', ['logs-a']),
          wildcard: capability('wildcard', ['logs-b']),
        },
      },
      ['tag']
    );
    expect(problems).toEqual([]);
    expect(schema).toEqual({ tag: 'keyword' });
  });

  it('reports a type a query cannot read as a covered type', () => {
    const { problems } = derive(
      {
        host: { object: capability('object') },
        hits: { counter_long: capability('counter_long') },
      },
      ['host', 'hits']
    );
    expect(problems.map((p) => [p.column, p.code])).toEqual([
      ['host', 'unsupported_field_type'],
      ['hits', 'unsupported_field_type'],
    ]);
    expect(problems[0].message).toBe(
      'host has the type object, which a query cannot read as a covered type'
    );
  });
});

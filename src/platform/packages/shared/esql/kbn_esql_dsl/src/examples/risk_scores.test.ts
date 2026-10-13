/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { compile, typecheck } from '..';
import { capability, response } from '../preflight/fixtures';
import { preflight } from '../preflight/preflight';
import { riskScoresQuery } from './risk_scores';

const options = {
  identifierField: 'host.name',
  afterKeys: { lower: '"a"' },
  pageSize: 100,
  index: 'dsl-alerts',
};

const alertMappings = {
  'kibana.alert.risk_score': { float: capability('float') },
  'kibana.alert.rule.name': { keyword: capability('keyword') },
  'kibana.alert.rule.uuid': { keyword: capability('keyword') },
  'kibana.alert.uuid': { keyword: capability('keyword') },
  'event.kind': { keyword: capability('keyword') },
  '@timestamp': { date: capability('date') },
  'host.name': { keyword: capability('keyword') },
};

describe('the risk score calculation written with the DSL', () => {
  const query = riskScoresQuery(options);

  it('compiles to the ES|QL the calculation runs', () => {
    expect(compile(typecheck(query.ast).core).print('basic')).toBe(
      [
        'FROM dsl-alerts',
        'WHERE kibana.alert.risk_score IS NOT NULL AND KQL("host.name > \\"a\\"")',
        'RENAME kibana.alert.risk_score AS risk_score',
        'RENAME kibana.alert.rule.name AS rule_name',
        'RENAME kibana.alert.rule.uuid AS rule_id',
        'RENAME kibana.alert.uuid AS alert_id',
        'RENAME event.kind AS category',
        'RENAME @timestamp AS time',
        'EVAL rule_name_b64 = TO_BASE64(rule_name)',
        'EVAL category_b64 = TO_BASE64(category)',
        'EVAL input = CONCAT(" {\\"risk_score\\": \\"", TO_STRING(risk_score), "\\", \\"time\\": \\"", TO_STRING(time), "\\", \\"rule_name_b64\\": \\"", rule_name_b64, "\\", \\"category_b64\\": \\"", category_b64, "\\", \\"id\\": \\"", alert_id, "\\" } ")',
        'STATS alert_count = COUNT(risk_score), scores = MV_PSERIES_WEIGHTED_SUM(TOP(risk_score, 10000, "desc"), 1.5), risk_inputs = TOP(input, 10, "desc") BY entity = host.name',
        'SORT scores DESC',
        'LIMIT 100',
      ].join(' | ')
    );
  });

  it('checks without a schema and produces the columns the caller reads by position', () => {
    const a = typecheck(query.ast);
    expect(a.ok).toBe(true);
    expect([...a.output.columns.keys()]).toEqual([
      'alert_count',
      'scores',
      'risk_inputs',
      'entity',
    ]);
    expect(a.output.open).toBe(false);
    expect([...a.required.keys()].toSorted()).toEqual(Object.keys(alertMappings).toSorted());
  });

  it('needs a lower or an upper bound to page by', () => {
    expect(() => riskScoresQuery({ ...options, afterKeys: {} })).toThrow(
      'Either lower or upper after key must be provided for pagination'
    );
  });

  it('passes preflight against the mappings of the alerts index', async () => {
    const result = await preflight(query, { fieldCaps: async () => response(alertMappings) });
    expect(result.ok).toBe(true);
    expect(result.schema['kibana.alert.risk_score']).toBe('double');
  });

  it('fails preflight when the risk score is mapped as keyword', async () => {
    const result = await preflight(query, {
      fieldCaps: async () =>
        response({
          ...alertMappings,
          'kibana.alert.risk_score': { keyword: capability('keyword') },
        }),
    });
    expect(result.diagnostics.map((d) => d.code)).toEqual(['no_instance']);
    expect(result.diagnostics[0].message).toBe('Numeric has no instance for (ES.keyword)');
  });

  it('fails preflight when a column the calculation reads is not mapped', async () => {
    const { 'event.kind': _kind, ...withoutKind } = alertMappings;
    const result = await preflight(query, { fieldCaps: async () => response(withoutKind) });
    expect(result.diagnostics.map((d) => [d.code, d.column])).toEqual([
      ['unmapped_column', 'event.kind'],
    ]);
  });
});

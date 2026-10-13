/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  and,
  concat,
  count,
  desc,
  from,
  isNotNull,
  kql,
  lit,
  mvPseriesWeightedSum,
  toBase64,
  toKeyword,
  top,
} from '..';

/**
 * `getESQL` of the entity analytics risk score calculation, written with the DSL. It reads the
 * alerts of an entity type and keeps the highest risk inputs of each entity. The original builds
 * the same query as a string. Left out: `SET unmapped_fields`, `METADATA _index` and the index
 * name in each input. The entity column is called `entity`, since the caller reads the rows by
 * position.
 */
export interface RiskScoresOptions {
  readonly identifierField: string;
  readonly afterKeys: { readonly lower?: string; readonly upper?: string };
  readonly sampleSize?: number;
  readonly pageSize: number;
  readonly index?: string;
  /** The `s` of the Riemann zeta weighting. */
  readonly zeta?: number;
}

export const riskScoresQuery = ({
  identifierField,
  afterKeys,
  sampleSize = 10000,
  pageSize,
  index = '.alerts-security.alerts-default',
  zeta = 1.5,
}: RiskScoresOptions) =>
  from(index)
    .where((c) =>
      and(
        isNotNull(c['kibana.alert.risk_score']),
        kql(lit.str(rangeClause(identifierField, afterKeys)))
      )
    )
    .rename('kibana.alert.risk_score', 'risk_score')
    .rename('kibana.alert.rule.name', 'rule_name')
    .rename('kibana.alert.rule.uuid', 'rule_id')
    .rename('kibana.alert.uuid', 'alert_id')
    .rename('event.kind', 'category')
    .rename('@timestamp', 'time')
    .eval('rule_name_b64', (c) => toBase64(c.rule_name))
    .eval('category_b64', (c) => toBase64(c.category))
    .eval('input', (c) =>
      concat(
        lit.str(' {"risk_score": "'),
        toKeyword(c.risk_score),
        lit.str('", "time": "'),
        toKeyword(c.time),
        lit.str('", "rule_name_b64": "'),
        c.rule_name_b64,
        lit.str('", "category_b64": "'),
        c.category_b64,
        lit.str('", "id": "'),
        c.alert_id,
        lit.str('" } ')
      )
    )
    .stats(
      (c) => ({
        alert_count: count(c.risk_score),
        scores: mvPseriesWeightedSum(
          top(c.risk_score, lit.int(sampleSize), lit.str('desc')),
          lit.double(zeta)
        ),
        risk_inputs: top(c.input, lit.int(10), lit.str('desc')),
      }),
      (c) => ({ entity: c[identifierField] })
    )
    .sort((c) => [desc(c.scores)])
    .limit(pageSize);

/** The pagination window as a KQL range over the identifier field. */
const rangeClause = (
  identifierField: string,
  { lower, upper }: RiskScoresOptions['afterKeys']
): string => {
  const clauses = [
    ...(lower ? [`${identifierField} > ${lower}`] : []),
    ...(upper ? [`${identifierField} <= ${upper}`] : []),
  ];
  if (clauses.length === 0) {
    throw new Error('Either lower or upper after key must be provided for pagination');
  }
  return clauses.join(' and ');
};

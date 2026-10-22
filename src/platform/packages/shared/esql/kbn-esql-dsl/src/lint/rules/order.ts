/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Rule } from '../lint';

export const orderRules: readonly Rule[] = [
  {
    id: 'missing-limit',
    severity: 'warning',
    // A STATS without grouping makes one row, and no later command makes more.
    check: (ast) =>
      ast.pipe.some((c) => c.tag === 'limit' || (c.tag === 'stats' && c.by.length === 0))
        ? []
        : [
            {
              command: undefined,
              message:
                'the query has no LIMIT, so it returns at most the default number of rows (1000 unless the cluster changes it)',
              perhaps: 'add a LIMIT with the number of rows needed',
            },
          ],
  },
  {
    id: 'limit-before-sort',
    severity: 'warning',
    check: (ast) =>
      ast.pipe.flatMap((c, i) =>
        c.tag === 'sort' &&
        ast.pipe.slice(0, i).findLast((before) => before.tag === 'limit' || before.tag === 'stats')
          ?.tag === 'limit'
          ? [
              {
                command: i,
                message: 'SORT after LIMIT orders only the rows the LIMIT kept',
                perhaps: 'move the SORT before the LIMIT to keep the first rows in order',
              },
            ]
          : []
      ),
  },
  {
    id: 'sort-before-stats',
    severity: 'suggestion',
    check: (ast) =>
      ast.pipe.flatMap((c, i) =>
        c.tag === 'sort' &&
        ast.pipe
          .slice(i + 1)
          .find((after) => after.tag === 'limit' || after.tag === 'stats' || after.tag === 'sort')
          ?.tag === 'stats'
          ? [
              {
                command: i,
                message: 'SORT has no effect, because STATS does not keep the order of its input',
                perhaps: 'remove the SORT',
                fix: [{ command: i, with: [] }],
              },
            ]
          : []
      ),
  },
  {
    id: 'repeated-limit',
    severity: 'suggestion',
    check: (ast) =>
      ast.pipe.flatMap((c, i) => {
        const next = ast.pipe[i + 1];
        return c.tag === 'limit' && next?.tag === 'limit'
          ? [
              {
                command: i,
                message: `LIMIT ${c.n} is followed by LIMIT ${next.n}, so only the smaller one matters`,
                perhaps: `keep one LIMIT ${Math.min(c.n, next.n)}`,
                fix: [
                  { command: i, with: [] },
                  { command: i + 1, with: [{ tag: 'limit' as const, n: Math.min(c.n, next.n) }] },
                ],
              },
            ]
          : [];
      }),
  },
];

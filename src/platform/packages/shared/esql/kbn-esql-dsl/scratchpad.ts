/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Demo queries, in the order of DEMO.md. Remove an `@ts-expect-error` comment to see the editor
 * error it hides, and hover `c` on a line marked `// hover c` to see the columns a stage sees.
 */
import { add, avg, caseOf, count, desc, eq, from, gt, lit, max, round, sum, typed } from './src';
import type { Cols, Stage } from './src';

interface Logs {
  '@timestamp': 'date';
  'host.name': 'keyword';
  message: 'text';
  bytes: 'long';
  risk: 'double';
  status: 'integer';
}

// 0. Hover `c`. A callback's `c` shows the columns that stage sees. The `where` probes below do
// nothing but give a callback to hover. Reading the output type of a column, hover the variable.
const probe = lit.bool(true);

// A closed schema: every column has its type, and each stage changes the set.
export const typedFlow = from<Logs>('logs-*')
  .where((c) => probe) // hover c: the six columns of Logs
  .eval('next', (c) => add(c.bytes, lit.long(1)))
  .where((c) => probe) // hover c: `next` is a long
  .drop('message', 'status')
  .where((c) => probe) // hover c: `message` and `status` are gone
  .rename('bytes', 'size')
  .where((c) => probe) // hover c: `bytes` became `size`, still a long
  .stats(
    (c) => ({ total: sum(c.size), worst: max(c.risk) }),
    (c) => ({ host: c['host.name'] })
  )
  .where((c) => probe); // hover c: only `total`, `worst` and `host`

// An open schema: any column can be read and is `Inferred`, so TS cannot say more about it than
// that. The query's real requirements come from `typecheck` (`show(openFlow)`). What TS does track
// is what the stages add, declare and drop.
export const openFlow = from('logs-*')
  .where((c) => probe) // hover c: any column, all Inferred
  .eval('next', (c) => add(c.bytes, lit.long(1)))
  .eval('flag', (c) => gt(c.risk, lit.double(1)))
  .eval('declared', (c) => typed('long', c.bytes))
  .where((c) => probe) // hover c: `flag` is a boolean, `declared` a long, `next` Inferred
  .drop('message')
  .where((c) => probe) // hover c: `[lacksBrand]: "message"` marks it Dropped, and reading it is an error
  .keep('next', 'flag')
  .where((c) => probe); // hover c: KEEP closes the row to `next` and `flag`

// 1. A typed query. The schema flows through every stage: after STATS only `total`, `worst`, `n`
// and `host` exist, so `.keep('bytes')` would be an error.
export const heavyHosts = from<Logs>('logs-*')
  .where((c) => gt(c.bytes, lit.long(1024)))
  .stats(
    (c) => ({ total: sum(c.bytes), worst: max(c.risk), n: count(c.status) }),
    (c) => ({ host: c['host.name'] })
  )
  .sort((c) => [desc(c.total)])
  .limit(10);

// 2. CASE reads like ES|QL: (condition, value) pairs, then the default.
export const riskLevels = from<Logs>('logs-*')
  .eval('level', (c) =>
    caseOf(
      [
        [gt(c.risk, lit.double(50)), lit.str('high')],
        [gt(c.risk, lit.double(1)), lit.str('medium')],
      ],
      lit.str('low')
    )
  )
  .stats(
    (c) => ({ n: count(c.bytes), avgRisk: round(avg(c.risk)) }),
    (c) => ({ level: c.level })
  )
  .limit(10);

// 3. No schema: `from` without a type argument is open. Every column read is inferred from how it
// is used, and `typecheck(...).principal` says what the query needs from the data.
export const unknownSchema = from('logs-*')
  .where((c) => gt(c.bytes, lit.long(1024)))
  .stats((c) => ({ total: sum(c.bytes), mean: avg(c.risk) }));

// 4. Lint. SORT before STATS is dead, the second LIMIT wins, and EVAL then DROP is a RENAME.
export const sloppy = from<Logs>('logs-*')
  .sort((c) => [desc(c.bytes)])
  .stats(
    (c) => ({ n: count(c.bytes) }),
    (c) => ({ host: c['host.name'] })
  )
  .limit(100)
  .limit(5);

export const evalThenDrop = from<Logs>('logs-*')
  .eval('size', (c) => c.bytes)
  .drop('bytes')
  .limit(10);

// 5. A reusable stage. It names the columns it needs, so it applies to any schema that has them.
const since =
  <G extends { '@timestamp': 'date' }>(iso: string): Stage<G, G> =>
  (q) =>
    q.where((c: Cols<{ '@timestamp': 'date' }>) => gt(c['@timestamp'], lit.date(iso)));

export const recent = from<Logs>('logs-*').pipe(since('2024-01-01')).limit(5);

// @ts-expect-error the schema has no `@timestamp`, so the stage does not apply
from<{ bytes: 'long' }>('x').pipe(since('2024-01-01'));

// 6. What the editor rejects.

// @ts-expect-error keyword and long are not comparable
from<Logs>('logs-*').where((c) => eq(c['host.name'], c.bytes));

// @ts-expect-error an aggregate cannot appear in WHERE
from<Logs>('logs-*').where((c) => gt(avg(c.bytes), lit.long(1)));

// @ts-expect-error `bytes` is gone after STATS
heavyHosts.keep('bytes');

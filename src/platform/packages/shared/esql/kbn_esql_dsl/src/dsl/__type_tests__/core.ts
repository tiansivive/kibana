/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Compile-time tests. They run under `tsc`, not jest: a failing expectation is a type error,
 * and an `@ts-expect-error` that no longer fires is TS2578.
 */

import type { Cols, Inferred, OpenSchema, Q, Stage } from '../..';
import {
  abs,
  add,
  and,
  avg,
  count,
  eq,
  from,
  gt,
  lit,
  max,
  round,
  sum,
  top,
  typed,
  where,
} from '../..';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
const assertType = <_T extends true>() => {};

type SchemaOf<X> = X extends Q<infer G> ? G : never;

interface Doc {
  '@timestamp': 'date';
  'host.name': 'keyword';
  bytes: 'long';
  risk: 'double';
  status: 'integer';
  ok: 'boolean';
}

const logs = () => from<Doc>('logs-*');

// --- positive: the schema flows through stages -------------------------------------------------

const summary = logs()
  .where((c) => and(gt(c.bytes, lit.long(100)), eq(c['host.name'], lit.str('a'))))
  .stats(
    (c) => ({
      total: sum(c.bytes),
      avgRisk: round(avg(c.risk)),
      n: count(c.bytes),
      worst: max(c.risk),
      top3: top(c.status, lit.int(3), lit.str('desc')),
    }),
    (c) => ({ host: c['host.name'] })
  )
  .eval('doubled', (c) => add(c.total, c.total));

assertType<
  Equal<
    typeof summary,
    Q<{
      total: 'long';
      avgRisk: 'double';
      n: 'long';
      worst: 'double';
      top3: 'integer';
      host: 'keyword';
      doubled: 'long';
    }>
  >
>();

// EVAL shadows: the new type replaces the old one.
const shadowed = logs().eval('bytes', (c) => add(c.risk, c.risk));
assertType<
  Equal<
    typeof shadowed,
    Q<{
      '@timestamp': 'date';
      'host.name': 'keyword';
      risk: 'double';
      status: 'integer';
      ok: 'boolean';
      bytes: 'double';
    }>
  >
>();

// Arithmetic follows the signature table: integer + long widens to long.
const widened = logs().eval('w', (c) => add(c.status, c.bytes));
assertType<Equal<SchemaOf<typeof widened>['w'], 'long'>>();

// --- negative: kinds -----------------------------------------------------------------------------

logs().where((c) =>
  // @ts-expect-error an aggregate cannot appear in WHERE
  gt(avg(c.bytes), lit.int(1))
);

// @ts-expect-error aggregates cannot be nested
logs().stats((c) => ({ x: avg(max(c.risk)) }));

// @ts-expect-error a bare column is not an aggregate
logs().stats((c) => ({ x: c.bytes }));

logs().stats(
  (c) => ({ n: count(c.bytes) }),
  // @ts-expect-error BY takes scalars or grouping functions, not aggregates
  (c) => ({ k: avg(c.risk) })
);

// @ts-expect-error scalar mixed with agg: reported at the offending argument
logs().stats((c) => ({ x: add(avg(c.risk), c.risk) }));

// --- negative: constant parameters ------------------------------------------------------------

// @ts-expect-error the limit must be a constant, not a column
logs().stats((c) => ({ t: top(c.risk, c.status, lit.str('desc')) }));

// --- negative: types ----------------------------------------------------------------------------

// @ts-expect-error a long is not a boolean
logs().where((c) => c.bytes);

// @ts-expect-error keyword and long are not comparable
logs().where((c) => eq(c['host.name'], c.bytes));

// @ts-expect-error abs has no keyword overload
logs().eval('a', (c) => abs(c['host.name']));

// --- negative: scoping --------------------------------------------------------------------------

const grouped = logs().stats(
  (c) => ({ n: count(c.bytes) }),
  (c) => ({ host: c['host.name'] })
);

// @ts-expect-error `bytes` no longer exists after STATS
grouped.keep('bytes');

// @ts-expect-error callback only sees the post-STATS columns
grouped.where((c) => gt(c.bytes, lit.long(1)));

// --- generic, reusable stages ---------------------------------------------------------------------

// A generic stage names the columns it needs by annotating its callback with a narrower `Cols`.
const since =
  <G extends { '@timestamp': 'date' }>(iso: string): Stage<G, G> =>
  (q) =>
    q.where((c: Cols<{ '@timestamp': 'date' }>) => gt(c['@timestamp'], lit.date(iso)));

// composes with a concrete schema through both spellings
const viaPipe = logs().pipe(since('2024-01-01'));
assertType<Equal<typeof viaPipe, Q<Doc>>>();

const viaWhere = logs().pipe(where((c) => gt(c.bytes, lit.long(1))));
assertType<Equal<typeof viaWhere, Q<Doc>>>();

// @ts-expect-error the schema has no `@timestamp`, so the generic stage does not apply
from<{ bytes: 'long' }>('x').pipe(since('2024-01-01'));

// --- open sources: no schema, so columns are Inferred ------------------------------------------

// Without a type argument `from` is open: any column can be read and its type is Inferred.
const open = from('logs-*');
assertType<Equal<typeof open, Q<OpenSchema>>>();

open.where((c) => gt(c.bytes, lit.long(1)));

// A result computed from an Inferred column is Inferred.
const computed = open.eval('x', (c) => add(c.a, lit.int(1)));
assertType<Equal<SchemaOf<typeof computed>['x'], Inferred>>();

// `typed` declares the type of an open column, and only an open column.
const declared = open.eval('n', (c) => typed('long', c.a));
assertType<Equal<SchemaOf<typeof declared>['n'], 'long'>>();

// @ts-expect-error `bytes` is declared, so it is not Inferred and needs no declaration
logs().eval('x', (c) => typed('long', c.bytes));

// KEEP closes an open row to the columns it names.
// @ts-expect-error `b` was not kept
open.keep('a').keep('b');

// --- open sources: dropped columns -------------------------------------------------------------

open
  .drop('x')
  // @ts-expect-error `x` was dropped, so reading it is an error
  .where((c) => gt(c.x, lit.long(1)));

// Other columns of an open row stay readable after a DROP.
open.drop('x').where((c) => gt(c.y, lit.long(1)));

// EVAL puts a dropped column back.
open
  .drop('x')
  .eval('x', () => lit.long(1))
  .where((c) => gt(c.x, lit.long(2)));

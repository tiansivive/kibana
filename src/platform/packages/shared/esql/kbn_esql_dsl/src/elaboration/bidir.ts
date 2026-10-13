/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Core, CoreCommand, CoreExpr } from '../core/terms';
import { esqlType, metaType } from '../core/type';
import type { Hole, Mono } from '../core/type';
import type { Library } from '../core/polymorphism/library';
import { diagnostic } from '../diagnostics/diagnostic';
import type { Origin } from '../diagnostics/origin';
import type { EsqlType } from '../vocabulary/esql_type';
import { withEntry } from '../utils/immutable';
import type { Kind } from '../vocabulary/kind';
import type { ExprNode } from '../surface/expr';
import type { CommandNode, QueryAst } from '../surface/query';
import { callKind, expectAggregate, expectScalar, rejectAggregateKey } from './kinds';
import { closedRow, define, demand, drop, openRow, schemaRow } from './row';
import type { Row } from './row';
import { constrain, equal, merge, none, report, wanted } from './solve/constraints';
import type { Emit } from './solve/constraints';

export interface Elaboration {
  readonly core: Core;
  /** The row the query produces. */
  readonly output: Row;
  readonly emit: Emit;
}

/**
 * Walks the AST and builds the Core. Calls look up the function's type, instantiate it, and
 * check each argument against its parameter. Contexts check against the type they expect. The
 * constraints that result are solved separately.
 */
export const elaborate = (
  library: Library,
  ast: QueryAst,
  schema?: Readonly<Record<string, EsqlType>>
): Elaboration => {
  const start = schema ? schemaRow(schema) : { row: openRow, emit: none };
  const done = ast.pipe.reduce<{ row: Row; core: readonly CoreCommand[]; emit: Emit }>(
    (acc, cmd, i) => {
      const next = step(library, acc.row, cmd, i);
      return { row: next.row, core: [...acc.core, next.core], emit: merge(acc.emit, next.emit) };
    },
    { row: start.row, core: [], emit: start.emit }
  );
  return {
    core: { source: ast.source, pipe: done.core },
    output: done.row,
    emit: done.emit,
  };
};

interface Step {
  readonly row: Row;
  readonly core: CoreCommand;
  readonly emit: Emit;
}

const step = (library: Library, row: Row, cmd: CommandNode, index: number): Step => {
  const base = `pipe[${index}].${cmd.tag}`;
  switch (cmd.tag) {
    case 'where': {
      const cond = perRow(library, row, cmd.cond, `${base}.cond`, 'WHERE', esqlType('boolean'));
      return { row, core: { tag: 'where', cond: cond.core }, emit: cond.emit };
    }
    case 'eval': {
      const value = perRow(library, row, cmd.expr, `${base}.expr`, 'EVAL');
      return {
        row: define(row, cmd.name, value.core.type),
        core: { tag: 'eval', name: cmd.name, expr: value.core },
        emit: value.emit,
      };
    }
    case 'stats': {
      const aggs = cmd.aggs.map((a) => ({
        name: a.name,
        value: synth(library, row, a.expr, `${base}.aggs.${a.name}`),
      }));
      const keys = cmd.by.map((b) => ({
        name: b.name,
        value: synth(library, row, b.expr, `${base}.by.${b.name}`),
      }));
      const checks = [
        ...aggs.map((a) => expectAggregate(a.value.kind, a.name, at(`${base}.aggs.${a.name}`))),
        ...keys.map((k) => rejectAggregateKey(k.value.kind, k.name, at(`${base}.by.${k.name}`))),
      ];
      return {
        row: closedRow(
          [...aggs, ...keys].reduce<ReadonlyMap<string, Mono>>(
            (fields, { name, value }) => withEntry(fields, name, value.core.type),
            new Map()
          )
        ),
        core: {
          tag: 'stats',
          aggs: aggs.map((a) => ({ name: a.name, expr: a.value.core })),
          by: keys.map((k) => ({ name: k.name, expr: k.value.core })),
        },
        emit: merge(...[...aggs, ...keys].map((x) => x.value.emit), ...checks),
      };
    }
    case 'keep': {
      const found = cmd.cols.map((name) => ({ name, d: demand(row, name, at(`${base}.cols`)) }));
      return {
        row: closedRow(
          found.reduce<ReadonlyMap<string, Mono>>(
            (fields, { name, d }) => withEntry(fields, name, d.type),
            new Map()
          )
        ),
        core: { tag: 'keep', cols: cmd.cols },
        emit: merge(...found.map((f) => f.d.emit)),
      };
    }
    case 'drop':
      return {
        row: drop(row, cmd.cols),
        core: { tag: 'drop', cols: cmd.cols },
        emit: merge(...cmd.cols.map((name) => demand(row, name, at(`${base}.cols`)).emit)),
      };
    case 'sort': {
      const keys = cmd.keys.map((key, i) => ({
        dir: key.dir,
        value: perRow(library, row, key.expr, `${base}.keys[${i}]`, 'SORT'),
        path: `${base}.keys[${i}]`,
      }));
      return {
        row,
        core: { tag: 'sort', keys: keys.map((k) => ({ expr: k.value.core, dir: k.dir })) },
        emit: merge(
          ...keys.map(({ value, path }) =>
            merge(
              value.emit,
              constrain(wanted(`${path}#orderable`, 'Orderable', [value.core.type], at(path)))
            )
          )
        ),
      };
    }
    case 'limit':
      return { row, core: { tag: 'limit', n: cmd.n }, emit: none };
  }
};

interface Typed extends Elaborated<CoreExpr> {
  readonly kind: Kind;
}

interface Elaborated<T> {
  readonly core: T;
  readonly emit: Emit;
}

/**
 * An expression where a command takes a per-row value: elaborated, checked against the type the
 * command expects if it has one, and rejected if it is an aggregate.
 */
const perRow = (
  library: Library,
  row: Row,
  node: ExprNode,
  path: string,
  command: string,
  expected?: Mono
): Typed => {
  const value = expected
    ? check(library, row, node, expected, path, `${command} needs`)
    : synth(library, row, node, path);
  return { ...value, emit: merge(value.emit, expectScalar(value.kind, command, at(path))) };
};

/** Elaborates an expression against the type its context expects. */
const check = (
  library: Library,
  row: Row,
  node: ExprNode,
  expected: Mono,
  path: string,
  note: string
): Typed => {
  const found = synth(library, row, node, path);
  return {
    ...found,
    emit: merge(found.emit, constrain(equal(found.core.type, expected, at(path), note))),
  };
};

/** Finds the type of an expression from the expression itself. */
const synth = (library: Library, row: Row, node: ExprNode, path: string): Typed => {
  const origin = at(path);
  switch (node.tag) {
    case 'col': {
      const { type, emit } = demand(row, node.name, origin);
      return { core: { tag: 'col', name: node.name, type }, kind: 'scalar', emit };
    }
    case 'lit':
      return {
        core: { tag: 'lit', ty: node.ty, value: node.value, type: esqlType(node.ty) },
        kind: 'const',
        emit: none,
      };
    case 'param':
      return {
        core: { tag: 'param', name: node.name, ty: node.ty, type: esqlType(node.ty) },
        kind: 'const',
        emit: none,
      };
    case 'ann': {
      const inner = synth(library, row, node.expr, `${path}.expr`);
      return {
        core: { tag: 'ann', expr: inner.core, type: inner.core.type },
        kind: inner.kind,
        emit: merge(
          inner.emit,
          constrain(equal(inner.core.type, esqlType(node.ty), origin, 'the declaration says'))
        ),
      };
    }
    case 'call':
      return call(library, row, node, path);
  }
};

const call = (
  library: Library,
  row: Row,
  node: Extract<ExprNode, { tag: 'call' }>,
  path: string
): Typed => {
  const origin = at(path);
  const fn = library.functions.get(node.fn);
  const unresolved = (emit: Emit, args: readonly Typed[]): Typed => ({
    core: {
      tag: 'call',
      fn: node.fn,
      args: args.map((a) => a.core),
      type: metaType(`${path}!`),
      instances: [],
    },
    kind: 'scalar',
    emit: merge(...args.map((a) => a.emit), emit),
  });
  if (!fn) {
    return unresolved(
      report(diagnostic('unknown_function', `unknown function ${node.fn}`, origin)),
      node.args.map((a, i) => synth(library, row, a, `${path}.args[${i}]`))
    );
  }
  if (fn.type.params.length !== node.args.length) {
    return unresolved(
      report(
        diagnostic('arity', `${node.fn} does not take ${node.args.length} argument(s)`, origin)
      ),
      node.args.map((a, i) => synth(library, row, a, `${path}.args[${i}]`))
    );
  }
  // The function's type is instantiated, and each argument is checked against its parameter.
  const inst = instantiate(path);
  const args = node.args.map((a, i) =>
    check(library, row, a, inst(fn.type.params[i]), `${path}.args[${i}]`, `${fn.name} needs`)
  );
  const holes: readonly Hole[] = fn.type.requires.map((_, k) => `${path}#${k}`);
  const { kind, emit: kindEmit } = callKind(
    fn,
    args.map((a) => a.kind),
    origin
  );
  return {
    core: {
      tag: 'call',
      fn: node.fn,
      args: args.map((a) => a.core),
      type: inst(fn.type.result),
      instances: holes,
    },
    kind,
    emit: merge(
      ...args.map((a) => a.emit),
      kindEmit,
      constrain(
        ...fn.type.requires.map((r, k) => wanted(holes[k], r.protocol, r.args.map(inst), origin))
      )
    ),
  };
};

/** A type variable of a function's type at the call at `path` is the meta `path$name`. */
const instantiate =
  (path: string) =>
  (term: Mono): Mono =>
    term.tag === 'var' ? metaType(`${path}$${term.name}`) : term;

const at = (path: string): Origin => ({ path });

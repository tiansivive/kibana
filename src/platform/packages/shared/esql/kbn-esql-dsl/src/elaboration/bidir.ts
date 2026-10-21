/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Print from '../core/print';
import type { Core, CoreCommand, CoreExpr } from '../core/terms';
import { esqlType, metaType, perElementVariables, variableNames } from '../core/type';
import type { Mono, Slot } from '../core/type';
import type { Library } from '../core/polymorphism/library';
import type { Location } from '../diagnostics/location';
import type { EsqlType } from '../vocabulary/esql_type';
import { withEntry } from '../utils/immutable';
import type { Kind } from '../vocabulary/kind';
import { isExpr } from '../surface/expr';
import type { ArgNode, ExprNode } from '../surface/expr';
import type { CommandNode, QueryAst } from '../surface/query';
import { gaps, absentOnlyVariables, place } from './arguments';
import { callKind, expectAggregate, expectScalar, rejectAggregateKey } from './kinds';
import * as Locate from './locate';
import { closedRow, define, demand, drop, openRow, schemaRow } from './row';
import type { Row } from './row';
import { constrain, equal, merge, none, problem, wanted } from './solve/constraints';
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
  const location = Locate.command(index, cmd.tag);
  switch (cmd.tag) {
    case 'where': {
      const cond = perRow(
        library,
        row,
        cmd.cond,
        Locate.field(location, 'cond'),
        'WHERE',
        esqlType('boolean')
      );
      return { row, core: { tag: 'where', cond: cond.core }, emit: cond.emit };
    }
    case 'eval': {
      const value = perRow(library, row, cmd.expr, Locate.field(location, 'expr'), 'EVAL');
      return {
        row: define(row, cmd.name, value.core.type),
        core: { tag: 'eval', name: cmd.name, expr: value.core },
        emit: value.emit,
      };
    }
    case 'stats': {
      const aggs = cmd.aggs.map((a) => {
        const at = Locate.aggregate(location, a.name);
        return { name: a.name, location: at, value: synth(library, row, a.expr, at) };
      });
      const keys = cmd.by.map((b) => {
        const at = Locate.groupKey(location, b.name);
        return { name: b.name, location: at, value: synth(library, row, b.expr, at) };
      });
      const checks = [
        ...aggs.map((a) => expectAggregate(a.value.kind, a.name, a.location)),
        ...keys.map((k) => rejectAggregateKey(k.value.kind, k.name, k.location)),
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
      const columns = Locate.field(location, 'cols');
      const found = cmd.cols.map((name) => ({ name, d: demand(row, name, columns) }));
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
    case 'drop': {
      const columns = Locate.field(location, 'cols');
      return {
        row: drop(row, cmd.cols),
        core: { tag: 'drop', cols: cmd.cols },
        emit: merge(...cmd.cols.map((name) => demand(row, name, columns).emit)),
      };
    }
    case 'rename': {
      const found = demand(row, cmd.from, Locate.field(location, 'from'));
      return {
        row: define(cmd.from === cmd.to ? row : drop(row, [cmd.from]), cmd.to, found.type),
        core: { tag: 'rename', from: cmd.from, to: cmd.to },
        emit: found.emit,
      };
    }
    case 'sort': {
      const keys = cmd.keys.map((key, i) => {
        const at = Locate.sortKey(location, i);
        return { dir: key.dir, location: at, value: perRow(library, row, key.expr, at, 'SORT') };
      });
      return {
        row,
        core: { tag: 'sort', keys: keys.map((k) => ({ expr: k.value.core, dir: k.dir })) },
        emit: merge(
          ...keys.map((k) =>
            merge(
              k.value.emit,
              constrain(
                wanted(Locate.orderable(k.location), 'Orderable', [k.value.core.type], k.location)
              )
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
  location: Location,
  command: string,
  expected?: Mono
): Typed => {
  const value = expected
    ? check(library, row, node, expected, location, `${command} needs`)
    : synth(library, row, node, location);
  return { ...value, emit: merge(value.emit, expectScalar(value.kind, command, location)) };
};

/** Elaborates an expression against the type its context expects. */
const check = (
  library: Library,
  row: Row,
  node: ExprNode,
  expected: Mono,
  location: Location,
  note: string
): Typed => {
  const found = synth(library, row, node, location);
  return {
    ...found,
    emit: merge(found.emit, constrain(equal(found.core.type, expected, location, note))),
  };
};

/** Finds the type of an expression from the expression itself. */
const synth = (library: Library, row: Row, node: ExprNode, location: Location): Typed => {
  switch (node.tag) {
    case 'col': {
      const { type, emit } = demand(row, node.name, location);
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
      const inner = synth(library, row, node.expr, Locate.field(location, 'expr'));
      return {
        core: { tag: 'ann', expr: inner.core, type: inner.core.type },
        kind: inner.kind,
        emit: merge(
          inner.emit,
          constrain(equal(inner.core.type, esqlType(node.ty), location, 'the declaration says'))
        ),
      };
    }
    case 'call':
      return call(library, row, node, location);
  }
};

const call = (
  library: Library,
  row: Row,
  node: Extract<ExprNode, { tag: 'call' }>,
  location: Location
): Typed => {
  const fn = library.functions.get(node.fn);
  // A call that cannot be checked against a type still elaborates its arguments, for what they report.
  const unresolved = (emit: Emit): Typed => {
    const args = located(node.args, location).map((e) => synth(library, row, e.node, e.at));
    return {
      core: {
        tag: 'call',
        fn: node.fn,
        args: args.map((a) => a.core),
        type: metaType(Locate.untyped(location)),
        instances: [],
      },
      kind: 'scalar',
      emit: merge(...args.map((a) => a.emit), emit),
    };
  };
  if (!fn) {
    return unresolved(problem('unknown_function', `unknown function ${node.fn}`, location));
  }
  const placed = place(fn.type, node.args);
  if (!placed) {
    return unresolved(problem('arity', `${fn.name} takes ${Print.signature(fn.type)}`, location));
  }
  // The function's type is instantiated, and each argument is checked against its parameter.
  const perElement = perElementVariables(fn.type);
  const shared = instantiate(location);
  const elementOf = (arg: ExprNode, slot: Slot, at: Location, tuple?: Tuple) => ({
    typed: check(
      library,
      row,
      arg,
      instantiate(location, perElement, tuple)(slot.type),
      at,
      `${fn.name} needs`
    ),
    slot,
  });
  const given = placed.map((p, i) => {
    const at = Locate.arg(location, i);
    switch (p.tag) {
      case 'one':
      case 'optional': {
        const e = p.node && elementOf(p.node, p.slots[0], at);
        return { core: e?.typed.core, elements: e ? [e] : [] };
      }
      case 'many': {
        const items = p.items.map((tuple, k) =>
          tuple.map((arg, j) =>
            elementOf(arg, p.slots[j], Locate.item(Locate.item(at, k), j), { param: i, item: k })
          )
        );
        return {
          core: items.map((tuple) => tuple.map((e) => e.typed.core)),
          elements: items.flat(),
        };
      }
    }
  });
  const elements = given.flatMap((g) => g.elements);
  const absent = absentOnlyVariables(placed, fn.type.result);
  const needed = fn.type.requires.flatMap((r, k) => {
    const names = variableNames(r.args);
    const param = names.flatMap((name) => perElement.get(name) ?? [])[0];
    const sequence = param === undefined ? undefined : placed[param];
    return names.some((name) => absent.has(name))
      ? []
      : param === undefined
      ? [{ hole: Locate.instance(location, k), protocol: r.protocol, args: r.args.map(shared) }]
      : (sequence?.tag === 'many' ? sequence.items : []).map((_, item) => ({
          hole: Locate.itemInstance(location, k, param, item),
          protocol: r.protocol,
          args: r.args.map(instantiate(location, perElement, { param, item })),
        }));
  });
  const { kind, emit: kindEmit } = callKind(
    fn,
    elements.map((e) => ({ kind: e.typed.kind, expects: e.slot.kind })),
    location
  );
  return {
    core: {
      tag: 'call',
      fn: node.fn,
      args: given.map((g) => g.core),
      type: shared(fn.type.result),
      instances: needed.map(({ hole, protocol }) => ({ hole, protocol })),
    },
    kind,
    emit: merge(
      ...elements.map((e) => e.typed.emit),
      kindEmit,
      ...gaps(placed).map((i) =>
        problem(
          'gap',
          `${fn.name} is given argument ${i + 1} after an optional argument that is left out`,
          Locate.arg(location, i)
        )
      ),
      constrain(...needed.map((n) => wanted(n.hole, n.protocol, n.args, location)))
    ),
  };
};

/** The tuple `item` of the sequence that is parameter `param`. */
interface Tuple {
  readonly param: number;
  readonly item: number;
}

/**
 * Each type variable of a function's type becomes a meta named for the call it is at. Inside a
 * tuple of a sequence, the variables that stand for each element of that sequence are that tuple's.
 */
const instantiate =
  (location: Location, perElement: ReadonlyMap<string, number> = new Map(), tuple?: Tuple) =>
  (term: Mono): Mono =>
    term.tag !== 'var'
      ? term
      : metaType(
          tuple && perElement.get(term.name) === tuple.param
            ? Locate.itemVariable(location, term.name, tuple.param, tuple.item)
            : Locate.typeVariable(location, term.name)
        );

/** The expressions in the arguments of a call, each with its location in the AST. */
const located = (
  args: readonly ArgNode[],
  location: Location
): readonly { readonly node: ExprNode; readonly at: Location }[] =>
  args.flatMap((arg, i) => within(arg, Locate.arg(location, i)));

const within = (
  arg: ArgNode,
  at: Location
): readonly { readonly node: ExprNode; readonly at: Location }[] =>
  arg === undefined
    ? []
    : isExpr(arg)
    ? [{ node: arg, at }]
    : arg.flatMap((item, i) => within(item, Locate.item(at, i)));

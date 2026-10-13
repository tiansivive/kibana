/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../esql_type';
import type { KindSignature } from '../kind';
import { resolve } from '../elaboration/solve/solution';
import type { Solution } from '../elaboration/solve/solution';
import type { Principal } from '../elaboration/solve/principal';
import type { Library, LibraryFunction } from './polymorphism/library';
import type { Core, CoreCommand, CoreExpr } from './terms';
import type { Meta, Mono, Poly, Requires, Type } from './type';

/**
 * Everything that shows types or the Core as text, imported as `import * as Print from`.
 */

export interface Options {
  /** Names the protocol behind each instance. Without it only the instance's types are shown. */
  readonly library?: Library;
  /** Describes a type that is still unknown, for example with the types it may still be. */
  readonly explain?: (type: Mono) => string;
}

/** How a meta is shown. Without a name for it, a meta is `?`. */
export interface Names {
  readonly meta?: (meta: Meta) => string;
}

export interface FnOptions extends Names {
  /** Shows the kind signature on a second line. On unless it is set to `false`. */
  readonly kinds?: boolean;
}

/**
 * Shows the elaborated query as an indented tree: every expression with its type and every call
 * with the instances it needed. Types are looked up in the solution as they are printed, so the
 * Core is shown exactly as elaboration built it.
 */
export const core = (query: Core, solution: Solution, options: Options = {}): string =>
  [
    `FROM ${query.source.indices.join(', ')}`,
    ...query.pipe.flatMap((cmd) => command(cmd, solution, options)),
  ].join('\n');

/**
 * Shows a type: an ES|QL type as `ES.keyword`, a variable by its name, and a function's type as
 * `forall a b. (SignedNumeric a, Wide a b) => (a, ES.integer) -> b`.
 */
export const ty = (type: Type, names: Names = {}): string =>
  type.tag === 'poly' ? poly(type, names) : mono(type, names);

export const esqlType = (type: EsqlType): string => `ES.${type}`;

/** Shows a library function: its type, and under it the kind signature that says where it may be used. */
export const fn = (f: LibraryFunction, options: FnOptions = {}): string => {
  const { kinds = true, ...names } = options;
  return [
    `${f.name} :: ${ty(f.type, names)}`,
    ...(kinds ? [`${' '.repeat(f.name.length)} :: ${kindSignature(f.kinds)}`] : []),
  ].join('\n');
};

/** The protocol facts of a type as `Protocol a b =>`, or nothing when there are none. */
export const context = (requires: readonly Requires[], names: Names = {}): string => {
  const facts = requires.map((r) => [r.protocol, ...r.args.map((a) => mono(a, names))].join(' '));
  return facts.length > 1
    ? `(${facts.join(', ')}) => `
    : facts.length === 1
    ? `${facts[0]} => `
    : '';
};

/** Shows a principal type, naming the unknown types `a`, `b`, `c` in order of appearance. */
export const principal = (p: Principal): string => {
  const metas = distinctMetas([
    ...p.input.columns.values(),
    ...p.output.columns.values(),
    ...p.requires.flatMap((r) => r.args),
  ]);
  const names = { meta: (meta: Meta) => variableName(metas.indexOf(meta)) };
  const row = (columns: ReadonlyMap<string, Mono>, open: boolean): string => {
    const fields = [
      ...[...columns].map(([name, type]) => `${name}: ${ty(type, names)}`),
      ...(open ? ['...'] : []),
    ];
    return fields.length > 0 ? `{ ${fields.join(', ')} }` : '{}';
  };
  return [
    metas.length > 0 ? `forall ${metas.map((_, i) => variableName(i)).join(' ')}. ` : '',
    context(p.requires, names),
    `${row(p.input.columns, p.input.open)} -> ${row(p.output.columns, p.output.open)}`,
  ].join('');
};

const mono = (type: Mono, names: Names): string =>
  type.tag === 'esql'
    ? esqlType(type.esql)
    : type.tag === 'var'
    ? type.name
    : names.meta?.(type.meta) ?? '?';

const poly = (type: Poly, names: Names): string => {
  const variables = [...type.params, type.result, ...type.requires.flatMap((r) => r.args)]
    .flatMap((t) => (t.tag === 'var' ? [t.name] : []))
    .filter((name, i, all) => all.indexOf(name) === i);
  return [
    variables.length > 0 ? `forall ${variables.join(' ')}. ` : '',
    context(type.requires, names),
    `${parameters(type.params.map((p) => mono(p, names)))} -> ${mono(type.result, names)}`,
  ].join('');
};

const kindSignature = (kinds: KindSignature): string =>
  `${parameters(kinds.params)} -> ${kinds.result}`;

const parameters = (shown: readonly string[]): string =>
  shown.length === 1 ? shown[0] : `(${shown.join(', ')})`;

const distinctMetas = (types: readonly Mono[]): readonly Meta[] =>
  types
    .flatMap((t) => (t.tag === 'meta' ? [t.meta] : []))
    .filter((meta, i, all) => all.indexOf(meta) === i);

const variableName = (i: number): string => (i < 26 ? String.fromCharCode(97 + i) : `t${i}`);

const command = (cmd: CoreCommand, solution: Solution, options: Options): string[] => {
  const nested = (e: CoreExpr, depth: number) => expression(e, depth, solution, options);
  switch (cmd.tag) {
    case 'where':
      return ['WHERE', ...nested(cmd.cond, 1)];
    case 'eval':
      return [`EVAL ${cmd.name} =`, ...nested(cmd.expr, 1)];
    case 'stats':
      return [
        'STATS',
        ...cmd.aggs.flatMap((a) => [`  ${a.name} =`, ...nested(a.expr, 2)]),
        ...(cmd.by.length > 0 ? ['  BY'] : []),
        ...cmd.by.flatMap((k) => [`  ${k.name} =`, ...nested(k.expr, 2)]),
      ];
    case 'keep':
      return [`KEEP ${cmd.cols.join(', ')}`];
    case 'drop':
      return [`DROP ${cmd.cols.join(', ')}`];
    case 'sort':
      return [
        'SORT',
        ...cmd.keys.flatMap((k) => [`  ${k.dir.toUpperCase()}`, ...nested(k.expr, 2)]),
      ];
    case 'limit':
      return [`LIMIT ${cmd.n}`];
  }
};

const expression = (e: CoreExpr, depth: number, solution: Solution, options: Options): string[] => {
  const pad = '  '.repeat(depth);
  const type = typeOf(e.type, solution, options);
  switch (e.tag) {
    case 'col':
      return [`${pad}col ${e.name} : ${type}`];
    case 'lit':
      return [`${pad}lit ${JSON.stringify(e.value)} : ${type}`];
    case 'param':
      return [`${pad}param ?${e.name} : ${type}`];
    case 'ann':
      return [`${pad}declared : ${type}`, ...expression(e.expr, depth + 1, solution, options)];
    case 'call':
      return [
        `${pad}${e.fn} : ${type}${instances(e, solution, options)}`,
        ...e.args.flatMap((a) => expression(a, depth + 1, solution, options)),
      ];
  }
};

const typeOf = (type: Mono, solution: Solution, options: Options): string => {
  const resolved = resolve(solution, type);
  return resolved.tag === 'meta' && options.explain
    ? options.explain(resolved)
    : ty(resolved, { meta: (meta) => `?${meta}` });
};

const instances = (
  call: Extract<CoreExpr, { tag: 'call' }>,
  solution: Solution,
  options: Options
): string => {
  const requires = options.library?.functions.get(call.fn)?.type.requires ?? [];
  const shown = call.instances.flatMap((hole, i) => {
    const instance = solution.instances.get(hole);
    const name = requires[i]?.protocol;
    return instance
      ? [`${name ?? 'instance'}(${instance.map(esqlType).join(', ')})`]
      : name
      ? [`${name} undecided`]
      : [];
  });
  return shown.length > 0 ? `   [${shown.join('; ')}]` : '';
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../vocabulary/esql_type';
import type { KindSignature } from '../vocabulary/kind';
import { resolve } from '../elaboration/solve/solution';
import type { Solution } from '../elaboration/solve/solution';
import type { Principal } from '../elaboration/solve/principal';
import { instancesOf, instancesWith } from './polymorphism/library';
import type { Library, LibraryFunction } from './polymorphism/library';
import type { Core, CoreCommand, CoreExpr } from './terms';
import type { Meta, Mono, Poly, Requires, Type } from './type';

/**
 * Everything that shows types or the Core as text, imported as `import * as Print from`.
 */

export interface Options {
  /** Describes a type that is still unknown, for example with the types it may still be. */
  readonly explain?: (type: Mono) => string;
}

/** How a meta is shown. Without a name for it, a meta is `?`. */
export interface Names {
  readonly meta?: (meta: Meta) => string;
}

export interface FnOptions extends Names {
  /** Shows the kind signature under the type. On unless it is set to `false`. */
  readonly kinds?: boolean;
  /** Shows the dependency of each protocol the type requires that has one. On unless `false`. */
  readonly dependencies?: boolean;
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

/**
 * Shows a library function: its type, under it the kind signature that says where it may be used,
 * and a `where` line for each protocol it requires that has a dependency, since the type alone
 * does not say which arguments determine which.
 */
export const fn = (library: Library, f: LibraryFunction, options: FnOptions = {}): string => {
  const { kinds = true, dependencies = true, ...names } = options;
  const indent = ' '.repeat(f.name.length);
  return [
    `${f.name} :: ${ty(f.type, names)}`,
    ...(kinds ? [`${indent} :: ${kindSignature(f.kinds, f.type.required)}`] : []),
    ...(dependencies ? requiredDependencies(library, f.type.requires, names, indent) : []),
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

/**
 * Shows a principal type, naming the unknown types `a`, `b`, `c` in order of appearance, with a
 * `where` line for each protocol it requires that has a dependency unless `dependencies` is false.
 */
export const principal = (
  library: Library,
  p: Principal,
  options: { readonly dependencies?: boolean } = {}
): string => {
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
    [
      metas.length > 0 ? `forall ${metas.map((_, i) => variableName(i)).join(' ')}. ` : '',
      context(p.requires, names),
      `${row(p.input.columns, p.input.open)} -> ${row(p.output.columns, p.output.open)}`,
    ].join(''),
    ...(options.dependencies === false
      ? []
      : requiredDependencies(library, p.requires, names, ' ')),
  ].join('\n');
};

/**
 * A protocol with its dependency and its instances, written the way the dependency reads: the
 * determining types, then `->`, then the types they determine. With `containing`, only the
 * instances that mention that type.
 */
export const protocol = (
  library: Library,
  name: string,
  options: { readonly containing?: EsqlType } = {}
): string => {
  const declared = library.protocols.get(name);
  const rows = instancesOf(library, name).filter(
    (instance) => options.containing === undefined || instance.includes(options.containing)
  );
  const variables = Array.from({ length: declared?.arity ?? 0 }, (_, i) => variableName(i));
  const dependency = declared?.determinedBy
    ? ` | ${dependencyOf(variables, declared.determinedBy)}`
    : '';
  const shown = rows.map((instance) => instanceRow(instance, declared?.determinedBy));
  return [
    `protocol ${[name, ...variables].join(' ')}${dependency}`,
    ...(declared?.arity === 1 ? [`  ${shown.join(', ')}`] : shown.map((row) => `  ${row}`)),
  ].join('\n');
};

/** What a type supports: every protocol it takes part in, with the instances that mention it. */
export const protocolsOf = (library: Library, type: EsqlType): string =>
  instancesWith(library, type)
    .map(({ protocol: p }) => protocol(library, p.name, { containing: type }))
    .join('\n\n');

const mono = (type: Mono, names: Names): string =>
  type.tag === 'esql'
    ? esqlType(type.esql)
    : type.tag === 'var'
    ? type.name
    : names.meta?.(type.meta) ?? '?';

const poly = (type: Poly, names: Names): string => {
  const variables = [
    ...type.params,
    ...(type.rest ? [type.rest] : []),
    type.result,
    ...type.requires.flatMap((r) => r.args),
  ]
    .flatMap((t) => (t.tag === 'var' ? [t.name] : []))
    .filter((name, i, all) => all.indexOf(name) === i);
  return [
    variables.length > 0 ? `forall ${variables.join(' ')}. ` : '',
    context(type.requires, names),
    `${parameters(
      type.params.map((p) => mono(p, names)),
      type.required,
      type.rest && mono(type.rest, names)
    )} -> ${mono(type.result, names)}`,
  ].join('');
};

const requiredDependencies = (
  library: Library,
  requires: readonly Requires[],
  names: Names,
  indent: string
): string[] =>
  requires
    .flatMap((r) => {
      const determinedBy = library.protocols.get(r.protocol)?.determinedBy;
      const args = r.args.map((a) => mono(a, names));
      return determinedBy
        ? [`${[r.protocol, ...args].join(' ')} | ${dependencyOf(args, determinedBy)}`]
        : [];
    })
    .map((line, i) => `${indent} ${i === 0 ? 'where' : '     '} ${line}`);

const dependencyOf = (names: readonly string[], determinedBy: readonly number[]): string =>
  `${determinedBy.map((i) => names[i]).join(' ')} -> ${names
    .filter((_, i) => !determinedBy.includes(i))
    .join(' ')}`;

const instanceRow = (instance: readonly EsqlType[], determinedBy?: readonly number[]): string => {
  const shown = (types: readonly EsqlType[]) => parameters(types.map(esqlType));
  return determinedBy
    ? `${shown(instance.filter((_, i) => determinedBy.includes(i)))} -> ${shown(
        instance.filter((_, i) => !determinedBy.includes(i))
      )}`
    : instance.length === 1
    ? esqlType(instance[0])
    : shown(instance);
};

const kindSignature = (kinds: KindSignature, required: number): string =>
  `${parameters(kinds.params, required, kinds.rest)} -> ${kinds.result}`;

/** Parameters as they read in a type: optional ones end in `?` and further arguments in `...`. */
const parameters = (shown: readonly string[], required = shown.length, rest?: string): string => {
  const items = [
    ...shown.map((p, i) => (i < required ? p : `${p}?`)),
    ...(rest === undefined ? [] : [`...${rest}`]),
  ];
  return items.length === 1 && shown.length === required && rest === undefined
    ? items[0]
    : `(${items.join(', ')})`;
};

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
    case 'rename':
      return [`RENAME ${cmd.from} AS ${cmd.to}`];
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
        `${pad}${e.fn} : ${type}${instances(e, solution)}`,
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

const instances = (call: Extract<CoreExpr, { tag: 'call' }>, solution: Solution): string => {
  const shown = call.instances.map((needed) => {
    const instance = solution.instances.get(needed.hole);
    return instance
      ? `${needed.protocol}(${instance.map(esqlType).join(', ')})`
      : `${needed.protocol} undecided`;
  });
  return shown.length > 0 ? `   [${shown.join('; ')}]` : '';
};

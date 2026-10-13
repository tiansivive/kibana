/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Library } from './polymorphism/library';
import type { Mono } from './type';
import type { Core, CoreCommand, CoreExpr } from './terms';
import { resolve } from '../elaboration/solve/solution';
import type { Solution } from '../elaboration/solve/solution';

export interface PrintOptions {
  /** Names the protocol behind each instance. Without it only the instance's types are shown. */
  readonly library?: Library;
  /** Describes a type that is still unknown, for example with the types it may still be. */
  readonly explain?: (type: Mono) => string;
}

/**
 * Shows the elaborated query as an indented tree: every expression with its type and every call
 * with the instances it needed. Types are looked up in the solution as they are printed, so the
 * Core is shown exactly as elaboration built it.
 */
export const printCore = (core: Core, solution: Solution, options: PrintOptions = {}): string =>
  [
    `FROM ${core.source.indices.join(', ')}`,
    ...core.pipe.flatMap((cmd) => printCommand(cmd, solution, options)),
  ].join('\n');

const printCommand = (cmd: CoreCommand, solution: Solution, options: PrintOptions): string[] => {
  const expr = (e: CoreExpr, depth: number) => printExpr(e, depth, solution, options);
  switch (cmd.tag) {
    case 'where':
      return ['WHERE', ...expr(cmd.cond, 1)];
    case 'eval':
      return [`EVAL ${cmd.name} =`, ...expr(cmd.expr, 1)];
    case 'stats':
      return [
        'STATS',
        ...cmd.aggs.flatMap((a) => [`  ${a.name} =`, ...expr(a.expr, 2)]),
        ...(cmd.by.length > 0 ? ['  BY'] : []),
        ...cmd.by.flatMap((k) => [`  ${k.name} =`, ...expr(k.expr, 2)]),
      ];
    case 'keep':
      return [`KEEP ${cmd.cols.join(', ')}`];
    case 'drop':
      return [`DROP ${cmd.cols.join(', ')}`];
    case 'sort':
      return ['SORT', ...cmd.keys.flatMap((k) => [`  ${k.dir.toUpperCase()}`, ...expr(k.expr, 2)])];
    case 'limit':
      return [`LIMIT ${cmd.n}`];
  }
};

const printExpr = (
  e: CoreExpr,
  depth: number,
  solution: Solution,
  options: PrintOptions
): string[] => {
  const pad = '  '.repeat(depth);
  const type = typeName(e.type, solution, options);
  switch (e.tag) {
    case 'col':
      return [`${pad}col ${e.name} : ${type}`];
    case 'lit':
      return [`${pad}lit ${JSON.stringify(e.value)} : ${type}`];
    case 'param':
      return [`${pad}param ?${e.name} : ${type}`];
    case 'ann':
      return [`${pad}declared : ${type}`, ...printExpr(e.expr, depth + 1, solution, options)];
    case 'call':
      return [
        `${pad}${e.fn} : ${type}${instancesOf(e, solution, options)}`,
        ...e.args.flatMap((a) => printExpr(a, depth + 1, solution, options)),
      ];
  }
};

const typeName = (type: Mono, solution: Solution, options: PrintOptions): string => {
  const resolved = resolve(solution, type);
  return resolved.tag === 'esql'
    ? resolved.esql
    : options.explain?.(resolved) ?? `?${show(resolved)}`;
};

const instancesOf = (
  call: Extract<CoreExpr, { tag: 'call' }>,
  solution: Solution,
  options: PrintOptions
): string => {
  const requires = options.library?.functions.get(call.fn)?.type.requires ?? [];
  const shown = call.instances.flatMap((hole, i) => {
    const instance = solution.instances.get(hole);
    const name = requires[i]?.protocol;
    return instance
      ? [`${name ?? 'instance'}(${instance.join(', ')})`]
      : name
      ? [`${name} undecided`]
      : [];
  });
  return shown.length > 0 ? `   [${shown.join('; ')}]` : '';
};

const show = (type: Mono): string =>
  type.tag === 'meta' ? type.meta : type.tag === 'var' ? type.name : '';

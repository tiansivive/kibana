/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CommandNode } from '../../surface/query';
import { defines, dropWithout, hasPattern, mentions, reads, removes } from '../columns';
import type { Rule } from '../lint';

export const dataFlowRules: readonly Rule[] = [
  {
    id: 'dead-eval',
    severity: 'suggestion',
    check: (ast) =>
      ast.pipe.flatMap((c, i) => {
        const end = c.tag === 'eval' ? endOf(ast.pipe, i + 1, c.name) : undefined;
        return c.tag === 'eval' && end !== undefined
          ? [
              {
                command: i,
                message: `column ${c.name} is computed and then never read before it is dropped or overwritten`,
                perhaps: 'remove the EVAL',
                fix: [
                  { command: i, with: [] },
                  ...(ast.pipe[end].tag === 'drop'
                    ? [{ command: end, with: dropWithout(ast.pipe[end], c.name) }]
                    : []),
                ],
              },
            ]
          : [];
      }),
  },
  {
    id: 'rename-chain',
    severity: 'suggestion',
    check: (ast) =>
      ast.pipe.flatMap((c, i) => {
        const next = c.tag === 'rename' ? nextMention(ast.pipe, i + 1, [c.from, c.to]) : undefined;
        const second = next === undefined ? undefined : ast.pipe[next];
        return c.tag === 'rename' &&
          next !== undefined &&
          second?.tag === 'rename' &&
          second.from === c.to &&
          second.to !== c.from &&
          !ast.pipe.slice(i + 1, next).some(hasPattern)
          ? [
              {
                command: i,
                message: `${c.from} is renamed to ${c.to} and then to ${second.to}`,
                perhaps: `rename ${c.from} to ${second.to} once`,
                fix: [
                  { command: i, with: [] },
                  {
                    command: next,
                    with: [{ tag: 'rename' as const, from: c.from, to: second.to }],
                  },
                ],
              },
            ]
          : [];
      }),
  },
  {
    id: 'eval-drop-rename',
    severity: 'suggestion',
    check: (ast) =>
      ast.pipe.flatMap((c, i) => {
        const source = c.tag === 'eval' && c.expr.tag === 'col' ? c.expr.name : undefined;
        const next = source === undefined ? undefined : nextMention(ast.pipe, i + 1, [source]);
        const drop = next === undefined ? undefined : ast.pipe[next];
        return c.tag === 'eval' &&
          source !== undefined &&
          source !== c.name &&
          next !== undefined &&
          drop?.tag === 'drop' &&
          !ast.pipe.slice(i + 1, next).some(hasPattern)
          ? [
              {
                command: i,
                message: `${c.name} copies ${source}, which is dropped afterwards`,
                perhaps: `RENAME ${source} AS ${c.name}, which keeps the column where it is instead of moving it to the end`,
                fix: [
                  { command: i, with: [{ tag: 'rename' as const, from: source, to: c.name }] },
                  { command: next, with: dropWithout(drop, source) },
                ],
              },
            ]
          : [];
      }),
  },
];

/**
 * Where a column stops existing as the value computed at the start of `from`: the index of the
 * command that drops or overwrites it before anything reads it. Nothing when something reads it,
 * when it reaches the end of the query, or when a pattern makes that unclear.
 */
const endOf = (pipe: readonly CommandNode[], from: number, name: string): number | undefined => {
  const command = pipe[from];
  return command === undefined || reads(command).includes(name) || hasPattern(command)
    ? undefined
    : defines(command).includes(name) || removes(command, name)
    ? from
    : endOf(pipe, from + 1, name);
};

/** The index of the first command from `from` that names any of the columns. */
const nextMention = (
  pipe: readonly CommandNode[],
  from: number,
  names: readonly string[]
): number | undefined => {
  const index = pipe.findIndex(
    (command, i) => i >= from && mentions(command).some((name) => names.includes(name))
  );
  return index === -1 ? undefined : index;
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ExprNode } from '../surface/expr';
import { expressionsOf } from '../surface/expr';
import type { CommandNode } from '../surface/query';

/** The columns an expression reads. */
export const columnsOf = (expr: ExprNode): readonly string[] =>
  expr.tag === 'col'
    ? [expr.name]
    : expr.tag === 'ann'
    ? columnsOf(expr.expr)
    : expr.tag === 'call'
    ? expressionsOf(expr.args).flatMap(columnsOf)
    : [];

/** The columns a command reads to compute something, or moves when it renames them. */
export const reads = (command: CommandNode): readonly string[] => {
  switch (command.tag) {
    case 'where':
      return columnsOf(command.cond);
    case 'eval':
      return columnsOf(command.expr);
    case 'stats':
      return [...command.aggs, ...command.by].flatMap(({ expr }) => columnsOf(expr));
    case 'sort':
      return command.keys.flatMap(({ expr }) => columnsOf(expr));
    case 'rename':
      return [command.from];
    case 'keep':
    case 'drop':
    case 'limit':
      return [];
  }
};

/** The columns a command creates or overwrites. */
export const defines = (command: CommandNode): readonly string[] => {
  switch (command.tag) {
    case 'eval':
      return [command.name];
    case 'rename':
      return [command.to];
    case 'stats':
      return [...command.aggs, ...command.by].map(({ name }) => name);
    case 'where':
    case 'keep':
    case 'drop':
    case 'sort':
    case 'limit':
      return [];
  }
};

/** Every column a command names, whether it reads, creates or lists it. */
export const mentions = (command: CommandNode): readonly string[] => [
  ...reads(command),
  ...defines(command),
  ...(command.tag === 'keep' || command.tag === 'drop' ? command.cols : []),
];

/** Whether the command takes columns by pattern, which this analysis does not follow. */
export const hasPattern = (command: CommandNode): boolean =>
  (command.tag === 'keep' || command.tag === 'drop') &&
  command.cols.some((name) => name.includes('*'));

/** Whether the column is gone after the command, when the command did not read it. */
export const removes = (command: CommandNode, name: string): boolean =>
  command.tag === 'drop'
    ? command.cols.includes(name)
    : command.tag === 'keep'
    ? !command.cols.includes(name)
    : command.tag === 'stats'
    ? !defines(command).includes(name)
    : false;

/** The command with a column left out of its list, which is nothing when the list was only that. */
export const dropWithout = (command: CommandNode, name: string): readonly CommandNode[] =>
  command.tag === 'drop' && command.cols.some((col) => col !== name)
    ? [{ ...command, cols: command.cols.filter((col) => col !== name) }]
    : [];

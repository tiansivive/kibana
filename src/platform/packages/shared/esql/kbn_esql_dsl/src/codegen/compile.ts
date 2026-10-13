/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Builder, ComposerQuery } from '@elastic/esql';
import type { ESQLAstCommand, ESQLAstExpression, ESQLOrderExpression } from '@elastic/esql';
import type { Core, CoreCommand, CoreExpr } from '../core/terms';
import type { EsqlType } from '../vocabulary/esql_type';

/**
 * Prints a Core through `@elastic/esql`. The result is a fresh `ComposerQuery`: call `print()`
 * for the text, or `toRequest()` for the request. Named parameters appear as `?name` and get their
 * values from the caller. Protocols and instances were only a typing device, so nothing here reads
 * them. Types come from the Core's nodes, and when a type is needed from a meta it is looked up in
 * the solution at that point.
 *
 * The query is built from tree nodes and never from spliced text, so the printer decides where
 * parentheses go and a name is quoted only when it has to be.
 */
export const compile = (core: Core): ComposerQuery =>
  new ComposerQuery(
    Builder.expression.query([
      Builder.command({
        name: 'from',
        args: core.source.indices.map((index) => Builder.expression.source.index(index)),
      }),
      ...core.pipe.map(command),
    ])
  );

const command = (cmd: CoreCommand): ESQLAstCommand => {
  switch (cmd.tag) {
    case 'where':
      return Builder.command({ name: 'where', args: [expression(cmd.cond)] });
    case 'eval':
      return Builder.command({
        name: 'eval',
        args: [assignment(cmd.name, expression(cmd.expr))],
      });
    case 'stats':
      return Builder.command({
        name: 'stats',
        args: [
          ...cmd.aggs.map((a) => assignment(a.name, expression(a.expr))),
          ...(cmd.by.length > 0
            ? [
                Builder.option({
                  name: 'by',
                  args: cmd.by.map((k) => assignment(k.name, expression(k.expr))),
                }),
              ]
            : []),
        ],
      });
    case 'keep':
      return Builder.command({ name: 'keep', args: cmd.cols.map(column) });
    case 'drop':
      return Builder.command({ name: 'drop', args: cmd.cols.map(column) });
    case 'sort':
      return Builder.command({
        name: 'sort',
        args: cmd.keys.map((k) => order(expression(k.expr), k.dir)),
      });
    case 'rename':
      return Builder.command({
        name: 'rename',
        args: [Builder.expression.func.binary('as', [column(cmd.from), column(cmd.to)])],
      });
    case 'limit':
      return Builder.command({
        name: 'limit',
        args: [Builder.expression.literal.integer(cmd.n)],
      });
  }
};

/** A sort key. ES|QL sorts by any expression, though the builder's helper only takes a column. */
const order = (key: ESQLAstExpression, dir: 'asc' | 'desc'): ESQLOrderExpression => ({
  type: 'order',
  name: '',
  order: dir === 'desc' ? 'DESC' : 'ASC',
  nulls: '',
  args: [key],
  ...Builder.parserFields(),
});

const column = (name: string): ESQLAstExpression => Builder.expression.column(name.split('.'));

const assignment = (name: string, value: ESQLAstExpression): ESQLAstExpression =>
  Builder.expression.func.binary('=', [column(name), value]);

/** The operators ES|QL writes after their operand. */
const POSTFIX = new Map<string, string>([
  ['is_null', 'is null'],
  ['is_not_null', 'is not null'],
]);

/** The operators ES|QL writes between its operands, and how tightly each binds. */
const OPERATORS = new Map<string, { symbol: '+' | '>' | '==' | 'and' | 'or'; level: string }>([
  ['add', { symbol: '+', level: 'additive' }],
  ['greater_than', { symbol: '>', level: 'comparison' }],
  ['equals', { symbol: '==', level: 'comparison' }],
  ['and', { symbol: 'and', level: 'and' }],
  ['or', { symbol: 'or', level: 'or' }],
]);

/**
 * Operators are built as tree nodes, not by splicing text, so the printer decides where
 * parentheses go for operands that bind more loosely: `(a + b) * c` stays what it was. The printer
 * would flatten an operand at the same level, and regrouping changes what a query means (floating
 * point addition is not associative), so such an operand keeps its parentheses.
 */
const expression = (e: CoreExpr): ESQLAstExpression => {
  switch (e.tag) {
    case 'col':
      return column(e.name);
    case 'lit':
      return literal(e.ty, e.value);
    case 'param':
      return Builder.param.named({ value: e.name });
    case 'ann':
      // a declaration is a typing device and prints as the expression it declares
      return expression(e.expr);
    case 'call': {
      const operator = OPERATORS.get(e.fn);
      const postfix = POSTFIX.get(e.fn);
      const [left, right] = e.args;
      if (postfix !== undefined && left !== undefined) {
        return Builder.expression.func.postfix(postfix, expression(left));
      }
      return operator !== undefined && left !== undefined && right !== undefined
        ? Builder.expression.func.binary(operator.symbol, [
            operand(left, operator.level, 'left'),
            operand(right, operator.level, 'right'),
          ])
        : Builder.expression.func.call(
            e.fn,
            e.args.map((arg) => expression(arg))
          );
    }
  }
};

/** An operand of an operator, parenthesised when it sits at the same level and could be regrouped. */
const operand = (arg: CoreExpr, level: string, side: 'left' | 'right'): ESQLAstExpression => {
  const node = expression(arg);
  const sameLevel = arg.tag === 'call' && OPERATORS.get(arg.fn)?.level === level;
  return sameLevel && (side === 'right' || level === 'comparison')
    ? Builder.expression.parens(node)
    : node;
};

/** A literal prints as ES|QL would type it, with a cast where the written form would mean another type. */
const literal = (ty: EsqlType, value: string | number | boolean): ESQLAstExpression => {
  switch (ty) {
    case 'integer':
      return Builder.expression.literal.integer(numberOf(value));
    case 'double':
      return Builder.expression.literal.decimal(numberOf(value));
    case 'long':
      return Builder.expression.inlineCast({
        value: Builder.expression.literal.integer(numberOf(value)),
        castType: 'long',
      });
    case 'date':
      return Builder.expression.inlineCast({
        value: Builder.expression.literal.string(String(value)),
        castType: 'datetime',
      });
    case 'boolean':
      return Builder.expression.literal.boolean(value === true);
    case 'keyword':
      return Builder.expression.literal.string(String(value));
    default:
      throw new Error(`no literal syntax for ${ty}`);
  }
};

const numberOf = (value: string | number | boolean): number => {
  if (typeof value !== 'number') {
    throw new Error(`expected a number, got ${typeof value}`);
  }
  return value;
};

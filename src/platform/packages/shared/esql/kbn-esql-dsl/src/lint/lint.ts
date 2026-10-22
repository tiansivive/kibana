/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Location } from '../diagnostics/location';
import * as Locate from '../elaboration/locate';
import type { CommandNode, QueryAst } from '../surface/query';
import { dataFlowRules } from './rules/data_flow';
import { orderRules } from './rules/order';

export type Severity = 'warning' | 'suggestion';

/** Replaces the command at index `command` of the pipe with `with`, which is nothing to remove it. */
export interface Edit {
  readonly command: number;
  readonly with: readonly CommandNode[];
}

/** What a rule reports. `lint` adds the rule and where the problem is. */
export interface Problem {
  /** The index of the command in the pipe, or `undefined` for the query as a whole. */
  readonly command: number | undefined;
  readonly message: string;
  /** What to do instead, in words. */
  readonly perhaps: string;
  /** Edits that make the query what `perhaps` says. Absent when the rule cannot know what is meant. */
  readonly fix?: readonly Edit[];
}

export interface Rule {
  readonly id: string;
  readonly severity: Severity;
  readonly check: (ast: QueryAst) => readonly Problem[];
}

export interface Finding extends Omit<Problem, 'command'> {
  readonly rule: string;
  readonly severity: Severity;
  readonly location: Location;
}

export const recommended: readonly Rule[] = [...orderRules, ...dataFlowRules];

/** Finds what is suspicious or avoidable in a query, in the order of the pipe. */
export const lint = (ast: QueryAst, rules: readonly Rule[] = recommended): readonly Finding[] =>
  rules
    .flatMap((rule) =>
      rule.check(ast).map(({ command, ...problem }) => ({
        ...problem,
        rule: rule.id,
        severity: rule.severity,
        order: command ?? -1,
        location:
          command === undefined ? Locate.source : Locate.command(command, ast.pipe[command].tag),
      }))
    )
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...finding }) => finding);

interface Applied {
  readonly applied: readonly Finding[];
  readonly edits: readonly Edit[];
  readonly edited: ReadonlySet<number>;
}

const nothingApplied: Applied = { applied: [], edits: [], edited: new Set() };

/**
 * Applies the fixes of the findings in order. A finding whose fix would edit a command that an
 * earlier fix already edited is left out, so lint again to find what the applied fixes uncovered.
 */
export const applyFixes = (
  ast: QueryAst,
  findings: readonly Finding[]
): { readonly ast: QueryAst; readonly applied: readonly Finding[] } => {
  const { applied, edits } = findings.reduce<Applied>((acc, finding) => {
    const touched = (finding.fix ?? []).map((edit) => edit.command);
    return finding.fix && touched.every((index) => !acc.edited.has(index))
      ? {
          applied: [...acc.applied, finding],
          edits: [...acc.edits, ...finding.fix],
          edited: new Set([...acc.edited, ...touched]),
        }
      : acc;
  }, nothingApplied);
  const replacements = new Map(edits.map((edit) => [edit.command, edit.with]));
  return {
    ast: { ...ast, pipe: ast.pipe.flatMap((command, i) => replacements.get(i) ?? [command]) },
    applied,
  };
};

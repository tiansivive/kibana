/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Core } from './core/terms';
import { metaType, sourceMeta } from './core/type';
import type { Mono } from './core/type';
import { standardLibrary } from './core/polymorphism/standard/standard';
import type { Diagnostic } from './diagnostics/diagnostic';
import { elaborate } from './elaboration/bidir';
import { candidates } from './elaboration/solve/guidance';
import { principal } from './elaboration/solve/principal';
import type { Principal } from './elaboration/solve/principal';
import { solve } from './elaboration/solve/solve';
import type { Solution } from './elaboration/solve/solution';
import type { EsqlType } from './vocabulary/esql_type';
import type { QueryAst } from './surface/query';

export interface TypecheckOptions {
  /** Known source schema. Without it the source is open and its column types are inferred. */
  readonly schema?: Readonly<Record<string, EsqlType>>;
}

export interface Typechecked {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Source columns the query reads, with the types each can have. One type means it is known, and
   * several are guidance from the constraints that could not be decided yet.
   */
  readonly required: ReadonlyMap<string, readonly EsqlType[]>;
  readonly output: {
    readonly columns: ReadonlyMap<string, readonly EsqlType[]>;
    /** True when the output may contain further source columns the query never mentions. */
    readonly open: boolean;
    readonly lacks: readonly string[];
  };
  /** The type of the whole query: unknown column types as variables, and what couples them. */
  readonly principal: Principal;
  /** The elaborated query. A type that was not known when it was built is a meta. */
  readonly core: Core;
  /** What solving recorded. Whatever needs a type from the Core looks the meta up here, on demand. */
  readonly solution: Solution;
}

/**
 * Checks a query for internal consistency and infers the types of the columns it reads.
 * Without a schema the source row is open: reading a column creates a meta that the protocols of
 * the functions applied to it constrain. With a schema the row is closed, so reading an unknown
 * column is an error and every column has a type.
 */
export const typecheck = (ast: QueryAst, options: TypecheckOptions = {}): Typechecked => {
  const library = standardLibrary;
  const { core, output, emit } = elaborate(library, ast, options.schema);
  const solution = solve(library, emit.constraints);
  const diagnostics = [...emit.diagnostics, ...solution.diagnostics];
  const typesOf = (type: Mono): readonly EsqlType[] => candidates(library, solution, type);

  const sources = [...new Set(emit.sources)];
  const lacks = output.tail.tag === 'open' ? [...output.tail.lacks] : [];
  // Source columns the query read but never named in the output still flow through an open row.
  const passedThrough =
    output.tail.tag === 'open'
      ? sources
          .filter((name) => !output.fields.has(name) && !lacks.includes(name))
          .map((name): [string, Mono] => [name, metaType(sourceMeta(name))])
      : [];
  const outputTypes = new Map([...output.fields, ...passedThrough]);
  const open = output.tail.tag === 'open';

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    required: new Map(
      sources.map((name): [string, readonly EsqlType[]] => [
        name,
        typesOf(metaType(sourceMeta(name))),
      ])
    ),
    output: {
      columns: new Map(
        [...outputTypes].map(([name, type]): [string, readonly EsqlType[]] => [name, typesOf(type)])
      ),
      open,
      lacks,
    },
    principal: principal(
      solution,
      { names: sources, open: options.schema === undefined },
      { columns: outputTypes, open }
    ),
    core,
    solution,
  };
};

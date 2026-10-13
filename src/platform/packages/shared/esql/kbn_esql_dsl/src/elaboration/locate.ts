/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Location } from '../diagnostics/location';
import type { Hole, Meta } from '../core/type';

/**
 * Every place in the query that elaboration names, and every name it derives from a place, is
 * built here, imported as `import * as Locate from`. A location is a path into the query AST
 * such as `pipe[1].stats.aggs.total.args[0]`, and the metas and holes of the Core take their
 * names from the location of the node they belong to, so no other file spells these strings.
 */

/** The command at `index` of the pipe. */
export const command = (index: number, tag: string): Location => ({
  path: `pipe[${index}].${tag}`,
});

/** A part of a command or an expression, such as `cond` or `expr`. */
export const field = (location: Location, name: string): Location => ({
  path: `${location.path}.${name}`,
});

export const arg = (location: Location, index: number): Location => ({
  path: `${location.path}.args[${index}]`,
});

export const sortKey = (location: Location, index: number): Location => ({
  path: `${location.path}.keys[${index}]`,
});

export const aggregate = (location: Location, name: string): Location => ({
  path: `${location.path}.aggs.${name}`,
});

export const groupKey = (location: Location, name: string): Location => ({
  path: `${location.path}.by.${name}`,
});

/** What a schema declares about a source column. */
export const schema = (name: string): Location => ({ path: `schema.${name}` });

/** The type variable `name` of a function's type, at the call at `location`. */
export const typeVariable = (location: Location, name: string): Meta => `${location.path}$${name}`;

/** An expression or column that could not be typed. Nothing constrains it, so nothing built on it reports again. */
export const untyped = (location: Location, name?: string): Meta =>
  name === undefined ? `${location.path}!` : `${location.path}!${name}`;

/** The instance the call at `location` needs for its `index`th required protocol. */
export const instance = (location: Location, index: number): Hole => `${location.path}#${index}`;

/** The instance saying that a sort key has an order. */
export const orderable = (location: Location): Hole => `${location.path}#orderable`;

/** The instance saying that a source column has a type a source column can have. */
export const fieldType = (location: Location, name: string): Hole =>
  `${location.path}#field.${name}`;

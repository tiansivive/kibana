/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsqlType } from '../../esql_type';

/**
 * A protocol is a named predicate over types, declared once. An instance is one ground fact that
 * a tuple of types satisfies a protocol, declared separately from the protocol and from every
 * function. A function's type says which protocols its parameters and result must satisfy, and
 * never lists types of its own.
 */
export interface Protocol {
  readonly name: string;
  readonly arity: number;
  /** Positions whose types determine all the others. Checked against the instances. */
  readonly determinedBy?: readonly number[];
}

export interface Instance {
  readonly protocol: string;
  readonly types: readonly EsqlType[];
}

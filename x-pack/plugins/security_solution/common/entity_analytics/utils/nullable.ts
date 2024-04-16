/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Predicate, Refinement } from 'fp-ts/lib/function';

export type Nullable<T> = T | null | undefined;

export const isDefined = <T>(thing: T): thing is NonNullable<T> =>
  thing !== undefined && thing !== null;

export const of: <T>(value: T) => Nullable<T> = (value) => value;

export const map: {
  <A, B>(f: (a: A) => B): (fa: Nullable<A>) => Nullable<B>;
  <A, B>(fa: Nullable<A>, f: (a: A) => B): Nullable<B>;
} = <A, B>(...args: [(el: A) => B] | [Nullable<A>, (el: A) => B]) => {
  if (args.length === 2) {
    const [el, fn] = args;
    return isDefined(el) ? fn(el) : undefined;
  }
  const [fn] = args;
  return (el: A) => (isDefined(el) ? fn(el) : undefined);
};

export const chain: {
  <A, B>(f: (a: A) => Nullable<B>): (fa: Nullable<A>) => Nullable<B>;
  <A, B>(fa: Nullable<A>, f: (a: A) => Nullable<B>): Nullable<B>;
} = <A, B>(...args: [(el: A) => B] | [Nullable<A>, (el: A) => Nullable<B>]) => {
  if (args.length === 2) {
    const [el, f] = args;
    return isDefined(el) ? f(el) : undefined;
  }
  const [f] = args;
  return (fa: Nullable<A>) => (isDefined(fa) ? f(fa) : undefined);
};

export const filter: {
  <A, B extends A>(refinement: Refinement<A, B>): (fa: Nullable<A>) => Nullable<B>;
  <A>(predicate: Predicate<A>): <B extends A>(fb: Nullable<B>) => Nullable<B>;
  <A>(predicate: Predicate<A>): (fa: Nullable<A>) => Nullable<A>;
  <A>(fa: Nullable<A>, predicate: Predicate<A>): Nullable<A>;
} = <A, B extends A>(
  ...args: [fa: Nullable<A>, predicate: Predicate<A>] | [Predicate<A>] | [Refinement<A, B>]
) => {
  if (args.length === 2) {
    const [fa, predicate] = args;
    return !isDefined(fa) ? undefined : predicate(fa) ? fa : undefined;
  }

  const [pred] = args;
  return (fa: Nullable<A>) => (!isDefined(fa) ? undefined : pred(fa) ? fa : undefined);
};

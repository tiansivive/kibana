/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SetStateAction } from 'react';
import type React from 'react';

export type InferType<T> = T extends infer P ? P : never;

/** Turns a type expression into a type literal
```ts
type A = Required<{ a?: string }>;
const a: A = { a: "" }; // `a` has type `Required<{ a?: string }>`
const b: FlattenType<A> = { a: "" }; // `b` has type `{ a: string }`
```
 */
export type FlattenType<T> = T extends infer I ? { [key in keyof I]: I[key] } : never;

/** Get props type for a react component */
export type PropsType<T extends React.FC<unknown>> = T extends React.FC<infer I> ? I : never;

/** Set some properties of `O` to non-nullable */
export type SetNonNullable<O, Keys extends keyof O> = {
  [K in keyof O]: K extends Keys ? NonNullable<O[K]> : O[K];
};

/** Returns `A & B` but does not allow `A` and `B` to have overlaping keys.
 * If the inferred type for `B` is `never`, `B` has keys that are also present in `A`
 */
export type StrictIntersection<
  A,
  B extends Extract<keyof A, keyof B> extends never ? unknown : never
> = A & B;

/** A version of `Extract` that gives a type error if you try to extract a thing that doesn't exist in `T` */
export type ExtractStrict<T, U extends T> = T extends U ? T : never;

export type SetState<T> = React.Dispatch<SetStateAction<T>>;
export type UseState<T> = [T, SetState<T>];

export type ShallowSet<O extends object, K extends keyof O & string, T> = Omit<O, K> & {
  [_K in K]: T;
};

export type ReplaceKey<
  T extends object,
  OldKey extends keyof T & string,
  NewKey extends string,
  V
> = Omit<T, OldKey> & { [K in NewKey]: V };

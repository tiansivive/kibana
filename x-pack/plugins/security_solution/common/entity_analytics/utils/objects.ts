/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fp from 'lodash/fp';

export const merge: {
  <Source extends object, Target extends object>(source: Source): (
    target: Target
  ) => Target & Source;
  <Source extends object, Target extends object>(target: Target, source: Source): Target & Source;
} = <S, T>(...args: [S] | [S, T]) => {
  if (args.length === 2) {
    const [target, source] = args;
    return fp.merge(target, source);
  }
  const [source] = args;
  return (target) => fp.merge(target, source);
};

/** Proxy for `Object.assign` with more strict types (both objects must be of the same type)
 * 
 * The `next` object is allowed to be a partial, which is useful f ex for React state updaters:
 * 
```ts
type Foo = { foo: string, bar: number };
const [state, setState] = useState<Foo>({ foo: "foo", bar: 0 });
setState(assign({ bar: 1 })); // Next state: { foo: "foo"; bar: 1 }
```
 */
export const assign: {
  <T extends object, P extends Partial<T> = Partial<T>>(next: P): (target: T) => T;
  <T extends object, P extends Partial<T> = Partial<T>>(target: T, next: P): T;
} = <T, P>(...args: [P] | [T, P]) => {
  if (args.length === 2) {
    const [target, next] = args;
    return { ...target, ...next };
  }
  const [next] = args;
  return (target) => ({ ...target, ...next });
};

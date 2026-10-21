/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dependencyViolations, makeLibrary } from '../../core/polymorphism/library';
import type { Instance, Protocol } from '../../core/polymorphism/protocol';
import { standardLibrary } from '../../core/polymorphism/standard/standard';
import { esqlType, metaType } from '../../core/type';
import type { Mono } from '../../core/type';
import { ESQL_TYPES } from '../../vocabulary/esql_type';
import type { EsqlType } from '../../vocabulary/esql_type';
import { equal, wanted } from './constraints';
import type { Constraint } from './constraints';
import { resolve } from './solution';
import { solve } from './solve';

const location = (path: string) => ({ path });
const meta = (name: string) => metaType(name);
const ty = (t: EsqlType) => esqlType(t);
const same = (found: Mono, expected: Mono, path = 'e') =>
  equal(found, expected, location(path), 'needs');
const want = (hole: string, protocol: string, ...args: Mono[]) =>
  wanted(hole, protocol, args, location(hole));

const library = makeLibrary(
  [
    { name: 'Numeric', arity: 1 },
    { name: 'Norm', arity: 2, determinedBy: [0] },
    { name: 'Pair', arity: 2 },
    { name: 'Next', arity: 2, determinedBy: [0] },
  ],
  [
    { protocol: 'Numeric', types: ['integer'] },
    { protocol: 'Numeric', types: ['long'] },
    { protocol: 'Norm', types: ['text', 'keyword'] },
    { protocol: 'Norm', types: ['keyword', 'keyword'] },
    { protocol: 'Norm', types: ['long', 'long'] },
    { protocol: 'Pair', types: ['integer', 'long'] },
    { protocol: 'Pair', types: ['long', 'integer'] },
    { protocol: 'Next', types: ['integer', 'long'] },
    { protocol: 'Next', types: ['long', 'integer'] },
  ],
  []
);

describe('solve: unification', () => {
  it('records what each meta was unified with and resolves by lookup', () => {
    const solution = solve(library, [
      same(meta('a'), meta('b')),
      same(meta('b'), meta('c')),
      same(meta('c'), ty('long')),
    ]);
    expect(solution.diagnostics).toEqual([]);
    ['a', 'b', 'c'].forEach((m) => expect(resolve(solution, meta(m))).toEqual(ty('long')));
  });

  it('reports two different ground types for one meta', () => {
    const solution = solve(library, [
      same(meta('a'), ty('long')),
      same(meta('a'), ty('keyword'), 'second'),
    ]);
    expect(solution.diagnostics.map((d) => d.code)).toEqual(['type_conflict']);
    expect(solution.diagnostics[0].message).toBe('needs ES.keyword, found ES.long');
  });

  it('keeps a source column as the representative of the metas unified with it', () => {
    const solution = solve(library, [same(meta('call$a'), meta('src:x'))]);
    expect(resolve(solution, meta('call$a'))).toEqual(meta('src:x'));
  });
});

describe('solve: instances', () => {
  it('records the instance when every argument is known', () => {
    const solution = solve(library, [
      same(meta('a'), ty('integer')),
      want('hole', 'Numeric', meta('a')),
    ]);
    expect(solution.diagnostics).toEqual([]);
    expect(solution.instances.get('hole')).toEqual(['integer']);
    expect(solution.residual).toEqual([]);
  });

  it('reports a known tuple that has no instance', () => {
    const solution = solve(library, [
      same(meta('a'), ty('keyword')),
      want('hole', 'Numeric', meta('a')),
    ]);
    expect(solution.diagnostics.map((d) => d.code)).toEqual(['no_instance']);
    expect(solution.diagnostics[0].message).toBe('Numeric has no instance for (ES.keyword)');
  });

  it('lets a dependency fix the rest once the determining arguments are known', () => {
    const solution = solve(library, [
      same(meta('a'), ty('text')),
      want('norm', 'Norm', meta('a'), meta('b')),
    ]);
    expect(resolve(solution, meta('b'))).toEqual(ty('keyword'));
    expect(solution.instances.get('norm')).toEqual(['text', 'keyword']);
  });

  it('carries what a dependency learns into later constraints', () => {
    const solution = solve(library, [
      want('numeric', 'Numeric', meta('b')),
      want('norm', 'Norm', meta('a'), meta('b')),
      same(meta('a'), ty('long')),
    ]);
    expect(solution.diagnostics).toEqual([]);
    expect(resolve(solution, meta('b'))).toEqual(ty('long'));
    expect(solution.instances.get('numeric')).toEqual(['long']);
  });

  it('reports determining arguments no instance matches', () => {
    const solution = solve(library, [
      same(meta('a'), ty('boolean')),
      want('norm', 'Norm', meta('a'), meta('b')),
    ]);
    expect(solution.diagnostics.map((d) => d.code)).toEqual(['no_instance']);
  });
});

describe('solve: constraints that stay undecided are guidance, not errors', () => {
  it('leaves them in the residual and reports nothing', () => {
    const solution = solve(library, [want('hole', 'Pair', meta('a'), meta('b'))]);
    expect(solution.diagnostics).toEqual([]);
    expect(solution.residual.map((w) => w.hole)).toEqual(['hole']);
  });

  it('accepts a cycle of constraints that cannot all hold while the types are unknown', () => {
    // Pair relates integer and long only, so three metas that must pairwise differ have no
    // solution. Nothing is known, so nothing clashes.
    const solution = solve(library, [
      want('ab', 'Pair', meta('a'), meta('b')),
      want('bc', 'Pair', meta('b'), meta('c')),
      want('ac', 'Pair', meta('a'), meta('c')),
    ]);
    expect(solution.diagnostics).toEqual([]);
  });

  it('finds the clash as soon as one of the metas is known and a dependency carries it on', () => {
    const solution = solve(library, [
      same(meta('a'), ty('integer')),
      want('ab', 'Next', meta('a'), meta('b')),
      want('bc', 'Next', meta('b'), meta('c')),
      want('ac', 'Next', meta('a'), meta('c')),
    ]);
    // a = integer fixes b = long, which fixes c = integer, but Next has no (integer, integer)
    expect(resolve(solution, meta('c'))).toEqual(ty('integer'));
    expect(solution.diagnostics.map((d) => d.code)).toEqual(['no_instance']);
  });
});

describe('solve: never rejects what has a solution', () => {
  const UNIVERSE: readonly EsqlType[] = ['integer', 'long', 'double', 'keyword'];

  // A small deterministic generator, so a failure is reproducible from its seed.
  const generator = (seed: number) => {
    const state = { value: seed };
    return (n: number): number => {
      state.value = (state.value * 1664525 + 1013904223) % 4294967296;
      return Math.floor((state.value / 4294967296) * n);
    };
  };

  const randomCase = (seed: number) => {
    const next = generator(seed);
    const pick = <T>(items: readonly T[]): T => items[next(items.length)];
    const protocols: Protocol[] = [
      { name: 'R1', arity: 2 },
      { name: 'R2', arity: 2 },
      { name: 'R3', arity: 3 },
    ];
    const tuples = (protocol: string, arity: number, count: number): Instance[] =>
      [
        ...new Set(
          Array.from({ length: count }, () =>
            Array.from({ length: arity }, () => pick(UNIVERSE)).join(',')
          )
        ),
      ].map((row) => ({
        protocol,
        types: row.split(',').filter((s): s is EsqlType => UNIVERSE.some((u) => u === s)),
      }));
    const random = makeLibrary(
      protocols,
      [
        ...tuples('R1', 2, 4 + next(5)),
        ...tuples('R2', 2, 4 + next(5)),
        ...tuples('R3', 3, 5 + next(8)),
      ],
      []
    );
    const names = Array.from({ length: 2 + next(3) }, (_, i) => `v${i}`);
    const variable = () => meta(pick(names));
    const constraints: Constraint[] = Array.from({ length: 2 + next(4) }, (_, i): Constraint => {
      const kind = next(5);
      return kind === 0
        ? want(`c${i}`, 'R1', variable(), variable())
        : kind === 1
        ? want(`c${i}`, 'R2', variable(), variable())
        : kind === 2
        ? want(`c${i}`, 'R3', variable(), variable(), variable())
        : kind === 3
        ? same(variable(), variable(), `c${i}`)
        : same(variable(), ty(pick(UNIVERSE)), `c${i}`);
    });
    return { random, names, constraints };
  };

  const typeOf = (type: Mono, assignment: Map<string, EsqlType>): EsqlType | undefined =>
    type.tag === 'meta' ? assignment.get(type.meta) : type.tag === 'esql' ? type.esql : undefined;

  const assignments = (names: readonly string[]): readonly Map<string, EsqlType>[] =>
    names.reduce<readonly Map<string, EsqlType>[]>(
      (acc, name) => acc.flatMap((m) => UNIVERSE.map((t) => new Map([...m, [name, t]]))),
      [new Map()]
    );

  const satisfied = (
    c: Constraint,
    a: Map<string, EsqlType>,
    lib: ReturnType<typeof makeLibrary>
  ): boolean => {
    if (c.tag === 'equal') {
      return typeOf(c.found, a) === typeOf(c.expected, a);
    }
    const types = c.args.map((arg) => typeOf(arg, a));
    return (lib.instances.get(c.protocol) ?? []).some((row) => row.every((t, i) => t === types[i]));
  };

  it('reports nothing for a network that has a solution', () => {
    const outcomes = Array.from({ length: 200 }, (_, seed) => seed + 1).map((seed) => {
      const { random, names, constraints } = randomCase(seed);
      const hasSolution = assignments(names).some((a) =>
        constraints.every((c) => satisfied(c, a, random))
      );
      const solution = solve(random, constraints);
      if (hasSolution) {
        expect({ seed, diagnostics: solution.diagnostics.map((d) => d.code) }).toEqual({
          seed,
          diagnostics: [],
        });
      }
      return hasSolution;
    });
    // Both kinds of network must be well represented, or the check proves little.
    expect(outcomes.filter(Boolean).length).toBeGreaterThan(30);
    expect(outcomes.filter((s) => !s).length).toBeGreaterThan(30);
  });

  it('does not depend on the order of the constraints', () => {
    Array.from({ length: 80 }, (_, seed) => seed + 1000).forEach((seed) => {
      const { random, names, constraints } = randomCase(seed);
      const forward = solve(random, constraints);
      const backward = solve(random, [...constraints].reverse());
      expect({ seed, ok: backward.diagnostics.length === 0 }).toEqual({
        seed,
        ok: forward.diagnostics.length === 0,
      });
      if (forward.diagnostics.length === 0) {
        names.forEach((n) =>
          expect({ seed, n, type: resolve(backward, meta(n)).tag }).toEqual({
            seed,
            n,
            type: resolve(forward, meta(n)).tag,
          })
        );
      }
    });
  });
});

describe('library coherence', () => {
  it('has no instances that disagree on what a protocol determines', () => {
    expect(dependencyViolations(standardLibrary)).toEqual([]);
  });

  it('reports a protocol whose determining positions do not determine the rest', () => {
    const broken = makeLibrary(
      [{ name: 'F', arity: 2, determinedBy: [0] }],
      [
        { protocol: 'F', types: ['integer', 'long'] },
        { protocol: 'F', types: ['integer', 'double'] },
      ],
      []
    );
    expect(dependencyViolations(broken)).toHaveLength(1);
  });

  it('knows every type the checker can name', () => {
    expect(ESQL_TYPES.length).toBeGreaterThan(0);
  });
});

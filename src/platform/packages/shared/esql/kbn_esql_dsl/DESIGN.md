# @kbn/esql-dsl

Typed ES|QL query DSL. Queries are built with helper functions that produce a discriminated-union AST, checked for internal consistency, then compiled onto `@elastic/esql`.

## Pipeline

```
DSL helpers -> surface AST -> analyze (rows + constraints) -> preflight (optional, schema) -> compile -> @elastic/esql
```

| Stage | Needs | Catches |
|---|---|---|
| 0. TypeScript | nothing | non-boolean in `WHERE`, aggregate outside `STATS`, wrong argument types, reference to a column dropped by an earlier stage |
| 1. `analyze` | nothing | inferred-type conflicts, closed-row violations, aggregate and grouping misuse, param mismatches. Yields the `required` row and the `output` row |
| 2. `preflight` | a schema (static or `field_caps`) | missing fields, bound violations, cross-index conflicts |
| 3. `compile` | nothing | prints to `@elastic/esql` nodes |

## Design

| Concern | Decision |
|---|---|
| Surface | Immutable builder over stage functions. `Stage<A,B> = (q: Q<A>) => Q<B>` is the primitive. Builder methods are one-liners over stages, plus `q.pipe(stage)` for reusable generic stages. |
| Expressions | `Expr<T, K>` with a brand field so `T` is structural. `K` is `const \| scalar \| agg \| grouping`. Parameters hinted `constant` accept literals only. |
| Column scoping | Callback-scoped `Cols<G>` per stage (Kysely/Drizzle style). Closed schema gives compile-time checking. Open sources use a Proxy and runtime rows. |
| Environment | Open row `{ fields, tail }`, `tail` is `closed` or `open(lacks)`. One row operation, `demand(name)`, writing new fields into the source row's `required` map. `KEEP` closes the tail, `DROP` and `RENAME` add lacks, `EVAL` shadows. |
| Field types | Separate prefix: `flex` (alpha bounded by a set of types), `rigid` (alpha equals a type, from annotations and resolved variables), `pred` (a signature table as a closed class). |
| Solver | Improvement loop: filter each predicate's rows against current bounds, bind a variable when one row survives, error when none survives, keep as residual otherwise. Normalise by substituting singleton bounds and dropping dead variables. No subtyping lattice. |
| Types | `Ty` includes `time_duration`, `date_period`, `unsigned_long`, `aggregate_metric_double`. Signatures with out-of-scope types are dropped and reported as an "unsupported by DSL" diagnostic. |
| Literals | Flexible by context, defaulting to `integer` when materialised. |
| Elaboration | After solving, each call node records its chosen signature row. `compile` uses it to insert casts and decimal points. |
| Definitions source | `@elastic/esql-definitions`, pinned to the same version as `@elastic/esql`. |
| Compile target | `@elastic/esql` Builder and `esql` templates, always a fresh `ComposerQuery`. |
| Preflight | `required` row checked against a schema (static first, `field_caps` adapter later), then variables are instantiated and the remaining predicates entailed. |

## Theory used

Hindley-Milner with qualified types (closed classes whose instances are the ES|QL signature rows) for field types, and row polymorphism with lacks for the column environment. From the flexible-types line of work (Leijen, POPL 2009; Leijen and Loeh, ICFP 2005) only these ideas are taken: bounds as sets of allowed instantiations, bound intersection on unification, entailment under a prefix for improvement, normal-form simplification, and the rigid versus flexible distinction. Rigid HML's defaulting at `let` corresponds to defaulting at `EVAL`.

## Out of scope for v0

`raw<T>()` escape hatch, multi-source rows (`LOOKUP JOIN`, `FROM a, b`, subqueries), wildcard `KEEP`/`DROP`, `enrich`, `grok`/`dissect`, `SET unmapped_fields`, the `field_caps` adapter and lazy diagnose-on-error, stack-trace origin capture, any coupling to a specific consumer's queries.

## Phases

**P0: scaffold and TypeScript spike.** `Ty`, `Expr<T,K>`, `Q<G>`, `from`/`where`/`eval`/`stats`/`keep`/`sort`/`limit`, hand-written signatures for about 10 functions. Type tests, run under `node scripts/type_check --project`:

1. `mvPseriesWeightedSum(top(c.risk, 10000, 'desc'), 1.5)` passes while `avg(max(x))` and `avg(x) + c.nonKey` fail.
2. Overload compression for `top` (52 signatures), `case` (54), `coalesce` (28), `add` (27), with a self-check that the compressed form expands to exactly the runtime set. Hand-write the variadics.
3. A 15-stage chain with `EVAL` shadowing over a schema of about 1,000 fields. Measure `--extendedDiagnostics` instantiations, watch for TS2589, flatten with `Simplify` per stage.
4. A generic `<G extends {'@timestamp': 'date'}>` stage composed with a concrete `G`, through both `.pipe` and a chained call.

**P1: rows and solver.** `demand`, tail closing and lacks, prefix with `flex`/`rigid`/`pred`, improvement loop, normalisation, diagnostics. Seed classes for `abs`, `add`, `gt`, `sum`.

**P2: codegen.** TS declarations and runtime class tables from `@elastic/esql-definitions`, overload compression with an expand-back self-check, policy for `any`, array types, repeating signatures, preview and license flags.

**P3: elaboration and compile.** Record chosen signature rows, insert casts and decimal points, print through `@elastic/esql`.

**P4: preflight.** `required` row versus a static schema, then the `field_caps` adapter.

**P5: oracles.** ES integration test comparing the inferred output row with `columns` from `query | LIMIT 0`. `validateQuery` agreement as a cheap regression check.

**Late.** Express an existing real query as an external test of the DSL. Gaps found become backlog.

## Properties to test

- Extracting a sub-expression into a reusable stage does not change typability, except where `EVAL` materialises a column.
- Constraint application order does not change the solved result.

## Risks

1. TypeScript performance and inference on large schemas and long chains.
2. Signature table fidelity: variadics and `any` handling are not in the raw data.
3. Multi-source rows when `LOOKUP JOIN` arrives.
4. Upstream fit: the package may belong in `elastic/esql-js`, so it keeps zero `@kbn` dependencies.

## P0 results

Checked on TypeScript 6.0.3 (the repo's) and 7.0.2.

- **Kind propagation holds.** Binary functions take separate kind parameters, `KA extends Operand` and `KB extends CompatibleWith<KA>`, so a `scalar` / `agg` mix is rejected at the second argument and inference never unions kinds. `Expr<T, K>` needs its optional brand to make `T` and `K` structural.
- **Scoping holds.** After `STATS`, `KEEP` rejects dropped columns and the callback's `Cols` no longer has them. `EVAL` shadowing replaces the column's type.
- **Constant parameters hold.** `round(x, column)` is rejected, `round(avg(x), lit.int(2))` passes.
- **Table-driven signatures work.** `ADD`, `GREATER_THAN`, `EQUALS` and the unary tables are `as const` objects used for both the TypeScript signature and a jest check against `@elastic/esql-definitions`, restricted to the covered types. The check compares both directions, so a drifting table fails.
- **Generic stages need one idiom.** Inside `<G extends { '@timestamp': 'date' }>` the column `c['@timestamp']` is a deferred type and cannot be passed to a typed function. Annotating the callback with a narrower `Cols<{ '@timestamp': 'date' }>` resolves it. A generic stage therefore states the columns it needs in its callback annotation. It composes through `.pipe` and rejects a schema without the column.
- **Long chains are cheap.** 1,000 fields and 15 `WHERE`/`EVAL`/`SORT` stages cost about 92k instantiations and 0.2s of check time. Cost is linear in both fields and stages (3,000 fields and 40 stages is 675k instantiations, 0.7s), with no TS2589.

Not covered yet:

- `CASE` (54 signatures) and `COALESCE` (28) are not covered, and the raw data does not say which parameters repeat. They are not the same problem. `CASE` resembles pattern matching: condition and result arms with a shared result type, so it likely needs its own typing rule rather than a signature table. `COALESCE` resembles coercion: its arguments must unify to one type, which is a solver concern. Both wait for P1 and P2.
- Whether an aggregate expression may reference a `BY` grouping key is unverified. The editor validator is too lenient to answer it. The DSL rejects `add(avg(x), key)` conservatively. Settle it against a live cluster in P5.
- Literals are explicit (`lit.int`, `lit.long`, `lit.double`, `lit.str`, `lit.date`). Context-flexible literals arrive with the solver in P1.
- Open sources (`fromOpen`) and runtime rows are P1.

## Working in this worktree

The worktree has no `node_modules` of its own: `node_modules` is a symlink to the main checkout. Do not bootstrap or install here, since that would rewrite the main checkout's dependencies. `tsconfig.json` extends `@kbn/tsconfig-base`, which resolves into the main checkout and fails its `rootDir` check, so type checking uses the self-contained `tsconfig.spike.json`. The package is not registered in the root `package.json` or `tsconfig.base.json` yet.

```
# from the package directory
node ../../../../../../node_modules/typescript/bin/tsc -p tsconfig.spike.json   # types and @ts-expect-error tests (TS 6.0.3)
../../../../../../node_modules/.bin/tsc -p tsconfig.spike.json                   # the same on TS 7
node perf/gen.mjs 1000 15 && node ../../../../../../node_modules/typescript/bin/tsc -p tsconfig.perf.json --extendedDiagnostics

# from the repo root
node scripts/jest.js --config src/platform/packages/shared/esql/kbn_esql_dsl/jest.config.js
node scripts/eslint.js src/platform/packages/shared/esql/kbn_esql_dsl
```

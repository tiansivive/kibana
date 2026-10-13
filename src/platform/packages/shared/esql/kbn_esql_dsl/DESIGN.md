# @kbn/esql-dsl

A typed ES|QL query DSL. Queries are built with helper functions that produce a discriminated-union AST. The AST is checked for internal consistency, which needs no index mapping, and compiled onto `@elastic/esql`.

## Goals

1. Reject queries that are inconsistent in themselves: wrong argument types, aggregates outside `STATS`, a column read after a stage removed it.
2. Make ES|QL's growth cheap. A new function, type or license tier is data, never solver code, and the library of functions grows one function at a time as it is needed.
3. Infer the types of the source columns a query reads, then check them against a real schema (static or from `field_caps`) before running.
4. Know which instance each call resolves to, so diagnostics and guidance can name it. It never changes the printed query.
5. Rest on a standard theory (qualified types) so that behaviour comes from uniform data and rules, not per-feature special cases.
6. Plain functions over immutable data: no JS classes, no mutation.

## Pipeline

```
DSL helpers -> AST -> elaborate (bidirectional) -> Core with metas -> solve -> solution; compile reads the Core and looks types up in the solution -> @elastic/esql
```

| Stage | What it does |
|---|---|
| TypeScript | rejects non-boolean in `WHERE`, aggregate outside `STATS`, wrong argument types, a reference to a column a stage removed |
| `elaborate` | walks the AST, checking against expected types where known and synthesising for calls. Looks up each function's type, instantiates it, emits constraints, and builds the Core: the AST with a meta for every type not yet known and a placeholder for every instance a call needs |
| `solve` | resolves the constraints with the protocols and instances and records a solution: what each meta resolved to and which instance each placeholder is. Composes solutions, never rewrites a type |
| `compile` | walks the Core and builds the query with `@elastic/esql`, always as a fresh `ComposerQuery`. When it needs a type it looks the meta up in the solution at that point. Protocols and instances are a typing device and have no effect on the output |
| preflight | given a schema, source columns have known types, so the same solving resolves them or reports the clash |

## Types

`EsqlType` is a finite closed set of ES|QL value types (`boolean`, `keyword`, `text`, `ip`, `version`, `date`, `date_nanos`, `integer`, `long`, `unsigned_long`, `double`, `geo_point`, `date_period`, `time_duration`, and more as they are covered). A monotype is an `EsqlType`, a meta (a type that is not known yet), or, inside a function's type, a variable.

The type of a column says what it holds. Its **kind** says where an expression may appear. The two are checked independently.

| Kind | Meaning |
|---|---|
| `const` | a literal or foldable expression, required where ES|QL demands a constant parameter |
| `scalar` | evaluated per row |
| `agg` | an aggregate, valid only in the aggregation position of `STATS` |
| `grouping` | a grouping function such as `BUCKET`, valid only in `BY` |

A call over a `scalar` and an `agg` operand has no kind and is rejected. Aggregate arguments must be `const` or `scalar`.

Kinds are not part of the type system. Every expression's kind is known from its parts, so nothing is inferred or unified: `elaboration/kinds.ts` applies each function's **kind signature** to the kinds of its arguments. A kind signature sits beside the type signature and says how each parameter is used and what the call is:

```
top   :: forall a b. (Orderable a, Norm a b) => (a, ES.integer, ES.keyword) -> b
      :: (scalar, const, const) -> agg
add   :: forall a b c. Arith a b c => (a, b) -> c
      :: (k, k) -> k
```

A parameter is `const` (must be a constant), `scalar` (a per-row or constant value, never an aggregate) or `k` (any kind). The result is `agg`, `grouping`, or `k`, the join of the arguments passed to the `k` parameters, where mixing `scalar` with `agg` is rejected. An aggregate function is `(scalar, ...) -> agg`, a scalar function is `(k, ...) -> k`. The kind of an expression indexes a value, not its type, so the alternative of indexing every type by kind (`Expr k t`, as the TypeScript layer does) was not taken: scalar functions would need a partial join over kinds inside unification, for kinds that are never unknown.

## Protocols, instances and function types

A **protocol** is a named predicate over types, declared once and shared by any number of functions. It states a fact about types that holds whether or not any function uses it ("`long` is numeric", "`integer` and `long` widen to `long`"), never what one function accepts. An **instance** is one ground fact that a tuple of types satisfies a protocol, declared separately from the protocol and from every function. A protocol owns no functions and no implementations, because ES executes the functions. Protocols and instances are internal to the library: users cannot declare them, and they play no part in codegen.

Values have monotypes. Only functions are polymorphic, so the arrow and the qualification are one thing, the `poly` type of a function, `forall vars. requires => params -> result`, and no arrow appears anywhere else in the type language. Every function has exactly one such type:

```ts
type Mono =
  | { tag: 'esql'; esql: EsqlType }
  | { tag: 'var'; name: string }
  | { tag: 'meta'; meta: string };
interface Poly { tag: 'poly'; requires: readonly Requires[]; params: readonly Mono[]; result: Mono }
interface Requires { protocol: string; args: readonly Mono[] }
type Type = Mono | Poly;

interface Protocol { name: string; arity: number; determinedBy?: readonly number[] }
interface Instance { protocol: string; types: readonly EsqlType[] }
interface LibraryFunction {
  name: string;
  type: Poly;
  kinds: { params: readonly ('const' | 'scalar' | 'k')[]; result: 'agg' | 'grouping' | 'k' };
}
```

```
abs   :: forall a. Numeric a => a -> a
avg   :: forall a. SignedNumeric a => a -> ES.double
sum   :: forall a b. (SignedNumeric a, Wide a b) => a -> b
max   :: forall a b. (Orderable a, Norm a b) => a -> b
add   :: forall a b c. Arith a b c => (a, b) -> c
count :: forall a. a -> ES.long                       -- needs no protocol
```

The parameters are a list, written `(a, b) -> c`, because functions are applied to all their arguments at once and never partially. The kind signature is not part of the type, and `Print.fn` shows it on a second line unless `kinds: false` is given. A protocol with a dependency is also shown beside the signature, as `where Arith a b c | a b -> c`, because the type alone does not say which arguments determine which. `Print.protocol` and `Print.protocolsOf` write a protocol, or everything a type takes part in, with its instances in the form the dependency reads: `(ES.integer, ES.long) -> ES.long`.

The variety in ES|QL's accepted types is carried by instances, never by several types per function. `add` accepts numbers and also a time value with a time quantity, and `Arith` holds the instances of both. Given the first type, the instances restrict the second and determine the result.

Two kinds of protocol exist. Unary ones are sets of types: `Numeric`, `SignedNumeric`, `Orderable`, `FieldType`. Relations between types are facts about how types combine, again independent of any function:

- `Norm a b`: the normal form of `a`. It is the identity on every type except `Norm text keyword`, and types the many functions that return their argument's type with `text` replaced by `keyword`.
- `Wide a b`: the type `a` aggregates in (`integer` and `long` give `long`, `double` gives `double`).
- `Arith a b c`: how two types combine arithmetically and what results. Numbers widen to their least upper bound along `integer < long < double`, and a time value combines with a time quantity in either order.
- `Comparable a b` and `Equatable a b`: pairs of types that can be compared with and without an ordering.

A protocol that relates several types may declare `determinedBy`: some of its positions determine all the others, so `Arith integer long long` and `Arith integer long double` cannot both exist. The declaration is an invariant of the instances, checked by `dependencyViolations`, and the solver uses it to improve: when the determining arguments are known, the matching instance fixes the rest.

The universe of types is closed and instances are ground, so resolving a protocol is a table lookup. Optional and repeating parameters are not modelled yet: the library has only required parameters.

## Growing the library

The library is declared by hand and starts small. Adding a function adds its type. If an existing protocol describes a parameter, the function's type uses it. Otherwise the function brings a protocol and its instances, and the protocol must describe types, not that function's signature. A recurring set of types is a candidate protocol, and a set only one function uses is a function shape that does not become one.

Where ES|QL's accepted set for a function matches no general fact (`max` accepts `boolean` but comparison operators do not, `top` accepts a subset of `max`'s types), the function uses the nearest general protocol. The DSL may accept a query ES rejects, but must not reject one ES accepts, because a false rejection blocks valid work and a false acceptance only fails later at ES. A quirk becomes a restriction only if the ES oracle shows ES enforces it. Adding a type, an ES version or a license tier adds instances. None of these touches the solver, and a query that does not use the addition keeps its result.

The published signature rows in `@elastic/esql-definitions` are the reference for what ES|QL accepts. Tests compare each declared function's tables against them, restricted to covered types.

Irregularities in the published rows to expect when adding functions:

- Many functions return their argument's type except `text` becomes `keyword`. Use `Norm`.
- Arithmetic and comparisons widen along `integer < long < double`, the result of arithmetic is the least upper bound, and the numeric rows of `add`, `sub`, `mul`, `div` and `mod` are identical. Their temporal rows differ between `add` and `sub`. Comparisons also accept `date` with `date_nanos` and `keyword` with `text`, with one table for equality (which also takes `boolean` and `geo_point`) and one for ordering.
- `unsigned_long` mixes with nothing in arithmetic or comparisons, but mixes with `integer`, `long` and `double` in `clamp`, with no single least upper bound (`clamp(integer, unsigned_long, unsigned_long)` is `unsigned_long`, `clamp(unsigned_long, long, long)` is `long`).
- A variadic signature repeats its last parameter. `coalesce`, `greatest` and `least` take same-type arguments. `case` alternates conditions and values and needs its own typing.
- A signature with optional parameters can have a result that depends on an omitted-at-the-end parameter (`top` with `outputField`). An explicit signature takes precedence over a shorter prefix of a longer one.
- `tbucket` and `tstep` list `date` and `date_nanos` for identical arguments, so their result depends on something that is not a parameter (a candidate: the implicit time field). Leave them out until that is explained.
- Implicit casts of string literals to `date`, `ip` and `version` do not appear in the rows.
- A parameter or return type outside the covered set drops that signature. A function with no covered signature is unsupported.

## Inference

Inference elaborates the AST into the Core while emitting constraints, then solves them.

**Elaboration.** The pass is bidirectional. A context checks an expression against the type it expects (`WHERE` expects `boolean`), and an expression with no expectation synthesises its own type. A call looks up the function's type, instantiates it with fresh metas named by the call's AST path, and checks each argument against its parameter, so the expected type flows from the function down into the argument. It emits one wanted constraint per requirement of the function's type, each with a placeholder for the instance. A source column read from the source is a meta constrained by the `FieldType` protocol, which excludes value-only types such as `date_period` and `time_duration`. Commands are monotypes over rows and need no instantiation.

**Solving.** Solving has two operations and records its result:

1. Unify. Two metas are linked, a meta is linked to a ground type, and two different ground types are an error. The links are recorded, and a lookup follows them to a ground type or to the meta that stands for it.
2. Decide wanted constraints, repeatedly. If every argument is known, the instance exists or the constraint is an error. If the arguments a dependency says determine the rest are known, the matching instance fixes the rest, and the placeholder records which instance it is. Anything else waits.

The recorded solution holds the links, the instance chosen for each placeholder, the constraints still waiting, and the problems found. Solutions compose by recording, and no type or constraint is ever rewritten. An error is reported once per place, so a call that fails reports its first failing requirement and the others stay quiet.

**Using the Core.** The Core is never rewritten. Whatever consumes it, such as compile, looks a meta up in the solution at the moment it needs the type. A meta that is still unknown stays a meta. No substitution is applied anywhere, and there is no separate pass that resolves the tree.

**Constraints that wait are guidance.** When the types of source columns are not known, some constraints wait, and they say what the unknown types must satisfy. They are returned as information and are never an error. They can even be unsatisfiable together without any one failing, as in `WHERE x + y > t AND y + z > t AND x + z > t` with `t` a date, where each pair needs one date and one period and no assignment gives three pairs that all differ. Unification links metas and does not choose types, so nothing clashes while the columns are unknown. Once a schema is given, every column has a type, resolution fails on the first impossible pair, and the user fixes the query. For display, the types a waiting constraint still allows for a meta can be computed on their own from the waiting constraints. An empty list says no type satisfies them together.

**Principal type.** The principal type of a query is `forall src. P => required -> output`: `src` are the metas for source column types, `P` is the set of waiting constraints, `required` maps each source column the query reads to its type, and `output` is the final row.

**Preflight.** Given a schema `S`, equate the source metas with `S` and solve again. With every column known, resolution grounds everything, and an impossible query fails at the first constraint that cannot hold. Analysing a query with a schema gives the same result as preflighting its principal type against that schema.

**Instances in the Core.** Every call carries placeholders for the instances it needs, and the solution says which they are. Compile does not use them: ES widens inside the operator, so nothing is inserted.

**Diagnostics.** Provenance is a path into the AST (`pipe[1].stats.aggs.total`), so no stack capture is needed. An impossible argument reads `SignedNumeric has no instance for (keyword)` at the call, and a mismatch of two ground types reads `WHERE needs boolean, found long`.

## Coercion

Widening is an instance relation, not a subtyping judgement and not a conversion that is inserted into the query. A global order on types would need to be coherent, and the data has none (`unsigned_long` behaves differently per family). A per-position coercion predicate would need a least-upper-bound rule that `clamp` violates.

- `Arith a b c`, with `a b` determining `c`, states which types combine and what results: given the first type, the second is restricted to the types that coerce with it, and the result is determined. Its nine rows over `integer`, `long` and `double` give the least upper bound and are the same for `add`, `sub`, `mul`, `div`, `mod`, `clamp_min`, `clamp_max` and `clamp` (which repeats its bound type). Time values and time quantities add rows to the same protocol. Functions that accept only numbers over-accept the time rows, which the policy allows until the ES oracle shows it matters. Other numeric binary functions (`atan2`, `hypot`, `log`, `pow`, `percentile`, `weighted_avg`, `bucket`) accept the same pairs but return a fixed type, so they need only an independent `Numeric` per parameter.
- `unsigned_long` combines with itself in the arithmetic family and with the other numerics in `clamp`, so those rows are separate instances per family.
- Comparison pairs are `Comparable` (ordering) and `Equatable` (equality, which also takes `boolean` and `geo_point`).
- Every family is data, so a family with different behaviour never needs an exception in the solver.

## Literals

Numeric literals are rigid and follow ES|QL's own typing: `lit.int`, `lit.long`, `lit.double`. They are not overloaded, because ES|QL's are not, and a context-dependent literal could change the printed query.

A string literal has type `keyword` and belongs to a protocol `StrLit a` whose instances are the types ES implicitly casts a string to (`date`, `date_nanos`, `ip`, `version`, and others from the implicit-cast table in `kbn-esql-language`). The literal prints unchanged, because ES performs the cast, so which instance is chosen never affects the output and needs no defaulting. Only literals cast, never column references.

## Environment

The columns visible after a stage form a **row** `{ fields, tail }`. `fields` are the columns the query has named. `tail` is `closed` (nothing else) or `open(lacks)` (any other source column except those in `lacks`).

- Reading a name finds a field first. Otherwise, in an open row, it is the source column `src:<name>`: one meta per source column, shared by every stage. In a closed row it is an `unknown_column` error.
- `KEEP` and `STATS` close the row. `DROP` removes fields and adds the names to `lacks`. `EVAL` replaces a column and clears its lack. `KEEP` and `DROP` read the columns they name, so naming a column that does not exist is an error.
- `lacks` records that a dropped source column must not be read again. Without it, the open tail would answer the read by creating a fresh requirement on the source, accepting a query ES rejects. Closed TypeScript schemas already catch this through `Omit`. For open schemas `lacks` is the only guard.

## Compile

`compile(core)` builds the query from `@elastic/esql` tree nodes (`Builder`) and wraps it in a `ComposerQuery`, so `print()` gives the text and `toRequest()` the request. It never splices text.

- **Operators are tree nodes.** `add`, `greater_than`, `equals`, `and` and `or` are binary expressions and the printer decides where parentheses go. The composer's template holes drop a parenthesis node, and the printer flattens an operand at the same level, which regroups a sum and so changes what it means for floating point. Compile therefore builds every command from nodes and keeps the parentheses of an operand that sits at the same level as its operator, so `add(add(a, b), add(c, d))` prints as `a + b + (c + d)`.
- **Other functions are called by name:** `ABS(x)`, `SUM(x)`, `TOP(x, 3, "desc")`.
- **A literal prints as the type it was written with.** `lit.int(2)` is `2`, `lit.double(2)` is `2.0`, `lit.long(2)` is `2::LONG`, `lit.date(...)` is `"..."::DATETIME`, and strings are escaped. ES types a bare integer literal as `integer`, so a written `long` needs a cast.
- **Names are quoted only when they must be:** `` `host name` ``, `` `1abc` ``, and `@timestamp` as is.
- **A parameter prints as `?name`.** The caller supplies its value.
- **A declaration prints as the expression it declares.** It is a typing device.
- **Printing a typed query is checked by parsing it back** with `@elastic/esql`'s parser.

`Print.core(core, solution, options)` shows the elaborated Core as an indented tree: every expression with its type, and every call with the instances it needed. It looks types up in the solution as it prints, and shows a type that is still unknown as its meta or as the explanation it is given.

## TypeScript layer

- `Expr<T, K>` carries its ES|QL type and kind as a structural brand. `Q<G>` is an immutable query whose schema `G` flows through stages. Each stage's callback receives `Cols<G>`, so a removed column is a compile error.
- `Stage<A, B> = (q: Q<A>) => Q<B>` is the primitive and the builder's methods are sugar over it. `q.pipe(stage)` applies a stage built elsewhere.
- A generic stage names the columns it needs by annotating its callback with a narrower `Cols`, for example `Cols<{ '@timestamp': 'date' }>` inside `<G extends { '@timestamp': 'date' }>`. Without the annotation the column's type is deferred and cannot be passed to a typed function.
- The type of a column whose type is unknown statically is `never`, which every function accepts and which yields `never`. Kinds are still checked at compile time and column types are left to `typecheck`.
- Binary functions take one kind parameter per operand, with the second constrained by the first, so a mismatch is reported at the offending argument.
- A function's TypeScript signature is written next to its type, from the same tables. Generating signatures from function types is possible once the library is large enough to justify it. A generic `fn('name', ...args)` call can make any function in the library usable immediately, checked by `typecheck` and typed `never` in TypeScript.

## Properties to test

| Property | How |
|---|---|
| Soundness against ES | generate `ROW ... \| LIMIT 0` queries, compare the returned column types with the inferred output |
| Solver soundness | on random constraint networks, a network that has a solution is never rejected, checked against exhaustive enumeration |
| Principality | analysing with a schema equals preflighting the principal type against it, for random schemas |
| Coherence | the dependency check of every protocol |
| Published rows | for every combination of covered types, each declared function accepts the published argument types and gives the published result |
| Order independence | permuting constraints does not change the result |
| Stage extraction | extracting an expression into a reusable stage does not change typability, except where `EVAL` materialises a column |
| Monotone extension | adding an instance or a function does not change the result of a query that does not use it |
| Elaboration round trip | printing, parsing with `@elastic/esql` and re-analysing gives the same types |

## Open questions that only ES can answer

- Do `coalesce`, `greatest` and `least` accept mixed numeric types beyond the published same-type signatures?
- Which implicit string-literal conversions exist?
- Does `unsigned_long + 1` type-check?
- May an aggregate expression reference a `BY` grouping key?
- What determines the result type of `tbucket`?
- Does `DROP` of a nonexistent column fail?

About eight `ROW ... | EVAL ... | LIMIT 0` queries against a local cluster settle most of these. Casting every type inside `ROW` is itself unverified.

## Source layout

```
src/
  vocabulary/                 esql_type.ts, kind.ts: the ES|QL types, the kinds and kind signatures
  typecheck.ts                typecheck(ast, { schema? }): elaborate, solve, report
  surface/                    the AST the DSL builds: expr.ts, query.ts
  dsl/                        the typed TypeScript layer: expr.ts, query.ts, functions.ts, kinds.ts
  core/
    type.ts                   Mono, Poly, Type, Meta, Hole
    terms.ts, print.ts        the elaborated query and its printer
    polymorphism/             protocol.ts, library.ts, standard/ (tables, protocols, instances, functions)
  elaboration/
    bidir.ts, row.ts          AST to Core, and the open or closed column row
    kinds.ts                  applies kind signatures to argument kinds
    solve/                    constraints, unify, decide, solve, solution, guidance
  diagnostics/                origin.ts, diagnostic.ts
  codegen/compile.ts          Core to ES|QL
  utils/immutable.ts          immutable map helpers
```

`core/print.ts` reads a `Solution` from `elaboration/solve`, while elaboration depends on `core`, so the two folders depend on each other.

## Implementation state

Implemented:

- Kinds, `Expr<T, K>`, the immutable builder, stages and callback-scoped columns, with compile-time tests (`@ts-expect-error`) and a performance check (1,000 fields and 15 stages cost about 100k type instantiations and under a second of checking on TypeScript 6.0.3, growing linearly in both).
- Protocols, instances and function types as data, with a coherence check. The standard library has 9 protocols (`FieldType`, `Numeric`, `SignedNumeric`, `Orderable`, `Norm`, `Wide`, `Arith`, `Comparable`, `Equatable`) and one type for each of 12 functions (`abs`, `round`, `add`, `greater_than`, `equals`, `and`, `or`, `avg`, `sum`, `max`, `count`, `top`), built from tables that are checked against `@elastic/esql-definitions`. A test checks every function against the published tables for every combination of types. The library is not exported.
- The Core and bidirectional elaboration into it, with a placeholder for every instance. The Core is never rewritten: types are looked up in the solution on demand.
- The solver: unification recorded as links, and wanted constraints resolved with instances and dependencies, in a few small files. A property test checks that a constraint network with a solution is never rejected and that the result does not depend on constraint order.
- Open rows with `lacks`, diagnostics with AST-path provenance, guidance computed from the waiting constraints, and `typecheck(ast, { schema? })`, which returns the diagnostics, the types of the columns read and produced, the Core, and the solution.
- `compile`, which turns the Core into an `@elastic/esql` query for every command and expression the library has, and the printer.
- `typecheck` reports the principal type (`Typechecked.principal`) and `Print.principal` shows it, for example `forall a b. (SignedNumeric a, Wide a b) => { a: a, ... } -> { total: b }`. `Print.ty` in `core/print.ts`, imported as `import * as Print`, shows every type the same way: ES|QL types with an `ES.` prefix (`ES.keyword`) so they are never mistaken for variables, variables by name, and a function's type as `forall a b. (SignedNumeric a, Wide a b) => a -> b`, with several parameters as `(a, b) -> c`. `Print.principal` adds the same `where` line for each protocol with a dependency, so the fundep that couples two variables is visible, for example `where Wide a b | a -> b`. Diagnostics, `Print.core`, `Print.principal` and the playground all use it. Unknown column types are variables, `P` is the undecided protocol facts with `FieldType` on source columns left out and repeats dropped, and a closed schema leaves no variables. Variables that belong to neither row, such as the result of an inner `add`, stay in `P`. Guidance per column is the projection of `P` onto one variable.
- A playground, `src/playground.test.ts`: a list of example queries, each printed as the ES|QL it compiles to, whether it checks, the guidance for unknown columns, the principal type and the elaborated Core.
- A REPL, `repl.js`, run from the repository root with `node src/platform/packages/shared/esql/kbn_esql_dsl/repl.js`: the package exports are in scope, and `show(query, { schema? })` prints what the playground prints for one query. `:t name` shows a function's type, `:t` alone lists them all, and `:i name` shows a protocol with its dependency and every instance, what an ES|QL type supports, or a function with the protocols it requires, and `:toggle kinds` and `:toggle dependencies` show or hide the kind signature and the `where` lines of `:t` and `:i`. Kinds start hidden.

Not yet implemented:

- Running a compiled query against Elasticsearch, and comparing its result columns with the inferred output.
- Optional and repeating parameters, grouping functions and string-literal protocols.

## Build order

1. **Grow the library** as functions are needed.
2. **ES oracle** for the open questions and the soundness test, with a local cluster started through `createTestEsCluster` from `@kbn/test-es-server`.
3. **Generate TypeScript signatures** from the function types, if the library grows enough to justify it.

## Out of scope

`raw<T>()` escape hatch, multi-source rows (`LOOKUP JOIN`, `FROM a, b`, subqueries), wildcard `KEEP`/`DROP`, `enrich`, `grok`/`dissect`, `SET unmapped_fields`, the `field_caps` adapter, lazy diagnosis on error, stack-trace provenance, context-dependent numeric literals, subtyping, user-defined protocols or instances, optional and repeating parameters, and detection of unsatisfiable constraints between unknown types.

## Risks

1. The published rows may differ from what ES accepts. The oracle tests this first.
2. Constraints between unknown source columns can be unsatisfiable together and still be accepted. They are guidance, and a schema turns them into errors.
3. Multi-source rows need a tail per source with provenance. `LOOKUP JOIN` is the first case.
4. TypeScript performance as the library grows.
5. The package may belong upstream in `elastic/esql-js`, so it keeps zero `@kbn` dependencies.

## Running the checks

The package is not yet registered in the root `package.json` or `tsconfig.base.json`, so type checking uses the self-contained `tsconfig.check.json`.

```
# from the package directory
node ../../../../../../node_modules/typescript/bin/tsc -p tsconfig.check.json    # types and @ts-expect-error tests
../../../../../../node_modules/.bin/tsc -p tsconfig.check.json                    # the same on the native compiler
node perf/gen.mjs 1000 15 && node ../../../../../../node_modules/typescript/bin/tsc -p tsconfig.perf.json --extendedDiagnostics

# from the repository root
node scripts/jest.js --config src/platform/packages/shared/esql/kbn_esql_dsl/jest.config.js
# the playground, with its output printed
node scripts/jest.js --config src/platform/packages/shared/esql/kbn_esql_dsl/jest.config.js src/platform/packages/shared/esql/kbn_esql_dsl/src/playground.test.ts --runInBand
node scripts/eslint.js src/platform/packages/shared/esql/kbn_esql_dsl
```

## References

- M. P. Jones, "A theory of qualified types", ESOP 1992.
- M. P. Jones, "Simplifying and improving qualified types", Yale research report YALEU/DCS/RR-1040, 1994.
- M. P. Jones, "Type classes with functional dependencies", ESOP 2000.
- M. Odersky, M. Sulzmann, M. Wehr, "Type inference with constrained types", Theory and Practice of Object Systems, 1999 (HM(X)).
- F. Pottier, D. Rémy, "The essence of ML type inference", in Advanced Topics in Types and Programming Languages, 2005.
- D. Vytiniotis, S. Peyton Jones, T. Schrijvers, M. Sulzmann, "OutsideIn(X): modular type inference with local assumptions", Journal of Functional Programming, 2011.

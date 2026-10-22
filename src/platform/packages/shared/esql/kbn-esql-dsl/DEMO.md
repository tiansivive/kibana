# Demo plan

About 30 minutes. Lead with what the existing packages do not do: types in the editor, inference with no schema, and rules over a typed query. Preflight and "a type error exists" are not unique, because `validateQuery` in `@kbn/esql-language` reports the same errors for a known schema.

## Setup

- Local ES up, then `scripts/setup_test_indices.sh`.
- Start the REPL (`node repl.js` from the package directory). Run `:connect` as its own step, because input piped in at once runs `:check` before the connection finishes.
- Keep `src/dsl/__type_tests__/core.ts` open for the editor errors.
- For multiline input in the REPL, end each line with a dot or an open bracket, or use `.editor`. `:h` says so.

## Outline

1. **The problem (2 min).** ES|QL queries are strings. A mistake shows up as a 400 from ES, or never, as a wrong column. Composer helps with syntax and safe parameters, and the validator checks text at runtime. Goal: catch type, column and kind errors while writing the query, without a cluster, and know what a query requires of the schema before there is one.

2. **A query in the DSL (3 min).** Show the CASE example, `from('logs').eval('level', (c) => caseOf(...)).stats(...)`, and the ES|QL it prints (`CASE(risk > 50.0, "high", risk > 1.0, "medium", "low")`). The DSL reads like ES|QL: same parameter order, `undefined` for a skipped optional, arrays for sequences. Literals are explicit (`lit.double(50)`), because ES|QL typing is.

3. **Layer 1, TypeScript while typing (4 min).** Use `from<Schema>('logs')` and show the red squiggles for a dropped column, `eq(c['host.name'], c.bytes)` (keyword against long), an aggregate in `WHERE`, nested aggregates, and a column in `STATS` that is not an aggregate. Typed composition: a reusable stage `(q: Q<A>) => Q<B>` that declares the columns it needs, applied to a query that lacks one. The tables behind these types are the ones the runtime layer uses, checked against the published ES|QL definitions.

4. **Layer 2, `typecheck` with no schema (4 min).** `from('logs')` is open. `:q` prints `checks: ok`, the columns read with the types the query allows each to have, and the principal type, for example `forall a. Comparable a ES.double => { risk: a, ... } -> { n: ES.long, level: ES.keyword }`. Read the arrow as a function from the table the query needs to the table it returns, with `...` for the columns it does not care about. Show an error with its location (`pipe[0].where...`).

5. **Lint (5 min).** Show `:q` on a query with findings, then `:fix`. Examples: `... | LIMIT 5 | LIMIT 2` (`repeated-limit`), `EVAL n = host | DROP host` becoming `RENAME host AS n` (`eval-drop-rename`, which keeps the column where it was), `SORT` before `STATS` (`sort-before-stats`). Say the rules are plain objects, fixes are edits to the AST, and `missing-limit` and `limit-before-sort` have no fix because the intent is unknowable. Rules that need resolved types (redundant conversion, `CASE` branches) come next, and the Core is why they are possible.

6. **Preflight against a real mapping (3 min).** `:connect`, then `:check` on `dsl-logs-*`. The failures the setup script documents: `host.name` (keyword) compared with a long, `size` (long in one index, keyword in the other), `name` (keyword and text), an unmapped column, `sum` over `text`. The message is per column: `mapped keyword, query needs {integer, long, double}, does not fit`. No query goes to ES, only `field_caps` for the columns the query reads. Present it as better diagnostics for the same outcomes the validator gives.

7. **A real query (2 min).** `riskScoresQuery(...)` in `src/examples/risk_scores.ts`, next to the ES|QL it prints, checked against `dsl-alerts`.

8. **How it works (3 min).** The DSL builds an AST, which elaborates into a Core with a type on every node, and the solver records a solution. Nothing is rewritten. Compile prints through `@elastic/esql`. Each function has one polymorphic type, and protocols and instances (`Numeric`, `Norm`, `Arith`, ...) carry the variety of types ES accepts. Unknown columns produce guidance, and preflight turns it into errors once real types exist.

9. **Next (2 min).** `ROADMAP.md`: rules over resolved types, CLI tools (schema type from `field_caps`, signatures from the library), declared columns, then the library.

## Say these limits first

- 22 functions and 8 commands, against about 240 functions in the validator, which also does licensing, autocomplete and hover.
- `CASE` is stricter than ES: it rejects `CASE(c, 2.0, 1)`. The validator rejects it too. The fix is the `Coerce` protocol on the roadmap.
- `round` accepts more than ES (`ROUND(x, 1.0)` is an ES error).
- Columns-read sets are wide for an open query. `risk_score` in the risk query lists nearly every numeric type.
- The package has no registered owner and is not in `tsconfig.base.json`.

## Questions to expect

- **Why not extend the Composer API?** The DSL compiles onto `@elastic/esql`. What is new is the type layer, and the Composer composes queries untyped.
- **Does it replace the validator?** No. It checks queries built in code, at build time. The validator checks text at runtime. Preflight and the validator agree for a known schema.
- **How is it different from `esql-dsl` in esql-js?** That package builds strings from `InstrumentedExpression` and takes `ExpressionLike`, with no AST, schema or inference. It has far more coverage and a shorter fluent form. Ours has typed values, a schema through stages, inference and a typed Core.
- **Who would write queries this way?** Server code that builds queries from options, such as the risk score port. Ask who else has such code.

## People

- Discover (`@elastic/kibana-discover`) owns the ES|QL language and AST packages, and `esql-js`.
- Composer API: `vadimkibana` (Vadims Daleckis, #kibana-esql) and `sddonne` (Sebastian Delle Donne). The question for Vadim is whether the typed layer sits beside `esql-dsl` or on top of it.

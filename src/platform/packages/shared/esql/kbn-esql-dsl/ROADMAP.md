# Roadmap

## Done

- [x] Typed DSL, AST, bidirectional elaboration into a Core, constraint solving, compile
- [x] Protocols and instances, one polymorphic type per function
- [x] Kinds checked beside the types
- [x] Open rows, inferred columns, principal type
- [x] Diagnostics located by AST path
- [x] Preflight against `field_caps`
- [x] Risk score query ported as an example
- [x] Variadic `and`, `or` and `add`
- [x] Parameters as `one`, `optional` and `many`, sequences as arrays in the DSL
- [x] `CASE`
- [x] REPL and test-index script

## Next, in order

- [ ] Lint engine
  - [x] `lint`, `applyFixes`, edits as command replacements
  - [x] `LIMIT` missing (the default of 1000 rows applies), `LIMIT` before `SORT`, `SORT` before `STATS`, repeated `LIMIT`
  - [x] Dead `EVAL`, `RENAME` chains, `EVAL` plus `DROP` that is a `RENAME`
  - [ ] Rules that read resolved types, such as a redundant conversion (rules then take the typechecked query)
  - [ ] Redundant `IS NOT NULL` (needs a library flag for functions that return null for null input)
  - [ ] `CASE`: unreachable branch, all values equal
  - [x] Show findings in the REPL (`:q`) and apply fixes (`:fix`)
- [ ] CLI tools
  - [ ] Schema type generated from `field_caps`
  - [ ] TypeScript signatures generated from the library
  - [ ] Committed manifest or schema diff to catch stale declarations
- [ ] Declared columns
  - [ ] Per-stage type arguments, `eval<{ foo: 'keyword' }>(...)`
  - [ ] `.declare<{ ... }>()` stage for when a method's generics conflict
  - [ ] Value-level schema, `from('idx', { foo: 'keyword' })`

## Type system

- [ ] `Coerce a b` protocol: `a` converts implicitly to `b`, with no dependency between the two. Replaces `Norm` in `CASE`, so the DSL stops rejecting what ES accepts (`CASE(c, 2.0, 1)`, `CASE(c, long, int)`)
- [ ] `CASE` takes a mandatory first (condition, value) pair, so the first value fixes the result type as in ES|QL
- [ ] Revisit the strictness policy: where the DSL is looser or stricter than ES
- [ ] Erase absent optional parameters from a function's type before instantiating it, with the variables and requirements only they mention. Replaces `absentOnlyVariables`
- [ ] `null` literals

## Library

- [ ] `bucket` and a grouping kind (the typed helper requires both `from` and `to`)
- [ ] `greatest` and `least`
- [ ] `log`, `date_format` and `date_parse`, whose optional parameters lead
- [ ] Named map options (`function_named_parameters`)
- [ ] JS values as literals (`gt(0, 1)`)
- [ ] `SET unmapped_fields` and `METADATA`

## Housekeeping

- [ ] One numbering convention for positions in diagnostics (`gap` counts parameters from 1, `constant_required` counts elements from 0)
- [ ] Register the package when something consumes it (owner, `tsconfig.base.json`)

## Parked

- ES oracle
- Profiling and explain helpers
- Query fingerprint and `X-Opaque-Id`

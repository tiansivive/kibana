# @kbn/esql-dsl

**@kbn/esql-dsl** is a typed, composable way to build ES|QL queries in TypeScript.
Each stage transforms the schema produced by the previous stage. The library keeps the query as an
abstract syntax tree (AST), checks it, infers its input and output types, and compiles it through
**@elastic/esql**.

The package serves code that builds queries dynamically. A query can begin with a known schema or
an unknown schema. TypeScript tracks the schema through the stages while the query is written. A
separate runtime checker analyzes the finished AST, infers the contract of an unknown source, and
can verify that contract against real Elasticsearch mappings.

## Goals

1. Provide an expressive, stage-based API for building dynamic ES|QL queries.
2. Use a known schema as a TypeScript type argument and report type, column, and stage errors in
   the editor.
3. Infer the schema requirements of a query whose source schema is unknown.
4. Infer the shape and types of the result schema.
5. Verify inferred requirements against a static schema or live index mappings before execution.
6. Preserve a typed AST that supports diagnostics, lint rules, safe rewrites, and future
   optimization passes.
7. Grow with ES|QL through declarative function signatures and type tables.

## Where it fits

The Elastic ecosystem offers several ways to construct and check ES|QL:

| Tool | Primary capability | Representation and type information |
|---|---|---|
| ES\|QL strings with **@kbn/esql-language** validation | Full language validation, editor features, autocomplete, and diagnostics | Parses query text and validates it against a supplied schema |
| The [Composer API](https://github.com/elastic/esql-js/tree/main/packages/esql) in **@elastic/esql** | Safe programmatic construction, parameters, AST nodes, and printing | Builds ES\|QL syntax and query requests |
| [@elastic/elasticsearch-esql-dsl](https://github.com/elastic/esql-js/tree/main/packages/esql-dsl) | A fluent API with broad command and function coverage | Represents commands and expressions as chainable objects and renders query strings |
| **@kbn/esql-dsl** | Schema-aware composition and inference | Builds an AST, carries the schema through stages, infers input and output types, and compiles through **@elastic/esql** |

The typed DSL occupies the layer between an expressive query builder and a query validator. Its
surface API supports dynamic construction. Its TypeScript and runtime layers describe what data the
query accepts and what data it returns.

## Schema and row terminology

A schema is the set of columns visible at one point in the pipeline together with their ES|QL
types. Type theory calls this structure a row type. Each data record returned by the query conforms
to the final schema.

The schema changes as commands transform the pipeline. **EVAL** adds or replaces a column,
**RENAME** changes a column name, **DROP** removes columns, and **STATS** creates a new schema from
its aggregations and grouping columns.

## Building queries in stages

The surface API follows the ES|QL pipeline. A query starts with a source and grows through stages
such as **WHERE**, **EVAL**, **STATS**, **SORT**, **KEEP**, **DROP**, **RENAME**, and **LIMIT**.

~~~ts
interface Logs {
  '@timestamp': 'date';
  'host.name': 'keyword';
  bytes: 'long';
}

const heavyHosts = from<Logs>('logs-*')
  .where((c) => gt(c.bytes, lit.long(1024)))
  .stats(
    (c) => ({ total: sum(c.bytes) }),
    (c) => ({ host: c['host.name'] })
  )
  .sort((c) => [desc(c.total)])
  .limit(10);
~~~

The schema flows through the pipeline. In this example, **WHERE** keeps the input row, **STATS**
replaces it with **total** and **host**, and the remaining stages see those two columns.

A stage is a reusable transformation from one schema to another. Ordinary TypeScript control
flow can choose stages, construct arguments, branch from a shared query, and assemble larger
queries from smaller pieces.

## Layer 1: TypeScript tracks the schema

The first layer runs in the TypeScript compiler and language server. It provides editor feedback,
including the information shown when hovering a callback parameter such as **c**.

### Closed source schemas

The type argument to **from** describes the source schema:

~~~ts
from<Logs>('logs-*')
~~~

This creates a closed schema. The type lists every available source column and its ES|QL type.
Hovering **c** shows how the schema changes from stage to stage:

~~~ts
const probe = lit.bool(true);

const known = from<Logs>('logs-*')
  .where((c) => probe) // hover c: @timestamp is date, host.name is keyword, bytes is long
  .eval('large', (c) => gt(c.bytes, lit.long(1024)))
  .where((c) => probe) // hover c: the Logs columns plus large, which is boolean
  .stats(
    (c) => ({ total: sum(c.bytes) }),
    (c) => ({ host: c['host.name'] })
  )
  .where((c) => probe); // hover c: exactly total as long and host as keyword
~~~

TypeScript can report:

- a function applied to an incompatible column type;
- a non-boolean expression passed to **WHERE**;
- an aggregate used outside the aggregation position of **STATS**;
- a scalar used as a **STATS** aggregation;
- a column read after **DROP**, **KEEP**, **RENAME**, or **STATS** removed it;
- a reusable stage applied to a row that lacks one of its required columns.

Each stage also computes its output row type. A query that ends with a single column named
**total** carries that output shape through TypeScript, so consumers can connect the query to a
response type with the same information.

### Open source schemas

Calling **from** without a type argument creates an open schema. TypeScript allows any source
column name and gives each source column the marker type **Inferred**:

~~~ts
const open = from('logs-*')
  .where((c) => probe) // hover c: any source column is available as Inferred
  .eval('large', (c) => gt(c.bytes, lit.long(1024)))
  .where((c) => probe) // hover c: the source remains open and large is boolean
  .drop('message')
  .keep('large')
  .where((c) => probe); // hover c: KEEP closed the schema to exactly large as boolean
~~~

The open TypeScript schema still tracks the effects of the pipeline:

- a derived column with a fixed result type becomes visible with that type;
- **EVAL** and **RENAME** add named columns;
- **DROP** records that a column has left the schema;
- **KEEP** and **STATS** close the schema to their declared output columns.

The **Inferred** marker flows through expressions whose result depends on an unknown source type.
The TypeScript layer records the shape produced by each stage. The runtime checker derives the
actual requirements of the source columns from their uses.

## Layer 2: runtime inference over the AST

Building a query produces the surface AST. Passing that AST to **typecheck** starts the runtime
checking layer:

~~~ts
const query = from('logs-*')
  .where((c) => gt(c.bytes, lit.long(1024)))
  .stats((c) => ({ total: sum(c.bytes) }));

const checked = typecheck(query.ast);
~~~

A simplified view of `checked` looks like this:

~~~ts
{
  ok: true,
  required: {
    bytes: ['integer', 'long', 'double'],
  },
  output: {
    total: ['long', 'double'],
  },
  principal:
    'forall a b. (Comparable a ES.long, SignedNumeric a, Wide a b) => { bytes: a, ... } -> { total: b }',
  diagnostics: [],
}
~~~

`required` describes the source columns the query reads and the concrete ES|QL types that satisfy
all of their uses. `output` describes the result schema. `principal` keeps the relationship between
the input type and the aggregate result type, and `diagnostics` identifies incompatible expressions
and their locations.

This code runs as JavaScript wherever the application chooses to analyze or compile the query.
The checker reads the operations in the AST and infers a contract for the source schema and the
result schema.

In this example, the comparison with a **long** literal narrows the types that **bytes** can have.
**sum** adds the requirement that **bytes** is a numeric type accepted by that aggregate.
**STATS** establishes the result as a closed schema with one column named **total**.

The runtime result contains:

- the source columns read by the query;
- the types each source column may have;
- relationships between those types;
- the output columns and their possible types;
- diagnostics located at paths in the AST;
- a principal type that summarizes the whole query.

The following sections unpack how the checker derives this result, how qualified types and
protocols express the constraints, and how the principal type summarizes the complete query. The
REPL section shows the same information in the form used during development.

### How bidirectional inference works

The runtime checker walks the AST in both directions:

1. Context supplies an expected type. **WHERE** expects a boolean. A function supplies the expected
   type or type requirement for each argument.
2. Expressions supply information upward. Literals have concrete types. Function results follow
   from their signatures. A source column with an unknown type receives a placeholder.
3. Every use of a placeholder adds constraints. Two uses of the same source column refine the same
   placeholder.
4. The solver combines the constraints, selects the matching ES|QL type rules, and records concrete
   types whenever the available information determines them.
5. Remaining placeholders describe genuine requirements on the source schema. They become useful
   guidance for verification.

A placeholder means “the type of this column is still open.” The surrounding operations gradually
describe which concrete ES|QL types fit there.

## How the layers fit together

The complete progression is:

~~~text
query builder
  |
  +-- known source type
  |     TypeScript checks column types and tracks a closed schema
  |
  +-- unknown source type
        TypeScript marks source columns as Inferred and tracks stage-defined columns
  |
  v
surface AST
  |
  v
typecheck
  infers source requirements, relationships, and result types
  |
  +-- preflight adds field_caps and verifies live mappings
  |
  v
compile through @elastic/esql
~~~

Passing a schema to **typecheck(query.ast, { schema })** applies the runtime inference rules with
every source column already resolved. Calling **typecheck(query.ast)** leaves source columns open
and produces their inferred requirements.

## Qualified types, in practical terms

The inference engine follows the established theory of qualified types. A function type contains
its inputs and output plus a set of requirements on those types.

For example, the type of **sum** can be read as:

~~~text
sum :: SignedNumeric a, Wide a b => a -> b
~~~

This says:

- **sum** accepts a type **a** that satisfies **SignedNumeric**;
- **Wide a b** determines the aggregate result type **b** for input type **a**;
- the function returns **b**.

An integer or long input produces a long sum. A double input produces a double sum. The function
keeps one general signature, and the ES|QL type rules provide the concrete cases.

### Protocols and instances

A protocol names a fact about one or more types:

- **SignedNumeric a** means that **a** belongs to the signed numeric family;
- **Comparable a b** means that values of **a** and **b** support ordered comparison;
- **Wide a b** relates an aggregate input type to its result type;
- **Norm a b** relates a type to the normal form returned by many functions.

An instance is one concrete row in that fact table. Instances state that **long** is signed numeric,
that **integer** widens to **long** during aggregation, or that **integer** and **double** compare.

ES|QL has a closed set of value types. The solver can therefore resolve protocols through finite
tables. Adding a function usually means declaring its qualified type. Adding an ES|QL type or a new
compatibility rule usually means adding instances to the relevant tables.

## The principal type

The principal type is the most general contract the checker can infer for a query. It describes:

- the source columns the query requires;
- the relationships their types must satisfy;
- the result schema.

A compact example looks like this:

~~~text
forall a. Comparable a ES.double =>
  { risk: a, ... } -> { total: ES.long }
~~~

Read it as:

- **risk** may have any ES|QL type represented by **a**;
- **a** must support comparison with **double**;
- the source may contain further columns;
- the result is a closed schema with a **long** column named **total**.

This contract exists before an index mapping is available. It gives a reusable description of the
query, preserves relationships between unknown column types, and provides the basis for checking
the same query against several schemas.

## Verification against real mappings

**preflight** connects the inferred query contract to Elasticsearch:

1. It checks the query with an open source schema and collects the source columns it reads.
2. It requests **field_caps** for those columns and indices.
3. It converts the mappings into ES|QL value types.
4. It checks the query again with the concrete schema.
5. It reports type conflicts, unsupported mapping types, and unmapped columns at the AST path that
   uses them.

The result includes the inferred requirements and the mapped type of each column. This supports
diagnostics such as “mapped as keyword; query requires a numeric type” and identifies conflicting
types across indices.

## A typed AST as a platform

The AST supports analysis beyond type checking. Every command and expression has a stable
structure and location. The elaborated form associates types with expressions, and the solver
records how each polymorphic operation was resolved.

The current lint engine uses the AST to find and fix patterns such as:

- repeated **LIMIT** commands;
- **SORT** work discarded by a later **STATS**;
- an **EVAL** result that is removed before use;
- a **RENAME** chain that can be collapsed;
- an **EVAL** followed by **DROP** that can become **RENAME**.

Lint fixes are AST edits, so the compiler prints valid ES|QL after a rewrite. Future analysis can
use the same typed representation for optimizations, query explanations, fingerprints, and more
type-aware rules.

## REPL

The package includes a REPL for exploring the complete flow:

- **:q** builds a query, prints its ES|QL, shows inferred input and output types, and runs lint;
- **:fix** applies available lint fixes and prints the rewritten query;
- **:connect** connects to a local Elasticsearch cluster;
- **:check** runs preflight against live mappings.

The REPL runs the builder, runtime checker, compiler, and lint engine in a standalone Node process.
**:q** and **:fix** operate on the AST and inferred types. **:connect** enables **:check** to add live
mapping verification. This makes the full runtime path available during development in isolation
from Kibana application code.

Start it from the Kibana repository root:

~~~sh
node src/platform/packages/shared/esql/kbn-esql-dsl/repl.js
~~~

A representative `:q` session looks like this:

~~~text
esql-dsl> :q from('logs-*').where((c) => gt(c.bytes, lit.long(1024))).stats((c) => ({ total: sum(c.bytes) }))
FROM logs-*
  | WHERE bytes > 1024::LONG
  | STATS total = SUM(bytes)

checks: ok

lint: nothing found

columns read, and the types the query allows each to have:
  bytes: {ES.integer, ES.long, ES.double}

principal type: forall a b. (Comparable a ES.long, SignedNumeric a, Wide a b) => { bytes: a, ... } -> { total: b }
  where Wide a b | a -> b
~~~

The first block is the compiled ES|QL. `checks: ok` means runtime inference found a consistent type
for every expression. The lint block reports structural findings from the AST. The columns block
lists the source fields the query reads and every concrete type that satisfies their combined uses.
The principal type reads as a contract from the required input schema to the result schema. Its
variables keep the exact input type open, and `Wide a b | a -> b` says that the input type uniquely
determines the aggregate result type.

This output makes principal types and inference visible while developing function signatures,
diagnostics, lint rules, and real query ports.

## From source code to ES|QL

The full path through the package is:

~~~text
stage-based DSL
  -> surface AST
  -> bidirectional elaboration
  -> constraints and typed Core
  -> solver and principal type
  -> @elastic/esql ComposerQuery
  -> ES|QL request
~~~

The surface API provides composition. TypeScript tracks closed and open schemas. Runtime inference
describes unknown source types and the result schema. Preflight connects those requirements to
real mappings. The typed AST supports higher-level tooling over the same query.

## Further detail

[DESIGN.md](./DESIGN.md) contains the internal model, function parameter representation, solving
rules, row operations, compiler details, and implementation invariants.

[ROADMAP.md](./ROADMAP.md) tracks current coverage and planned work.

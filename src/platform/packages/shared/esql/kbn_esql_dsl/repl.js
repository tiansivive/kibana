/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * A REPL with the DSL loaded: `node src/platform/packages/shared/esql/kbn_esql_dsl/repl.js` from the
 * repository root. Every export of the package is in scope, plus `show(query, { schema? })`.
 */

require('@kbn/setup-node-env');

const dsl = require('./src');
const { standardLibrary } = require('./src/core/polymorphism/standard/standard');
const { candidates } = require('./src/elaboration/solve/guidance');

const show = (q, options) => {
  const result = dsl.typecheck(q.ast, options);
  const explain = (type) =>
    `${candidates(standardLibrary, result.solution, type).join('|') || 'none'}?`;
  console.log(dsl.compile(result.core).print('pipe-multiline'));
  console.log(
    result.ok
      ? '\nchecks: ok'
      : `\nproblems:\n${result.diagnostics
          .map((d) => `  ${d.origin.path}: ${d.message}`)
          .join('\n')}`
  );
  console.log('\ncolumns read:');
  result.required.forEach((types, name) => console.log(`  ${name}: {${types.join(', ')}}`));
  console.log(
    `\n${dsl.printCore(result.core, result.solution, { library: standardLibrary, explain })}`
  );
};

const server = require('repl').start({ prompt: 'esql-dsl> ', useGlobal: true });
Object.assign(server.context, dsl, { show });

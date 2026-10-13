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
 * `:t name` shows a function's type, and `:t` alone lists them all.
 */

require('@kbn/setup-node-env');

const dsl = require('./src');
const { standardLibrary } = require('./src/core/polymorphism/standard/standard');
const { candidates } = require('./src/elaboration/solve/guidance');

const show = (q, options) => {
  const result = dsl.typecheck(q.ast, options);
  const explain = (type) =>
    `${
      candidates(standardLibrary, result.solution, type).map(dsl.Print.esqlType).join('|') || 'none'
    }?`;
  console.log(dsl.compile(result.core).print('pipe-multiline'));
  console.log(
    result.ok
      ? '\nchecks: ok'
      : `\nproblems:\n${result.diagnostics
          .map((d) => `  ${d.origin.path}: ${d.message}`)
          .join('\n')}`
  );
  console.log('\ncolumns read:');
  result.required.forEach((types, name) =>
    console.log(`  ${name}: {${types.map(dsl.Print.esqlType).join(', ')}}`)
  );
  console.log(`\nprincipal type: ${dsl.Print.principal(result.principal)}`);
  console.log(
    `\n${dsl.Print.core(result.core, result.solution, { library: standardLibrary, explain })}`
  );
};

// The DSL helpers `gt` and `eq` are the library's `greater_than` and `equals`.
const aliases = { gt: 'greater_than', eq: 'equals' };

const typeOfFunction = (name) => {
  const fn = standardLibrary.functions.get(aliases[name] ?? name);
  return fn ? dsl.Print.fn(fn) : undefined;
};

const lookup = (name) =>
  name
    ? typeOfFunction(name) ?? `no function ${name}`
    : [...standardLibrary.functions.keys()].map(typeOfFunction).join('\n');

const server = require('repl').start({
  prompt: 'esql-dsl> ',
  useGlobal: true,
  ignoreUndefined: true,
});
Object.assign(server.context, dsl, { show });

const evaluate = server.eval;
server.eval = (input, context, file, done) => {
  const command = /^\s*:t\b\s*(\S*)\s*$/.exec(input);
  if (command) {
    console.log(lookup(command[1]));
    done(null);
  } else {
    evaluate.call(server, input, context, file, done);
  }
};

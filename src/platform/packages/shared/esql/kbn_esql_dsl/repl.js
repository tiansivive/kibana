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
 * `:t name` shows a function's type, and `:t` alone lists them all. `:i name` shows everything
 * about a protocol (its dependency and instances), an ES|QL type (what it supports) or a function
 * (its type and the protocols it requires). `:toggle kinds` and `:toggle dependencies` show or hide
 * the kind signature and the `where` lines of `:t` and `:i`; kinds start hidden.
 */

require('@kbn/setup-node-env');

const dsl = require('./src');
const { standardLibrary } = require('./src/core/polymorphism/standard/standard');
const { ESQL_TYPES } = require('./src/vocabulary/esql_type');
const { candidates } = require('./src/elaboration/solve/guidance');

// What `:toggle` switches. Kinds start hidden and the `where` lines start shown.
const settings = { kinds: false, dependencies: true };

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
  console.log(
    `\nprincipal type: ${dsl.Print.principal(standardLibrary, result.principal, settings)}`
  );
  console.log(
    `\n${dsl.Print.core(result.core, result.solution, { library: standardLibrary, explain })}`
  );
};

// The DSL helpers `gt` and `eq` are the library's `greater_than` and `equals`.
const aliases = { gt: 'greater_than', eq: 'equals' };

const functionNamed = (name) => standardLibrary.functions.get(aliases[name] ?? name);

const typeOfFunction = (name) => {
  const fn = functionNamed(name);
  return fn ? dsl.Print.fn(standardLibrary, fn, settings) : undefined;
};

const aboutFunction = (fn) =>
  [
    dsl.Print.fn(standardLibrary, fn, settings),
    ...fn.type.requires.map((r) => dsl.Print.protocol(standardLibrary, r.protocol)),
  ].join('\n\n');

// `:i` takes a protocol, an ES|QL type with or without its `ES.` prefix, or a function.
const info = (name) => {
  const type = name.replace(/^ES\./, '');
  const fn = functionNamed(name);
  if (!name) {
    return [...standardLibrary.protocols.keys()].join('\n');
  }
  if (standardLibrary.protocols.has(name)) {
    return dsl.Print.protocol(standardLibrary, name);
  }
  if (ESQL_TYPES.includes(type)) {
    return dsl.Print.protocolsOf(standardLibrary, type);
  }
  return fn ? aboutFunction(fn) : `nothing named ${name}`;
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

const toggle = (name) => {
  if (name in settings) {
    settings[name] = !settings[name];
  }
  return name in settings
    ? `${name}: ${settings[name] ? 'on' : 'off'}`
    : `settings: ${Object.keys(settings).join(', ')}`;
};

const evaluate = server.eval;
server.eval = (input, context, file, done) => {
  const type = /^\s*:t\b\s*(\S*)\s*$/.exec(input);
  const about = /^\s*:i\b\s*(\S*)\s*$/.exec(input);
  const setting = /^\s*:toggle\b\s*(\S*)\s*$/.exec(input);
  if (type) {
    console.log(lookup(type[1]));
    done(null);
  } else if (about) {
    console.log(info(about[1]));
    done(null);
  } else if (setting) {
    console.log(toggle(setting[1]));
    done(null);
  } else {
    evaluate.call(server, input, context, file, done);
  }
};

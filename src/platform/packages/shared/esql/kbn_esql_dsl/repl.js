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
 * repository root. Every export of the package is in scope, and an expression prints as the plain
 * JS value it is. `:h` lists the commands, which show a query the way the playground does (`:q`),
 * look up types, protocols and instances (`:t`, `:i`), and switch what they show (`:toggle`).
 */

const { inspect } = require('util');

require('@kbn/setup-node-env');

const dsl = require('./src');
const { standardLibrary } = require('./src/core/polymorphism/standard/standard');
const { ESQL_TYPES } = require('./src/vocabulary/esql_type');
const { candidates } = require('./src/elaboration/solve/guidance');

// What `:toggle` switches. The kind signatures and the Core start hidden, the `where` lines shown.
const settings = { kinds: false, dependencies: true, 'print-core': false };

const describe = (q, options) => {
  const result = dsl.typecheck(q.ast, options);
  const explain = (type) =>
    `${
      candidates(standardLibrary, result.solution, type).map(dsl.Print.esqlType).join('|') || 'none'
    }?`;
  return [
    dsl.compile(result.core).print('pipe-multiline'),
    result.ok
      ? '\nchecks: ok'
      : `\nproblems:\n${result.diagnostics
          .map((d) => `  ${d.origin.path}: ${d.message}`)
          .join('\n')}`,
    '\ncolumns read:',
    ...[...result.required].map(
      ([name, types]) => `  ${name}: {${types.map(dsl.Print.esqlType).join(', ')}}`
    ),
    `\nprincipal type: ${dsl.Print.principal(standardLibrary, result.principal, settings)}`,
    ...(settings['print-core']
      ? [
          `\n${dsl.Print.core(result.core, result.solution, {
            library: standardLibrary,
            explain,
          })}`,
        ]
      : []),
  ].join('\n');
};

const show = (q, options) => console.log(describe(q, options));

const isQuery = (value) => Boolean(value && value.ast && value.ast.source);

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

// `:q` evaluates what follows it and, when that is a query, shows it the way the playground does.
const showQuery = (expression, context, done) =>
  evaluate.call(server, `${expression}\n`, context, 'repl', (error, value) => {
    if (error) {
      console.log(String(error));
    } else if (isQuery(value)) {
      console.log(describe(value));
    } else {
      console.log(`not a query: ${inspect(value, { colors: process.stdout.isTTY })}`);
    }
    done(null);
  });

const helpText = (list) =>
  [
    'Every export of the package is in scope, and `show(query, { schema })` shows a query against a schema.',
    '',
    ...list.map((c) => `  ${c.usage.padEnd(20)}${c.help}`),
  ].join('\n');

const commands = [
  {
    usage: ':q <expression>',
    help: 'show a one-line query: its ES|QL, checks, columns read and principal type, and the elaborated Core with :toggle print-core',
    run: (argument, context, done) => showQuery(argument, context, done),
  },
  {
    usage: ':t [function]',
    help: "show a function's type, or every function's",
    run: (argument, _context, done) => {
      console.log(lookup(argument));
      done(null);
    },
  },
  {
    usage: ':i [name]',
    help: 'show a protocol with its dependency and instances, what an ES|QL type supports, or a function with the protocols it requires; no name lists the protocols',
    run: (argument, _context, done) => {
      console.log(info(argument));
      done(null);
    },
  },
  {
    usage: ':toggle [setting]',
    help: `switch a setting (${Object.keys(settings).join(
      ', '
    )}) that decides what :t, :i and :q show`,
    run: (argument, _context, done) => {
      console.log(toggle(argument));
      done(null);
    },
  },
  {
    usage: ':h',
    help: 'show this help',
    run: (_argument, _context, done) => {
      console.log(helpText(commands));
      done(null);
    },
  },
];

server.eval = (input, context, file, done) => {
  const typed = /^\s*:(\w+)\b\s*([\s\S]*?)\s*$/.exec(input);
  const command = typed && commands.find((c) => c.usage.split(/[ [<]/)[0] === `:${typed[1]}`);
  if (command) {
    command.run(typed[2], context, done);
  } else if (typed) {
    console.log(`unknown command :${typed[1]}, :h lists the commands`);
    done(null);
  } else {
    evaluate.call(server, input, context, file, done);
  }
};

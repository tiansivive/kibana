/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * A REPL with the DSL loaded: `node src/platform/packages/shared/esql/kbn-esql-dsl/repl.js` from the
 * repository root. Every export of the package is in scope, and so is `riskScoresQuery`, the risk
 * score calculation's query written with the DSL (`src/examples/risk_scores.ts`), and an expression prints as the plain
 * JS value it is. `:h` lists the commands, which show a query the way the playground does (`:q`),
 * lint a query and apply the fixes (`:fix`), look up types, protocols and instances (`:t`, `:i`), and
 * switch what they show (`:toggle`).
 * `:connect` or `:load` give it mappings to check a query against (`:check`, `:caps`).
 */

const fs = require('fs');
const { inspect } = require('util');

require('@kbn/setup-node-env');

const dsl = require('./src');
const { standardLibrary } = require('./src/core/polymorphism/standard/standard');
const { ESQL_TYPES } = require('./src/vocabulary/esql_type');
const { candidates } = require('./src/elaboration/solve/guidance');

// What `:toggle` switches. The kind signatures and the Core start hidden, the `where` lines shown.
const settings = { kinds: false, dependencies: true, 'print-core': false };

const lintText = (ast) => {
  const findings = dsl.lint(ast);
  return findings.length === 0
    ? 'lint: nothing found'
    : [
        'lint:',
        ...findings.flatMap((f) => [
          `  ${f.severity} ${f.rule} (${f.location.path}): ${f.message}`,
          `    Perhaps: ${f.perhaps}${f.fix ? ' (:fix applies it)' : ''}`,
        ]),
      ].join('\n');
};

// The query after its fixes are applied, and the rules whose fixes were applied.
const fixed = (q) => {
  const { ast, applied } = dsl.applyFixes(q.ast, dsl.lint(q.ast));
  return applied.length === 0
    ? 'nothing to fix'
    : [
        dsl.compile(dsl.typecheck(ast).core).print('pipe-multiline'),
        `\napplied: ${applied.map((f) => `${f.rule} (${f.location.path})`).join(', ')}`,
        'lint again to find what the fixes uncovered',
      ].join('\n');
};

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
          .map((d) => `  ${d.location.path}: ${d.message}`)
          .join('\n')}`,
    `\n${lintText(q.ast)}`,
    '\ncolumns read, and the types the query allows each to have:',
    ...[...result.required].map(
      ([name, types]) => `  ${name}: {${types.map(dsl.Print.esqlType).join(', ')}}`
    ),
    `\nprincipal type: ${dsl.Print.principal(standardLibrary, result.principal, settings)}`,
    ...(settings['print-core']
      ? [`\n${dsl.Print.core(result.core, result.solution, { explain })}`]
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
Object.assign(server.context, dsl, require('./src/examples/risk_scores'), { show });

const toggle = (name) => {
  if (name in settings) {
    settings[name] = !settings[name];
  }
  return name in settings
    ? `${name}: ${settings[name] ? 'on' : 'off'}`
    : `settings: ${Object.keys(settings).join(', ')}`;
};

// The cluster `:check` and `:caps` ask for mappings: a live client from `:connect`, or recorded
// `field_caps` responses from `:load`.
const connection = { client: undefined, label: 'none' };

const withOptions = (argument) => {
  const words = argument.split(/\s+/).filter(Boolean);
  const option = (flag) => (words.includes(flag) ? words[words.indexOf(flag) + 1] : undefined);
  return { words, option, flag: (name) => words.includes(name) };
};

// The first of `[value, where it came from]` that has a value.
const first = (...entries) => entries.find(([value]) => value !== undefined) ?? [];

// What Kibana's own config says about the cluster: `elasticsearch.hosts` and its credentials.
const kibanaConfig = (files) => {
  // The REPL is a development tool run from a terminal, so it may read Kibana's server config.
  // eslint-disable-next-line @kbn/imports/no_boundary_crossing
  const { getConfigFromFiles } = require('@kbn/config');
  const existing = files.filter((file) => fs.existsSync(file));
  const { elasticsearch = {} } = existing.length > 0 ? getConfigFromFiles(existing) : {};
  return {
    node: [elasticsearch.hosts].flat()[0],
    username: elasticsearch.username,
    password: elasticsearch.password,
    token: elasticsearch.serviceAccountToken,
    files: existing,
  };
};

const credentials = (given, config) => {
  const [apiKey] = first([given.apiKey, 'option'], [process.env.ES_API_KEY, 'ES_API_KEY']);
  if (apiKey !== undefined) {
    return { auth: { apiKey }, who: 'an API key', from: 'the option or ES_API_KEY' };
  }
  const [username, from] = first(
    [given.username, 'the option'],
    [process.env.ES_USERNAME, 'ES_USERNAME'],
    [config.username, 'the Kibana config'],
    // `yarn es snapshot` starts with this user and password
    ['elastic', 'the yarn es default']
  );
  const [password] = first(
    [given.password, ''],
    [process.env.ES_PASSWORD, ''],
    [config.password, ''],
    ['changeme', '']
  );
  return config.token !== undefined && username === config.username
    ? { auth: { bearer: config.token }, who: 'the Kibana service account token', from }
    : { auth: { username, password }, who: username, from };
};

const connect = async (argument, context) => {
  const { words, option, flag } = withOptions(argument);
  const config = kibanaConfig(
    option('--config') ? [option('--config')] : ['config/kibana.yml', 'config/kibana.dev.yml']
  );
  const [node, nodeFrom] = first(
    [words.find((w) => /^https?:/.test(w)), 'the argument'],
    [process.env.ES_URL, 'ES_URL'],
    [config.node, 'the Kibana config'],
    ['http://localhost:9200', 'the default']
  );
  const { auth, who, from } = credentials(
    { apiKey: option('--api-key'), username: option('--user'), password: option('--password') },
    config
  );
  const { Client } = require('@elastic/elasticsearch');
  const client = new Client({
    node,
    auth,
    ...(flag('--insecure') ? { tls: { rejectUnauthorized: false } } : {}),
  });
  const described = `${node} (from ${nodeFrom}) as ${who} (from ${from})`;
  const info = await client.info().catch((e) => {
    throw new Error(`could not connect to ${described}: ${e.message}`);
  });
  context.esClient = client;
  return Object.assign(connection, {
    client,
    label: `${info.cluster_name} ${info.version.number}, ${described}`,
  }).label;
};

const load = (path, context) => {
  const recorded = JSON.parse(fs.readFileSync(path, 'utf8'));
  const client = {
    fieldCaps: async ({ fields }) => ({
      indices: recorded.indices ?? [],
      fields: Object.fromEntries(
        Object.entries(recorded.fields).filter(
          ([name]) => [fields].flat().includes('*') || [fields].flat().includes(name)
        )
      ),
    }),
  };
  context.esClient = client;
  return Object.assign(connection, { client, label: `recorded response ${path}` }).label;
};

const noCluster = ':connect <url> or :load <file> first';

const caps = async (argument) => {
  const [index, ...fields] = argument.split(/\s+/).filter(Boolean);
  const response = await connection.client.fieldCaps({
    index: index.split(','),
    fields: fields.length > 0 ? fields : ['*'],
  });
  // Metadata fields and the parents of dotted names are not columns a query reads.
  const readable = Object.keys(response.fields).filter((name) =>
    Object.values(response.fields[name]).some((c) => !c.metadata_field && c.type !== 'object')
  );
  const { schema, problems } = dsl.schemaFromFieldCaps(response, readable, index.split(','));
  return [
    ...Object.entries(schema).map(([name, type]) => `  ${name}: ${dsl.Print.esqlType(type)}`),
    ...problems.map((p) => `  ${p.column}: ${p.code}: ${p.message}`),
  ].join('\n');
};

const check = async (query) => {
  const result = await dsl.preflight(query, connection.client);
  return [
    result.ok
      ? 'preflight: ok'
      : `preflight: problems\n${result.diagnostics
          .map((d) => `  ${d.location.path}: ${d.code}: ${d.message}`)
          .join('\n')}`,
    '\ncolumns read, as mapped in the index, and the types the query allows:',
    ...result.columns.map(
      (c) =>
        `  ${c.column}: mapped ${
          c.mapped ? dsl.Print.esqlType(c.mapped) : 'nothing'
        }, query needs {${c.needs.map(dsl.Print.esqlType).join(', ')}} ${
          c.fits ? 'fits' : 'does not fit'
        }`
    ),
  ].join('\n');
};

const evaluate = server.eval;

// `:q` evaluates what follows it and, when that is a query, shows it the way the playground does.
// Evaluates the expression after a command and, when it is a query, passes it to `use`, which
// returns the text to print or a promise of it.
const withQuery = (expression, context, done, use) =>
  evaluate.call(server, `${expression}\n`, context, 'repl', (error, value) => {
    if (error) {
      console.log(String(error));
      done(null);
    } else if (!isQuery(value)) {
      console.log(`not a query: ${inspect(value, { colors: process.stdout.isTTY })}`);
      done(null);
    } else {
      Promise.resolve(value)
        .then(use)
        .then(console.log, (e) => console.log(`failed: ${e.message}`))
        .then(() => done(null));
    }
  });

const showQuery = (expression, context, done) =>
  withQuery(expression, context, done, (q) => describe(q));

const fixQuery = (expression, context, done) => withQuery(expression, context, done, fixed);

// `:check` evaluates what follows it and, when that is a query, checks it against the mappings.
const checkQuery = (expression, context, done) => withQuery(expression, context, done, check);

const asynchronously = (work, done) =>
  work()
    .then(console.log, (e) => console.log(`failed: ${e.message}`))
    .then(() => done(null));

const helpText = (list) =>
  [
    'Every export of the package is in scope, and `show(query, { schema })` shows a query against a schema.',
    'For several lines, end each line with a dot or an open bracket, or type `.editor`, paste and press Ctrl+D. The colon commands take one line, so assign a multiline query first and pass its name.',
    '',
    ...list.map((c) => `  ${c.usage.padEnd(26)}${c.help}`),
  ].join('\n');

const commands = [
  {
    usage: ':q <expression>',
    help: 'show a one-line query: its ES|QL, checks, lint findings, columns read and principal type, and the elaborated Core with :toggle print-core',
    run: (argument, context, done) => showQuery(argument, context, done),
  },
  {
    usage: ':fix <expression>',
    help: 'apply the fixes of the lint findings of a query and show the result',
    run: (argument, context, done) => fixQuery(argument, context, done),
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
    usage: ':connect [url]',
    help: 'connect to a cluster; the url, user and password come from the options (--user, --password, --api-key, --config, --insecure), then ES_URL, ES_USERNAME, ES_PASSWORD, ES_API_KEY, then config/kibana.yml and config/kibana.dev.yml, then http://localhost:9200 as elastic:changeme; esClient is then in scope',
    run: (argument, context, done) => asynchronously(() => connect(argument, context), done),
  },
  {
    usage: ':load <file>',
    help: 'use a recorded field_caps response as the cluster, with no connection; esClient is then in scope',
    run: (argument, context, done) =>
      asynchronously(async () => `using ${load(argument, context)}`, done),
  },
  {
    usage: ':caps <index> [field...]',
    help: 'show how the mappings of an index read as ES|QL types, and the fields that do not',
    run: (argument, _context, done) =>
      asynchronously(async () => (connection.client ? caps(argument) : noCluster), done),
  },
  {
    usage: ':check <expression>',
    help: 'check a one-line query against the mappings of the indices it reads',
    run: (argument, context, done) =>
      connection.client
        ? checkQuery(argument, context, done)
        : (console.log(noCluster), done(null)),
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

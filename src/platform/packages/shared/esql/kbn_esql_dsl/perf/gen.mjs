/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Generates perf/chain.ts: a schema with N fields and a chain of M stages that shadow and add columns.
// Usage: node perf/gen.mjs [fields=1000] [stages=15]
import { writeFileSync } from 'node:fs';

const HEADER = `/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */`;

const fields = Number(process.argv[2] ?? 1000);
const stages = Number(process.argv[3] ?? 15);
const tys = ['long', 'double', 'keyword', 'integer', 'boolean', 'date'];

const schema = Array.from({ length: fields }, (_, i) => `  f${i}: '${tys[i % tys.length]}';`).join(
  '\n'
);

// f0 is long, f1 double: shadowing alternates between types so each stage changes the schema.
const calls = [];
for (let i = 0; i < stages; i++) {
  switch (i % 5) {
    case 0:
      calls.push(`.where((c) => gt(c.f0, lit.long(${i})))`);
      break;
    case 1:
      calls.push(`.eval('f0', (c) => add(c.f0, c.f0))`);
      break;
    case 2:
      calls.push(`.eval('n${i}', (c) => add(c.f1, c.f1))`);
      break;
    case 3:
      calls.push(`.eval('f1', (c) => abs(c.f0))`);
      break;
    default:
      calls.push(`.sort((c) => [c.f0])`);
  }
}

writeFileSync(
  new URL('./chain.ts', import.meta.url),
  `${HEADER}
import { abs, add, from, gt, lit } from '../src';

interface Big {
${schema}
}

export const chained = from<Big>('big')
  ${calls.join('\n  ')};
`
);

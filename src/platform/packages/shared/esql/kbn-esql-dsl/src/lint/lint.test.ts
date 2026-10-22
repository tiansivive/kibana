/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { abs, applyFixes, compile, count, desc, from, gt, lint, lit, typecheck } from '..';
import type { OpenSchema, Q, QueryAst } from '..';

const printed = (ast: QueryAst): string => compile(typecheck(ast).core).print('basic');
const rules = (ast: QueryAst): readonly string[] => lint(ast).map((f) => f.rule);
const fixed = (ast: QueryAst): string => printed(applyFixes(ast, lint(ast)).ast);

const big = lit.long(100);

describe('order rules', () => {
  describe('missing-limit', () => {
    it('reports a query with no LIMIT, at the source', () => {
      const ast = from('logs').where((c) => gt(c.bytes, big)).ast;
      expect(lint(ast)).toMatchObject([{ rule: 'missing-limit', location: { path: 'source' } }]);
    });

    it('accepts a LIMIT, or a STATS that makes one row', () => {
      expect(rules(from('logs').limit(10).ast)).toEqual([]);
      expect(rules(from('logs').stats((c) => ({ n: count(c.bytes) })).ast)).toEqual([]);
    });

    it('still asks for a LIMIT after a grouped STATS', () => {
      const grouped = from('logs').stats(
        (c) => ({ n: count(c.bytes) }),
        (c) => ({ host: c.host })
      );
      expect(rules(grouped.ast)).toEqual(['missing-limit']);
    });
  });

  describe('limit-before-sort', () => {
    it('reports a SORT that follows a LIMIT', () => {
      const ast = from('logs')
        .limit(10)
        .sort((c) => [desc(c.bytes)]).ast;
      expect(lint(ast)).toMatchObject([
        { rule: 'limit-before-sort', location: { path: 'pipe[1].sort' } },
      ]);
    });

    it('accepts a SORT before the LIMIT, and a SORT after a STATS that follows a LIMIT', () => {
      expect(
        rules(
          from('logs')
            .sort((c) => [desc(c.bytes)])
            .limit(10).ast
        )
      ).toEqual([]);
      const afterStats = from('logs')
        .limit(10)
        .stats(
          (c) => ({ n: count(c.bytes) }),
          (c) => ({ host: c.host })
        )
        .sort((c) => [desc(c.n)]);
      expect(rules(afterStats.ast)).toEqual([]);
    });

    it('has no fix, because it cannot know which order was meant', () => {
      const [finding] = lint(
        from('logs')
          .limit(10)
          .sort((c) => [desc(c.bytes)]).ast
      );
      expect(finding.fix).toBeUndefined();
    });
  });

  describe('sort-before-stats', () => {
    const grouped = (q: Q<OpenSchema>) =>
      q.stats(
        (c) => ({ n: count(c.bytes) }),
        (c) => ({ host: c.host })
      );

    it('reports a SORT that a STATS discards, and removes it', () => {
      const ast = grouped(from('logs').sort((c) => [desc(c.bytes)])).limit(5).ast;
      expect(rules(ast)).toEqual(['sort-before-stats']);
      expect(fixed(ast)).toBe('FROM logs | STATS n = COUNT(bytes) BY host = host | LIMIT 5');
    });

    it('accepts a LIMIT between them, which makes the order matter', () => {
      const ast = grouped(
        from('logs')
          .sort((c) => [desc(c.bytes)])
          .limit(10)
      ).limit(5).ast;
      expect(rules(ast)).toEqual([]);
    });
  });

  describe('repeated-limit', () => {
    it('keeps the smaller of two adjacent LIMITs', () => {
      const ast = from('logs').limit(100).limit(10).ast;
      expect(rules(ast)).toEqual(['repeated-limit']);
      expect(fixed(ast)).toBe('FROM logs | LIMIT 10');
      expect(fixed(from('logs').limit(10).limit(100).ast)).toBe('FROM logs | LIMIT 10');
    });
  });
});

describe('data flow rules', () => {
  describe('dead-eval', () => {
    it('removes an EVAL whose column is then dropped', () => {
      const ast = from('logs')
        .eval('x', (c) => abs(c.bytes))
        .drop('x')
        .limit(10).ast;
      expect(lint(ast)).toMatchObject([{ rule: 'dead-eval', location: { path: 'pipe[0].eval' } }]);
      expect(fixed(ast)).toBe('FROM logs | LIMIT 10');
    });

    it('keeps the other columns of the DROP', () => {
      const ast = from('logs')
        .eval('x', (c) => abs(c.bytes))
        .drop('x', 'host')
        .limit(10).ast;
      expect(fixed(ast)).toBe('FROM logs | DROP host | LIMIT 10');
    });

    it('removes an EVAL that a KEEP leaves out, and one that is overwritten', () => {
      const left = from('logs')
        .eval('x', (c) => abs(c.bytes))
        .keep('host')
        .limit(10).ast;
      expect(fixed(left)).toBe('FROM logs | KEEP host | LIMIT 10');
      const overwritten = from('logs')
        .eval('x', (c) => abs(c.bytes))
        .eval('x', (c) => abs(c.size))
        .limit(10).ast;
      expect(fixed(overwritten)).toBe('FROM logs | EVAL x = ABS(size) | LIMIT 10');
    });

    it('accepts a column that is read, or that reaches the output', () => {
      const read = from('logs')
        .eval('x', (c) => abs(c.bytes))
        .where((c) => gt(c.x, big))
        .limit(10).ast;
      expect(rules(read)).toEqual([]);
      expect(
        rules(
          from('logs')
            .eval('x', (c) => abs(c.bytes))
            .limit(10).ast
        )
      ).toEqual([]);
    });

    it('does not follow a pattern', () => {
      const ast = from('logs')
        .eval('x', (c) => abs(c.bytes))
        .drop('x*')
        .limit(10).ast;
      expect(rules(ast)).toEqual([]);
    });
  });

  describe('rename-chain', () => {
    it('renames once, even with unrelated commands between', () => {
      const ast = from('logs').rename('a', 'b').rename('b', 'c').limit(10).ast;
      expect(rules(ast)).toEqual(['rename-chain']);
      expect(fixed(ast)).toBe('FROM logs | RENAME a AS c | LIMIT 10');
      const between = from('logs')
        .rename('a', 'b')
        .where((c) => gt(c.bytes, big))
        .rename('b', 'c')
        .limit(10).ast;
      expect(fixed(between)).toBe('FROM logs | WHERE bytes > 100::LONG | RENAME a AS c | LIMIT 10');
    });

    it('accepts a column that is read between the two renames', () => {
      const ast = from('logs')
        .rename('a', 'b')
        .where((c) => gt(c.b, big))
        .rename('b', 'c')
        .limit(10).ast;
      expect(rules(ast)).toEqual([]);
    });
  });

  describe('eval-drop-rename', () => {
    it('suggests RENAME for a copy of a column that is then dropped', () => {
      const ast = from('logs')
        .eval('n', (c) => c.host)
        .drop('host')
        .limit(10).ast;
      expect(rules(ast)).toEqual(['eval-drop-rename']);
      expect(fixed(ast)).toBe('FROM logs | RENAME host AS n | LIMIT 10');
    });

    it('accepts a copy whose source is read again before it is dropped', () => {
      const ast = from('logs')
        .eval('n', (c) => c.host)
        .where((c) => gt(c.host, big))
        .drop('host')
        .limit(10).ast;
      expect(rules(ast)).toEqual([]);
    });
  });
});

describe('applyFixes', () => {
  it('leaves out a fix that edits a command an earlier fix edited', () => {
    const ast = from('logs').limit(100).limit(10).limit(5).ast;
    expect(rules(ast)).toEqual(['repeated-limit', 'repeated-limit']);
    const { applied, ast: once } = applyFixes(ast, lint(ast));
    expect(applied).toHaveLength(1);
    expect(printed(once)).toBe('FROM logs | LIMIT 10 | LIMIT 5');
    expect(fixed(once)).toBe('FROM logs | LIMIT 5');
  });

  it('reports findings in the order of the pipe, the whole query first', () => {
    const ast = from('logs')
      .sort((c) => [desc(c.bytes)])
      .stats(
        (c) => ({ n: count(c.bytes) }),
        (c) => ({ host: c.host })
      ).ast;
    expect(rules(ast)).toEqual(['missing-limit', 'sort-before-stats']);
  });

  it('leaves a query that was fine as it was', () => {
    const ast = from('logs')
      .where((c) => gt(c.bytes, big))
      .limit(10).ast;
    expect(lint(ast)).toEqual([]);
    expect(applyFixes(ast, lint(ast)).ast).toEqual(ast);
  });
});

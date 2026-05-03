/**
 * Tests for schema-resolver
 */

import { selectTemplates } from './schema-resolver';
import type { SchemaConfig } from './types';

describe('selectTemplates', () => {
  test('Returns empty list when there are no rules', () => {
    expect(selectTemplates({}, 'note.md')).toEqual([]);
  });

  test('Returns every matching rule in declaration order', () => {
    const config: SchemaConfig = {
      rules: [
        { match: 'Web/**', schema: { 'body-file': './web.md' } },
        { match: 'Web/Admin/**', schema: { 'body-file': './admin.md' } }
      ]
    };
    expect(selectTemplates(config, 'Web/Admin/note.md')).toEqual([
      { schema: { 'body-file': './web.md' } },
      { schema: { 'body-file': './admin.md' } }
    ]);
  });

  test('Catch-all rule fires for every file (overlay model)', () => {
    const config: SchemaConfig = {
      rules: [
        { schema: { frontmatter: { type: 'note' } } },
        { match: 'Web/**', schema: { 'body-file': './web.md' } }
      ]
    };
    expect(selectTemplates(config, 'Mobile/note.md')).toEqual([
      { schema: { frontmatter: { type: 'note' } } }
    ]);
    expect(selectTemplates(config, 'Web/note.md')).toEqual([
      { schema: { frontmatter: { type: 'note' } } },
      { schema: { 'body-file': './web.md' } }
    ]);
  });

  test('Returns empty list when no rule matches and there is no catch-all', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'Web/**', schema: { 'body-file': './web.md' } }]
    };
    expect(selectTemplates(config, 'Mobile/note.md')).toEqual([]);
  });

  test('Carries through frontmatter-delete from a matched rule', () => {
    const config: SchemaConfig = {
      rules: [
        {
          match: 'quick-*.md',
          schema: { frontmatter: { type: 'quick' } },
          'frontmatter-delete': ['scratch']
        }
      ]
    };
    expect(selectTemplates(config, 'quick-foo.md')).toEqual([
      {
        schema: { frontmatter: { type: 'quick' } },
        frontmatterDelete: ['scratch']
      }
    ]);
  });

  test('Honors glob edge cases (single * does not cross /)', () => {
    const config: SchemaConfig = {
      rules: [
        { match: '*.md', schema: { 'body-file': './only-root.md' } },
        { schema: { 'body-file': './nested.md' } }
      ]
    };
    const rootHits = selectTemplates(config, 'note.md');
    expect(rootHits.map((r) => r.schema)).toEqual([
      { 'body-file': './only-root.md' },
      { 'body-file': './nested.md' }
    ]);
    const subHits = selectTemplates(config, 'sub/note.md');
    expect(subHits.map((r) => r.schema)).toEqual([{ 'body-file': './nested.md' }]);
  });

  test('Supports exact-filename rule', () => {
    const config: SchemaConfig = {
      rules: [
        { match: 'INDEX.md', schema: { 'body-file': './index.md' } }
      ]
    };
    expect(selectTemplates(config, 'INDEX.md')).toEqual([
      { schema: { 'body-file': './index.md' } }
    ]);
    expect(selectTemplates(config, 'foo/INDEX.md')).toEqual([]);
  });

  test('Supports `**/x` filename-anywhere rule', () => {
    const config: SchemaConfig = {
      rules: [{ match: '**/INDEX.md', schema: { 'body-file': './index.md' } }]
    };
    expect(selectTemplates(config, 'foo/bar/INDEX.md')).toEqual([
      { schema: { 'body-file': './index.md' } }
    ]);
  });

  test('Supports `?` single-character matching', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'log?.md', schema: { 'body-file': './log.md' } }]
    };
    expect(selectTemplates(config, 'log1.md')).toEqual([
      { schema: { 'body-file': './log.md' } }
    ]);
    expect(selectTemplates(config, 'log12.md')).toEqual([]);
  });

  test('A match list fires when any of its patterns matches', () => {
    const config: SchemaConfig = {
      rules: [
        {
          match: ['think/**', 'scratch/**'],
          schema: { frontmatter: { type: 'atom' } }
        }
      ]
    };
    expect(selectTemplates(config, 'think/idea.md')).toEqual([
      { schema: { frontmatter: { type: 'atom' } } }
    ]);
    expect(selectTemplates(config, 'scratch/note.md')).toEqual([
      { schema: { frontmatter: { type: 'atom' } } }
    ]);
    expect(selectTemplates(config, 'base/page.md')).toEqual([]);
  });

  test('A specific overlay layers on top of a general rule', () => {
    const config: SchemaConfig = {
      rules: [
        {
          match: ['inbox/**', 'source/**'],
          schema: { frontmatter: { id: '{{snowflake_id}}', title: null } }
        },
        {
          match: ['inbox/archive/**', 'source/archive/**'],
          schema: { frontmatter: { archived: '{{time}}' } }
        }
      ]
    };
    // Library item, no archive overlay.
    expect(selectTemplates(config, 'inbox/foo.md').map((r) => r.schema)).toEqual([
      { frontmatter: { id: '{{snowflake_id}}', title: null } }
    ]);
    // Archive item: both rules contribute.
    expect(
      selectTemplates(config, 'inbox/archive/foo.md').map((r) => r.schema)
    ).toEqual([
      { frontmatter: { id: '{{snowflake_id}}', title: null } },
      { frontmatter: { archived: '{{time}}' } }
    ]);
  });
});

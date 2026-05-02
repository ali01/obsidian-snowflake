/**
 * Tests for schema-resolver
 */

import { selectTemplate } from './schema-resolver';
import type { SchemaConfig } from './types';

describe('selectTemplate', () => {
  test('Returns null when there are no rules', () => {
    expect(selectTemplate({}, 'note.md')).toBeNull();
  });

  test('First matching rule wins', () => {
    const config: SchemaConfig = {
      rules: [
        { match: 'Web/**', schema: './web.md' },
        { match: 'Web/Admin/**', schema: './admin.md' }
      ]
    };
    expect(selectTemplate(config, 'Web/Admin/note.md')).toEqual({ schema: './web.md' });
  });

  test('Falls through to a trailing catch-all rule when no match fires', () => {
    const config: SchemaConfig = {
      rules: [
        { match: 'Web/**', schema: './web.md' },
        { schema: './note.md' }
      ]
    };
    expect(selectTemplate(config, 'Mobile/note.md')).toEqual({ schema: './note.md' });
  });

  test('Returns null when no rule matches and there is no catch-all', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'Web/**', schema: './web.md' }]
    };
    expect(selectTemplate(config, 'Mobile/note.md')).toBeNull();
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
    expect(selectTemplate(config, 'quick-foo.md')).toEqual({
      schema: { frontmatter: { type: 'quick' } },
      frontmatterDelete: ['scratch']
    });
  });

  test('Carries through frontmatter-delete from a catch-all rule', () => {
    const config: SchemaConfig = {
      rules: [{ schema: './note.md', 'frontmatter-delete': ['legacy'] }]
    };
    expect(selectTemplate(config, 'note.md')).toEqual({
      schema: './note.md',
      frontmatterDelete: ['legacy']
    });
  });

  test('Honors glob edge cases (single * does not cross /)', () => {
    const config: SchemaConfig = {
      rules: [
        { match: '*.md', schema: './only-root.md' },
        { schema: './nested.md' }
      ]
    };
    expect(selectTemplate(config, 'note.md')?.schema).toBe('./only-root.md');
    expect(selectTemplate(config, 'sub/note.md')?.schema).toBe('./nested.md');
  });

  test('Supports exact-filename rule', () => {
    const config: SchemaConfig = {
      rules: [
        { match: 'INDEX.md', schema: './index.md' },
        { schema: './note.md' }
      ]
    };
    expect(selectTemplate(config, 'INDEX.md')?.schema).toBe('./index.md');
    expect(selectTemplate(config, 'foo/INDEX.md')?.schema).toBe('./note.md');
  });

  test('Supports `**/x` filename-anywhere rule', () => {
    const config: SchemaConfig = {
      rules: [{ match: '**/INDEX.md', schema: './index.md' }]
    };
    expect(selectTemplate(config, 'foo/bar/INDEX.md')?.schema).toBe('./index.md');
  });

  test('Supports `?` single-character matching', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'log?.md', schema: './log.md' }]
    };
    expect(selectTemplate(config, 'log1.md')?.schema).toBe('./log.md');
    expect(selectTemplate(config, 'log12.md')).toBeNull();
  });
});

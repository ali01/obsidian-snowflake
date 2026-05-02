/**
 * Tests for schema-resolver
 */

import { selectTemplate } from './schema-resolver';
import type { SchemaConfig } from './types';

describe('selectTemplate', () => {
  test('Returns null when neither rules nor default is set', () => {
    expect(selectTemplate({}, 'note.md')).toBeNull();
  });

  test('First matching rule wins', () => {
    const config: SchemaConfig = {
      rules: [
        { match: 'Web/**', template: './web.md' },
        { match: 'Web/Admin/**', template: './admin.md' }
      ]
    };
    expect(selectTemplate(config, 'Web/Admin/note.md')).toEqual({ template: './web.md' });
  });

  test('Falls through to default when no rule matches', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'Web/**', template: './web.md' }],
      default: { template: './note.md' }
    };
    expect(selectTemplate(config, 'Mobile/note.md')).toEqual({ template: './note.md' });
  });

  test('Returns null when no rule matches and no default exists', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'Web/**', template: './web.md' }]
    };
    expect(selectTemplate(config, 'Mobile/note.md')).toBeNull();
  });

  test('Carries through frontmatter-delete from a rule', () => {
    const config: SchemaConfig = {
      rules: [
        {
          match: 'quick-*.md',
          template: { frontmatter: { type: 'quick' } },
          'frontmatter-delete': ['scratch']
        }
      ]
    };
    expect(selectTemplate(config, 'quick-foo.md')).toEqual({
      template: { frontmatter: { type: 'quick' } },
      frontmatterDelete: ['scratch']
    });
  });

  test('Carries through frontmatter-delete from default', () => {
    const config: SchemaConfig = {
      default: { template: './note.md', 'frontmatter-delete': ['legacy'] }
    };
    expect(selectTemplate(config, 'note.md')).toEqual({
      template: './note.md',
      frontmatterDelete: ['legacy']
    });
  });

  test('Honors glob edge cases (single * does not cross /)', () => {
    const config: SchemaConfig = {
      rules: [{ match: '*.md', template: './only-root.md' }],
      default: { template: './nested.md' }
    };
    expect(selectTemplate(config, 'note.md')?.template).toBe('./only-root.md');
    expect(selectTemplate(config, 'sub/note.md')?.template).toBe('./nested.md');
  });

  test('Supports exact-filename rule', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'INDEX.md', template: './index.md' }],
      default: { template: './note.md' }
    };
    expect(selectTemplate(config, 'INDEX.md')?.template).toBe('./index.md');
    expect(selectTemplate(config, 'foo/INDEX.md')?.template).toBe('./note.md');
  });

  test('Supports `**/x` filename-anywhere rule', () => {
    const config: SchemaConfig = {
      rules: [{ match: '**/INDEX.md', template: './index.md' }]
    };
    expect(selectTemplate(config, 'foo/bar/INDEX.md')?.template).toBe('./index.md');
  });

  test('Supports `?` single-character matching', () => {
    const config: SchemaConfig = {
      rules: [{ match: 'log?.md', template: './log.md' }]
    };
    expect(selectTemplate(config, 'log1.md')?.template).toBe('./log.md');
    expect(selectTemplate(config, 'log12.md')).toBeNull();
  });
});

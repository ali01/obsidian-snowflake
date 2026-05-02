/**
 * Tests for schema-parser
 */

import { parseSchema } from './schema-parser';

describe('parseSchema', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('Returns empty config for empty / whitespace YAML', () => {
    expect(parseSchema('')).toEqual({});
    expect(parseSchema('   \n  ')).toEqual({});
  });

  test('Parses a simple default-only schema with external template', () => {
    const yaml = `
default:
  template: ./note.md
`;
    expect(parseSchema(yaml)).toEqual({
      default: { template: './note.md' }
    });
  });

  test('Parses an inline default template', () => {
    const yaml = `
default:
  template:
    frontmatter:
      type: note
      tags: [a, b]
    body: |
      # {{title}}
`;
    const result = parseSchema(yaml);
    expect(result).toEqual({
      default: {
        template: {
          frontmatter: { type: 'note', tags: ['a', 'b'] },
          body: '# {{title}}\n'
        }
      }
    });
  });

  test('Parses rules with mixed inline and external templates', () => {
    const yaml = `
rules:
  - match: "Web/**"
    template: ./web.md
  - match: "**/quick-*.md"
    template:
      frontmatter:
        type: quick
      body: "# {{title}}"
    frontmatter-delete: [scratch]
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        { match: 'Web/**', template: './web.md' },
        {
          match: '**/quick-*.md',
          template: { frontmatter: { type: 'quick' }, body: '# {{title}}' },
          'frontmatter-delete': ['scratch']
        }
      ]
    });
  });

  test('Parses top-level exclude list', () => {
    const yaml = `
exclude:
  - MEETINGS.md
  - Archive/
  - "**/*.tmp"
default:
  template: ./note.md
`;
    expect(parseSchema(yaml)).toEqual({
      exclude: ['MEETINGS.md', 'Archive/', '**/*.tmp'],
      default: { template: './note.md' }
    });
  });

  test('Drops blank entries from string lists', () => {
    const yaml = `
exclude:
  - "first"
  - ""
  - "  "
  - "second"
`;
    expect(parseSchema(yaml)).toEqual({ exclude: ['first', 'second'] });
  });

  test('Returns null and warns on malformed YAML', () => {
    const result = parseSchema('rules: [\n  - match');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  test('Returns null when top level is not a mapping', () => {
    expect(parseSchema('- a\n- b')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  test('Rejects rules that are not a list', () => {
    expect(parseSchema('rules: "not a list"')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  test('Rejects a rule missing match', () => {
    expect(
      parseSchema(`
rules:
  - template: ./web.md
`)
    ).toBeNull();
  });

  test('Rejects a rule with empty match', () => {
    expect(
      parseSchema(`
rules:
  - match: ""
    template: ./web.md
`)
    ).toBeNull();
  });

  test('Rejects a template block missing template', () => {
    expect(
      parseSchema(`
default:
  frontmatter-delete: [foo]
`)
    ).toBeNull();
  });

  test('Rejects a template that is neither string nor mapping', () => {
    expect(
      parseSchema(`
default:
  template: 42
`)
    ).toBeNull();
  });

  test('Rejects an inline template with non-mapping frontmatter', () => {
    expect(
      parseSchema(`
default:
  template:
    frontmatter: [a, b]
    body: ""
`)
    ).toBeNull();
  });

  test('Rejects an inline template with non-string body', () => {
    expect(
      parseSchema(`
default:
  template:
    body: 42
`)
    ).toBeNull();
  });

  test('Rejects empty external template path', () => {
    expect(
      parseSchema(`
default:
  template: ""
`)
    ).toBeNull();
  });

  test('Rejects frontmatter-delete that is not a list', () => {
    expect(
      parseSchema(`
default:
  template: ./note.md
  frontmatter-delete: "foo"
`)
    ).toBeNull();
  });

  test('Rejects frontmatter-delete entries that are not strings', () => {
    expect(
      parseSchema(`
default:
  template: ./note.md
  frontmatter-delete: [foo, 1]
`)
    ).toBeNull();
  });

  test('Includes the schema path in warning messages', () => {
    parseSchema('rules: "x"', 'Projects/.schema.yaml');
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('Projects/.schema.yaml');
  });
});

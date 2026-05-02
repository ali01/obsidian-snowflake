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

  test('Parses a single catch-all rule with external schema', () => {
    const yaml = `
rules:
  - schema: ./note.md
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [{ schema: './note.md' }]
    });
  });

  test('Parses a single catch-all rule with inline schema', () => {
    const yaml = `
rules:
  - schema:
      frontmatter:
        type: note
        tags: [a, b]
      body: |
        # {{title}}
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        {
          schema: {
            frontmatter: { type: 'note', tags: ['a', 'b'] },
            body: '# {{title}}\n'
          }
        }
      ]
    });
  });

  test('Parses rules with mixed inline and external schemas', () => {
    const yaml = `
rules:
  - match: "Web/**"
    schema: ./web.md
  - match: "**/quick-*.md"
    schema:
      frontmatter:
        type: quick
      body: "# {{title}}"
    frontmatter-delete: [scratch]
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        { match: 'Web/**', schema: './web.md' },
        {
          match: '**/quick-*.md',
          schema: { frontmatter: { type: 'quick' }, body: '# {{title}}' },
          'frontmatter-delete': ['scratch']
        }
      ]
    });
  });

  test('Parses matched rules followed by a catch-all rule', () => {
    const yaml = `
rules:
  - match: "Web/**"
    schema: ./web.md
  - schema: ./note.md
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        { match: 'Web/**', schema: './web.md' },
        { schema: './note.md' }
      ]
    });
  });

  test('Parses top-level exclude list', () => {
    const yaml = `
exclude:
  - MEETINGS.md
  - Archive/
  - "**/*.tmp"
rules:
  - schema: ./note.md
`;
    expect(parseSchema(yaml)).toEqual({
      exclude: ['MEETINGS.md', 'Archive/', '**/*.tmp'],
      rules: [{ schema: './note.md' }]
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

  test('Warns when a rule appears after a catch-all', () => {
    const yaml = `
rules:
  - schema: ./note.md
  - match: "Web/**"
    schema: ./web.md
`;
    const result = parseSchema(yaml);
    expect(result?.rules).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unreachable'));
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

  test('Rejects a rule with empty match', () => {
    expect(
      parseSchema(`
rules:
  - match: ""
    schema: ./web.md
`)
    ).toBeNull();
  });

  test('Rejects a rule missing schema', () => {
    expect(
      parseSchema(`
rules:
  - match: "**"
    frontmatter-delete: [foo]
`)
    ).toBeNull();
  });

  test('Rejects a schema value that is neither string nor mapping', () => {
    expect(
      parseSchema(`
rules:
  - schema: 42
`)
    ).toBeNull();
  });

  test('Rejects an inline schema with non-mapping frontmatter', () => {
    expect(
      parseSchema(`
rules:
  - schema:
      frontmatter: [a, b]
      body: ""
`)
    ).toBeNull();
  });

  test('Rejects an inline schema with non-string body', () => {
    expect(
      parseSchema(`
rules:
  - schema:
      body: 42
`)
    ).toBeNull();
  });

  test('Rejects empty external schema path', () => {
    expect(
      parseSchema(`
rules:
  - schema: ""
`)
    ).toBeNull();
  });

  test('Rejects frontmatter-delete that is not a list', () => {
    expect(
      parseSchema(`
rules:
  - schema: ./note.md
    frontmatter-delete: "foo"
`)
    ).toBeNull();
  });

  test('Rejects frontmatter-delete entries that are not strings', () => {
    expect(
      parseSchema(`
rules:
  - schema: ./note.md
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

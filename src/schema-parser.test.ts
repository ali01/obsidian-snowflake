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

  test('Parses inline schema with body-file reference', () => {
    const yaml = `
rules:
  - schema:
      frontmatter:
        type: note
      body-file: ./body.md
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        {
          schema: {
            frontmatter: { type: 'note' },
            'body-file': './body.md'
          }
        }
      ]
    });
  });

  test('Parses rules with mixed inline-body and body-file schemas', () => {
    const yaml = `
rules:
  - match: "Web/**"
    schema:
      frontmatter:
        type: web
      body-file: ./web.md
  - match: "**/quick-*.md"
    schema:
      frontmatter:
        type: quick
      body: "# {{title}}"
    frontmatter-delete: [scratch]
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        {
          match: 'Web/**',
          schema: { frontmatter: { type: 'web' }, 'body-file': './web.md' }
        },
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
    schema:
      frontmatter:
        type: web
  - schema:
      frontmatter:
        type: note
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        { match: 'Web/**', schema: { frontmatter: { type: 'web' } } },
        { schema: { frontmatter: { type: 'note' } } }
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
  - schema:
      frontmatter:
        type: note
`;
    expect(parseSchema(yaml)).toEqual({
      exclude: ['MEETINGS.md', 'Archive/', '**/*.tmp'],
      rules: [{ schema: { frontmatter: { type: 'note' } } }]
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

  test('Allows specific rules after a catch-all (overlay model)', () => {
    const yaml = `
rules:
  - schema:
      frontmatter:
        type: note
  - match: "Web/**"
    schema:
      frontmatter:
        type: web
`;
    const result = parseSchema(yaml);
    expect(result?.rules).toHaveLength(2);
    // No "unreachable" warning — second rule is now an overlay on top of
    // the catch-all base.
    const messages = warnSpy.mock.calls.map((c) => c[0] as string);
    for (const m of messages) {
      expect(m).not.toContain('unreachable');
    }
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
    schema:
      frontmatter:
        type: note
`)
    ).toBeNull();
  });

  test('Parses a match list (multiple patterns share one schema)', () => {
    const yaml = `
rules:
  - match: ["think/**", "scratch/**"]
    schema:
      frontmatter:
        type: atom
`;
    expect(parseSchema(yaml)).toEqual({
      rules: [
        {
          match: ['think/**', 'scratch/**'],
          schema: { frontmatter: { type: 'atom' } }
        }
      ]
    });
  });

  test('Rejects an empty match list', () => {
    expect(
      parseSchema(`
rules:
  - match: []
    schema:
      frontmatter:
        type: note
`)
    ).toBeNull();
  });

  test('Rejects a match list whose entries are not non-empty strings', () => {
    expect(
      parseSchema(`
rules:
  - match: ["ok", ""]
    schema:
      frontmatter:
        type: note
`)
    ).toBeNull();
    expect(
      parseSchema(`
rules:
  - match: ["ok", 1]
    schema:
      frontmatter:
        type: note
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

  test('Rejects schema given as a bare string (frontmatter must be inline)', () => {
    expect(
      parseSchema(`
rules:
  - schema: ./note.md
`)
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('must be a mapping'));
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

  test('Rejects body-file that is empty or non-string', () => {
    expect(
      parseSchema(`
rules:
  - schema:
      body-file: ""
`)
    ).toBeNull();
    expect(
      parseSchema(`
rules:
  - schema:
      body-file: 42
`)
    ).toBeNull();
  });

  test('Rejects setting both body and body-file on the same schema', () => {
    expect(
      parseSchema(`
rules:
  - schema:
      body: "# inline"
      body-file: ./body.md
`)
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cannot set both `body` and `body-file`')
    );
  });

  test('Rejects frontmatter-delete that is not a list', () => {
    expect(
      parseSchema(`
rules:
  - schema:
      frontmatter:
        type: note
    frontmatter-delete: "foo"
`)
    ).toBeNull();
  });

  test('Rejects frontmatter-delete entries that are not strings', () => {
    expect(
      parseSchema(`
rules:
  - schema:
      frontmatter:
        type: note
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

/**
 * Tests for Template Loader
 *
 * The loader reads `.schema.yaml` (or `.schema/schema.yaml`) at each folder
 * level, evaluates `exclude:` and the rule resolver, and produces a chain of
 * resolved templates. Frontmatter always lives in the inline schema; bodies
 * may be inline or loaded from a body-only `.md` file via `body-file:`.
 */

import { TemplateLoader, TemplateLoaderTestUtils } from './template-loader';
import { Vault, TFile } from 'obsidian';
import { MarkdownFile } from './types';

jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian');
  return {
    ...actual,
    TFile: class MockTFile {
      public path: string;
      public name: string;
      public basename: string;
      public extension: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      public parent: any;

      constructor() {
        this.path = '';
        this.name = '';
        this.basename = '';
        this.extension = '';
        this.parent = null;
      }
    }
  };
});

class MockVault {
  private files: Map<string, { content: string; file: TFile }> = new Map();

  public adapter = {
    exists: async (path: string): Promise<boolean> => this.files.has(path),
    read: async (path: string): Promise<string> => {
      const entry = this.files.get(path);
      if (!entry) throw new Error('File not found');
      return entry.content;
    }
  };

  public addFile(path: string, content = ''): void {
    const file = new TFile();
    file.path = path;
    const name = path.split('/').pop() ?? '';
    file.name = name;
    file.basename = name.replace(/\.md$/, '');
    file.extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
    this.files.set(path, { content, file });
  }

  public getAbstractFileByPath(path: string): TFile | null {
    const entry = this.files.get(path);
    return entry ? entry.file : null;
  }

  public async read(file: TFile): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error('File not found');
    return entry.content;
  }
}

function makeFile(path: string): MarkdownFile {
  const folderPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
  const name = path.split('/').pop() ?? '';
  return {
    basename: name.replace(/\.md$/, ''),
    name,
    path,
    extension: 'md',
    parent: { path: folderPath }
  } as unknown as MarkdownFile;
}

describe('TemplateLoader', () => {
  let mockVault: MockVault;
  let loader: TemplateLoader;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockVault = new MockVault();
    loader = new TemplateLoader(mockVault as unknown as Vault);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('loadTemplate', () => {
    test('Loads existing template content', async () => {
      mockVault.addFile('Templates/note.md', '# Note');
      const content = await loader.loadTemplate('Templates/note.md');
      expect(content).toBe('# Note');
    });

    test('Returns null for non-existent template', async () => {
      const content = await loader.loadTemplate('Missing/note.md');
      expect(content).toBeNull();
    });
  });

  describe('getTemplateChain', () => {
    test('Returns empty chain when no schema exists', async () => {
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(0);
      expect(chain.hasInheritance).toBe(false);
    });

    test('Picks the catch-all template when no match-pattern fires', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - schema:
      frontmatter:
        type: project
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].schemaPath).toBe('Projects/.schema.yaml');
      expect(chain.templates[0].folderPath).toBe('Projects');
      expect(chain.templates[0].templateAnchor).toBe('Projects');
      expect(chain.templates[0].resolvedTemplate.schema).toEqual({
        frontmatter: { type: 'project' }
      });
    });

    test('Returns one chain item per matching rule, in declaration order', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - match: "Web/**"
    schema:
      frontmatter:
        type: web
  - match: "Mobile/**"
    schema:
      frontmatter:
        type: mobile
  - schema:
      frontmatter:
        type: project
`
      );
      // Catch-all + Web/** overlay both fire for a Web file.
      const webChain = await loader.getTemplateChain(makeFile('Projects/Web/Frontend/note.md'));
      expect(webChain.templates.map((t) => t.resolvedTemplate.schema)).toEqual([
        { frontmatter: { type: 'web' } },
        { frontmatter: { type: 'project' } }
      ]);

      // Catch-all only for an unmatched path.
      const fallbackChain = await loader.getTemplateChain(makeFile('Projects/Other/note.md'));
      expect(fallbackChain.templates.map((t) => t.resolvedTemplate.schema)).toEqual([
        { frontmatter: { type: 'project' } }
      ]);
    });

    test('Overlay rule layers extra fields on top of a general rule', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - match: ["inbox/**", "source/**"]
    schema:
      frontmatter:
        id: "{{snowflake_id}}"
        title:
  - match: ["inbox/archive/**", "source/archive/**"]
    schema:
      frontmatter:
        archived: "{{time}}"
`
      );
      const archiveChain = await loader.getTemplateChain(
        makeFile('Projects/inbox/archive/foo.md')
      );
      expect(archiveChain.templates.map((t) => t.resolvedTemplate.schema)).toEqual([
        { frontmatter: { id: '{{snowflake_id}}', title: null } },
        { frontmatter: { archived: '{{time}}' } }
      ]);

      const loaded = await loader.loadTemplateChain(archiveChain);
      const merged = loaded.templates.map((t) => t.content!).join('\n');
      expect(merged).toContain('id:');
      expect(merged).toContain('title:');
      expect(merged).toContain('archived:');
    });

    test('Inherits from ancestor schemas root → leaf', async () => {
      mockVault.addFile(
        '.schema.yaml',
        `rules:\n  - schema:\n      frontmatter:\n        scope: root\n`
      );
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:\n  - schema:\n      frontmatter:\n        scope: project\n`
      );
      mockVault.addFile(
        'Projects/Web/.schema.yaml',
        `rules:\n  - schema:\n      frontmatter:\n        scope: web\n`
      );

      const chain = await loader.getTemplateChain(makeFile('Projects/Web/Frontend/note.md'));
      expect(chain.templates).toHaveLength(3);
      expect(chain.hasInheritance).toBe(true);
      expect(chain.templates.map((t) => t.depth)).toEqual([0, 1, 2]);
      expect(chain.templates.map((t) => t.folderPath)).toEqual(['', 'Projects', 'Projects/Web']);
    });

    test('Schema with no matching rule contributes nothing', async () => {
      mockVault.addFile(
        '.schema.yaml',
        `rules:\n  - schema:\n      frontmatter:\n        scope: root\n`
      );
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - match: "Special/**"
    schema:
      frontmatter:
        scope: special
`
      );

      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].folderPath).toBe('');
    });

    test('Hard exclude short-circuits the entire chain', async () => {
      mockVault.addFile(
        '.schema.yaml',
        `rules:\n  - schema:\n      frontmatter:\n        scope: root\n`
      );
      mockVault.addFile(
        'Projects/.schema.yaml',
        `exclude:
  - MEETINGS.md
  - Archive/
rules:
  - schema:
      frontmatter:
        scope: project
`
      );

      // Bare-filename pattern matches at any depth below the schema folder.
      expect(
        (await loader.getTemplateChain(makeFile('Projects/Web/MEETINGS.md'))).templates
      ).toHaveLength(0);

      // Directory pattern excludes everything under the dir.
      expect(
        (await loader.getTemplateChain(makeFile('Projects/Archive/2024/note.md'))).templates
      ).toHaveLength(0);

      // Unrelated files still pick up both root and project schemas.
      const normal = await loader.getTemplateChain(makeFile('Projects/Web/note.md'));
      expect(normal.templates).toHaveLength(2);
    });

    test('Folder form (.schema/schema.yaml) is preferred when both forms exist', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:\n  - schema:\n      frontmatter:\n        scope: flat\n`
      );
      mockVault.addFile(
        'Projects/.schema/schema.yaml',
        `rules:\n  - schema:\n      frontmatter:\n        scope: folder\n`
      );

      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].schemaPath).toBe('Projects/.schema/schema.yaml');
      expect(chain.templates[0].templateAnchor).toBe('Projects/.schema');
    });

    test('Malformed schema is skipped with a warning', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - match
` // intentionally malformed list item
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('loadTemplateChain', () => {
    test('Materializes inline templates into frontmatter+body strings', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - schema:
      frontmatter:
        type: project
        tags: [project]
      body: |
        # {{title}}
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);

      expect(loaded.templates).toHaveLength(1);
      const content = loaded.templates[0].content;
      expect(content).toBeDefined();
      expect(content).toContain('---');
      expect(content).toContain('type: project');
      expect(content).toContain('tags:');
      expect(content).toContain('# {{title}}');
    });

    test('Loads body-file content and pairs it with inline frontmatter', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - schema:
      frontmatter:
        type: web
      body-file: ./web.md
`
      );
      mockVault.addFile('Projects/web.md', '# Web project\n');
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);

      expect(loaded.templates).toHaveLength(1);
      const content = loaded.templates[0].content!;
      expect(content).toContain('type: web');
      expect(content).toContain('# Web project');
    });

    test('Resolves body-file paths relative to .schema/ when in folder form', async () => {
      mockVault.addFile(
        'Projects/.schema/schema.yaml',
        `rules:
  - schema:
      frontmatter:
        type: web
      body-file: ./web.md
`
      );
      mockVault.addFile('Projects/.schema/web.md', '# Web body\n');
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);

      expect(loaded.templates).toHaveLength(1);
      expect(loaded.templates[0].content).toContain('type: web');
      expect(loaded.templates[0].content).toContain('# Web body');
    });

    test('Rejects a body-file that contains frontmatter', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - schema:
      frontmatter:
        type: web
      body-file: ./web.md
`
      );
      mockVault.addFile(
        'Projects/web.md',
        `---\ntype: web\n---\n# Web body\n`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);

      expect(loaded.templates).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('must not contain frontmatter')
      );
    });

    test('Injects rule frontmatter-delete as a delete: list', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - schema:
      frontmatter:
        type: project
    frontmatter-delete: [legacy]
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);

      expect(loaded.templates[0].content).toContain('delete:');
      expect(loaded.templates[0].content).toContain('legacy');
    });

    test('Skips chain items whose body-file is missing', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - schema:
      frontmatter:
        type: project
      body-file: ./missing.md
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);
      expect(loaded.templates).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping missing template in chain')
      );
    });

    test('Handles empty chain', async () => {
      const loaded = await loader.loadTemplateChain({ templates: [], hasInheritance: false });
      expect(loaded.templates).toHaveLength(0);
    });
  });

  describe('test-only utilities', () => {
    test('relativeTo strips the anchor prefix', () => {
      expect(TemplateLoaderTestUtils.relativeTo('Projects/Web/note.md', 'Projects')).toBe(
        'Web/note.md'
      );
      expect(TemplateLoaderTestUtils.relativeTo('Projects/note.md', '')).toBe('Projects/note.md');
    });

    test('resolveTemplatePath handles relative, leading-slash, and ../ refs', () => {
      expect(TemplateLoaderTestUtils.resolveTemplatePath('./web.md', 'Projects')).toBe(
        'Projects/web.md'
      );
      expect(TemplateLoaderTestUtils.resolveTemplatePath('web.md', 'Projects')).toBe(
        'Projects/web.md'
      );
      expect(TemplateLoaderTestUtils.resolveTemplatePath('/Templates/x.md', 'Projects')).toBe(
        'Templates/x.md'
      );
      expect(TemplateLoaderTestUtils.resolveTemplatePath('../shared/x.md', 'Projects/Web')).toBe(
        'Projects/shared/x.md'
      );
      expect(TemplateLoaderTestUtils.resolveTemplatePath('../../etc.md', 'A')).toBeNull();
    });

    test('serializeInlineSchema produces frontmatter+body', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        { frontmatter: { type: 'note', tags: ['a'] }, body: '# Hello' },
        undefined
      );
      expect(out).toMatch(/^---\n/);
      expect(out).toContain('type: note');
      expect(out).toContain('# Hello');
    });

    test('serializeInlineSchema renders null fields as empty placeholders', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        { frontmatter: { related: null, category: null } },
        undefined
      );
      expect(out).toContain('related:');
      expect(out).toContain('category:');
      expect(out).not.toContain('null');
    });

    test('serializeInlineSchema adds delete list when frontmatter-delete is set', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        { frontmatter: { type: 'note' } },
        ['legacy', 'old-field']
      );
      expect(out).toContain('delete:');
      expect(out).toContain('legacy');
    });
  });

  describe('field spec extraction', () => {
    test('Field with structured spec materializes as default', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        {
          frontmatter: {
            id: { type: 'id', default: '{{snowflake_id}}', length: 10 }
          }
        },
        undefined
      );
      expect(out).toContain('id: ');
      expect(out).toContain('{{snowflake_id}}');
      expect(out).not.toContain('type:');
      expect(out).not.toContain('length:');
    });

    test('Field with structured spec but no default materializes as empty', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        {
          frontmatter: {
            kind: {
              type: 'enum',
              values: ['article', 'book', 'paper']
            }
          }
        },
        undefined
      );
      expect(out).toContain('kind:');
      expect(out).not.toContain('type:');
      expect(out).not.toContain('values:');
      expect(out).not.toContain('article');
    });

    test('Field with literal value passes through unchanged', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        {
          frontmatter: {
            description: 'default text',
            tags: ['auto', 'draft'],
            ref: '{{snowflake_id}}'
          }
        },
        undefined
      );
      expect(out).toContain('description: default text');
      expect(out).toMatch(/tags:\s*\n\s*-\s*auto\s*\n\s*-\s*draft/);
      expect(out).toContain('{{snowflake_id}}');
    });

    test('$contract and other $-prefixed keys never leak into output', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        {
          frontmatter: {
            priority: {
              type: 'enum',
              values: [1, 2, 3],
              optional: true,
              $contract: 'Inbox-only triage. 1 = read soon.'
            },
            $loose: 'should not appear'
          }
        },
        undefined
      );
      expect(out).not.toContain('$contract');
      expect(out).not.toContain('Inbox-only');
      expect(out).not.toContain('$loose');
      expect(out).not.toContain('should not appear');
      expect(out).toContain('priority:');
    });

    test('Mixed literal and structured fields in the same frontmatter block', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        {
          frontmatter: {
            id: { type: 'id', default: 'x8K2n5pQ7A' },
            title: null,
            kind: { type: 'enum', values: ['article'] },
            tags: ['auto']
          }
        },
        undefined
      );
      expect(out).toContain('id: x8K2n5pQ7A');
      expect(out).toContain('title:');
      expect(out).toContain('kind:');
      expect(out).toMatch(/tags:\s*\n\s*-\s*auto/);
    });

    test('Structured spec inside body-file flow is unchanged (frontmatter-only feature)', () => {
      // body-file references a body-only .md; the inline frontmatter still
      // applies the spec extraction. This is the same code path; the test
      // just confirms structured specs and body-file coexist.
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        {
          frontmatter: {
            id: { type: 'id', default: '{{snowflake_id}}' }
          },
          body: '# {{title}}\nbody content'
        },
        undefined
      );
      expect(out).toContain('{{snowflake_id}}');
      expect(out).toContain('# {{title}}');
      expect(out).toContain('body content');
    });

    test('fieldDefault: structured spec returns default', () => {
      expect(
        TemplateLoaderTestUtils.fieldDefault({
          type: 'string',
          default: 'hello'
        })
      ).toBe('hello');
    });

    test('fieldDefault: structured spec without default returns null', () => {
      expect(
        TemplateLoaderTestUtils.fieldDefault({
          type: 'enum',
          values: ['a', 'b']
        })
      ).toBeNull();
    });

    test('fieldDefault: literal scalar passes through', () => {
      expect(TemplateLoaderTestUtils.fieldDefault('foo')).toBe('foo');
      expect(TemplateLoaderTestUtils.fieldDefault(42)).toBe(42);
      expect(TemplateLoaderTestUtils.fieldDefault(null)).toBeNull();
    });

    test('fieldDefault: $-only mapping treated as spec', () => {
      // A mapping that only has $-prefixed keys (no SPEC_KEYS) is still a
      // spec — meta keys count as a spec marker.
      expect(
        TemplateLoaderTestUtils.fieldDefault({
          $contract: 'just a note'
        })
      ).toBeNull();
    });

    test('fieldDefault: literal mapping with no spec keys passes through', () => {
      const literal = { foo: 'bar', count: 3 };
      expect(TemplateLoaderTestUtils.fieldDefault(literal)).toEqual(literal);
    });

    test('stripMetaKeys: removes $-prefixed keys recursively', () => {
      const input = {
        keep: 1,
        $contract: 'drop',
        nested: {
          also_keep: 2,
          $note: 'drop',
          deeper: { $hidden: 'drop', visible: true }
        },
        list: [{ $meta: 'drop', x: 1 }, 'untouched']
      };
      expect(TemplateLoaderTestUtils.stripMetaKeys(input)).toEqual({
        keep: 1,
        nested: {
          also_keep: 2,
          deeper: { visible: true }
        },
        list: [{ x: 1 }, 'untouched']
      });
    });
  });
});

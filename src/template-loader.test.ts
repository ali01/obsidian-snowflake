/**
 * Tests for Template Loader
 *
 * The loader now reads `.schema.yaml` (or `.schema/schema.yaml`) at each
 * folder level, evaluates `exclude:` and the rule resolver, and produces a
 * chain of resolved templates. `getTemplateChain` is async because it reads
 * schema YAML files from the vault.
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
  - schema: ./project.md
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].schemaPath).toBe('Projects/.schema.yaml');
      expect(chain.templates[0].folderPath).toBe('Projects');
      expect(chain.templates[0].templateAnchor).toBe('Projects');
      expect(chain.templates[0].resolvedTemplate.schema).toBe('./project.md');
    });

    test('Routes by first matching rule', async () => {
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - match: "Web/**"
    schema: ./web.md
  - match: "Mobile/**"
    schema: ./mobile.md
  - schema: ./project.md
`
      );
      const webChain = await loader.getTemplateChain(makeFile('Projects/Web/Frontend/note.md'));
      expect(webChain.templates[0].resolvedTemplate.schema).toBe('./web.md');

      const mobileChain = await loader.getTemplateChain(makeFile('Projects/Mobile/iOS/note.md'));
      expect(mobileChain.templates[0].resolvedTemplate.schema).toBe('./mobile.md');

      const fallbackChain = await loader.getTemplateChain(makeFile('Projects/Other/note.md'));
      expect(fallbackChain.templates[0].resolvedTemplate.schema).toBe('./project.md');
    });

    test('Inherits from ancestor schemas root → leaf', async () => {
      mockVault.addFile('.schema.yaml', `rules:\n  - schema: ./root.md\n`);
      mockVault.addFile('Projects/.schema.yaml', `rules:\n  - schema: ./project.md\n`);
      mockVault.addFile('Projects/Web/.schema.yaml', `rules:\n  - schema: ./web.md\n`);

      const chain = await loader.getTemplateChain(makeFile('Projects/Web/Frontend/note.md'));
      expect(chain.templates).toHaveLength(3);
      expect(chain.hasInheritance).toBe(true);
      expect(chain.templates.map((t) => t.depth)).toEqual([0, 1, 2]);
      expect(chain.templates.map((t) => t.folderPath)).toEqual(['', 'Projects', 'Projects/Web']);
    });

    test('Schema with no matching rule contributes nothing', async () => {
      mockVault.addFile('.schema.yaml', `rules:\n  - schema: ./root.md\n`);
      mockVault.addFile(
        'Projects/.schema.yaml',
        `rules:
  - match: "Special/**"
    schema: ./special.md
`
      );

      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].folderPath).toBe('');
    });

    test('Hard exclude short-circuits the entire chain', async () => {
      mockVault.addFile('.schema.yaml', `rules:\n  - schema: ./root.md\n`);
      mockVault.addFile(
        'Projects/.schema.yaml',
        `exclude:
  - MEETINGS.md
  - Archive/
rules:
  - schema: ./project.md
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
      mockVault.addFile('Projects/.schema.yaml', `rules:\n  - schema: ./flat.md\n`);
      mockVault.addFile('Projects/.schema/schema.yaml', `rules:\n  - schema: ./folder.md\n`);

      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].schemaPath).toBe('Projects/.schema/schema.yaml');
      expect(chain.templates[0].templateAnchor).toBe('Projects/.schema');
    });

    test('.schema.md shorthand applies the file itself as the catch-all template', async () => {
      mockVault.addFile(
        'Projects/.schema.md',
        `---
type: project
---
# {{title}}
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].schemaPath).toBe('Projects/.schema.md');
      expect(chain.templates[0].resolvedTemplate.schema).toBe('/Projects/.schema.md');

      const loaded = await loader.loadTemplateChain(chain);
      expect(loaded.templates[0].content).toContain('type: project');
      expect(loaded.templates[0].content).toContain('# {{title}}');
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

    test('Loads external template content via path resolution', async () => {
      mockVault.addFile('Projects/.schema.yaml', `rules:\n  - schema: ./web.md\n`);
      mockVault.addFile(
        'Projects/web.md',
        `---
type: web
---
# Web project
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);

      expect(loaded.templates).toHaveLength(1);
      expect(loaded.templates[0].content).toContain('type: web');
      expect(loaded.templates[0].content).toContain('# Web project');
    });

    test('Resolves external paths relative to .schema/ when in folder form', async () => {
      mockVault.addFile('Projects/.schema/schema.yaml', `rules:\n  - schema: ./web.md\n`);
      mockVault.addFile(
        'Projects/.schema/web.md',
        `---
type: web
---
body
`
      );
      const chain = await loader.getTemplateChain(makeFile('Projects/note.md'));
      const loaded = await loader.loadTemplateChain(chain);

      expect(loaded.templates).toHaveLength(1);
      expect(loaded.templates[0].content).toContain('type: web');
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

    test('Skips chain items whose external template is missing', async () => {
      mockVault.addFile('Projects/.schema.yaml', `rules:\n  - schema: ./missing.md\n`);
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

    test('serializeInlineSchema adds delete list when frontmatter-delete is set', () => {
      const out = TemplateLoaderTestUtils.serializeInlineSchema(
        { frontmatter: { type: 'note' } },
        ['legacy', 'old-field']
      );
      expect(out).toContain('delete:');
      expect(out).toContain('legacy');
    });

    test('injectDeleteList appends to existing frontmatter', () => {
      const original = `---
type: note
---
body`;
      const out = TemplateLoaderTestUtils.injectDeleteList(original, ['legacy']);
      expect(out).toContain('type: note');
      expect(out).toContain('delete: [legacy]');
      expect(out).toContain('body');
    });

    test('injectDeleteList adds a frontmatter block when none exists', () => {
      const out = TemplateLoaderTestUtils.injectDeleteList('# heading', ['legacy']);
      expect(out.startsWith('---\n')).toBe(true);
      expect(out).toContain('delete: [legacy]');
      expect(out).toContain('# heading');
    });
  });
});

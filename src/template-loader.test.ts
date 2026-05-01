/**
 * Tests for Template Loader
 *
 * The loader resolves SCHEMA.md inheritance chains: walking the folder tree
 * root → leaf and collecting every ancestor folder's SCHEMA.md (when one
 * exists in the vault).
 */

import { TemplateLoader, TemplateLoaderTestUtils } from './template-loader';
import { Vault, TFile, TFolder } from 'obsidian';
import { SnowflakeSettings, MarkdownFile } from './types';

jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian');
  return {
    ...actual,
    TFile: class MockTFile {
      path: string;
      name: string;
      basename: string;
      extension: string;
      parent: any;

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

class MockVault implements Partial<Vault> {
  private files: Map<string, { content: string; file: TFile }> = new Map();

  addFile(path: string, content: string) {
    const file = new TFile();
    file.path = path;
    const name = path.split('/').pop() ?? '';
    file.name = name;
    file.basename = name.replace(/\.md$/, '');
    file.extension = 'md';
    file.parent = Object.assign(new TFolder(), {
      path: path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''
    });
    this.files.set(path, { content, file });
  }

  getAbstractFileByPath(path: string): TFile | null {
    const entry = this.files.get(path);
    return entry ? entry.file : null;
  }

  async read(file: TFile): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error('File not found');
    return entry.content;
  }

  async modify(file: TFile, content: string): Promise<void> {
    const entry = this.files.get(file.path);
    if (entry) {
      entry.content = content;
    }
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
  let settings: SnowflakeSettings;
  let loader: TemplateLoader;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockVault = new MockVault();
    settings = {
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm',
      globalExcludePatterns: []
    };
    loader = new TemplateLoader(mockVault as unknown as Vault, settings);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('loadTemplate', () => {
    test('Should load existing template', async () => {
      mockVault.addFile('Projects/SCHEMA.md', '# Project Template');
      const content = await loader.loadTemplate('Projects/SCHEMA.md');
      expect(content).toBe('# Project Template');
    });

    test('Should return null for non-existent template', async () => {
      const content = await loader.loadTemplate('Missing/SCHEMA.md');
      expect(content).toBeNull();
    });

    test('Should handle errors gracefully', async () => {
      const errorFile = { path: 'error.md' } as TFile;
      jest.spyOn(mockVault, 'getAbstractFileByPath').mockReturnValueOnce(errorFile);
      jest.spyOn(mockVault, 'read').mockRejectedValueOnce(new Error('Read error'));

      const content = await loader.loadTemplate('error.md');
      expect(content).toBeNull();
    });
  });

  describe('getTemplateChain', () => {
    test('Should return empty chain when no SCHEMA.md exists', () => {
      const chain = loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(0);
      expect(chain.hasInheritance).toBe(false);
    });

    test('Should return single template when only the immediate parent has a SCHEMA.md', () => {
      mockVault.addFile('Projects/SCHEMA.md', '# Project');
      const chain = loader.getTemplateChain(makeFile('Projects/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0]).toEqual({
        path: 'Projects/SCHEMA.md',
        folderPath: 'Projects',
        depth: 1
      });
      expect(chain.hasInheritance).toBe(false);
    });

    test('Should pick up an ancestor SCHEMA.md for files in a deeper subfolder', () => {
      mockVault.addFile('Projects/SCHEMA.md', '# Project');
      const chain = loader.getTemplateChain(makeFile('Projects/Web/Frontend/note.md'));
      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].folderPath).toBe('Projects');
    });

    test('Should build inheritance chain from root to leaf', () => {
      mockVault.addFile('SCHEMA.md', '# Root');
      mockVault.addFile('Projects/SCHEMA.md', '# Project');
      mockVault.addFile('Projects/Web/SCHEMA.md', '# Web');
      mockVault.addFile('Projects/Web/Frontend/SCHEMA.md', '# Frontend');

      const chain = loader.getTemplateChain(makeFile('Projects/Web/Frontend/note.md'));

      expect(chain.templates).toHaveLength(4);
      expect(chain.hasInheritance).toBe(true);
      expect(chain.templates.map((t) => t.folderPath)).toEqual([
        '',
        'Projects',
        'Projects/Web',
        'Projects/Web/Frontend'
      ]);
      expect(chain.templates.map((t) => t.depth)).toEqual([0, 1, 2, 3]);
    });

    test('Should handle partial inheritance chain (gaps in the tree)', () => {
      mockVault.addFile('Projects/SCHEMA.md', '# Project');
      mockVault.addFile('Projects/Web/Frontend/SCHEMA.md', '# Frontend');

      const chain = loader.getTemplateChain(makeFile('Projects/Web/Frontend/note.md'));

      expect(chain.templates).toHaveLength(2);
      expect(chain.templates[0].folderPath).toBe('Projects');
      expect(chain.templates[1].folderPath).toBe('Projects/Web/Frontend');
    });

    test('Should pick up the root SCHEMA.md for a file with no parent folder', () => {
      mockVault.addFile('SCHEMA.md', '# Root');
      const file = {
        basename: 'note',
        name: 'note.md',
        path: 'note.md',
        extension: 'md',
        parent: null
      } as unknown as MarkdownFile;

      const chain = loader.getTemplateChain(file);

      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].folderPath).toBe('');
    });

    test('Should return empty chain when file matches a global exclude pattern', () => {
      mockVault.addFile('Projects/SCHEMA.md', '# Project');
      settings.globalExcludePatterns = ['*.tmp', 'draft-*'];
      loader.updateSettings(settings);

      expect(loader.getTemplateChain(makeFile('Projects/scratch.tmp')).templates).toHaveLength(0);
      expect(
        loader.getTemplateChain(makeFile('Projects/draft-post.md')).templates
      ).toHaveLength(0);
      expect(loader.getTemplateChain(makeFile('Projects/note.md')).templates).toHaveLength(1);
    });

    test('Should match global excludes against the full vault path', () => {
      mockVault.addFile('Projects/SCHEMA.md', '# Project');
      settings.globalExcludePatterns = ['Projects/Archive/**'];
      loader.updateSettings(settings);

      expect(
        loader.getTemplateChain(makeFile('Projects/Archive/2024/note.md')).templates
      ).toHaveLength(0);
      expect(loader.getTemplateChain(makeFile('Projects/note.md')).templates).toHaveLength(1);
    });
  });

  describe('loadTemplateChain', () => {
    test('Should load content for all templates in a chain', async () => {
      mockVault.addFile('SCHEMA.md', 'Root content');
      mockVault.addFile('Projects/SCHEMA.md', 'Project content');

      const chain = {
        templates: [
          { path: 'SCHEMA.md', folderPath: '', depth: 0 },
          { path: 'Projects/SCHEMA.md', folderPath: 'Projects', depth: 1 }
        ],
        hasInheritance: true
      };

      const loadedChain = await loader.loadTemplateChain(chain);

      expect(loadedChain.templates).toHaveLength(2);
      expect(loadedChain.templates[0].content).toBe('Root content');
      expect(loadedChain.templates[1].content).toBe('Project content');
      expect(loadedChain.hasInheritance).toBe(true);
    });

    test('Should skip missing templates in chain', async () => {
      mockVault.addFile('SCHEMA.md', 'Root');
      // Projects/SCHEMA.md intentionally missing

      const chain = {
        templates: [
          { path: 'SCHEMA.md', folderPath: '', depth: 0 },
          { path: 'Projects/SCHEMA.md', folderPath: 'Projects', depth: 1 }
        ],
        hasInheritance: true
      };

      const loadedChain = await loader.loadTemplateChain(chain);

      expect(loadedChain.templates).toHaveLength(1);
      expect(loadedChain.templates[0].path).toBe('SCHEMA.md');
      expect(loadedChain.hasInheritance).toBe(false);
    });

    test('Should handle empty chain', async () => {
      const loadedChain = await loader.loadTemplateChain({
        templates: [],
        hasInheritance: false
      });
      expect(loadedChain.templates).toHaveLength(0);
      expect(loadedChain.hasInheritance).toBe(false);
    });
  });

  describe('schemaPathFor (test util)', () => {
    test('Maps root to a top-level SCHEMA.md', () => {
      expect(TemplateLoaderTestUtils.schemaPathFor(loader, '')).toBe('SCHEMA.md');
      expect(TemplateLoaderTestUtils.schemaPathFor(loader, '/')).toBe('SCHEMA.md');
    });

    test('Maps subfolder to its SCHEMA.md', () => {
      expect(TemplateLoaderTestUtils.schemaPathFor(loader, 'Projects/Web')).toBe(
        'Projects/Web/SCHEMA.md'
      );
    });
  });
});

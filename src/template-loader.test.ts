/**
 * Tests for Template Loader
 */

import { TemplateLoader } from './template-loader';
import { Vault, TFile, TFolder } from 'obsidian';
import { SnowflakeSettings, MarkdownFile } from './types';

// Mock the TFile class from obsidian
jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian');
  return {
    ...actual,
    TFile: class MockTFile {
      path: string;
      basename: string;
      extension: string;
      parent: any;

      constructor() {
        this.path = '';
        this.basename = '';
        this.extension = '';
        this.parent = null;
      }
    }
  };
});

// Mock Vault
class MockVault implements Partial<Vault> {
  private files: Map<string, { content: string; file: TFile }> = new Map();

  addFile(path: string, content: string) {
    const file = new TFile();
    file.path = path;
    file.basename = path.split('/').pop()?.replace('.md', '') || '';
    file.extension = 'md';
    file.parent = Object.assign(new TFolder(), { path: path.substring(0, path.lastIndexOf('/')) });

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

describe('TemplateLoader', () => {
  let mockVault: MockVault;
  let settings: SnowflakeSettings;
  let loader: TemplateLoader;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console.warn to suppress expected warnings in tests
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    mockVault = new MockVault();
    settings = {
      templateMappings: {
        Projects: 'project.md',
        Daily: 'daily.md',
        '': 'root.md' // Root folder mapping
      },

      templatesFolder: 'Templates',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm'
    };
    loader = new TemplateLoader(mockVault as any, settings);

    // Add some template files
    mockVault.addFile('Templates/project.md', '# Project Template');
    mockVault.addFile('Templates/daily.md', '# Daily Template');
    mockVault.addFile('Templates/default.md', '# Default Template');
    mockVault.addFile('Templates/root.md', '# Root Template');
  });

  afterEach(() => {
    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  describe('loadTemplate', () => {
    test('Should load existing template', async () => {
      const content = await loader.loadTemplate('Templates/project.md');
      expect(content).toBe('# Project Template');
    });

    test('REQ-026: Should return null for non-existent template', async () => {
      const content = await loader.loadTemplate('Templates/missing.md');
      expect(content).toBeNull();
    });

    test('Should handle errors gracefully', async () => {
      // Create a file that will throw on read
      const errorFile = { path: 'error.md' } as TFile;
      jest.spyOn(mockVault, 'getAbstractFileByPath').mockReturnValueOnce(errorFile);
      jest.spyOn(mockVault, 'read').mockRejectedValueOnce(new Error('Read error'));

      const content = await loader.loadTemplate('error.md');
      expect(content).toBeNull();
    });
  });

  describe('getTemplateForFile', () => {
    test('REQ-002: Should return folder-specific template', () => {
      const file = {
        basename: 'test',
        parent: { path: 'Projects' }
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(file);
      expect(templatePath).toBe('Templates/project.md');
    });

    test('Should match nested folders to parent mapping', () => {
      const file = {
        basename: 'test',
        parent: { path: 'Projects/Subfolder/Deep' }
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(file);
      expect(templatePath).toBe('Templates/project.md');
    });

    test('REQ-003: Should return null when no mapping exists', () => {
      // Create a new loader with no mappings
      const loaderNoMappings = new TemplateLoader(mockVault as any, {
        templateMappings: {},
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });

      const file = {
        basename: 'test',
        parent: { path: 'Other/Folder' }
      } as MarkdownFile;

      const templatePath = loaderNoMappings.getTemplateForFile(file);
      expect(templatePath).toBe(null);
    });

    test('Should return root template for root files', () => {
      const file = {
        basename: 'test',
        parent: { path: '' }
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(file);
      expect(templatePath).toBe('Templates/root.md');
    });

    test('Should return null when no template configured', () => {
      settings.templateMappings = {};

      const file = {
        basename: 'test',
        parent: { path: 'Some/Folder' }
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(file);
      expect(templatePath).toBeNull();
    });

    test('Should handle files with no parent', () => {
      const file = {
        basename: 'test',
        parent: null
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(file);
      expect(templatePath).toBe('Templates/root.md');
    });

    test('Should exclude files matching exclusion patterns', () => {
      // Update settings to include exclusion patterns
      settings.templateMappings = {
        Projects: {
          templatePath: 'project.md',
          excludePatterns: ['*.tmp', 'draft-*', 'README.md']
        },
        '': 'root.md'
      };
      loader.updateSettings(settings);

      // Test excluded files
      const excludedFiles = [
        { basename: 'temp.tmp', path: 'Projects/temp.tmp', parent: { path: 'Projects' } },
        { basename: 'draft-post', path: 'Projects/draft-post.md', parent: { path: 'Projects' } },
        { basename: 'README', path: 'Projects/README.md', parent: { path: 'Projects' } }
      ];

      excludedFiles.forEach((file) => {
        const templatePath = loader.getTemplateForFile(file as MarkdownFile);
        expect(templatePath).toBeNull();
      });

      // Test non-excluded files
      const includedFile = {
        basename: 'normal',
        path: 'Projects/normal.md',
        parent: { path: 'Projects' }
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(includedFile);
      expect(templatePath).toBe('Templates/project.md');
    });

    test('Should handle exclusion patterns in nested folders', () => {
      settings.templateMappings = {
        Projects: {
          templatePath: 'project.md',
          excludePatterns: ['**/README.md', 'temp/**']
        }
      };
      loader.updateSettings(settings);

      // Should exclude README.md in any subfolder
      const readme = {
        basename: 'README',
        path: 'Projects/subdir/deep/README.md',
        parent: { path: 'Projects/subdir/deep' }
      } as MarkdownFile;
      expect(loader.getTemplateForFile(readme)).toBeNull();

      // Should exclude files in temp directory
      const tempFile = {
        basename: 'file',
        path: 'Projects/temp/file.md',
        parent: { path: 'Projects/temp' }
      } as MarkdownFile;
      expect(loader.getTemplateForFile(tempFile)).toBeNull();

      // Should not exclude other files
      const normalFile = {
        basename: 'doc',
        path: 'Projects/docs/doc.md',
        parent: { path: 'Projects/docs' }
      } as MarkdownFile;
      expect(loader.getTemplateForFile(normalFile)).toBe('Templates/project.md');
    });

    test('Should handle string mappings (backward compatibility)', () => {
      settings.templateMappings = {
        Projects: 'project.md', // String mapping - no exclusions
        Daily: {
          templatePath: 'daily.md',
          excludePatterns: ['archive-*']
        }
      };
      loader.updateSettings(settings);

      // String mapping should work normally
      const projectFile = {
        basename: 'anything',
        path: 'Projects/anything.md',
        parent: { path: 'Projects' }
      } as MarkdownFile;
      expect(loader.getTemplateForFile(projectFile)).toBe('Templates/project.md');

      // Config mapping with exclusions
      const archivedDaily = {
        basename: 'archive-2024',
        path: 'Daily/archive-2024.md',
        parent: { path: 'Daily' }
      } as MarkdownFile;
      expect(loader.getTemplateForFile(archivedDaily)).toBeNull();

      const normalDaily = {
        basename: 'today',
        path: 'Daily/today.md',
        parent: { path: 'Daily' }
      } as MarkdownFile;
      expect(loader.getTemplateForFile(normalDaily)).toBe('Templates/daily.md');
    });
  });

  describe('templateExists', () => {
    test('Should return true for existing template', async () => {
      const exists = await loader.templateExists('Templates/project.md');
      expect(exists).toBe(true);
    });

    test('Should return false for non-existent template', async () => {
      const exists = await loader.templateExists('Templates/missing.md');
      expect(exists).toBe(false);
    });
  });

  describe('updateSettings', () => {
    test('Should update settings reference', () => {
      const newSettings: SnowflakeSettings = {
        ...settings,
        templateMappings: {
          '/': 'new-default.md'
        }
      };

      loader.updateSettings(newSettings);

      const file = {
        basename: 'test',
        parent: { path: 'Unknown' }
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(file);
      expect(templatePath).toBe('Templates/new-default.md');
    });
  });

  describe('getTemplateChain', () => {
    test('REQ-032: Should build template chain from root to leaf', () => {
      const file = {
        basename: 'test',
        parent: { path: 'Projects/Web/Frontend' }
      } as MarkdownFile;

      // Set up mappings for parent folders
      loader.updateSettings({
        ...settings,
        templateMappings: {
          '': 'root.md', // Root mapping
          Projects: 'project.md',
          'Projects/Web': 'web.md',
          'Projects/Web/Frontend': 'frontend.md'
        }
      });

      const chain = loader.getTemplateChain(file);

      expect(chain.templates).toHaveLength(4);
      expect(chain.hasInheritance).toBe(true);

      // Verify order is root to leaf
      expect(chain.templates[0]).toEqual({
        path: 'Templates/root.md',
        folderPath: '',
        depth: 0
      });
      expect(chain.templates[1]).toEqual({
        path: 'Templates/project.md',
        folderPath: 'Projects',
        depth: 1
      });
      expect(chain.templates[2]).toEqual({
        path: 'Templates/web.md',
        folderPath: 'Projects/Web',
        depth: 2
      });
      expect(chain.templates[3]).toEqual({
        path: 'Templates/frontend.md',
        folderPath: 'Projects/Web/Frontend',
        depth: 3
      });
    });

    test('Should handle partial inheritance chain', () => {
      const file = {
        basename: 'test',
        parent: { path: 'Projects/Web/Frontend' }
      } as MarkdownFile;

      // Only some folders have templates
      loader.updateSettings({
        ...settings,
        templateMappings: {
          Projects: 'project.md',
          'Projects/Web/Frontend': 'frontend.md'
        }
      });

      const chain = loader.getTemplateChain(file);

      expect(chain.templates).toHaveLength(2);
      expect(chain.hasInheritance).toBe(true);
      expect(chain.templates[0].folderPath).toBe('Projects');
      expect(chain.templates[1].folderPath).toBe('Projects/Web/Frontend');
    });

    test('Should return single template when no inheritance', () => {
      const file = {
        basename: 'test',
        parent: { path: 'Projects' }
      } as MarkdownFile;

      // Remove root template mapping to test single template
      loader.updateSettings({
        ...settings,
        templateMappings: {
          Projects: 'project.md',
          Daily: 'daily.md'
        }
      });

      const chain = loader.getTemplateChain(file);

      expect(chain.templates).toHaveLength(1);
      expect(chain.hasInheritance).toBe(false);
      expect(chain.templates[0].path).toBe('Templates/project.md');
    });

    test('Should return empty chain when no folder mappings', () => {
      const file = {
        basename: 'test',
        parent: { path: 'Unknown/Path' }
      } as MarkdownFile;

      // Clear template mappings
      loader.updateSettings({
        ...settings,
        templateMappings: {}
      });

      const chain = loader.getTemplateChain(file);

      expect(chain.templates).toHaveLength(0);
      expect(chain.hasInheritance).toBe(false);
    });

    test('Should return empty chain when no templates configured', () => {
      loader.updateSettings({
        ...settings,
        templateMappings: {}
      });

      const file = {
        basename: 'test',
        parent: { path: 'Projects' }
      } as MarkdownFile;

      const chain = loader.getTemplateChain(file);

      expect(chain.templates).toHaveLength(0);
      expect(chain.hasInheritance).toBe(false);
    });

    test('Should handle files in root folder', () => {
      const file = {
        basename: 'test',
        parent: null // Root level file
      } as MarkdownFile;

      loader.updateSettings({
        ...settings,
        templateMappings: {
          '': 'root.md'
        }
      });

      const chain = loader.getTemplateChain(file);

      expect(chain.templates).toHaveLength(1);
      expect(chain.templates[0].folderPath).toBe('');
    });

    test('Should respect exclusions when building template chain', () => {
      const file = {
        basename: 'README',
        path: 'Projects/Web/README.md',
        parent: { path: 'Projects/Web' }
      } as MarkdownFile;

      // Set up mappings with exclusions
      loader.updateSettings({
        ...settings,
        templateMappings: {
          '': 'root.md',
          Projects: {
            templatePath: 'project.md',
            excludePatterns: ['README.md'] // Exclude README at Projects level
          },
          'Projects/Web': 'web.md' // No exclusions at Web level
        }
      });

      const chain = loader.getTemplateChain(file);

      // Should only have root and web templates (Projects excluded due to pattern)
      expect(chain.templates).toHaveLength(2);
      expect(chain.templates[0].path).toBe('Templates/root.md');
      expect(chain.templates[1].path).toBe('Templates/web.md');
      // Projects template should be excluded
      expect(chain.templates.find((t) => t.folderPath === 'Projects')).toBeUndefined();
    });

    test('Should handle multiple exclusions in chain', () => {
      const file = {
        basename: 'draft-README',
        path: 'Projects/Web/Frontend/draft-README.md',
        parent: { path: 'Projects/Web/Frontend' }
      } as MarkdownFile;

      loader.updateSettings({
        ...settings,
        templateMappings: {
          '': {
            templatePath: 'root.md',
            excludePatterns: ['draft-*'] // Exclude drafts at root
          },
          Projects: 'project.md',
          'Projects/Web': {
            templatePath: 'web.md',
            excludePatterns: ['*README*'] // Exclude README files
          },
          'Projects/Web/Frontend': 'frontend.md'
        }
      });

      const chain = loader.getTemplateChain(file);

      // Should only have Projects and Frontend templates
      expect(chain.templates).toHaveLength(2);
      expect(chain.templates[0].path).toBe('Templates/project.md');
      expect(chain.templates[1].path).toBe('Templates/frontend.md');
    });
  });

  describe('loadTemplateChain', () => {
    test('Should load content for all templates in chain', async () => {
      const chain = {
        templates: [
          { path: 'Templates/root.md', folderPath: '', depth: 0 },
          { path: 'Templates/project.md', folderPath: 'Projects', depth: 1 }
        ],
        hasInheritance: true
      };

      // Add specific template content for this test
      mockVault.addFile('Templates/root.md', 'Root template content');
      mockVault.addFile('Templates/project.md', 'Project template content');

      const loadedChain = await loader.loadTemplateChain(chain);

      expect(loadedChain.templates).toHaveLength(2);
      expect(loadedChain.templates[0].content).toBe('Root template content');
      expect(loadedChain.templates[1].content).toBe('Project template content');
      expect(loadedChain.hasInheritance).toBe(true);
    });

    test('REQ-032: Should skip missing templates in chain', async () => {
      const chain = {
        templates: [
          { path: 'Templates/exists.md', folderPath: '', depth: 0 },
          { path: 'Templates/missing.md', folderPath: 'Projects', depth: 1 },
          { path: 'Templates/also-exists.md', folderPath: 'Projects/Web', depth: 2 }
        ],
        hasInheritance: true
      };

      // Add templates for this test (missing.md is intentionally not added)
      mockVault.addFile('Templates/exists.md', 'Template content');
      mockVault.addFile('Templates/also-exists.md', 'Template content');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const loadedChain = await loader.loadTemplateChain(chain);

      expect(loadedChain.templates).toHaveLength(2); // Only non-missing templates
      expect(loadedChain.templates[0].path).toBe('Templates/exists.md');
      expect(loadedChain.templates[1].path).toBe('Templates/also-exists.md');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Skipping missing template in chain: Templates/missing.md'
      );
    });

    test('Should handle empty chain', async () => {
      const chain = {
        templates: [],
        hasInheritance: false
      };

      const loadedChain = await loader.loadTemplateChain(chain);

      expect(loadedChain.templates).toHaveLength(0);
      expect(loadedChain.hasInheritance).toBe(false);
    });

    test('Should update hasInheritance based on loaded templates', async () => {
      const chain = {
        templates: [
          { path: 'Templates/exists.md', folderPath: '', depth: 0 },
          { path: 'Templates/missing.md', folderPath: 'Projects', depth: 1 }
        ],
        hasInheritance: true
      };

      // Add only the existing template
      mockVault.addFile('Templates/exists.md', 'Content');

      const loadedChain = await loader.loadTemplateChain(chain);

      expect(loadedChain.templates).toHaveLength(1);
      expect(loadedChain.hasInheritance).toBe(false); // Only one template loaded
    });
  });
});

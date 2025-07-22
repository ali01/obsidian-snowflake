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
        Projects: 'Templates/project.md',
        Daily: 'Templates/daily.md',
        '': 'Templates/root.md' // Root folder mapping
      },
      defaultTemplate: 'Templates/default.md',
      enableAutoTemplating: true,
      templatesFolder: 'Templates'
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

    test('REQ-003: Should return default template when no mapping', () => {
      // Remove root mapping so default is used
      delete settings.templateMappings[''];

      const file = {
        basename: 'test',
        parent: { path: 'Other/Folder' }
      } as MarkdownFile;

      const templatePath = loader.getTemplateForFile(file);
      expect(templatePath).toBe('Templates/default.md');
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
      settings.defaultTemplate = '';
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
        templateMappings: {}, // Clear mappings
        defaultTemplate: 'Templates/new-default.md'
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
});

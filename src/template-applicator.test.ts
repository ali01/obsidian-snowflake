/**
 * Tests for Template Applicator
 */

import { TemplateApplicator } from './template-applicator';
import { Vault, Editor, TFile } from 'obsidian';
import { SnowflakeSettings, MarkdownFile } from './types';
import { TemplateLoader } from './template-loader';
import { TemplateVariableProcessor } from './template-variables';
import { FrontmatterMerger } from './frontmatter-merger';
import { ErrorHandler } from './error-handler';

// Mock dependencies
jest.mock('./template-loader');
jest.mock('./template-variables');
jest.mock('./frontmatter-merger');
jest.mock('./error-handler');
jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian')
}));

describe('TemplateApplicator', () => {
  let applicator: TemplateApplicator;
  let mockVault: {
    read: jest.MockedFunction<(file: TFile) => Promise<string>>;
    modify: jest.MockedFunction<(file: TFile, data: string) => Promise<void>>;
  };
  let settings: SnowflakeSettings;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  // Create mock instances
  const mockTemplateLoader = {
    getTemplateForFile: jest.fn(),
    loadTemplate: jest.fn(),
    templateExists: jest.fn(),
    updateSettings: jest.fn(),
    getTemplateChain: jest.fn(),
    loadTemplateChain: jest.fn()
  };

  const mockVariableProcessor = {
    processTemplate: jest.fn(),
    setDateFormat: jest.fn(),
    setTimeFormat: jest.fn()
  };

  const mockFrontmatterMerger = {
    merge: jest.fn(),
    mergeWithFile: jest.fn(),
    applyToFile: jest.fn(),
    mergeFrontmatter: jest.fn(),
    processWithDeleteList: jest.fn(),
    applyDeleteList: jest.fn(),
    extractDeleteList: jest.fn(),
    mergeWithDeleteList: jest.fn(),
    extractPropertyNames: jest.fn(),
    cleanupEmptyProperties: jest.fn()
  };

  const mockErrorHandler = {
    handleError: jest.fn(),
    handleErrorSilently: jest.fn()
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Mock console.error to prevent noise in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

    // Setup mock implementations
    (TemplateLoader as jest.Mock).mockImplementation(() => mockTemplateLoader);
    (TemplateVariableProcessor as jest.Mock).mockImplementation(() => mockVariableProcessor);
    (FrontmatterMerger as jest.Mock).mockImplementation(() => mockFrontmatterMerger);
    (ErrorHandler as any).getInstance = jest.fn().mockReturnValue(mockErrorHandler);

    // Mock vault
    mockVault = {
      read: jest.fn().mockResolvedValue('') as jest.MockedFunction<
        (file: TFile) => Promise<string>
      >,
      modify: jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<
        (file: TFile, data: string) => Promise<void>
      >
    };

    // Default settings
    settings = {
      templateMappings: {
        Projects: 'project.md'
      },

      templatesFolder: 'Templates',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm'
    };

    // Reset all mocks to default behavior
    mockTemplateLoader.getTemplateForFile.mockReturnValue(null);
    mockTemplateLoader.loadTemplate.mockResolvedValue(null);
    mockTemplateLoader.templateExists.mockResolvedValue(false);
    mockTemplateLoader.getTemplateChain.mockReturnValue({
      templates: [],
      hasInheritance: false
    });
    mockTemplateLoader.loadTemplateChain.mockResolvedValue({
      templates: [],
      hasInheritance: false
    });

    mockVariableProcessor.processTemplate.mockReturnValue({
      content: '',
      variables: {},
      hasSnowflakeId: false
    });

    mockFrontmatterMerger.mergeWithFile.mockReturnValue({
      merged: '',
      hasSnowflakeId: false
    });
    mockFrontmatterMerger.applyToFile.mockImplementation((content, merged) => content);
    mockFrontmatterMerger.processWithDeleteList.mockReturnValue({
      processedContent: '',
      newDeleteList: []
    });
    mockFrontmatterMerger.applyDeleteList.mockImplementation((content) => content);
    mockFrontmatterMerger.extractDeleteList.mockReturnValue(null);
    mockFrontmatterMerger.mergeFrontmatter.mockReturnValue({
      merged: '',
      conflicts: [],
      added: []
    });
    mockFrontmatterMerger.mergeWithDeleteList.mockImplementation(
      (accumulated, current, deleteList) => {
        // Default implementation that just returns accumulated
        return {
          mergedFrontmatter: accumulated || current || '',
          updatedDeleteList: deleteList || []
        };
      }
    );
    mockFrontmatterMerger.extractPropertyNames.mockReturnValue(new Set());
    mockFrontmatterMerger.cleanupEmptyProperties.mockImplementation((fm) => fm);

    mockErrorHandler.handleError.mockReturnValue('Error occurred');

    // Create applicator instance
    applicator = new TemplateApplicator(mockVault as unknown as Vault, settings);
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  describe('applyTemplate', () => {
    const mockFile: MarkdownFile = {
      basename: 'test',
      extension: 'md' as const,
      path: 'Projects/test.md',
      name: 'test.md',
      parent: { path: 'Projects' },
      vault: {} as any,
      stat: {
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      }
    } as MarkdownFile;

    test('REQ-006: Should merge template with existing content', async () => {
      // Existing content in file
      const existingContent = `---
title: Existing Title
tags: [existing]
---

# Existing Content`;

      // Template content
      const templateContent = `---
title: {{title}}
tags: [template]
date: {{date}}
id: {{snowflake_id}}
---

# {{title}}

## Overview`;

      // Expected processed template
      const processedTemplate = `---
title: test
tags: [template]
date: 2024-01-01
id: abc123
---

# test

## Overview`;

      // Setup mocks
      mockVault.read.mockResolvedValue(existingContent);
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/project.md', folderPath: 'Projects', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/project.md',
            folderPath: 'Projects',
            depth: 0,
            content: templateContent
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: processedTemplate,
        variables: {
          title: 'test',
          date: '2024-01-01',
          snowflakeId: 'abc123'
        },
        hasSnowflakeId: true
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'title: Existing Title\ntags: [existing, template]\ndate: 2024-01-01\nid: abc123',
        hasSnowflakeId: true
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue(`---
title: Existing Title
tags: [existing, template]
date: 2024-01-01
id: abc123
---

# Existing Content

## Overview`);

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockFile, expect.any(String));
      const modifiedContent = mockVault.modify.mock.calls[0][1];
      expect(modifiedContent).toMatch(/\n$/);
      expect(mockFrontmatterMerger.mergeWithFile).toHaveBeenCalledWith(
        existingContent,
        'title: test\ntags: [template]\ndate: 2024-01-01\nid: abc123'
      );
    });

    test('Should ensure file ends with exactly one newline', async () => {
      const existingContent = '# Test\n\nContent without trailing newline';
      mockVault.read.mockResolvedValue(existingContent);
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/test.md', folderPath: 'Test', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/test.md',
            content: '# Template Content',
            folderPath: 'Test',
            depth: 0
          }
        ],
        hasInheritance: false
      });
      // No frontmatter in template, so no merging needed
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: '',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation((content) => content);
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: '# Template Content',
        variables: {},
        hasSnowflakeId: false
      });

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(true);
      // Should append template content and ensure single trailing newline
      expect(mockVault.modify).toHaveBeenCalledWith(
        mockFile,
        '# Test\n\nContent without trailing newline\n# Template Content\n'
      );
    });

    test('Should normalize multiple trailing newlines to exactly one', async () => {
      const existingContent = '# Test\n\nContent with multiple trailing newlines\n\n\n';
      mockVault.read.mockResolvedValue(existingContent);
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/test.md', folderPath: 'Test', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/test.md',
            content: '', // Empty template
            folderPath: 'Test',
            depth: 0
          }
        ],
        hasInheritance: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: '',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation((content) => content);

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(true);
      // Should normalize multiple newlines to single newline
      expect(mockVault.modify).toHaveBeenCalledWith(
        mockFile,
        '# Test\n\nContent with multiple trailing newlines\n'
      );
    });

    test('Should show error when template not found', async () => {
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/missing.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [],
        hasInheritance: false
      });

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No templates could be loaded');
      expect(mockVault.modify).not.toHaveBeenCalled();
    });

    test('Should apply template even to files with existing snowflake_id', async () => {
      const contentWithId = `---
id: existing123
---
Content`;

      mockVault.read.mockResolvedValue(contentWithId);
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/default.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/default.md',
            folderPath: '',
            depth: 0,
            content: 'Template content'
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: 'Template content',
        variables: {},
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'id: existing123',
        hasSnowflakeId: true
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue(contentWithId + '\n\nTemplate content');

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalled();
    });

    test('REQ-007: Should apply template to empty file', async () => {
      const templateContent = `---
title: {{title}}
---
# {{title}}`;

      const processedContent = `---
title: test
---
# test`;

      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/default.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/default.md',
            folderPath: '',
            depth: 0,
            content: templateContent
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: processedContent,
        variables: { title: 'test' },
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'title: test',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue(processedContent);

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockFile, expect.any(String));
      const modifiedContent = mockVault.modify.mock.calls[0][1];
      expect(modifiedContent).toMatch(/\n$/);
    });

    test('Should handle editor cursor position when provided', async () => {
      const mockEditor = {
        getCursor: jest.fn().mockReturnValue({ line: 5, ch: 0 })
      } as any;

      const existingContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
      const templateContent = 'Template content';

      mockVault.read.mockResolvedValue(existingContent);
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/default.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/default.md',
            folderPath: '',
            depth: 0,
            content: templateContent
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: templateContent,
        variables: {},
        hasSnowflakeId: false
      });
      // Since the template has no frontmatter, merge won't be called

      const result = await applicator.applyTemplate(
        mockFile,
        { isManualCommand: true },
        mockEditor
      );

      expect(result.success).toBe(true);
      // Merge should not be called since template has no frontmatter
      expect(mockFrontmatterMerger.mergeWithFile).not.toHaveBeenCalled();
      // Verify that the editor cursor was used
      expect(mockEditor.getCursor).toHaveBeenCalled();
      expect(mockVault.modify).toHaveBeenCalled();
    });

    test('Should handle template processing errors', async () => {
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/default.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/default.md',
            folderPath: '',
            depth: 0,
            content: '{{invalid}}'
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockImplementation(() => {
        throw new Error('Invalid variable');
      });

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
      expect(mockErrorHandler.handleError).toHaveBeenCalled();
    });

    test('REQ-025: Should always apply template with manual command', async () => {
      const templateContent = `---
title: {{title}}
---
Template`;

      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/default.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/default.md',
            folderPath: '',
            depth: 0,
            content: templateContent
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: '---\ntitle: test\n---\nTemplate',
        variables: { title: 'test' },
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'title: test',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue('---\ntitle: test\n---\nTemplate');

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: true });

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalled();
    });

    test('Should show notice when template applied successfully', async () => {
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/default.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/default.md',
            folderPath: '',
            depth: 0,
            content: 'Template'
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: 'Template',
        variables: {},
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: '',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue('Template');

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: true });

      expect(result.success).toBe(true);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'Snowflake: Template(s) "Templates/default.md" applied to Projects/test.md'
      );
    });

    test('Should handle vault read errors gracefully', async () => {
      mockVault.read.mockRejectedValue(new Error('Permission denied'));

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No template configured');
    });

    test('Should handle vault modify errors gracefully', async () => {
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/default.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/default.md',
            folderPath: '',
            depth: 0,
            content: 'Template'
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: 'Template',
        variables: {},
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: '',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue('Template');
      mockVault.modify.mockRejectedValue(new Error('Disk full'));

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
    });

    test('Should not apply template when no template is configured', async () => {
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [],
        hasInheritance: false
      });

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No template configured');
      expect(mockVault.modify).not.toHaveBeenCalled();
    });

    test('Should not add extra newlines when applying template', async () => {
      // Test case 1: Empty file with template
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/test.md', folderPath: '', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/test.md',
            folderPath: '',
            depth: 0,
            content: '# Test\n\nContent\n'
          }
        ],
        hasInheritance: false
      });
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: '# Test\n\nContent\n',
        variables: {},
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: '',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation((content) => content);

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockFile, '# Test\n\nContent\n');

      // Test case 2: File with frontmatter
      mockVault.read.mockResolvedValue('---\ntitle: Test\n---\n');
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (content, merged) => '---\ntitle: Test\n---\n'
      );

      const result2 = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result2.success).toBe(true);
      const finalContent = mockVault.modify.mock.calls[mockVault.modify.mock.calls.length - 1][1];
      expect(finalContent).toBe('---\ntitle: Test\n---\n# Test\n\nContent\n');
      expect(finalContent).not.toMatch(/\n{3}/);
    });
  });

  describe('applySpecificTemplate', () => {
    const mockFile: MarkdownFile = {
      basename: 'test',
      extension: 'md' as const,
      path: 'Projects/test.md',
      name: 'test.md',
      parent: { path: 'Projects' },
      vault: {} as any,
      stat: {
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      }
    } as MarkdownFile;

    test('Should apply a specific template to a file', async () => {
      const templateContent = `---
title: {{title}}
---
# {{title}}`;

      const processedContent = `---
title: test
---
# test`;

      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.loadTemplate.mockResolvedValue(templateContent);
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: processedContent,
        variables: { title: 'test' },
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'title: test',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue(processedContent);

      const result = await applicator.applySpecificTemplate(mockFile, 'Templates/specific.md');

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockFile, expect.any(String));
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'Snowflake: Template "Templates/specific.md" applied to Projects/test.md'
      );
    });

    test('Should handle template not found', async () => {
      mockTemplateLoader.loadTemplate.mockResolvedValue(null);

      const result = await applicator.applySpecificTemplate(mockFile, 'Templates/missing.md');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Template not found');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Snowflake: Template not found: Templates/missing.md'
      );
    });

    test('Should handle errors gracefully', async () => {
      mockTemplateLoader.loadTemplate.mockRejectedValue(new Error('Read error'));
      mockErrorHandler.handleError.mockReturnValue('Error loading template');

      const result = await applicator.applySpecificTemplate(mockFile, 'Templates/error.md');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Error loading template');
    });
  });

  describe('updateSettings', () => {
    test('Should update internal settings and dependencies', () => {
      const newSettings: SnowflakeSettings = {
        ...settings
      };

      applicator.updateSettings(newSettings);

      // Verify all dependencies are updated
      expect(mockTemplateLoader.updateSettings).toHaveBeenCalledWith(newSettings);
      expect(mockVariableProcessor.setDateFormat).toHaveBeenCalledWith(newSettings.dateFormat);
      expect(mockVariableProcessor.setTimeFormat).toHaveBeenCalledWith(newSettings.timeFormat);
    });
  });

  describe('multi-template application (REQ-033, REQ-033a)', () => {
    const mockFile: MarkdownFile = {
      basename: 'test',
      extension: 'md' as const,
      path: 'Projects/Dev/test.md',
      name: 'test.md',
      parent: { path: 'Projects/Dev' },
      vault: {} as any,
      stat: {
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      }
    } as MarkdownFile;

    test('REQ-033: Should apply single template without inheritance', async () => {
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/project.md', folderPath: 'Projects', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/project.md',
            folderPath: 'Projects',
            depth: 0,
            content: '---\ntags: [project]\n---\nProject template'
          }
        ],
        hasInheritance: false
      });

      mockVariableProcessor.processTemplate.mockReturnValue({
        content: '---\ntags: [project]\n---\nProject template',
        variables: {},
        hasSnowflakeId: false
      });

      mockVault.read.mockResolvedValue('');
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'tags: [project]',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue(
        '---\ntags: [project]\n---\nProject template'
      );

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);
      expect(mockFrontmatterMerger.mergeFrontmatter).not.toHaveBeenCalled();
    });

    test('REQ-033: Should merge multiple templates with child precedence', async () => {
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/base.md', folderPath: '/', depth: 0 },
          { path: 'Templates/project.md', folderPath: 'Projects', depth: 1 }
        ],
        hasInheritance: true
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/base.md',
            folderPath: '/',
            depth: 0,
            content: '---\nauthor: John\ntags: [base]\n---\nBase content'
          },
          {
            path: 'Templates/project.md',
            folderPath: 'Projects',
            depth: 1,
            content: '---\ntitle: Project\ntags: [project]\n---\nProject content'
          }
        ],
        hasInheritance: true
      });

      mockFrontmatterMerger.mergeFrontmatter.mockReturnValue({
        merged: 'author: John\ntitle: Project\ntags: [base, project]'
      });

      // Mock processWithDeleteList for each template
      mockFrontmatterMerger.processWithDeleteList
        .mockReturnValueOnce({
          processedContent: 'author: John\ntags: [base]',
          newDeleteList: []
        })
        .mockReturnValueOnce({
          processedContent: 'title: Project\ntags: [project]',
          newDeleteList: []
        });

      mockFrontmatterMerger.mergeFrontmatter.mockReturnValue({
        merged: 'author: John\ntitle: Project\ntags: [base, project]'
      });

      mockFrontmatterMerger.applyDeleteList.mockImplementation((content) => content);

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));

      mockVault.read.mockResolvedValue('');
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'author: John\ntitle: Project\ntags: [base, project]',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---\n${fm}\n---\nBase content\n\nProject content`
      );

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);
      expect(mockFrontmatterMerger.mergeWithDeleteList).toHaveBeenCalledWith(
        'author: John\ntags: [base]',
        'title: Project\ntags: [project]',
        []
      );
    });

    test('REQ-033a: Should concatenate lists across inheritance chain', async () => {
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/base.md', folderPath: '/', depth: 0 },
          { path: 'Templates/project.md', folderPath: 'Projects', depth: 1 },
          { path: 'Templates/dev.md', folderPath: 'Projects/Dev', depth: 2 }
        ],
        hasInheritance: true
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/base.md',
            folderPath: '/',
            depth: 0,
            content: '---\ntags: [base, global]\naliases: [doc]\n---\nBase'
          },
          {
            path: 'Templates/project.md',
            folderPath: 'Projects',
            depth: 1,
            content: '---\ntags: [project]\naliases: [proj]\nstatus: active\n---\nProject'
          },
          {
            path: 'Templates/dev.md',
            folderPath: 'Projects/Dev',
            depth: 2,
            content: '---\ntags: [dev, code]\naliases: [development]\n---\nDev'
          }
        ],
        hasInheritance: true
      });

      // Mock processWithDeleteList for each template
      mockFrontmatterMerger.processWithDeleteList
        .mockReturnValueOnce({
          processedContent: 'tags: [base, global]\naliases: [doc]',
          newDeleteList: []
        })
        .mockReturnValueOnce({
          processedContent: 'tags: [project]\naliases: [proj]\nstatus: active',
          newDeleteList: []
        })
        .mockReturnValueOnce({
          processedContent: 'tags: [dev, code]\naliases: [development]',
          newDeleteList: []
        });

      // Mock mergeWithDeleteList for template merging
      mockFrontmatterMerger.mergeWithDeleteList
        .mockReturnValueOnce({
          mergedFrontmatter: 'tags: [base, global, project]\naliases: [doc, proj]\nstatus: active',
          updatedDeleteList: []
        })
        .mockReturnValueOnce({
          mergedFrontmatter:
            'tags: [base, global, project, dev, code]\naliases: [doc, proj, development]\nstatus: active',
          updatedDeleteList: []
        });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));

      mockVault.read.mockResolvedValue('');
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged:
          'tags: [base, global, project, dev, code]\naliases: [doc, proj, development]\nstatus: active',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---\n${fm}\n---\nBase\n\nProject\n\nDev`
      );

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);
      expect(mockFrontmatterMerger.mergeWithDeleteList).toHaveBeenCalledTimes(2);

      // Verify final content includes all parts
      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).toContain('tags: [base, global, project, dev, code]');
      expect(processedArg).toContain('aliases: [doc, proj, development]');
      expect(processedArg).toContain('status: active');
      expect(processedArg).toContain('Base');
      expect(processedArg).toContain('Project');
      expect(processedArg).toContain('Dev');
    });

    test('Should handle templates with only body content', async () => {
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/simple1.md', folderPath: 'Notes', depth: 0 },
          { path: 'Templates/simple2.md', folderPath: 'Notes/Sub', depth: 1 }
        ],
        hasInheritance: true
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/simple1.md',
            folderPath: 'Notes',
            depth: 0,
            content: 'First template content'
          },
          {
            path: 'Templates/simple2.md',
            folderPath: 'Notes/Sub',
            depth: 1,
            content: 'Second template content'
          }
        ],
        hasInheritance: true
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));

      mockVault.read.mockResolvedValue('');

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);

      // Verify merged content includes both body parts
      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).toBe('First template content\n\nSecond template content');
    });

    test('Should handle mix of templates with and without frontmatter', async () => {
      // Reset all mocks to clear any previous state
      jest.clearAllMocks();

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/with-fm.md', folderPath: 'Notes', depth: 0 },
          { path: 'Templates/without-fm.md', folderPath: 'Notes/Sub', depth: 1 }
        ],
        hasInheritance: true
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/with-fm.md',
            folderPath: 'Notes',
            depth: 0,
            content: '---\ntitle: Test\n---\nWith frontmatter'
          },
          {
            path: 'Templates/without-fm.md',
            folderPath: 'Notes/Sub',
            depth: 1,
            content: 'Without frontmatter'
          }
        ],
        hasInheritance: true
      });

      // Mock processWithDeleteList for the template with frontmatter
      mockFrontmatterMerger.processWithDeleteList.mockReturnValueOnce({
        processedContent: 'title: Test',
        newDeleteList: []
      });

      // No mergeWithDeleteList call expected when second template has no frontmatter

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));

      mockVault.read.mockResolvedValue('');
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'title: Test',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---\n${fm}\n---\nWith frontmatter\n\nWithout frontmatter`
      );

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);

      // Verify merged content preserves frontmatter and combines bodies
      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).toContain('---\ntitle: Test\n---');
      expect(processedArg).toContain('With frontmatter');
      expect(processedArg).toContain('Without frontmatter');
    });

    test('Should handle empty templates in chain', async () => {
      // Reset all mocks to clear any previous state
      jest.clearAllMocks();

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/empty.md', folderPath: 'Notes', depth: 0 },
          { path: 'Templates/content.md', folderPath: 'Notes/Sub', depth: 1 }
        ],
        hasInheritance: true
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/empty.md',
            folderPath: 'Notes',
            depth: 0,
            content: ''
          },
          {
            path: 'Templates/content.md',
            folderPath: 'Notes/Sub',
            depth: 1,
            content: '---\ntitle: Content\n---\nSome content'
          }
        ],
        hasInheritance: true
      });

      // Mock processWithDeleteList for non-empty template
      mockFrontmatterMerger.processWithDeleteList.mockReturnValueOnce({
        processedContent: 'title: Content',
        newDeleteList: []
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));

      mockVault.read.mockResolvedValue('');
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'title: Content',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---\n${fm}\n---\nSome content`
      );

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);
      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).toBe('---\ntitle: Content\n---\nSome content');
    });

    test('Should inherit list values from template chain when file has empty list', async () => {
      // This tests the bug where empty lists in files prevent inheritance
      const existingFileContent = '---\ntags: []\naliases: []\n---\nExisting content';

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/base.md', folderPath: '/', depth: 0 },
          { path: 'Templates/project.md', folderPath: 'Projects', depth: 1 }
        ],
        hasInheritance: true
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/base.md',
            folderPath: '/',
            depth: 0,
            content: '---\ntags: [base, global]\naliases: [doc]\n---\nBase'
          },
          {
            path: 'Templates/project.md',
            folderPath: 'Projects',
            depth: 1,
            content: '---\ntags: [project]\naliases: [proj]\n---\nProject'
          }
        ],
        hasInheritance: true
      });

      // Mock processWithDeleteList for first template
      mockFrontmatterMerger.processWithDeleteList.mockReturnValueOnce({
        processedContent: 'tags: [base, global]\naliases: [doc]',
        newDeleteList: []
      });

      // Mock mergeWithDeleteList for second template
      mockFrontmatterMerger.mergeWithDeleteList.mockReturnValueOnce({
        mergedFrontmatter: 'tags: [base, global, project]\naliases: [doc, proj]',
        updatedDeleteList: []
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));

      mockVault.read.mockResolvedValue(existingFileContent);

      // Now that the bug is fixed, empty lists in file should inherit template values
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'tags: [base, global, project]\naliases: [doc, proj]',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---\n${fm}\n---\nExisting content\n\nBase\n\nProject`
      );

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);

      // The test should verify that template values are preserved
      // Currently this will fail due to the bug
      expect(mockFrontmatterMerger.mergeWithFile).toHaveBeenCalledWith(
        existingFileContent,
        'tags: [base, global, project]\naliases: [doc, proj]'
      );
    });
  });

  describe('Delete List Template Inheritance', () => {
    const mockFile: MarkdownFile = {
      basename: 'test',
      extension: 'md' as const,
      path: 'Notes/test.md',
      name: 'test.md',
      parent: { path: 'Notes' },
      vault: {} as any,
      stat: {
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      }
    } as MarkdownFile;

    test('REQ-034: Should exclude properties from delete list in single template', async () => {
      // Reset all mocks to clear any previous state
      jest.clearAllMocks();

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/with-delete.md', folderPath: 'Notes', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/with-delete.md',
            folderPath: 'Notes',
            depth: 0,
            content: '---\nauthor: John\ndate: 2024-01-01\ndelete: [author]\n---\nContent'
          }
        ],
        hasInheritance: false
      });

      // Set up processWithDeleteList to remove delete property but keep everything else
      mockFrontmatterMerger.processWithDeleteList.mockReturnValue({
        processedContent: 'author: John\ndate: 2024-01-01',
        newDeleteList: ['author']
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));
      mockVault.read.mockResolvedValue('');

      // Mock mergeWithFile to return the processed frontmatter
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'author: John\ndate: 2024-01-01',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation((_, fm) => `---\n${fm}\n---\nContent`);

      const result = await applicator.applyTemplate(mockFile);
      expect(result.success).toBe(true);

      // Verify the delete property is removed but date remains
      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).toContain('date: 2024-01-01');
      expect(processedArg).not.toContain('delete:');
      expect(processedArg).toContain('author: John'); // Still there because it's explicitly defined
    });

    test('REQ-035: Should handle cumulative delete list through inheritance chain', async () => {
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/base.md', folderPath: '/', depth: 0 },
          { path: 'Templates/project.md', folderPath: 'Projects', depth: 1 },
          { path: 'Templates/dev.md', folderPath: 'Projects/Dev', depth: 2 }
        ],
        hasInheritance: true
      });

      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/base.md',
            folderPath: '/',
            depth: 0,
            content: '---\nauthor: John\ndate: 2024-01-01\ntags: [base]\n---\nBase'
          },
          {
            path: 'Templates/project.md',
            folderPath: 'Projects',
            depth: 1,
            content: '---\ndelete: [author, tags]\ncategory: project\n---\nProject'
          },
          {
            path: 'Templates/dev.md',
            folderPath: 'Projects/Dev',
            depth: 2,
            content: '---\nauthor: Jane\ntags: [dev]\n---\nDev'
          }
        ],
        hasInheritance: true
      });

      // Mock the first template processing
      mockFrontmatterMerger.processWithDeleteList.mockReturnValueOnce({
        processedContent: 'author: John\ndate: 2024-01-01\ntags: [base]',
        newDeleteList: []
      });

      // Mock subsequent merges with delete list
      mockFrontmatterMerger.mergeWithDeleteList
        .mockReturnValueOnce({
          mergedFrontmatter: 'date: 2024-01-01\ncategory: project',
          updatedDeleteList: ['author', 'tags']
        })
        .mockReturnValueOnce({
          mergedFrontmatter: 'date: 2024-01-01\ncategory: project\nauthor: Jane\ntags: [dev]',
          updatedDeleteList: [] // author and tags removed from delete list because redefined
        });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));
      mockVault.read.mockResolvedValue('');

      const result = await applicator.applyTemplate(mockFile);
      expect(result.success).toBe(true);

      // Final result should have Jane as author and [dev] as tags (re-added in dev template)
      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).toContain('author: Jane');
      expect(processedArg).toContain('tags: [dev]');
      expect(processedArg).toContain('date: 2024-01-01');
      expect(processedArg).toContain('category: project');
      expect(processedArg).not.toContain('delete:');
    });

    test('REQ-036: Should never include delete property in final output', async () => {
      // Clear specific mocks
      mockFrontmatterMerger.processWithDeleteList.mockClear();
      mockFrontmatterMerger.mergeWithDeleteList.mockClear();

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/t1.md', folderPath: 'A', depth: 0 },
          { path: 'Templates/t2.md', folderPath: 'A/B', depth: 1 }
        ],
        hasInheritance: true
      });

      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/t1.md',
            folderPath: 'A',
            depth: 0,
            content: '---\ndelete: [prop1]\nprop1: value1\nprop2: value2\n---\nT1'
          },
          {
            path: 'Templates/t2.md',
            folderPath: 'A/B',
            depth: 1,
            content: '---\ndelete: [prop2]\nprop3: value3\n---\nT2'
          }
        ],
        hasInheritance: true
      });

      mockFrontmatterMerger.processWithDeleteList.mockReturnValueOnce({
        processedContent: 'prop1: value1\nprop2: value2',
        newDeleteList: ['prop1']
      });

      mockFrontmatterMerger.mergeWithDeleteList.mockReturnValueOnce({
        mergedFrontmatter: 'prop1: value1\nprop3: value3',
        updatedDeleteList: ['prop1', 'prop2']
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));
      mockVault.read.mockResolvedValue('');

      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'prop1: value1\nprop3: value3',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation((_, fm) => `---\n${fm}\n---\nT1\n\nT2`);

      const result = await applicator.applyTemplate(mockFile);
      expect(result.success).toBe(true);

      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).not.toContain('delete:');
      expect(processedArg).toContain('prop1: value1');
      expect(processedArg).toContain('prop3: value3');
    });

    test('REQ-037: Should keep properties that are both in delete list and explicitly defined', async () => {
      // Reset all mocks to clear any previous state
      jest.clearAllMocks();

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/override.md', folderPath: 'Notes', depth: 0 }],
        hasInheritance: false
      });

      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/override.md',
            folderPath: 'Notes',
            depth: 0,
            content:
              '---\ndelete: [tags, author]\ntags: [important]\nauthor: System\ntitle: Note\n---\nContent'
          }
        ],
        hasInheritance: false
      });

      // Set up processWithDeleteList to keep explicitly defined properties
      mockFrontmatterMerger.processWithDeleteList.mockReturnValue({
        processedContent: 'tags: [important]\nauthor: System\ntitle: Note',
        newDeleteList: []
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));
      mockVault.read.mockResolvedValue('');

      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'tags: [important]\nauthor: System\ntitle: Note',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation((_, fm) => `---\n${fm}\n---\nContent`);

      const result = await applicator.applyTemplate(mockFile);
      expect(result.success).toBe(true);

      // tags and author should remain because they are explicitly defined
      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      expect(processedArg).toContain('tags: [important]');
      expect(processedArg).toContain('author: System');
      expect(processedArg).toContain('title: Note');
      expect(processedArg).not.toContain('delete:');
    });

    test('Should handle array concatenation with delete lists', async () => {
      // Clear specific mocks
      mockFrontmatterMerger.processWithDeleteList.mockClear();
      mockFrontmatterMerger.mergeWithDeleteList.mockClear();

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/base.md', folderPath: '/', depth: 0 },
          { path: 'Templates/child.md', folderPath: '/Sub', depth: 1 }
        ],
        hasInheritance: true
      });

      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/base.md',
            folderPath: '/',
            depth: 0,
            content: '---\ntags: [base, template]\naliases: [doc]\nauthor: BaseAuthor\n---\nBase'
          },
          {
            path: 'Templates/child.md',
            folderPath: '/Sub',
            depth: 1,
            content: '---\ndelete: [author]\ntags: [child, specific]\naliases: [subdoc]\n---\nChild'
          }
        ],
        hasInheritance: true
      });

      // Mock processWithDeleteList for base template
      mockFrontmatterMerger.processWithDeleteList.mockReturnValueOnce({
        processedContent: 'tags: [base, template]\naliases: [doc]\nauthor: BaseAuthor',
        newDeleteList: []
      });

      // Mock mergeWithDeleteList for child template with delete list
      mockFrontmatterMerger.mergeWithDeleteList.mockReturnValueOnce({
        mergedFrontmatter: 'tags: [base, template, child, specific]\naliases: [doc, subdoc]',
        updatedDeleteList: ['author']
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content,
        variables: {},
        hasSnowflakeId: false
      }));
      mockVault.read.mockResolvedValue('');

      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: 'tags: [base, template, child, specific]\naliases: [doc, subdoc]',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---\n${fm}\n---\nBase\n\nChild`
      );

      const result = await applicator.applyTemplate(mockFile);
      expect(result.success).toBe(true);

      const processedArg = mockVariableProcessor.processTemplate.mock.calls[0][0];
      // Arrays should be concatenated
      expect(processedArg).toContain('tags: [base, template, child, specific]');
      expect(processedArg).toContain('aliases: [doc, subdoc]');
      // Author should be excluded
      expect(processedArg).not.toContain('author:');
      expect(processedArg).not.toContain('delete:');
    });
  });

  describe('Empty Property Cleanup (REQ-038)', () => {
    const mockFile: MarkdownFile = {
      basename: 'test',
      extension: 'md' as const,
      path: 'Notes/test.md',
      name: 'test.md',
      parent: { path: 'Notes' },
      vault: {} as any,
      stat: {
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      }
    } as MarkdownFile;

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
    });

    test('Should clean up empty properties not from templates on existing files', async () => {
      const existingContent = `---
title: My Note
author:
description:
tags: [personal]
---
Existing content`;

      const templateContent = `---
title: {{title}}
tags: [template]
category: blog
---
Template content`;

      // Set up template chain
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/note.md', folderPath: 'Notes', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/note.md',
            folderPath: 'Notes',
            depth: 0,
            content: templateContent
          }
        ],
        hasInheritance: false
      });

      // Mock the FrontmatterMerger methods that are used during template merging
      mockFrontmatterMerger.processWithDeleteList.mockReturnValue({
        processedContent: 'title: {{title}}\ntags: [template]\ncategory: blog',
        newDeleteList: []
      });

      // Mock property extraction - template provides title, tags, category
      mockFrontmatterMerger.extractPropertyNames.mockImplementation((content) => {
        // For the template frontmatter
        if (content.includes('category: blog')) {
          return new Set(['title', 'tags', 'category']);
        }
        // For the merged file content
        if (content.includes('author:')) {
          return new Set(['title', 'author', 'description', 'tags', 'category']);
        }
        return new Set();
      });

      // Mock template processing
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: `---
title: test
tags: [template]
category: blog
---
Template content`,
        variables: { title: 'test' },
        hasSnowflakeId: false
      });

      // Mock file read - file has existing content with empty properties
      mockVault.read.mockResolvedValue(existingContent);

      // Mock frontmatter merge
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: `title: My Note
author:
description:
tags: [personal, template]
category: blog`,
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---
${fm}
---
Existing content

Template content`
      );

      // Mock cleanup - should remove author and description (empty and not from template)
      mockFrontmatterMerger.cleanupEmptyProperties.mockReturnValue(`title: My Note
tags: [personal, template]
category: blog`);

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);

      // Verify cleanup was called with template properties
      expect(mockFrontmatterMerger.cleanupEmptyProperties).toHaveBeenCalledWith(
        expect.stringContaining('author:'),
        new Set(['title', 'tags', 'category'])
      );

      // Verify file was modified twice - once for template, once for cleanup
      expect(mockVault.modify).toHaveBeenCalledTimes(2);

      // Verify final content doesn't have empty properties
      const finalModifyCall = mockVault.modify.mock.calls[1];
      expect(finalModifyCall[1]).toContain('title: My Note');
      expect(finalModifyCall[1]).toContain('tags: [personal, template]');
      expect(finalModifyCall[1]).toContain('category: blog');
      expect(finalModifyCall[1]).not.toContain('author:');
      expect(finalModifyCall[1]).not.toContain('description:');
    });

    test('Should NOT clean up empty properties on new files', async () => {
      const templateContent = `---
title: {{title}}
author:
tags: []
---
Template content`;

      // Set up template chain
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/note.md', folderPath: 'Notes', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/note.md',
            folderPath: 'Notes',
            depth: 0,
            content: templateContent
          }
        ],
        hasInheritance: false
      });

      // Mock property extraction
      mockFrontmatterMerger.extractPropertyNames.mockReturnValue(
        new Set(['title', 'author', 'tags'])
      );

      // Mock template processing
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: `---
title: test
author:
tags: []
---
Template content`,
        variables: { title: 'test' },
        hasSnowflakeId: false
      });

      // Mock file read - NEW FILE (empty content)
      mockVault.read.mockResolvedValue('');

      // Mock frontmatter merge
      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: `title: test
author:
tags: []`,
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue(`---
title: test
author:
tags: []
---
Template content`);

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);

      // Verify cleanup was NOT called for new file
      expect(mockFrontmatterMerger.cleanupEmptyProperties).not.toHaveBeenCalled();

      // Verify file was only modified once (no cleanup)
      expect(mockVault.modify).toHaveBeenCalledTimes(1);

      // Verify empty properties from template are preserved
      const finalContent = mockVault.modify.mock.calls[0][1];
      expect(finalContent).toContain('author:');
      expect(finalContent).toContain('tags: []');
    });

    test('Should track properties through template inheritance chain', async () => {
      const existingContent = `---
title: My Note
baseAuthor:
projectLead:
devLead:
tags: []
---
Content`;

      // Set up template chain with inheritance
      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [
          { path: 'Templates/base.md', folderPath: '/', depth: 0 },
          { path: 'Templates/project.md', folderPath: 'Projects', depth: 1 },
          { path: 'Templates/dev.md', folderPath: 'Projects/Dev', depth: 2 }
        ],
        hasInheritance: true
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/base.md',
            folderPath: '/',
            depth: 0,
            content: '---\nbaseAuthor: \ntags: [base]\n---\nBase'
          },
          {
            path: 'Templates/project.md',
            folderPath: 'Projects',
            depth: 1,
            content: '---\nprojectLead: \ntags: [project]\n---\nProject'
          },
          {
            path: 'Templates/dev.md',
            folderPath: 'Projects/Dev',
            depth: 2,
            content: '---\ndevLead: \ntags: [dev]\n---\nDev'
          }
        ],
        hasInheritance: true
      });

      // Mock property extraction - now only called once for final merged template
      mockFrontmatterMerger.extractPropertyNames.mockImplementation((content) => {
        // For the final merged template
        if (content.includes('devLead:')) {
          return new Set(['baseAuthor', 'tags', 'projectLead', 'devLead']);
        }
        return new Set();
      });

      // Set up merge mocks
      mockFrontmatterMerger.processWithDeleteList.mockReturnValue({
        processedContent: 'baseAuthor: \ntags: [base]',
        newDeleteList: []
      });
      mockFrontmatterMerger.mergeWithDeleteList
        .mockReturnValueOnce({
          mergedFrontmatter: 'baseAuthor: \nprojectLead: \ntags: [base, project]',
          updatedDeleteList: []
        })
        .mockReturnValueOnce({
          mergedFrontmatter: 'baseAuthor: \nprojectLead: \ndevLead: \ntags: [base, project, dev]',
          updatedDeleteList: []
        });

      mockVariableProcessor.processTemplate.mockReturnValue({
        content:
          '---\nbaseAuthor: \nprojectLead: \ndevLead: \ntags: [base, project, dev]\n---\nBase\n\nProject\n\nDev',
        variables: {},
        hasSnowflakeId: false
      });

      mockVault.read.mockResolvedValue(existingContent);

      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged:
          'title: My Note\nbaseAuthor: \nprojectLead: \ndevLead: \ntags: [base, project, dev]',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---\n${fm}\n---\nContent\n\nBase\n\nProject\n\nDev`
      );

      // Mock cleanup - all empty properties are from templates, so none should be removed
      mockFrontmatterMerger.cleanupEmptyProperties.mockImplementation(
        (fm: string, props: Set<string>) => fm
      );

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);

      // Verify template properties were extracted from final merged template
      expect(mockFrontmatterMerger.extractPropertyNames).toHaveBeenCalledTimes(1);

      // Verify cleanup was called with all template properties
      expect(mockFrontmatterMerger.cleanupEmptyProperties).toHaveBeenCalledWith(
        expect.any(String),
        new Set(['baseAuthor', 'tags', 'projectLead', 'devLead'])
      );
    });

    test('Should work with applySpecificTemplate for manual commands', async () => {
      const existingContent = `---
title: My Note
author:
tags: [personal]
notes:
---
Content`;

      const templateContent = `---
title: {{title}}
tags: [template]
status: draft
---
Template`;

      mockTemplateLoader.loadTemplate.mockResolvedValue(templateContent);

      mockVariableProcessor.processTemplate.mockReturnValue({
        content: `---
title: test
tags: [template]
status: draft
---
Template`,
        variables: { title: 'test' },
        hasSnowflakeId: false
      });

      mockVault.read.mockResolvedValue(existingContent);

      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: `title: My Note
author:
tags: [personal, template]
notes:
status: draft`,
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---
${fm}
---
Content

Template`
      );

      const result = await applicator.applySpecificTemplate(mockFile, 'Templates/specific.md');

      expect(result.success).toBe(true);

      // Verify cleanup was NOT called for specific template
      expect(mockFrontmatterMerger.cleanupEmptyProperties).not.toHaveBeenCalled();

      // Verify file was only modified once (no cleanup)
      expect(mockVault.modify).toHaveBeenCalledTimes(1);

      // Verify empty properties from original file are preserved
      const finalContent = mockVault.modify.mock.calls[0][1];
      expect(finalContent).toContain('author:');
      expect(finalContent).toContain('notes:');
    });

    test('Should remove delete property when applying specific template', async () => {
      const existingContent = `---
title: My Note
author: John
---
Content`;

      const templateContent = `---
title: Template Title
delete: [author, tags]
category: blog
---
Template content`;

      mockTemplateLoader.loadTemplate.mockResolvedValue(templateContent);

      // Mock processWithDeleteList to remove delete property
      mockFrontmatterMerger.processWithDeleteList.mockReturnValue({
        processedContent: `title: Template Title
category: blog`,
        newDeleteList: []
      });

      mockVariableProcessor.processTemplate.mockImplementation((content) => ({
        content: content.replace('Template Title', 'test'),
        variables: { title: 'test' },
        hasSnowflakeId: false
      }));

      mockVault.read.mockResolvedValue(existingContent);

      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: `title: My Note
author: John
category: blog`,
        hasSnowflakeId: false
      });

      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---
${fm}
---
Content

Template content`
      );

      const result = await applicator.applySpecificTemplate(mockFile, 'Templates/specific.md');

      expect(result.success).toBe(true);

      // Verify processWithDeleteList was called to remove delete property
      expect(mockFrontmatterMerger.processWithDeleteList).toHaveBeenCalledWith(
        expect.stringContaining('delete: [author, tags]'),
        []
      );

      // Verify the template content passed to processTemplate doesn't have delete property
      expect(mockVariableProcessor.processTemplate).toHaveBeenCalledWith(
        expect.not.stringContaining('delete:'),
        mockFile
      );

      // Verify the final content doesn't have delete property
      const finalContent = mockVault.modify.mock.calls[0][1];
      expect(finalContent).not.toContain('delete:');
    });

    test('Should handle cleanup when frontmatter becomes identical', async () => {
      const existingContent = `---
title: My Note
author: John
---
Content`;

      const templateContent = `---
title: {{title}}
author: John
---
Template`;

      mockTemplateLoader.getTemplateChain.mockReturnValue({
        templates: [{ path: 'Templates/note.md', folderPath: 'Notes', depth: 0 }],
        hasInheritance: false
      });
      mockTemplateLoader.loadTemplateChain.mockResolvedValue({
        templates: [
          {
            path: 'Templates/note.md',
            folderPath: 'Notes',
            depth: 0,
            content: templateContent
          }
        ],
        hasInheritance: false
      });

      mockFrontmatterMerger.extractPropertyNames.mockReturnValue(new Set(['title', 'author']));

      mockVariableProcessor.processTemplate.mockReturnValue({
        content: `---
title: test
author: John
---
Template`,
        variables: { title: 'test' },
        hasSnowflakeId: false
      });

      mockVault.read.mockResolvedValue(existingContent);

      mockFrontmatterMerger.mergeWithFile.mockReturnValue({
        merged: `title: My Note
author: John`,
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockImplementation(
        (_, fm) => `---
${fm}
---
Content

Template`
      );

      // Mock cleanup returns same content (no changes needed)
      mockFrontmatterMerger.cleanupEmptyProperties.mockReturnValue(`title: My Note
author: John`);

      const result = await applicator.applyTemplate(mockFile);

      expect(result.success).toBe(true);

      // Verify cleanup was called
      expect(mockFrontmatterMerger.cleanupEmptyProperties).toHaveBeenCalled();

      // Verify file was only modified once since cleanup didn't change anything
      expect(mockVault.modify).toHaveBeenCalledTimes(1);
    });
  });
});

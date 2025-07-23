/**
 * Tests for Template Applicator
 */

import { TemplateApplicator } from './template-applicator';
import { Vault, Editor, Notice, TFile } from 'obsidian';
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
  ...jest.requireActual('obsidian'),
  Notice: jest.fn()
}));

describe('TemplateApplicator', () => {
  let applicator: TemplateApplicator;
  let mockVault: {
    read: jest.MockedFunction<(file: TFile) => Promise<string>>;
    modify: jest.MockedFunction<(file: TFile, data: string) => Promise<void>>;
  };
  let settings: SnowflakeSettings;
  let consoleErrorSpy: jest.SpyInstance;

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
    mergeFrontmatter: jest.fn()
  };

  const mockErrorHandler = {
    handleError: jest.fn(),
    handleErrorSilently: jest.fn()
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock console.error to prevent noise in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

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
        Projects: 'Templates/project.md'
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

    mockErrorHandler.handleError.mockReturnValue('Error occurred');

    // Create applicator instance
    applicator = new TemplateApplicator(mockVault as unknown as Vault, settings);
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
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
      expect(Notice).toHaveBeenCalledWith('Template applied to test');
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
      path: 'test.md',
      name: 'test.md',
      parent: null,
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
      expect(Notice).toHaveBeenCalledWith('Template applied to test');
    });

    test('Should handle template not found', async () => {
      mockTemplateLoader.loadTemplate.mockResolvedValue(null);

      const result = await applicator.applySpecificTemplate(mockFile, 'Templates/missing.md');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Template not found');
      expect(Notice).toHaveBeenCalledWith('Template not found: Templates/missing.md');
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
      expect(mockFrontmatterMerger.mergeFrontmatter).toHaveBeenCalledWith(
        'author: John\ntags: [base]',
        'title: Project\ntags: [project]'
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

      // First merge: base + project
      mockFrontmatterMerger.mergeFrontmatter
        .mockReturnValueOnce({
          merged: 'tags: [base, global, project]\naliases: [doc, proj]\nstatus: active'
        })
        // Second merge: (base+project) + dev
        .mockReturnValueOnce({
          merged:
            'tags: [base, global, project, dev, code]\naliases: [doc, proj, development]\nstatus: active'
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
      expect(mockFrontmatterMerger.mergeFrontmatter).toHaveBeenCalledTimes(2);

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

      // First merge: base + project templates
      mockFrontmatterMerger.mergeFrontmatter.mockReturnValue({
        merged: 'tags: [base, global, project]\naliases: [doc, proj]'
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
});

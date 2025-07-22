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
    updateSettings: jest.fn()
  };

  const mockVariableProcessor = {
    processTemplate: jest.fn()
  };

  const mockFrontmatterMerger = {
    merge: jest.fn(),
    applyToFile: jest.fn()
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
      defaultTemplate: 'Templates/default.md',
      enableAutoTemplating: true,
      templatesFolder: 'Templates'
    };

    // Reset all mocks to default behavior
    mockTemplateLoader.getTemplateForFile.mockReturnValue(null);
    mockTemplateLoader.loadTemplate.mockResolvedValue(null);
    mockTemplateLoader.templateExists.mockResolvedValue(false);

    mockVariableProcessor.processTemplate.mockReturnValue({
      content: '',
      variables: {},
      hasSnowflakeId: false
    });

    mockFrontmatterMerger.merge.mockReturnValue({
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
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/project.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue(templateContent);
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: processedTemplate,
        variables: {
          title: 'test',
          date: '2024-01-01',
          snowflakeId: 'abc123'
        },
        hasSnowflakeId: true
      });
      mockFrontmatterMerger.merge.mockReturnValue({
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
      expect(mockFrontmatterMerger.merge).toHaveBeenCalledWith(
        existingContent,
        'title: test\ntags: [template]\ndate: 2024-01-01\nid: abc123'
      );
    });

    test('Should show error when template not found', async () => {
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/missing.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue(null);

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Template not found');
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(mockVault.modify).not.toHaveBeenCalled();
    });

    test('Should apply template even to files with existing snowflake_id', async () => {
      const contentWithId = `---
id: existing123
---
Content`;

      mockVault.read.mockResolvedValue(contentWithId);
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/default.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue('Template content');
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: 'Template content',
        variables: {},
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.merge.mockReturnValue({
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
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/default.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue(templateContent);
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: processedContent,
        variables: { title: 'test' },
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.merge.mockReturnValue({
        merged: 'title: test',
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.applyToFile.mockReturnValue(processedContent);

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockFile, expect.any(String));
    });

    test('Should handle editor cursor position when provided', async () => {
      const mockEditor = {
        getCursor: jest.fn().mockReturnValue({ line: 5, ch: 0 })
      } as any;

      const existingContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
      const templateContent = 'Template content';

      mockVault.read.mockResolvedValue(existingContent);
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/default.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue(templateContent);
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
      expect(mockFrontmatterMerger.merge).not.toHaveBeenCalled();
      // Verify that the editor cursor was used
      expect(mockEditor.getCursor).toHaveBeenCalled();
      expect(mockVault.modify).toHaveBeenCalled();
    });

    test('Should handle template processing errors', async () => {
      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/default.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue('{{invalid}}');
      mockVariableProcessor.processTemplate.mockImplementation(() => {
        throw new Error('Invalid variable');
      });

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
      expect(mockErrorHandler.handleError).toHaveBeenCalled();
    });

    test('REQ-005: Should not apply template when auto-templating is disabled', async () => {
      // Disable auto-templating
      applicator.updateSettings({ ...settings, enableAutoTemplating: false });

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Auto-templating is disabled');
      expect(mockVault.modify).not.toHaveBeenCalled();
    });

    test('REQ-025: Should apply template with manual command even when auto-templating is disabled', async () => {
      // Disable auto-templating
      applicator.updateSettings({ ...settings, enableAutoTemplating: false });

      const templateContent = `---
title: {{title}}
---
Template`;

      mockVault.read.mockResolvedValue('');
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/default.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue(templateContent);
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: '---\ntitle: test\n---\nTemplate',
        variables: { title: 'test' },
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.merge.mockReturnValue({
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
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/default.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue('Template');
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: 'Template',
        variables: {},
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.merge.mockReturnValue({
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
      mockTemplateLoader.getTemplateForFile.mockReturnValue('Templates/default.md');
      mockTemplateLoader.loadTemplate.mockResolvedValue('Template');
      mockVariableProcessor.processTemplate.mockReturnValue({
        content: 'Template',
        variables: {},
        hasSnowflakeId: false
      });
      mockFrontmatterMerger.merge.mockReturnValue({
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
      mockTemplateLoader.getTemplateForFile.mockReturnValue(null);

      const result = await applicator.applyTemplate(mockFile, { isManualCommand: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No template configured');
      expect(mockVault.modify).not.toHaveBeenCalled();
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
      mockFrontmatterMerger.merge.mockReturnValue({
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
        ...settings,
        defaultTemplate: 'Templates/new-default.md'
      };

      applicator.updateSettings(newSettings);

      // Only TemplateLoader has updateSettings method
      expect(mockTemplateLoader.updateSettings).toHaveBeenCalledWith(newSettings);
    });
  });
});

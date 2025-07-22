/**
 * Tests for Snowflake Commands
 */

import { SnowflakeCommands } from './commands';
import { Plugin, Notice, Editor, MarkdownView, TFile, TFolder } from 'obsidian';
import { SnowflakeSettings } from './types';
import { TemplateApplicator } from './template-applicator';
import { FolderSuggestModal } from './ui/folder-modal';

// Mock the dependencies
jest.mock('./template-applicator');
jest.mock('./ui/folder-modal');
jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  Notice: jest.fn()
}));

describe('SnowflakeCommands', () => {
  let commands: SnowflakeCommands;
  let mockPlugin: Plugin;
  let settings: SnowflakeSettings;
  let mockTemplateApplicator: jest.Mocked<TemplateApplicator>;
  let mockFolderModal: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock console.error to prevent noise in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock FolderSuggestModal constructor
    mockFolderModal = {
      open: jest.fn()
    };
    (FolderSuggestModal as jest.Mock).mockImplementation((app, callback) => {
      mockFolderModal.callback = callback;
      return mockFolderModal;
    });

    // Mock plugin
    mockPlugin = {
      app: {
        vault: {} as any
      },
      addCommand: jest.fn()
    } as any;

    // Default settings
    settings = {
      templateMappings: {
        'Projects': 'Templates/project.md'
      },
      defaultTemplate: 'Templates/default.md',
      enableAutoTemplating: false, // Disabled to test REQ-025
      templatesFolder: 'Templates'
    };

    // Create commands instance
    commands = new SnowflakeCommands(mockPlugin, settings);

    // Get mocked TemplateApplicator
    mockTemplateApplicator = (TemplateApplicator as jest.MockedClass<
      typeof TemplateApplicator
    >).mock.instances[0] as jest.Mocked<TemplateApplicator>;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('registerCommands', () => {
    test('Should register two commands', () => {
      commands.registerCommands();

      expect(mockPlugin.addCommand).toHaveBeenCalledTimes(2);

      // Check first command
      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'apply-template-to-current-note',
        name: 'Apply template to current note',
        editorCallback: expect.any(Function)
      });

      // Check second command
      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'apply-template-to-folder',
        name: 'Apply template to all notes in folder',
        callback: expect.any(Function)
      });
    });
  });

  describe('Apply template to current note command', () => {
    let editorCallback: (editor: Editor, view: MarkdownView) => void;
    let mockEditor: Editor;
    let mockView: MarkdownView;

    beforeEach(() => {
      commands.registerCommands();
      // Get the registered callback
      editorCallback = (mockPlugin.addCommand as jest.Mock).mock.calls[0][0]
        .editorCallback;

      mockEditor = {} as Editor;
      mockView = {
        file: null
      } as any;
    });

    test('Should show notice when no active file', async () => {
      mockView.file = null;

      await editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('No active file');
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should show notice for non-markdown files', async () => {
      mockView.file = {
        extension: 'txt',
        basename: 'test'
      } as any;

      await editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('Current file is not a markdown file');
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('REQ-025: Should apply template even when auto-templating is disabled', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        parent: { path: 'Projects' }
      } as any;
      mockView.file = mockFile;

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      await editorCallback(mockEditor, mockView);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(
        mockFile,
        { isManualCommand: true },
        mockEditor
      );
      // Should not show notice on success
      expect(Notice).not.toHaveBeenCalled();
    });

    test('Should show notice on failure', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        parent: { path: 'Projects' }
      } as any;
      mockView.file = mockFile;

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: false,
        message: 'No template found'
      });

      await editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('No template found');
    });

    test('Should handle errors gracefully', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        parent: { path: 'Projects' }
      } as any;
      mockView.file = mockFile;

      const error = new Error('Template error');
      mockTemplateApplicator.applyTemplate.mockRejectedValue(error);

      await editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('Error applying template: Template error');
    });
  });

  describe('Apply template to folder command', () => {
    let folderCallback: () => void;

    beforeEach(() => {
      commands.registerCommands();
      // Get the registered callback
      folderCallback = (mockPlugin.addCommand as jest.Mock).mock.calls[1][0]
        .callback;
    });

    test('REQ-019: Should show folder selection modal', () => {
      folderCallback();

      expect(FolderSuggestModal).toHaveBeenCalledWith(
        mockPlugin.app,
        expect.any(Function)
      );
      expect(mockFolderModal.open).toHaveBeenCalled();
    });
  });

  describe('processFolderBatch', () => {
    let processFolderBatch: (folder: TFolder) => Promise<void>;

    beforeEach(() => {
      commands.registerCommands();

      // Trigger the folder command to register the callback
      const folderCallback = (mockPlugin.addCommand as jest.Mock).mock.calls[1][0]
        .callback;
      folderCallback();

      // Get the folder selection callback
      processFolderBatch = mockFolderModal.callback;
    });

    test('Should show notice when no markdown files found', async () => {
      const mockFolder = {
        children: []
      } as any;

      await processFolderBatch(mockFolder);

      expect(Notice).toHaveBeenCalledWith('No markdown files found in selected folder');
    });

    test('REQ-020/REQ-021: Should process all markdown files asynchronously', async () => {
      const mockFiles = Array(25).fill(null).map((_, i) =>
        Object.assign(new TFile(), {
          extension: 'md',
          basename: `file${i}`,
          path: `folder/file${i}.md`,
          parent: { path: 'folder' }
        })
      );

      const mockFolder = Object.assign(new TFolder(), {
        children: mockFiles
      });

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      await processFolderBatch(mockFolder);

      // Should process all files
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(25);

      // REQ-022: Should show completion notice
      expect(Notice).toHaveBeenCalledWith('Processing 25 files...');
      expect(Notice).toHaveBeenCalledWith('Templates applied to 25 notes');
    });

    test('Should handle partial success', async () => {
      const mockFiles = Array(10).fill(null).map((_, i) =>
        Object.assign(new TFile(), {
          extension: 'md',
          basename: `file${i}`,
          path: `folder/file${i}.md`,
          parent: { path: 'folder' }
        })
      );

      const mockFolder = Object.assign(new TFolder(), {
        children: mockFiles
      });

      // Make half succeed and half fail
      mockTemplateApplicator.applyTemplate
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValue({ success: false, message: 'Failed' });

      await processFolderBatch(mockFolder);

      expect(Notice).toHaveBeenCalledWith('Templates applied to 5 of 10 notes');
    });

    test('Should handle nested folders', async () => {
      // Create mock files
      const nestedFile = Object.assign(new TFile(), {
        extension: 'md',
        basename: 'nested',
        path: 'folder/sub/nested.md',
        parent: { path: 'folder/sub' }
      });

      const file1 = Object.assign(new TFile(), {
        extension: 'md',
        basename: 'file1',
        path: 'folder/file1.md',
        parent: { path: 'folder' }
      });

      const txtFile = Object.assign(new TFile(), {
        extension: 'txt',
        basename: 'ignored',
        path: 'folder/ignored.txt'
      });

      const mockSubfolder = Object.assign(new TFolder(), {
        children: [nestedFile]
      });

      const mockFolder = Object.assign(new TFolder(), {
        children: [file1, mockSubfolder, txtFile]
      });

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      await processFolderBatch(mockFolder);

      // Should process markdown files only
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateSettings', () => {
    test('Should update internal settings and applicator', () => {
      const newSettings: SnowflakeSettings = {
        ...settings,
        enableAutoTemplating: true
      };

      commands.updateSettings(newSettings);

      expect(mockTemplateApplicator.updateSettings).toHaveBeenCalledWith(
        newSettings
      );
    });
  });
});


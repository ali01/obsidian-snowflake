/**
 * Tests for Snowflake Commands
 */

import { SnowflakeCommands } from './commands';
import { Plugin, Notice, Editor, MarkdownView, MarkdownFileInfo, TFile, TFolder } from 'obsidian';
import { SnowflakeSettings } from './types';
import { TemplateApplicator } from './template-applicator';
import { ConfirmationModal } from './ui/confirmation-modal';

// Mock the dependencies
jest.mock('./template-applicator');
jest.mock('./ui/confirmation-modal');
jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  Notice: jest.fn()
}));

describe('SnowflakeCommands', () => {
  let commands: SnowflakeCommands;
  let mockPlugin: Plugin;
  let settings: SnowflakeSettings;
  let mockTemplateApplicator: jest.Mocked<TemplateApplicator>;
  let mockConfirmationModal: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock console.error to prevent noise in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock ConfirmationModal constructor
    mockConfirmationModal = {
      open: jest.fn()
    };
    (ConfirmationModal as jest.Mock).mockImplementation(
      (app, title, message, onConfirm, onCancel) => {
        mockConfirmationModal.onConfirm = onConfirm;
        mockConfirmationModal.onCancel = onCancel;
        return mockConfirmationModal;
      }
    );

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
        Projects: 'Templates/project.md'
      },
      defaultTemplate: 'Templates/default.md',

      templatesFolder: 'Templates'
    };

    // Create commands instance
    commands = new SnowflakeCommands(mockPlugin, settings);

    // Get mocked TemplateApplicator
    mockTemplateApplicator = (TemplateApplicator as jest.MockedClass<typeof TemplateApplicator>)
      .mock.instances[0] as jest.Mocked<TemplateApplicator>;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('registerCommands', () => {
    test('Should register one command', () => {
      commands.registerCommands();

      expect(mockPlugin.addCommand).toHaveBeenCalledTimes(1);

      // Check the command
      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'apply-template-to-current-note',
        name: 'Apply mapped templates',
        editorCallback: expect.any(Function)
      });
    });
  });

  describe('Apply mapped templates command', () => {
    let editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => void;
    let mockEditor: Editor;
    let mockView: MarkdownView | MarkdownFileInfo;

    beforeEach(() => {
      commands.registerCommands();
      // Get the registered callback
      editorCallback = (mockPlugin.addCommand as jest.Mock).mock.calls[0][0].editorCallback;

      mockEditor = {} as Editor;
      mockView = {
        file: null
      } as any;
    });

    test('Should show notice when no active file', async () => {
      mockView = {
        file: null
      } as any;

      await editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('No active file');
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should show notice for non-markdown files', async () => {
      mockView = {
        file: {
          extension: 'txt',
          basename: 'test'
        } as any
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
      mockView = {
        file: mockFile
      } as any;

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
      mockView = {
        file: mockFile
      } as any;

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
      mockView = {
        file: mockFile
      } as any;

      const error = new Error('Template error');
      mockTemplateApplicator.applyTemplate.mockRejectedValue(error);

      await editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('Error applying template: Template error');
    });
  });

  describe('applyTemplateToFolderPath', () => {
    test('Should process markdown files in the specified folder', async () => {
      const mockFolder = Object.assign(new TFolder(), {
        children: [
          Object.assign(new TFile(), {
            extension: 'md',
            basename: 'test',
            path: 'folder/test.md'
          })
        ],
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      // Auto-confirm the dialog
      (ConfirmationModal as jest.Mock).mockImplementationOnce(
        (app, title, message, onConfirm, onCancel) => {
          const modal = mockConfirmationModal;
          modal.onConfirm = onConfirm;
          modal.onCancel = onCancel;
          setTimeout(() => onConfirm(), 0);
          return modal;
        }
      );

      await commands.applyTemplateToFolderPath('folder');

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlugin.app.vault.getAbstractFileByPath).toHaveBeenCalledWith('folder');
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith('Templates applied to 1 notes');
    });

    test('Should show error when folder does not exist', async () => {
      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);

      await commands.applyTemplateToFolderPath('nonexistent');

      expect(Notice).toHaveBeenCalledWith('Folder not found: nonexistent');
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });
  });

  describe('Batch processing (via applyTemplateToFolderPath)', () => {
    test('Should show notice when no markdown files found', async () => {
      const mockFolder = Object.assign(new TFolder(), {
        children: [],
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      await commands.applyTemplateToFolderPath('folder');

      expect(Notice).toHaveBeenCalledWith('No markdown files found in selected folder');
    });

    test('REQ-020/REQ-021: Should process all markdown files asynchronously', async () => {
      const mockFiles = Array(25)
        .fill(null)
        .map((_, i) =>
          Object.assign(new TFile(), {
            extension: 'md',
            basename: `file${i}`,
            path: `folder/file${i}.md`,
            parent: { path: 'folder' }
          })
        );

      const mockFolder = Object.assign(new TFolder(), {
        children: mockFiles,
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      // Auto-confirm the dialog
      (ConfirmationModal as jest.Mock).mockImplementationOnce(
        (app, title, message, onConfirm, onCancel) => {
          const modal = mockConfirmationModal;
          modal.onConfirm = onConfirm;
          modal.onCancel = onCancel;
          setTimeout(() => onConfirm(), 0);
          return modal;
        }
      );

      await commands.applyTemplateToFolderPath('folder');

      // Wait for all batches to complete (3 batches with 10ms delay between each)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should process all files
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(25);

      // REQ-022: Should show completion notice
      expect(Notice).toHaveBeenCalledWith('Templates applied to 25 notes');
    });

    test('Should handle partial success', async () => {
      const mockFiles = Array(10)
        .fill(null)
        .map((_, i) =>
          Object.assign(new TFile(), {
            extension: 'md',
            basename: `file${i}`,
            path: `folder/file${i}.md`,
            parent: { path: 'folder' }
          })
        );

      const mockFolder = Object.assign(new TFolder(), {
        children: mockFiles,
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      // Make half succeed and half fail
      mockTemplateApplicator.applyTemplate
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValue({ success: false, message: 'Failed' });

      // Auto-confirm the dialog
      (ConfirmationModal as jest.Mock).mockImplementationOnce(
        (app, title, message, onConfirm, onCancel) => {
          const modal = mockConfirmationModal;
          modal.onConfirm = onConfirm;
          modal.onCancel = onCancel;
          setTimeout(() => onConfirm(), 0);
          return modal;
        }
      );

      await commands.applyTemplateToFolderPath('folder');

      // Wait for batch processing to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

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
        children: [file1, mockSubfolder, txtFile],
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      // Auto-confirm the dialog
      (ConfirmationModal as jest.Mock).mockImplementationOnce(
        (app, title, message, onConfirm, onCancel) => {
          const modal = mockConfirmationModal;
          modal.onConfirm = onConfirm;
          modal.onCancel = onCancel;
          setTimeout(() => onConfirm(), 0);
          return modal;
        }
      );

      await commands.applyTemplateToFolderPath('folder');

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should process markdown files only
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(2);
    });

    test('Should show confirmation dialog before processing files', async () => {
      const mockFiles = [
        Object.assign(new TFile(), {
          extension: 'md',
          basename: 'test1',
          path: 'folder/test1.md'
        }),
        Object.assign(new TFile(), {
          extension: 'md',
          basename: 'test2',
          path: 'folder/test2.md'
        })
      ];

      const mockFolder = Object.assign(new TFolder(), {
        children: mockFiles,
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      // Simulate user confirming
      (ConfirmationModal as jest.Mock).mockImplementationOnce(
        (app, title, message, onConfirm, onCancel) => {
          const modal = mockConfirmationModal;
          modal.onConfirm = onConfirm;
          modal.onCancel = onCancel;
          // Simulate immediate confirmation
          setTimeout(() => onConfirm(), 0);
          return modal;
        }
      );

      await commands.applyTemplateToFolderPath('folder');

      // Verify confirmation dialog was shown with correct message
      expect(ConfirmationModal).toHaveBeenCalledWith(
        mockPlugin.app,
        'Apply templates to 2 notes in "folder"?',
        'This will apply the appropriate template to all markdown files in this folder.',
        expect.any(Function),
        expect.any(Function)
      );
      expect(mockConfirmationModal.open).toHaveBeenCalled();

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify files were processed after confirmation
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(2);
      expect(Notice).toHaveBeenCalledWith('Templates applied to 2 notes');
    });

    test('Should cancel processing when user declines confirmation', async () => {
      const mockFiles = [
        Object.assign(new TFile(), {
          extension: 'md',
          basename: 'test1',
          path: 'folder/test1.md'
        })
      ];

      const mockFolder = Object.assign(new TFolder(), {
        children: mockFiles,
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      // Simulate user cancelling
      (ConfirmationModal as jest.Mock).mockImplementationOnce(
        (app, title, message, onConfirm, onCancel) => {
          const modal = mockConfirmationModal;
          modal.onConfirm = onConfirm;
          modal.onCancel = onCancel;
          // Simulate immediate cancellation
          setTimeout(() => onCancel(), 0);
          return modal;
        }
      );

      await commands.applyTemplateToFolderPath('folder');

      // Wait a bit to ensure no async processing happens
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify confirmation dialog was shown but no processing occurred
      expect(ConfirmationModal).toHaveBeenCalled();
      expect(mockConfirmationModal.open).toHaveBeenCalled();
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
      expect(Notice).not.toHaveBeenCalledWith(expect.stringContaining('Processing'));
    });
  });

  describe('updateSettings', () => {
    test('Should update internal settings and applicator', () => {
      const newSettings: SnowflakeSettings = {
        ...settings
      };

      commands.updateSettings(newSettings);

      expect(mockTemplateApplicator.updateSettings).toHaveBeenCalledWith(newSettings);
    });
  });
});

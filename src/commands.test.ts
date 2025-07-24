/**
 * Tests for Snowflake Commands
 */

import { SnowflakeCommands } from './commands';
import { Plugin, Notice, Editor, MarkdownView, MarkdownFileInfo, TFile, TFolder } from 'obsidian';
import { SnowflakeSettings } from './types';
import { TemplateApplicator } from './template-applicator';
import { ConfirmationModal } from './ui/confirmation-modal';
import { TemplateSelectionModal } from './ui/template-selection-modal';
import { FolderSuggestModal } from './ui/folder-modal';

// Mock the dependencies
jest.mock('./template-applicator');
jest.mock('./ui/confirmation-modal');
jest.mock('./ui/template-selection-modal');
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
  let mockConfirmationModal: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock window.moment
    (global as any).window = {
      moment: jest.fn(() => ({
        format: jest.fn((format: string) => {
          if (format === 'YYYY-MM-DD') return '2024-01-15';
          if (format === 'HH:mm') return '14:30';
          return 'formatted-date-time';
        })
      }))
    };

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
        vault: {
          getAbstractFileByPath: jest.fn(),
          create: jest.fn()
        } as any
      },
      addCommand: jest.fn()
    } as any;

    // Default settings
    settings = {
      templateMappings: {
        Projects: 'project.md'
      },
      templatesFolder: 'Templates',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm'
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
    test('Should register all commands', () => {
      commands.registerCommands();

      expect(mockPlugin.addCommand).toHaveBeenCalledTimes(5);

      // Check the commands
      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'apply-template-to-current-note',
        name: 'Apply mapped templates',
        editorCallback: expect.any(Function)
      });

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'insert-date',
        name: 'Insert current date',
        editorCallback: expect.any(Function)
      });

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'insert-time',
        name: 'Insert current time',
        editorCallback: expect.any(Function)
      });

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'apply-specific-template',
        name: 'Apply specific template',
        editorCallback: expect.any(Function)
      });

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'create-note-in-folder',
        name: 'Create new note in folder',
        callback: expect.any(Function)
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

  describe('Insert Date/Time Commands', () => {
    let mockEditor: Editor;

    beforeEach(() => {
      mockEditor = {
        replaceSelection: jest.fn()
      } as any;
    });

    test('Should register insert-date command', () => {
      commands.registerCommands();

      const dateCommand = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (call: any[]) => call[0].id === 'insert-date'
      );

      expect(dateCommand).toBeDefined();
      expect(dateCommand[0].name).toBe('Insert current date');
    });

    test('Should register insert-time command', () => {
      commands.registerCommands();

      const timeCommand = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (call: any[]) => call[0].id === 'insert-time'
      );

      expect(timeCommand).toBeDefined();
      expect(timeCommand[0].name).toBe('Insert current time');
    });

    test('Should insert date with custom format', () => {
      commands.registerCommands();

      const dateCommand = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (call: any[]) => call[0].id === 'insert-date'
      );

      // Execute the command
      dateCommand[0].editorCallback(mockEditor);

      expect(mockEditor.replaceSelection).toHaveBeenCalledWith('2024-01-15');
    });

    test('Should insert time with custom format', () => {
      commands.registerCommands();

      const timeCommand = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (call: any[]) => call[0].id === 'insert-time'
      );

      // Execute the command
      timeCommand[0].editorCallback(mockEditor);

      expect(mockEditor.replaceSelection).toHaveBeenCalledWith('14:30');
    });
  });

  describe('Apply specific template command', () => {
    let editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => void;
    let mockEditor: Editor;
    let mockView: MarkdownView | MarkdownFileInfo;
    let mockTemplateSelectionModal: any;

    beforeEach(() => {
      commands.registerCommands();
      // Get the registered callback for the new command
      editorCallback = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (call: any[]) => call[0].id === 'apply-specific-template'
      )[0].editorCallback;

      mockEditor = {} as Editor;
      mockView = {
        file: null
      } as any;

      // Mock TemplateSelectionModal
      mockTemplateSelectionModal = {
        open: jest.fn()
      };
      (TemplateSelectionModal as jest.Mock).mockImplementation((app, templatesFolder, onChoose) => {
        mockTemplateSelectionModal.onChoose = onChoose;
        return mockTemplateSelectionModal;
      });
    });

    test('Should show notice when no active file', () => {
      mockView = {
        file: null
      } as any;

      editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('No active file');
      expect(TemplateSelectionModal).not.toHaveBeenCalled();
    });

    test('Should show notice for non-markdown files', () => {
      mockView = {
        file: {
          extension: 'txt',
          basename: 'test'
        } as any
      } as any;

      editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('Current file is not a markdown file');
      expect(TemplateSelectionModal).not.toHaveBeenCalled();
    });

    test('Should open template selection modal for markdown files', () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        path: 'test.md'
      } as any;
      mockView = {
        file: mockFile
      } as any;

      editorCallback(mockEditor, mockView);

      expect(TemplateSelectionModal).toHaveBeenCalledWith(
        mockPlugin.app,
        settings.templatesFolder,
        expect.any(Function)
      );
      expect(mockTemplateSelectionModal.open).toHaveBeenCalled();
    });

    test('Should apply selected template successfully', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        path: 'test.md'
      } as any;
      mockView = {
        file: mockFile
      } as any;

      const mockTemplateFile = {
        path: 'Templates/project.md',
        basename: 'project',
        extension: 'md'
      } as TFile;

      mockTemplateApplicator.applySpecificTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

      editorCallback(mockEditor, mockView);

      // Simulate template selection
      await mockTemplateSelectionModal.onChoose(mockTemplateFile);

      expect(mockTemplateApplicator.applySpecificTemplate).toHaveBeenCalledWith(
        mockFile,
        'Templates/project.md',
        mockEditor
      );
      // Should not show notice on success
      expect(Notice).not.toHaveBeenCalled();
    });

    test('Should show notice on template application failure', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        path: 'test.md'
      } as any;
      mockView = {
        file: mockFile
      } as any;

      const mockTemplateFile = {
        path: 'Templates/project.md',
        basename: 'project',
        extension: 'md'
      } as TFile;

      mockTemplateApplicator.applySpecificTemplate.mockResolvedValue({
        success: false,
        message: 'Template not found'
      });

      editorCallback(mockEditor, mockView);

      // Simulate template selection
      await mockTemplateSelectionModal.onChoose(mockTemplateFile);

      expect(Notice).toHaveBeenCalledWith('Template not found');
    });

    test('Should handle errors during template application', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        path: 'test.md'
      } as any;
      mockView = {
        file: mockFile
      } as any;

      const mockTemplateFile = {
        path: 'Templates/project.md',
        basename: 'project',
        extension: 'md'
      } as TFile;

      const error = new Error('Application error');
      mockTemplateApplicator.applySpecificTemplate.mockRejectedValue(error);

      editorCallback(mockEditor, mockView);

      // Simulate template selection
      await mockTemplateSelectionModal.onChoose(mockTemplateFile);

      expect(Notice).toHaveBeenCalledWith('Error applying template: Application error');
    });
  });

  describe('Create new note in folder command', () => {
    let callback: () => void;
    let mockFolderSuggestModal: any;

    beforeEach(() => {
      commands.registerCommands();
      // Get the registered callback for create-note-in-folder command
      callback = (mockPlugin.addCommand as jest.Mock).mock.calls[4][0].callback;

      // Mock FolderSuggestModal
      mockFolderSuggestModal = {
        open: jest.fn(),
        onChoose: null as any
      };
      (FolderSuggestModal as jest.Mock).mockImplementation((app, onChoose) => {
        mockFolderSuggestModal.onChoose = onChoose;
        return mockFolderSuggestModal;
      });

      // Reset workspace mock
      mockPlugin.app.workspace = {
        getLeaf: jest.fn().mockReturnValue({
          openFile: jest.fn()
        }),
        getActiveViewOfType: jest.fn()
      } as any;

      // Reset Notice mock
      (Notice as jest.Mock).mockClear();
    });

    test('Should open folder selection modal', () => {
      callback();

      expect(FolderSuggestModal).toHaveBeenCalledWith(mockPlugin.app, expect.any(Function));
      expect(mockFolderSuggestModal.open).toHaveBeenCalled();
    });

    test('Should create new note with Untitled name in selected folder', async () => {
      const mockFolder = {
        path: 'Projects',
        name: 'Projects'
      } as TFolder;

      const mockFile = {
        path: 'Projects/Untitled.md',
        basename: 'Untitled',
        extension: 'md'
      } as TFile;

      (mockPlugin.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (mockPlugin.app.vault.create as jest.Mock).mockResolvedValue(mockFile);

      callback();

      // Simulate user selecting folder
      await mockFolderSuggestModal.onChoose(mockFolder);

      // Wait for the async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Projects/Untitled.md', '');
      expect(mockPlugin.app.workspace.getLeaf().openFile).toHaveBeenCalledWith(mockFile);
    });

    test('Should increment Untitled number if file exists', async () => {
      const mockFolder = {
        path: 'Projects',
        name: 'Projects'
      } as TFolder;

      const mockFile = {
        path: 'Projects/Untitled 1.md',
        basename: 'Untitled 1',
        extension: 'md'
      } as TFile;

      // First call returns existing file, second call returns null
      (mockPlugin.app.vault.getAbstractFileByPath as jest.Mock)
        .mockReturnValueOnce({ path: 'Projects/Untitled.md' })
        .mockReturnValueOnce(null);

      (mockPlugin.app.vault.create as jest.Mock).mockResolvedValue(mockFile);

      callback();

      await mockFolderSuggestModal.onChoose(mockFolder);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Projects/Untitled 1.md', '');
    });

    test('Should handle root folder correctly', async () => {
      const mockFolder = {
        path: '',
        name: '/'
      } as TFolder;

      const mockFile = {
        path: 'Untitled.md',
        basename: 'Untitled',
        extension: 'md'
      } as TFile;

      (mockPlugin.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (mockPlugin.app.vault.create as jest.Mock).mockResolvedValue(mockFile);

      callback();

      await mockFolderSuggestModal.onChoose(mockFolder);

      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Untitled.md', '');
    });

    test('Should handle errors during note creation', async () => {
      const mockFolder = {
        path: 'Projects',
        name: 'Projects'
      } as TFolder;

      const error = new Error('Creation failed');
      (mockPlugin.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (mockPlugin.app.vault.create as jest.Mock).mockRejectedValue(error);

      callback();

      await mockFolderSuggestModal.onChoose(mockFolder);

      expect(Notice).toHaveBeenCalledWith('Error applying template: Creation failed');
    });
  });
});

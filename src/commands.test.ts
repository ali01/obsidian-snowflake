/**
 * Tests for Snowflake Commands
 */

import { SnowflakeCommands } from './commands';
import { Plugin, Notice, Editor, MarkdownView, MarkdownFileInfo, TFile, TFolder } from 'obsidian';
import { SnowflakeSettings } from './types';
import { TemplateApplicator } from './template-applicator';
import { ConfirmationModal } from './ui/confirmation-modal';
import { FolderSuggestModal } from './ui/folder-modal';

jest.mock('./template-applicator');
jest.mock('./ui/confirmation-modal');
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
    jest.clearAllMocks();

    (global as any).window = {
      moment: jest.fn(() => ({
        format: jest.fn((format: string) => {
          if (format === 'YYYY-MM-DD') return '2024-01-15';
          if (format === 'HH:mm') return '14:30';
          return 'formatted-date-time';
        })
      }))
    };

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockConfirmationModal = { open: jest.fn() };
    (ConfirmationModal as jest.Mock).mockImplementation(
      (app, title, message, onConfirm, onCancel) => {
        mockConfirmationModal.onConfirm = onConfirm;
        mockConfirmationModal.onCancel = onCancel;
        return mockConfirmationModal;
      }
    );

    mockPlugin = {
      app: {
        vault: {
          getAbstractFileByPath: jest.fn(),
          create: jest.fn()
        } as any
      },
      addCommand: jest.fn()
    } as any;

    settings = {
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm'
    };

    commands = new SnowflakeCommands(mockPlugin, settings);
    mockTemplateApplicator = (TemplateApplicator as jest.MockedClass<typeof TemplateApplicator>)
      .mock.instances[0] as jest.Mocked<TemplateApplicator>;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('registerCommands', () => {
    test('Should register exactly the expected commands', () => {
      commands.registerCommands();

      expect(mockPlugin.addCommand).toHaveBeenCalledTimes(4);

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'apply-schema-to-current-note',
        name: 'Apply schema to current note',
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
        id: 'create-note-in-folder',
        name: 'Create new note in folder',
        callback: expect.any(Function)
      });
    });

    test('Should not register the removed apply-specific-template command', () => {
      commands.registerCommands();
      const ids = (mockPlugin.addCommand as jest.Mock).mock.calls.map((c) => c[0].id);
      expect(ids).not.toContain('apply-specific-template');
    });
  });

  describe('Apply schema to current note command', () => {
    let editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => void;
    let mockEditor: Editor;
    let mockView: MarkdownView | MarkdownFileInfo;

    beforeEach(() => {
      commands.registerCommands();
      const call = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (c) => c[0].id === 'apply-schema-to-current-note'
      );
      editorCallback = call[0].editorCallback;

      mockEditor = {} as Editor;
      mockView = { file: null } as any;
    });

    test('Should show notice when no active file', async () => {
      await editorCallback(mockEditor, mockView);
      expect(Notice).toHaveBeenCalledWith('No active file');
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should show notice for non-markdown files', async () => {
      mockView = { file: { extension: 'txt', basename: 'test' } as any } as any;
      await editorCallback(mockEditor, mockView);
      expect(Notice).toHaveBeenCalledWith('Current file is not a markdown file');
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should apply template via the SCHEMA.md chain on success', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        parent: { path: 'Projects' }
      } as any;
      mockView = { file: mockFile } as any;
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
      expect(Notice).not.toHaveBeenCalled();
    });

    test('Should show notice on failure', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        parent: { path: 'Projects' }
      } as any;
      mockView = { file: mockFile } as any;
      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: false,
        message: 'No SCHEMA.md found for this location'
      });

      await editorCallback(mockEditor, mockView);

      expect(Notice).toHaveBeenCalledWith('No SCHEMA.md found for this location');
    });

    test('Should handle errors gracefully', async () => {
      const mockFile = {
        extension: 'md',
        basename: 'test',
        parent: { path: 'Projects' }
      } as any;
      mockView = { file: mockFile } as any;
      mockTemplateApplicator.applyTemplate.mockRejectedValue(new Error('Template error'));

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
      const mockFolder = Object.assign(new TFolder(), { children: [], path: 'folder' });
      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);
      await commands.applyTemplateToFolderPath('folder');
      expect(Notice).toHaveBeenCalledWith('No markdown files found in selected folder');
    });

    test('Should process all markdown files asynchronously', async () => {
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
      const mockFolder = Object.assign(new TFolder(), { children: mockFiles, path: 'folder' });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);
      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

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
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(25);
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
      const mockFolder = Object.assign(new TFolder(), { children: mockFiles, path: 'folder' });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);
      mockTemplateApplicator.applyTemplate
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValueOnce({ success: true, message: 'Applied' })
        .mockResolvedValue({ success: false, message: 'Failed' });

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
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(Notice).toHaveBeenCalledWith('Templates applied to 5 of 10 notes');
    });

    test('Should handle nested folders and skip non-markdown files', async () => {
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

      const mockSubfolder = Object.assign(new TFolder(), { children: [nestedFile] });
      const mockFolder = Object.assign(new TFolder(), {
        children: [file1, mockSubfolder, txtFile],
        path: 'folder'
      });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);
      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

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
      await new Promise((resolve) => setTimeout(resolve, 50));

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
      const mockFolder = Object.assign(new TFolder(), { children: mockFiles, path: 'folder' });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);
      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: true,
        message: 'Applied'
      });

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

      expect(ConfirmationModal).toHaveBeenCalledWith(
        mockPlugin.app,
        'Apply templates to 2 notes in "folder"?',
        'This will apply the appropriate template to all markdown files in this folder.',
        expect.any(Function),
        expect.any(Function)
      );
      expect(mockConfirmationModal.open).toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 50));

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
      const mockFolder = Object.assign(new TFolder(), { children: mockFiles, path: 'folder' });

      mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFolder);

      (ConfirmationModal as jest.Mock).mockImplementationOnce(
        (app, title, message, onConfirm, onCancel) => {
          const modal = mockConfirmationModal;
          modal.onConfirm = onConfirm;
          modal.onCancel = onCancel;
          setTimeout(() => onCancel(), 0);
          return modal;
        }
      );

      await commands.applyTemplateToFolderPath('folder');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(ConfirmationModal).toHaveBeenCalled();
      expect(mockConfirmationModal.open).toHaveBeenCalled();
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    test('Should update internal settings and applicator', () => {
      const newSettings: SnowflakeSettings = { ...settings };
      commands.updateSettings(newSettings);
      expect(mockTemplateApplicator.updateSettings).toHaveBeenCalledWith(newSettings);
    });
  });

  describe('Insert Date/Time Commands', () => {
    let mockEditor: Editor;

    beforeEach(() => {
      mockEditor = { replaceSelection: jest.fn() } as any;
    });

    test('Should insert date with custom format', () => {
      commands.registerCommands();
      const dateCommand = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (c) => c[0].id === 'insert-date'
      );
      dateCommand[0].editorCallback(mockEditor);
      expect(mockEditor.replaceSelection).toHaveBeenCalledWith('2024-01-15');
    });

    test('Should insert time with custom format', () => {
      commands.registerCommands();
      const timeCommand = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (c) => c[0].id === 'insert-time'
      );
      timeCommand[0].editorCallback(mockEditor);
      expect(mockEditor.replaceSelection).toHaveBeenCalledWith('14:30');
    });
  });

  describe('Create new note in folder command', () => {
    let callback: () => void;
    let mockFolderSuggestModal: any;

    beforeEach(() => {
      commands.registerCommands();
      const call = (mockPlugin.addCommand as jest.Mock).mock.calls.find(
        (c) => c[0].id === 'create-note-in-folder'
      );
      callback = call[0].callback;

      mockFolderSuggestModal = { open: jest.fn(), onChoose: null as any };
      (FolderSuggestModal as jest.Mock).mockImplementation((app, onChoose) => {
        mockFolderSuggestModal.onChoose = onChoose;
        return mockFolderSuggestModal;
      });

      mockPlugin.app.workspace = {
        getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn() }),
        getActiveViewOfType: jest.fn()
      } as any;

      (Notice as jest.Mock).mockClear();
    });

    test('Should open folder selection modal', () => {
      callback();
      expect(FolderSuggestModal).toHaveBeenCalledWith(mockPlugin.app, expect.any(Function));
      expect(mockFolderSuggestModal.open).toHaveBeenCalled();
    });

    test('Should create new note with Untitled name in selected folder', async () => {
      const mockFolder = { path: 'Projects', name: 'Projects' } as TFolder;
      const mockFile = {
        path: 'Projects/Untitled.md',
        basename: 'Untitled',
        extension: 'md'
      } as TFile;

      (mockPlugin.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (mockPlugin.app.vault.create as jest.Mock).mockResolvedValue(mockFile);

      callback();
      await mockFolderSuggestModal.onChoose(mockFolder);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Projects/Untitled.md', '');
      expect(mockPlugin.app.workspace.getLeaf().openFile).toHaveBeenCalledWith(mockFile);
    });

    test('Should increment Untitled number if file exists', async () => {
      const mockFolder = { path: 'Projects', name: 'Projects' } as TFolder;
      const mockFile = {
        path: 'Projects/Untitled 1.md',
        basename: 'Untitled 1',
        extension: 'md'
      } as TFile;

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
      const mockFolder = { path: '', name: '/' } as TFolder;
      const mockFile = { path: 'Untitled.md', basename: 'Untitled', extension: 'md' } as TFile;

      (mockPlugin.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (mockPlugin.app.vault.create as jest.Mock).mockResolvedValue(mockFile);

      callback();
      await mockFolderSuggestModal.onChoose(mockFolder);

      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith('Untitled.md', '');
    });

    test('Should handle errors during note creation', async () => {
      const mockFolder = { path: 'Projects', name: 'Projects' } as TFolder;
      (mockPlugin.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (mockPlugin.app.vault.create as jest.Mock).mockRejectedValue(new Error('Creation failed'));

      callback();
      await mockFolderSuggestModal.onChoose(mockFolder);

      expect(Notice).toHaveBeenCalledWith('Error applying template: Creation failed');
    });
  });
});

/**
 * Tests for File Creation Handler
 */

import { FileCreationHandler, FileCreationHandlerTestUtils } from './file-creation-handler';
import { TFile, TFolder, Vault, Plugin } from 'obsidian';
import { SnowflakeSettings } from './types';
import { TemplateApplicator } from './template-applicator';

jest.mock('./template-applicator');

describe('FileCreationHandler', () => {
  let handler: FileCreationHandler;
  let mockPlugin: Plugin;
  let mockVault: Vault;
  let settings: SnowflakeSettings;
  let mockTemplateApplicator: jest.Mocked<TemplateApplicator>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockPlugin = {
      registerEvent: jest.fn()
    } as any;

    mockVault = {
      on: jest.fn().mockReturnValue('event-ref'),
      offref: jest.fn(),
      read: jest.fn().mockResolvedValue(''),
      getAbstractFileByPath: jest.fn()
    } as any;

    settings = {
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm',
      globalExcludePatterns: []
    };

    handler = new FileCreationHandler(mockPlugin, mockVault, settings);
    mockTemplateApplicator = (TemplateApplicator as jest.MockedClass<typeof TemplateApplicator>)
      .mock.instances[0] as jest.Mocked<TemplateApplicator>;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('start/stop', () => {
    test('Should register event handlers on start', () => {
      handler.start();
      expect(mockVault.on).toHaveBeenCalledWith('create', expect.any(Function));
      expect(mockVault.on).toHaveBeenCalledWith('rename', expect.any(Function));
      expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
      expect(mockPlugin.registerEvent).toHaveBeenCalledWith('event-ref');
    });

    test('Should unregister event handlers on stop', () => {
      handler.start();
      handler.stop();
      expect(mockVault.offref).toHaveBeenCalledTimes(2);
      expect(mockVault.offref).toHaveBeenCalledWith('event-ref');
    });

    test('Should clear processing queue on stop', () => {
      const file = createMockFile('test.md', 'Projects');
      handler.start();
      (handler as any).processingQueue.add(file.path);
      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(true);
      handler.stop();
      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(false);
    });
  });

  describe('handleFileCreation', () => {
    let handleFileCreation: (file: TFile) => Promise<void>;

    beforeEach(() => {
      handler.start();
      handleFileCreation = (mockVault.on as jest.Mock).mock.calls[0][1];
    });

    test('Should skip non-markdown files', async () => {
      const file = createMockFile('test.txt', 'Projects');
      file.extension = 'txt';
      await handleFileCreation(file);
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should never apply a template to a SCHEMA.md file itself', async () => {
      const file = createMockFile('SCHEMA.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('');

      await handleFileCreation(file);

      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should process markdown files', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('');

      await handleFileCreation(file);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
    });

    test('Should skip files with existing content (e.g. synced files)', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('Existing content');

      await handleFileCreation(file);
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should skip if file was deleted during processing', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      await handleFileCreation(file);
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should prevent double processing of same file', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('');

      await Promise.all([handleFileCreation(file), handleFileCreation(file)]);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(1);
    });

    test('Should handle errors gracefully', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      mockTemplateApplicator.applyTemplate.mockRejectedValue(new Error('Apply error'));

      await expect(handler['handleFileCreation'](file)).resolves.not.toThrow();
      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(false);
    });
  });

  describe('updateSettings', () => {
    test('Should update internal settings and applicator', () => {
      const newSettings: SnowflakeSettings = { ...settings };
      handler.updateSettings(newSettings);
      expect(mockTemplateApplicator.updateSettings).toHaveBeenCalledWith(newSettings);
    });
  });

  describe('processing queue management', () => {
    test('Should track processing state', async () => {
      const file = createMockFile('test.md', 'Projects');

      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(false);
      expect(FileCreationHandlerTestUtils.getProcessingCount(handler)).toBe(0);

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('');
      handler.start();
      const handleFileCreation = (mockVault.on as jest.Mock).mock.calls[0][1];

      const processPromise = handleFileCreation(file);

      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(true);
      expect(FileCreationHandlerTestUtils.getProcessingCount(handler)).toBe(1);

      await processPromise;
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(false);
      expect(FileCreationHandlerTestUtils.getProcessingCount(handler)).toBe(0);
    });
  });

  describe('handleFileMove', () => {
    let handleFileMove: (file: TFile, oldPath: string) => Promise<void>;

    beforeEach(() => {
      handler.start();
      const renameCalls = (mockVault.on as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'rename'
      );
      handleFileMove = renameCalls[0][1];
    });

    test('Should apply template when empty file moved across folders', async () => {
      const file = createMockFile('test.md', 'Projects');
      const oldPath = 'Documents/test.md';

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('');

      await handleFileMove(file, oldPath);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
    });

    test('Should not apply template when file is renamed in same folder', async () => {
      const file = createMockFile('renamed.md', 'Projects');
      const oldPath = 'Projects/test.md';

      await handleFileMove(file, oldPath);

      expect(mockVault.read).not.toHaveBeenCalled();
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should skip files with existing content on move', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('Existing content');

      await handleFileMove(file, 'Documents/test.md');

      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should not apply template to non-markdown files', async () => {
      const file = Object.assign(new TFile(), {
        name: 'test.txt',
        basename: 'test',
        extension: 'txt',
        path: 'Projects/test.txt'
      });

      await handleFileMove(file, 'Documents/test.txt');

      expect(mockVault.read).not.toHaveBeenCalled();
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should not template a SCHEMA.md when it is moved into a new folder', async () => {
      const file = createMockFile('SCHEMA.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('');

      await handleFileMove(file, 'Other/SCHEMA.md');

      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });
  });
});

function createMockFile(name: string, parentPath: string): TFile {
  const file = new TFile();
  file.name = name;
  file.basename = name.replace('.md', '');
  file.extension = name.endsWith('.md') ? 'md' : name.split('.').pop() || '';
  file.path = parentPath ? `${parentPath}/${name}` : name;
  file.parent = parentPath ? Object.assign(new TFolder(), { path: parentPath }) : null;
  return file;
}

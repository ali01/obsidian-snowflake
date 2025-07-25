/**
 * Tests for File Creation Handler
 */

import { FileCreationHandler, FileCreationHandlerTestUtils } from './file-creation-handler';
import { TFile, TFolder, Vault, Plugin } from 'obsidian';
import { SnowflakeSettings } from './types';
import { TemplateApplicator } from './template-applicator';

// Mock the TemplateApplicator
jest.mock('./template-applicator');

describe('FileCreationHandler', () => {
  let handler: FileCreationHandler;
  let mockPlugin: Plugin;
  let mockVault: Vault;
  let settings: SnowflakeSettings;
  let mockTemplateApplicator: jest.Mocked<TemplateApplicator>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock console.error to prevent noise in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock plugin
    mockPlugin = {
      registerEvent: jest.fn()
    } as any;

    // Mock vault
    mockVault = {
      on: jest.fn().mockReturnValue('event-ref'),
      offref: jest.fn(),
      read: jest.fn().mockResolvedValue(''), // Default to empty content for new files
      getAbstractFileByPath: jest.fn()
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

    // Create handler
    handler = new FileCreationHandler(mockPlugin, mockVault, settings);

    // Get mocked TemplateApplicator
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
      // Add something to queue
      const file = createMockFile('test.md', 'Projects');
      handler.start();

      // Manually add to queue to test clearing
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
      // Get the registered handler function
      handleFileCreation = (mockVault.on as jest.Mock).mock.calls[0][1];
    });

    test('REQ-004: Should skip non-markdown files', async () => {
      const file = createMockFile('test.txt', 'Projects');
      file.extension = 'txt';

      await handleFileCreation(file);

      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should process markdown files', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue(''); // Empty content for new file

      await handleFileCreation(file);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
    });

    test('Should apply template even to files with existing content', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('Existing content'); // Non-empty content

      await handleFileCreation(file);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
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
      (mockVault.read as jest.Mock).mockResolvedValue(''); // Empty content

      // Start two concurrent processes
      const promise1 = handleFileCreation(file);
      const promise2 = handleFileCreation(file);

      await Promise.all([promise1, promise2]);

      // Should only process once
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledTimes(1);
    });

    test('Should handle errors gracefully', async () => {
      const file = createMockFile('test.md', 'Projects');
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      mockTemplateApplicator.applyTemplate.mockRejectedValue(new Error('Apply error'));

      // Should not throw
      await expect(handler['handleFileCreation'](file)).resolves.not.toThrow();

      // Should still remove from queue
      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(false);
    });
  });

  describe('updateSettings', () => {
    test('Should update internal settings and applicator', () => {
      const newSettings: SnowflakeSettings = {
        ...settings
      };

      handler.updateSettings(newSettings);

      expect(mockTemplateApplicator.updateSettings).toHaveBeenCalledWith(newSettings);

      // Verify settings were updated by testing behavior
      const file = createMockFile('test.md', 'Projects');
      handler.start();
      const handleFileCreation = (mockVault.on as jest.Mock).mock.calls[0][1];

      handleFileCreation(file);
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });
  });

  describe('processing queue management', () => {
    test('Should track processing state', async () => {
      const file = createMockFile('test.md', 'Projects');

      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(false);
      expect(FileCreationHandlerTestUtils.getProcessingCount(handler)).toBe(0);

      // Start processing
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue(''); // Empty content
      handler.start();
      const handleFileCreation = (mockVault.on as jest.Mock).mock.calls[0][1];

      const processPromise = handleFileCreation(file);

      // Should be processing now
      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(true);
      expect(FileCreationHandlerTestUtils.getProcessingCount(handler)).toBe(1);

      await processPromise;

      // Wait a bit more for async processing to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should be done processing
      expect(FileCreationHandlerTestUtils.isProcessing(handler, file.path)).toBe(false);
      expect(FileCreationHandlerTestUtils.getProcessingCount(handler)).toBe(0);
    });
  });

  describe('handleFileMove', () => {
    let handleFileMove: (file: TFile, oldPath: string) => Promise<void>;

    beforeEach(() => {
      handler.start();
      // Get the registered handler function for rename events
      const renameCalls = (mockVault.on as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'rename'
      );
      handleFileMove = renameCalls[0][1];
    });

    test('Should apply template when empty file moved to mapped directory', async () => {
      const file = createMockFile('test.md', 'Projects');
      const oldPath = 'Documents/test.md';

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue(''); // Empty content

      await handleFileMove(file, oldPath);

      expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith('Projects/test.md');
      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
    });

    test('Should not apply template when file moved within same directory', async () => {
      const file = createMockFile('renamed.md', 'Projects');
      const oldPath = 'Projects/test.md'; // Same directory, just renamed

      await handleFileMove(file, oldPath);

      expect(mockVault.read).not.toHaveBeenCalled();
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should apply template even when file has content', async () => {
      const file = createMockFile('test.md', 'Projects');
      const oldPath = 'Documents/test.md';

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('Existing content');

      await handleFileMove(file, oldPath);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
    });

    test('Should not apply template when moved to unmapped directory', async () => {
      const file = createMockFile('test.md', 'UnmappedFolder');
      const oldPath = 'Documents/test.md';

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue('');

      // Template applicator will return false for unmapped directories
      mockTemplateApplicator.applyTemplate.mockResolvedValue({
        success: false,
        message: 'No template configured for this location'
      });

      await handleFileMove(file, oldPath);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalled();
    });

    test('Should not apply template to non-markdown files', async () => {
      const file = Object.assign(new TFile(), {
        name: 'test.txt',
        basename: 'test',
        extension: 'txt',
        path: 'Projects/test.txt'
      });
      const oldPath = 'Documents/test.txt';

      await handleFileMove(file, oldPath);

      expect(mockVault.read).not.toHaveBeenCalled();
      expect(mockTemplateApplicator.applyTemplate).not.toHaveBeenCalled();
    });

    test('Should handle nested folder mappings correctly', async () => {
      // Add a nested folder mapping
      settings.templateMappings['Projects/Subfolder'] = 'subfolder.md';
      handler.updateSettings(settings);

      const file = createMockFile('test.md', 'Projects/Subfolder');
      const oldPath = 'Documents/test.md';

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue(''); // Empty content

      await handleFileMove(file, oldPath);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
    });

    test('Should handle root folder mapping', async () => {
      settings.templateMappings['/'] = 'default.md';
      handler.updateSettings(settings);

      const file = createMockFile('test.md', '');
      const oldPath = 'Documents/test.md';

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);
      (mockVault.read as jest.Mock).mockResolvedValue(''); // Empty content

      await handleFileMove(file, oldPath);

      expect(mockTemplateApplicator.applyTemplate).toHaveBeenCalledWith(file, {
        isManualCommand: false
      });
    });
  });
});

/**
 * Helper to create mock TFile
 */
function createMockFile(name: string, parentPath: string): TFile {
  const file = new TFile();
  file.name = name;
  file.basename = name.replace('.md', '');
  file.extension = 'md';
  file.path = parentPath ? `${parentPath}/${name}` : name;
  file.parent = parentPath ? Object.assign(new TFolder(), { path: parentPath }) : null;
  return file;
}

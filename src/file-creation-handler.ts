/**
 * File Creation Handler
 *
 * REQ-002: When a user creates a new markdown file in a folder that has a
 * template mapping, the plugin shall automatically apply that folder's
 * template to the file.
 *
 * REQ-004: When a user creates any non-markdown file (like .txt, .pdf,
 * .json), the plugin shall NOT apply any template.
 *
 * The plugin automatically applies templates to:
 * - New markdown files created in mapped folders
 * - Empty markdown files moved into mapped folders
 */

import { TFile } from 'obsidian';
import type { TAbstractFile, Vault, Plugin, EventRef } from 'obsidian';
import { isMarkdownFile } from './types';
import type { SnowflakeSettings, CommandContext, ErrorContext, MarkdownFile } from './types';
import { TemplateApplicator } from './template-applicator';
import { ErrorHandler } from './error-handler';

/**
 * FileCreationHandler: Handles file creation and move events
 *
 * Purpose: Intercepts file creation and move events to apply templates to:
 * - New markdown files created in mapped folders
 * - Empty markdown files moved into mapped folders
 */
export class FileCreationHandler {
  private readonly plugin: Plugin;
  private readonly vault: Vault;
  private settings: SnowflakeSettings;
  private readonly templateApplicator: TemplateApplicator;
  private readonly processingQueue: Set<string> = new Set();
  private createEventRef: EventRef | null = null;
  private renameEventRef: EventRef | null = null;
  private readonly errorHandler: ErrorHandler;

  constructor(plugin: Plugin, vault: Vault, settings: SnowflakeSettings) {
    this.plugin = plugin;
    this.vault = vault;
    this.settings = settings;
    this.templateApplicator = new TemplateApplicator(vault, settings);
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Start listening for file creation and rename/move events
   */
  start(): void {
    // Register the create event handler
    this.createEventRef = this.vault.on('create', (file: TAbstractFile) => {
      if (file instanceof TFile) {
        this.handleFileCreation(file).catch(() => {
          // Errors are handled inside handleFileCreation
        });
      }
    });
    this.plugin.registerEvent(this.createEventRef);

    // Register the rename event handler (includes moves)
    this.renameEventRef = this.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
      if (file instanceof TFile) {
        this.handleFileMove(file, oldPath).catch(() => {
          // Errors are handled inside handleFileMove
        });
      }
    });
    this.plugin.registerEvent(this.renameEventRef);
  }

  /**
   * Stop listening for file events
   */
  stop(): void {
    if (this.createEventRef !== null) {
      this.vault.offref(this.createEventRef);
      this.createEventRef = null;
    }
    if (this.renameEventRef !== null) {
      this.vault.offref(this.renameEventRef);
      this.renameEventRef = null;
    }
    this.processingQueue.clear();
  }

  /**
   * Handle file creation event
   *
   * REQ-004: Check if file is markdown before processing
   *
   * @param file - The newly created file
   */
  private async handleFileCreation(file: TFile): Promise<void> {
    await this.processFile(file);
  }

  /**
   * Common method to process a file for template application
   *
   * @param file - The file to process
   */
  private async processFile(file: TFile): Promise<void> {
    // REQ-004: Only process markdown files
    if (!isMarkdownFile(file)) {
      return;
    }

    // Prevent double processing using queue
    if (this.processingQueue.has(file.path)) {
      return;
    }

    this.processingQueue.add(file.path);

    try {
      await this.asyncProcessFile(file);
    } finally {
      this.processingQueue.delete(file.path);
    }
  }

  private async asyncProcessFile(file: TFile): Promise<void> {
    // Check if file still exists (could have been deleted/renamed)
    const stillExists = this.vault.getAbstractFileByPath(file.path);
    if (!stillExists) {
      return;
    }

    try {
      await this.vault.read(file);
    } catch {
      // If we can't read the file, skip it
      return;
    }

    try {
      const context: CommandContext = { isManualCommand: false };
      await this.templateApplicator.applyTemplate(file as MarkdownFile, context);
    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'apply_template',
        filePath: file.path
      };
      this.errorHandler.handleErrorSilently(error, errorContext);
    }
  }

  /**
   * Handle file move/rename event
   *
   * @param file - The file that was moved
   * @param oldPath - The previous path of the file
   */
  private async handleFileMove(file: TFile, oldPath: string): Promise<void> {
    // Extract directory paths
    const oldDirIndex = oldPath.lastIndexOf('/');
    const newDirIndex = file.path.lastIndexOf('/');

    const oldDir = oldDirIndex === -1 ? '' : oldPath.substring(0, oldDirIndex);
    const newDir = newDirIndex === -1 ? '' : file.path.substring(0, newDirIndex);

    // Only process if file moved to a different directory
    if (oldDir === newDir) {
      return;
    }

    // Process the file - the template applicator will check if there's a mapping
    await this.processFile(file);
  }

  /**
   * Update settings reference
   *
   * @param settings - New settings
   */
  updateSettings(settings: SnowflakeSettings): void {
    this.settings = settings;
    this.templateApplicator.updateSettings(settings);
  }

  /**
   * Check if a file is currently being processed
   *
   * @param filePath - Path to check
   * @returns True if file is in processing queue
   */
  isProcessing(filePath: string): boolean {
    return this.processingQueue.has(filePath);
  }

  /**
   * Get the number of files currently being processed
   *
   * @returns Number of files in processing queue
   */
  getProcessingCount(): number {
    return this.processingQueue.size;
  }
}

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
 * The plugin automatically applies templates to all new markdown files
 * based on their folder location.
 */

import { TFile } from 'obsidian';
import type { TAbstractFile, Vault, Plugin, EventRef } from 'obsidian';
import { isMarkdownFile } from './types';
import type { SnowflakeSettings, CommandContext, ErrorContext, MarkdownFile } from './types';
import { TemplateApplicator } from './template-applicator';
import { ErrorHandler } from './error-handler';

/**
 * FileCreationHandler: Handles new file creation events
 *
 * Purpose: Intercepts file creation events and applies templates to new
 * markdown files based on their location and plugin settings.
 */
export class FileCreationHandler {
  private readonly plugin: Plugin;
  private readonly vault: Vault;
  private settings: SnowflakeSettings;
  private readonly templateApplicator: TemplateApplicator;
  private readonly processingQueue: Set<string> = new Set();
  private eventRef: EventRef | null = null;
  private readonly errorHandler: ErrorHandler;

  constructor(plugin: Plugin, vault: Vault, settings: SnowflakeSettings) {
    this.plugin = plugin;
    this.vault = vault;
    this.settings = settings;
    this.templateApplicator = new TemplateApplicator(vault, settings);
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Start listening for file creation events
   */
  start(): void {
    // Register the event handler
    this.eventRef = this.vault.on('create', (file: TAbstractFile) => {
      if (file instanceof TFile) {
        this.handleFileCreation(file).catch(() => {
          // Errors are handled inside handleFileCreation
        });
      }
    });
    this.plugin.registerEvent(this.eventRef);
  }

  /**
   * Stop listening for file creation events
   */
  stop(): void {
    if (this.eventRef !== null) {
      this.vault.offref(this.eventRef);
      this.eventRef = null;
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
    if (!this.shouldProcessFile(file)) {
      return;
    }

    if (!this.addToProcessingQueue(file.path)) {
      return;
    }

    try {
      await this.processFileWithTemplate(file);
    } finally {
      this.processingQueue.delete(file.path);
    }
  }

  private shouldProcessFile(file: TFile): boolean {
    // REQ-004: Only process markdown files
    if (!isMarkdownFile(file)) {
      return false;
    }

    return true;
  }

  private addToProcessingQueue(filePath: string): boolean {
    // Prevent double processing using queue
    if (this.processingQueue.has(filePath)) {
      return false;
    }

    this.processingQueue.add(filePath);
    return true;
  }

  private async processFileWithTemplate(file: TFile): Promise<void> {
    // Check if file still exists (could have been deleted/renamed)
    const stillExists = this.vault.getAbstractFileByPath(file.path);
    if (!stillExists) {
      return;
    }

    // Check if file has content - we only want to apply templates to new/empty files
    try {
      const content = await this.vault.read(file);
      if (content.trim() !== '') {
        // File already has content, skip template application
        return;
      }
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

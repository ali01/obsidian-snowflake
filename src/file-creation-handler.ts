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
 * REQ-005: While auto-templating is disabled in settings, the plugin shall
 * NOT automatically apply templates to any new files.
 */

import { TFile, Vault, Plugin } from 'obsidian';
import {
  SnowflakeSettings,
  isMarkdownFile,
  CommandContext,
  ErrorContext
} from './types';
import { TemplateApplicator } from './template-applicator';
import { ErrorHandler } from './error-handler';

/**
 * FileCreationHandler: Handles new file creation events
 *
 * Purpose: Intercepts file creation events and applies templates to new
 * markdown files based on their location and plugin settings.
 */
export class FileCreationHandler {
  private plugin: Plugin;
  private vault: Vault;
  private settings: SnowflakeSettings;
  private templateApplicator: TemplateApplicator;
  private processingQueue: Set<string> = new Set();
  private eventRef: any;
  private errorHandler: ErrorHandler;

  constructor(
    plugin: Plugin,
    vault: Vault,
    settings: SnowflakeSettings
  ) {
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
    this.eventRef = this.vault.on('create', this.handleFileCreation.bind(this));
    this.plugin.registerEvent(this.eventRef);
  }

  /**
   * Stop listening for file creation events
   */
  stop(): void {
    if (this.eventRef) {
      this.vault.offref(this.eventRef);
      this.eventRef = null;
    }
    this.processingQueue.clear();
  }

  /**
   * Handle file creation event
   *
   * REQ-004: Check if file is markdown before processing
   * REQ-005: Check if auto-templating is enabled
   *
   * @param file - The newly created file
   */
  private async handleFileCreation(file: TFile): Promise<void> {
    // REQ-004: Only process markdown files
    if (!isMarkdownFile(file)) {
      return;
    }

    // REQ-005: Check if auto-templating is enabled
    if (!this.settings.enableAutoTemplating) {
      return;
    }

    // Prevent double processing using queue
    if (this.processingQueue.has(file.path)) {
      return;
    }

    // Add to processing queue
    this.processingQueue.add(file.path);

    try {
      // Check if file still exists (could have been deleted/renamed)
      const stillExists = this.vault.getAbstractFileByPath(file.path);
      if (!stillExists) {
        return;
      }

      // Apply template
      const context: CommandContext = { isManualCommand: false };
      await this.templateApplicator.applyTemplate(file, context);

    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'apply_template',
        filePath: file.path
      };

      // Use silent error handling since template applicator already shows notices
      this.errorHandler.handleErrorSilently(error, errorContext);
    } finally {
      // Remove from processing queue
      this.processingQueue.delete(file.path);
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

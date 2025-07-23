/**
 * Snowflake Commands
 *
 * REQ-017: When a user runs "Apply template to current note", the plugin
 * shall apply the appropriate template to the currently open markdown file.
 *
 * REQ-018: When manually applying a template to a file with existing content,
 * the plugin shall follow the same merging rules as automatic application.
 *
 * REQ-019: When a user runs "Insert template to all notes in folder", the
 * plugin shall show a folder selection dialog.
 *
 * REQ-020: After folder selection, the plugin shall apply templates to ALL
 * markdown files in that folder.
 *
 * REQ-021: While processing multiple files in a batch operation, the plugin
 * shall do so asynchronously to keep the UI responsive.
 *
 * REQ-022: When a batch operation completes, the plugin shall show a notice
 * like "Templates applied to 15 notes".
 *
 * REQ-025: Where auto-templating is disabled but a user runs a manual command,
 * the plugin shall still apply the template.
 */

import { Notice, TFile, TFolder } from 'obsidian';
import type { Plugin, Editor, MarkdownView, MarkdownFileInfo } from 'obsidian';
import { isMarkdownFile } from './types';
import type {
  SnowflakeSettings,
  CommandContext,
  BatchResult,
  ErrorContext,
  MarkdownFile
} from './types';
import { TemplateApplicator } from './template-applicator';
import { ConfirmationModal } from './ui/confirmation-modal';
import { ErrorHandler } from './error-handler';

/**
 * SnowflakeCommands: Manages all user-invokable commands
 *
 * Purpose: Provides manual template application commands that work
 * regardless of auto-templating settings.
 */
export class SnowflakeCommands {
  private readonly plugin: Plugin;
  private settings: SnowflakeSettings;
  private readonly templateApplicator: TemplateApplicator;
  private readonly errorHandler: ErrorHandler;

  constructor(plugin: Plugin, settings: SnowflakeSettings) {
    this.plugin = plugin;
    this.settings = settings;
    this.templateApplicator = new TemplateApplicator(plugin.app.vault, settings);
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Register all commands with Obsidian
   */
  registerCommands(): void {
    // REQ-017: Command to apply template to current note
    this.plugin.addCommand({
      id: 'apply-template-to-current-note',
      name: 'Apply mapped templates',
      editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        this.applyTemplateToCurrentNote(editor, view).catch(() => {
          // Error is handled in the method
        });
      }
    });

    // Command to insert current date
    this.plugin.addCommand({
      id: 'insert-date',
      name: 'Insert current date',
      editorCallback: (editor: Editor) => {
        this.insertDate(editor);
      }
    });

    // Command to insert current time
    this.plugin.addCommand({
      id: 'insert-time',
      name: 'Insert current time',
      editorCallback: (editor: Editor) => {
        this.insertTime(editor);
      }
    });
  }

  /**
   * Apply template to the currently active note
   *
   * REQ-017: Apply appropriate template to current file
   * REQ-018: Follow same merging rules as automatic application
   * REQ-025: Work even when auto-templating is disabled
   */
  private async applyTemplateToCurrentNote(
    editor: Editor,
    view: MarkdownView | MarkdownFileInfo
  ): Promise<void> {
    const file = 'file' in view ? view.file : view;

    if (!file) {
      new Notice('No active file');
      return;
    }

    if (!isMarkdownFile(file)) {
      new Notice('Current file is not a markdown file');
      return;
    }

    // REQ-025: Manual command context
    const context: CommandContext = { isManualCommand: true };

    try {
      const result = await this.templateApplicator.applyTemplate(file, context, editor);

      if (!result.success) {
        new Notice(result.message);
      }
    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'apply_template',
        filePath: file.path
      };
      this.errorHandler.handleError(error, errorContext);
    }
  }

  /**
   * Process all markdown files in a folder
   *
   * REQ-020: Process ALL markdown files
   * REQ-021: Async processing for UI responsiveness
   * REQ-022: Show progress and completion
   */
  private async processFolderBatch(
    folder: TFolder,
    skipConfirmation = false
  ): Promise<BatchResult | null> {
    const markdownFiles = this.getMarkdownFiles(folder);

    if (markdownFiles.length === 0) {
      if (!skipConfirmation) {
        new Notice('No markdown files found in selected folder');
      }
      return null;
    }

    // Show confirmation dialog unless skipped
    if (!skipConfirmation) {
      const confirmed = await this.confirmBatchOperation(folder, markdownFiles.length);
      if (!confirmed) {
        return null;
      }
    }

    const result = await this.processFilesInBatches(markdownFiles);

    // Only show completion notice if not part of a larger batch
    if (!skipConfirmation) {
      this.showCompletionNotice(result);
    }

    return result;
  }

  /**
   * Apply template to all notes in a folder by path
   *
   * Public method for use from settings panel
   *
   * @param folderPath - Path to the folder to process
   */
  async applyTemplateToFolderPath(
    folderPath: string,
    skipConfirmation = false
  ): Promise<BatchResult | null> {
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);

    if (!folder || !(folder instanceof TFolder)) {
      if (!skipConfirmation) {
        new Notice(`Folder not found: ${folderPath}`);
      }
      return null;
    }

    return await this.processFolderBatch(folder, skipConfirmation);
  }

  private getMarkdownFiles(folder: TFolder): TFile[] {
    const markdownFiles: TFile[] = [];
    this.collectMarkdownFiles(folder, markdownFiles);
    return markdownFiles;
  }

  private async processFilesInBatches(files: TFile[]): Promise<BatchResult> {
    const batchSize = 10;
    const context: CommandContext = { isManualCommand: true, isBatchOperation: true };
    let successCount = 0;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const results = await this.processBatch(batch, context);
      successCount += results.reduce((sum, val) => sum + val, 0);
      await this.sleep(10);
    }

    return {
      success: successCount,
      total: files.length
    };
  }

  private async processBatch(batch: TFile[], context: CommandContext): Promise<number[]> {
    return Promise.all(
      batch.map((file) =>
        this.templateApplicator
          .applyTemplate(file as MarkdownFile, context)
          .then((result) => (result.success ? 1 : 0))
          .catch((error: unknown) => {
            const errorContext: ErrorContext = {
              operation: 'apply_template',
              filePath: file.path
            };
            this.errorHandler.handleErrorSilently(error, errorContext);
            return 0;
          })
      )
    );
  }

  private showCompletionNotice(result: BatchResult): void {
    if (result.success === result.total) {
      new Notice(`Templates applied to ${String(result.success)} notes`);
    } else {
      new Notice(`Templates applied to ${String(result.success)} of ${String(result.total)} notes`);
    }
  }

  /**
   * Show confirmation dialog for batch operation
   *
   * @param folder - The folder to process
   * @param fileCount - Number of files that will be processed
   * @returns Promise resolving to true if confirmed, false if cancelled
   */
  private confirmBatchOperation(folder: TFolder, fileCount: number): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmationModal(
        this.plugin.app,
        `Apply templates to ${String(fileCount)} notes in "${folder.path}"?`,
        'This will apply the appropriate template to all markdown files in this folder.',
        () => {
          resolve(true);
        },
        () => {
          resolve(false);
        }
      );
      modal.open();
    });
  }

  /**
   * Recursively collect all markdown files in a folder
   *
   * @param folder - Folder to search
   * @param files - Array to collect files into
   */
  private collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
    for (const child of folder.children) {
      if (child instanceof TFile && isMarkdownFile(child)) {
        files.push(child);
      } else if (child instanceof TFolder) {
        this.collectMarkdownFiles(child, files);
      }
    }
  }

  /**
   * Sleep for a given number of milliseconds
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
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
   * Insert current date at cursor position
   *
   * @param editor - The editor instance
   */
  private insertDate(editor: Editor): void {
    const date = window.moment().format(this.settings.dateFormat);
    editor.replaceSelection(date);
  }

  /**
   * Insert current time at cursor position
   *
   * @param editor - The editor instance
   */
  private insertTime(editor: Editor): void {
    const time = window.moment().format(this.settings.timeFormat);
    editor.replaceSelection(time);
  }
}

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

import {
  Plugin,
  Command,
  Notice,
  TFile,
  TFolder,
  Editor,
  MarkdownView
} from 'obsidian';
import {
  SnowflakeSettings,
  isMarkdownFile,
  CommandContext,
  BatchResult
} from './types';
import { TemplateApplicator } from './template-applicator';
import { FolderSuggestModal } from './ui/folder-modal';

/**
 * SnowflakeCommands: Manages all user-invokable commands
 *
 * Purpose: Provides manual template application commands that work
 * regardless of auto-templating settings.
 */
export class SnowflakeCommands {
  private plugin: Plugin;
  private settings: SnowflakeSettings;
  private templateApplicator: TemplateApplicator;

  constructor(plugin: Plugin, settings: SnowflakeSettings) {
    this.plugin = plugin;
    this.settings = settings;
    this.templateApplicator = new TemplateApplicator(
      plugin.app.vault,
      settings
    );
  }

  /**
   * Register all commands with Obsidian
   */
  registerCommands(): void {
    // REQ-017: Command to apply template to current note
    this.plugin.addCommand({
      id: 'apply-template-to-current-note',
      name: 'Apply template to current note',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.applyTemplateToCurrentNote(editor, view);
      }
    });

    // REQ-019: Command to apply templates to all notes in a folder
    this.plugin.addCommand({
      id: 'apply-template-to-folder',
      name: 'Apply template to all notes in folder',
      callback: () => {
        this.applyTemplateToFolder();
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
    view: MarkdownView
  ): Promise<void> {
    const file = view.file;

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
      const result = await this.templateApplicator.applyTemplate(
        file,
        context,
        editor
      );

      if (!result.success) {
        new Notice(result.message);
      }
    } catch (error) {
      console.error('Error applying template:', error);
      new Notice(`Failed to apply template: ${(error as Error).message}`);
    }
  }

  /**
   * Apply templates to all notes in a selected folder
   *
   * REQ-019: Show folder selection dialog
   * REQ-020: Apply to ALL markdown files in folder
   * REQ-021: Process asynchronously
   * REQ-022: Show completion notice
   */
  private async applyTemplateToFolder(): Promise<void> {
    // REQ-019: Show folder selection dialog
    new FolderSuggestModal(
      this.plugin.app,
      async (folder: TFolder) => {
        await this.processFolderBatch(folder);
      }
    ).open();
  }

  /**
   * Process all markdown files in a folder
   *
   * REQ-020: Process ALL markdown files
   * REQ-021: Async processing for UI responsiveness
   * REQ-022: Show progress and completion
   */
  private async processFolderBatch(folder: TFolder): Promise<void> {
    // Collect all markdown files recursively
    const markdownFiles: TFile[] = [];
    this.collectMarkdownFiles(folder, markdownFiles);

    if (markdownFiles.length === 0) {
      new Notice('No markdown files found in selected folder');
      return;
    }

    // Show starting notice
    new Notice(`Processing ${markdownFiles.length} files...`);

    // Process files in batches for better performance
    const batchSize = 10;
    const context: CommandContext = { isManualCommand: true };
    let successCount = 0;

    // REQ-021: Process asynchronously
    for (let i = 0; i < markdownFiles.length; i += batchSize) {
      const batch = markdownFiles.slice(i, i + batchSize);

      // Process batch in parallel
      const results = await Promise.all(
        batch.map(file =>
          this.templateApplicator.applyTemplate(file, context)
            .then(result => result.success ? 1 : 0)
            .catch(error => {
              console.error(`Error processing ${file.path}:`, error);
              return 0;
            })
        )
      );

      successCount += results.reduce((sum, val) => sum + val, 0);

      // Allow UI to update between batches
      await this.sleep(10);
    }

    // REQ-022: Show completion notice
    const result: BatchResult = {
      success: successCount,
      total: markdownFiles.length
    };

    if (result.success === result.total) {
      new Notice(`Templates applied to ${result.success} notes`);
    } else {
      new Notice(
        `Templates applied to ${result.success} of ${result.total} notes`
      );
    }
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
    return new Promise(resolve => setTimeout(resolve, ms));
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
}

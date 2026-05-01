/**
 * Snowflake Commands
 *
 * Manual commands that operate on the SCHEMA.md chain for the active file
 * (or a folder, for batch operations). All commands work regardless of
 * whether auto-templating fired.
 */

import { Notice, TFile, TFolder, MarkdownView } from 'obsidian';
import type { Plugin, Editor, MarkdownFileInfo } from 'obsidian';
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
import { FolderSuggestModal } from './ui/folder-modal';
import { ErrorHandler } from './error-handler';

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

  public registerCommands(): void {
    this.plugin.addCommand({
      id: 'apply-schema-to-current-note',
      name: 'Apply schema to current note',
      editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        this.applyTemplateToCurrentNote(editor, view).catch(() => {
          // Error is handled in the method
        });
      }
    });

    this.plugin.addCommand({
      id: 'insert-date',
      name: 'Insert current date',
      editorCallback: (editor: Editor) => {
        this.insertDate(editor);
      }
    });

    this.plugin.addCommand({
      id: 'insert-time',
      name: 'Insert current time',
      editorCallback: (editor: Editor) => {
        this.insertTime(editor);
      }
    });

    this.plugin.addCommand({
      id: 'create-note-in-folder',
      name: 'Create new note in folder',
      callback: () => {
        this.createNoteInFolder();
      }
    });
  }

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

    if (!skipConfirmation) {
      const confirmed = await this.confirmBatchOperation(folder, markdownFiles.length);
      if (!confirmed) {
        return null;
      }
    }

    const result = await this.processFilesInBatches(markdownFiles);

    if (!skipConfirmation) {
      this.showCompletionNotice(result);
    }

    return result;
  }

  public async applyTemplateToFolderPath(
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

  private collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
    for (const child of folder.children) {
      if (child instanceof TFile && isMarkdownFile(child)) {
        files.push(child);
      } else if (child instanceof TFolder) {
        this.collectMarkdownFiles(child, files);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  public updateSettings(settings: SnowflakeSettings): void {
    this.settings = settings;
    this.templateApplicator.updateSettings(settings);
  }

  private insertDate(editor: Editor): void {
    const date = window.moment().format(this.settings.dateFormat);
    editor.replaceSelection(date);
  }

  private insertTime(editor: Editor): void {
    const time = window.moment().format(this.settings.timeFormat);
    editor.replaceSelection(time);
  }

  private createNoteInFolder(): void {
    const modal = new FolderSuggestModal(this.plugin.app, (folder: TFolder) => {
      this.createNoteInFolderHandler(folder).catch(() => {
        // Error is handled in the method
      });
    });
    modal.open();
  }

  private async createNoteInFolderHandler(folder: TFolder): Promise<void> {
    try {
      let fileName = 'Untitled';
      let counter = 1;
      let filePath = folder.path ? `${folder.path}/${fileName}.md` : `${fileName}.md`;

      while (this.plugin.app.vault.getAbstractFileByPath(filePath)) {
        fileName = `Untitled ${String(counter)}`;
        filePath = folder.path ? `${folder.path}/${fileName}.md` : `${fileName}.md`;
        counter++;
      }

      const file = await this.plugin.app.vault.create(filePath, '');

      const leaf = this.plugin.app.workspace.getLeaf();
      await leaf.openFile(file);

      setTimeout(() => {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          const titleEl = view.containerEl.querySelector('.inline-title') as HTMLElement;
          if (titleEl) {
            titleEl.focus();
            const range = document.createRange();
            range.selectNodeContents(titleEl);
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }
      }, 100);
    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'apply_template',
        filePath: folder.path || '/'
      };
      this.errorHandler.handleError(error, errorContext);
    }
  }
}

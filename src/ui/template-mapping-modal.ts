import type { App } from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import type { TextAreaComponent } from 'obsidian';
import { FolderInputSuggest } from './folder-input-suggest';
import { FileInputSuggest } from './file-input-suggest';
import { processExclusionPatterns } from '../pattern-matcher';
import type { TemplateMappingConfig } from '../types';

/**
 * TemplateMappingModal: A modal for adding or editing folder-to-template mappings
 *
 * Purpose: Provides a single form with autocomplete fields for both
 * folder and template selection, supporting both add and edit operations
 */
export class TemplateMappingModal extends Modal {
  private folderPath: string = '';
  private templatePath: string = '';
  private excludePatterns: string = '';
  private readonly templatesFolder: string;
  private readonly isEditMode: boolean;
  private readonly originalFolderPath?: string;
  private readonly onSave: (
    folderPath: string,
    templatePath: string,
    excludePatterns?: string[],
    originalFolderPath?: string
  ) => void;
  private saveButton?: HTMLButtonElement;

  constructor(
    app: App,
    templatesFolder: string,
    onSave: (
      folderPath: string,
      templatePath: string,
      excludePatterns?: string[],
      originalFolderPath?: string
    ) => void,
    editData?: {
      folderPath: string;
      config: string | TemplateMappingConfig;
    }
  ) {
    super(app);
    this.templatesFolder = templatesFolder;
    this.onSave = onSave;

    if (editData) {
      this.isEditMode = true;
      this.originalFolderPath = editData.folderPath;
      this.folderPath = editData.folderPath;

      // Extract template path and exclusion patterns from config
      if (typeof editData.config === 'string') {
        this.templatePath = editData.config;
      } else {
        this.templatePath = editData.config.templatePath;
        if (editData.config.excludePatterns && editData.config.excludePatterns.length > 0) {
          this.excludePatterns = editData.config.excludePatterns.join('\n');
        }
      }
    } else {
      this.isEditMode = false;
    }
  }

  // eslint-disable-next-line max-lines-per-function
  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', {
      text: this.isEditMode ? 'Edit Template Mapping' : 'Add Template Mapping'
    });
    contentEl.createEl('p', {
      text: this.isEditMode
        ? 'Modify the folder mapping configuration'
        : 'Map a folder to a template file',
      cls: 'setting-item-description'
    });

    // Folder selection field
    new Setting(contentEl)
      .setName('Folder')
      .setDesc('Select the folder to map (leave empty for root folder)')
      .addText((text) => {
        new FolderInputSuggest(this.app, text.inputEl);
        text
          .setPlaceholder('Example: Projects (empty for root)')
          .setValue(this.folderPath)
          .onChange((value) => {
            this.folderPath = value;
            this.updateSaveButton();
          });

        // Prevent auto-focus in edit mode
        if (this.isEditMode) {
          // Remove focus from the input element
          setTimeout(() => {
            text.inputEl.blur();
          }, 0);
        }

        return text;
      });

    // Template selection field
    new Setting(contentEl)
      .setName('Template')
      .setDesc('Select the template file to use')
      .addText((text) => {
        new FileInputSuggest(this.app, text.inputEl, 'md', this.templatesFolder);
        text
          .setPlaceholder('Example: project.md')
          .setValue(this.templatePath)
          .onChange((value) => {
            this.templatePath = value;
            this.updateSaveButton();
          });
        return text;
      });

    // Exclusion patterns field
    new Setting(contentEl)
      .setName('Exclude Files (optional)')
      .setDesc('Enter patterns to exclude files from template application. One pattern per line.')
      .addTextArea((text: TextAreaComponent) => {
        text
          .setPlaceholder('*.tmp\ndraft-*\nREADME.md')
          .setValue(this.excludePatterns)
          .onChange((value) => {
            this.excludePatterns = value;
          });
        text.inputEl.rows = 4;
        text.inputEl.style.width = '100%';
        return text;
      });

    // Buttons
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
        })
      )
      .addButton((btn) => {
        this.saveButton = btn
          .setButtonText(this.isEditMode ? 'Save' : 'Add')
          .setCta()
          .onClick(() => {
            this.handleSave();
          }).buttonEl;
        // Initially update the button state
        this.updateSaveButton();
        return btn;
      });
  }

  private updateSaveButton(): void {
    if (this.saveButton) {
      // Enable button only if template path has value (folder path can be empty for root)
      this.saveButton.disabled = !this.templatePath;
    }
  }

  private handleSave(): void {
    if (!this.templatePath) {
      new Notice('Please select a template');
      return;
    }

    // Process and validate exclusion patterns
    const result = processExclusionPatterns(this.excludePatterns);

    if (!result.isValid) {
      // Show validation errors
      const errorMessage = result.errors.join('\n');
      new Notice(`Invalid exclusion patterns:\n${errorMessage}`, 5000);
      return;
    }

    // Call the callback with the values
    this.onSave(
      this.folderPath,
      this.templatePath,
      result.patterns.length > 0 ? result.patterns : undefined,
      this.isEditMode ? this.originalFolderPath : undefined
    );
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

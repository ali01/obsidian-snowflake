import type { App } from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import { FolderInputSuggest } from './folder-input-suggest';
import { FileInputSuggest } from './file-input-suggest';

/**
 * AddMappingModal: A modal for adding folder-to-template mappings
 *
 * Purpose: Provides a single form with autocomplete fields for both
 * folder and template selection, replacing the two-step modal process
 */
export class AddMappingModal extends Modal {
  private folderPath: string = '';
  private templatePath: string = '';
  private readonly templatesFolder: string;
  private readonly onAdd: (folderPath: string, templatePath: string) => void;
  private addButton?: HTMLButtonElement;

  constructor(
    app: App,
    templatesFolder: string,
    onAdd: (folderPath: string, templatePath: string) => void
  ) {
    super(app);
    this.templatesFolder = templatesFolder;
    this.onAdd = onAdd;
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Add Template Mapping' });
    contentEl.createEl('p', {
      text: 'Map a folder to a template file',
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
            this.updateAddButton();
          });
        return text;
      });

    // Template selection field
    new Setting(contentEl)
      .setName('Template')
      .setDesc('Select the template file to use')
      .addText((text) => {
        new FileInputSuggest(this.app, text.inputEl, 'md', this.templatesFolder);
        text
          .setPlaceholder('Example: Templates/project.md')
          .setValue(this.templatePath)
          .onChange((value) => {
            this.templatePath = value;
            this.updateAddButton();
          });
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
        this.addButton = btn
          .setButtonText('Add')
          .setCta()
          .onClick(() => {
            this.handleAdd();
          }).buttonEl;
        // Initially disable the button
        this.updateAddButton();
        return btn;
      });
  }

  private updateAddButton(): void {
    if (this.addButton) {
      // Enable button only if template path has value (folder path can be empty for root)
      this.addButton.disabled = !this.templatePath;
    }
  }

  private handleAdd(): void {
    if (!this.templatePath) {
      new Notice('Please select a template');
      return;
    }

    // Call the callback with the values (folderPath can be empty for root)
    this.onAdd(this.folderPath, this.templatePath);
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

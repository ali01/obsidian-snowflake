/**
 * Template Selection Modal
 *
 * A modal that allows users to select a template from the configured templates folder
 */

import { FuzzySuggestModal, TFile, Notice, Vault, TFolder } from 'obsidian';
import type { App } from 'obsidian';

export class TemplateSelectionModal extends FuzzySuggestModal<TFile> {
  private readonly templatesFolder: string;
  private readonly onSelect: (template: TFile) => void;

  constructor(app: App, templatesFolder: string, onSelect: (template: TFile) => void) {
    super(app);
    this.templatesFolder = templatesFolder;
    this.onSelect = onSelect;
    this.setPlaceholder('Select a template to apply...');
  }

  /**
   * Get all template files from the templates folder
   */
  getItems(): TFile[] {
    const templateFolder = this.app.vault.getAbstractFileByPath(this.templatesFolder);
    if (!templateFolder || !(templateFolder instanceof TFolder)) {
      new Notice(`Templates folder not found: ${this.templatesFolder}`);
      return [];
    }

    const templates: TFile[] = [];
    Vault.recurseChildren(templateFolder, (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        templates.push(file);
      }
    });

    // Sort templates by path for consistent ordering
    templates.sort((a, b) => a.path.localeCompare(b.path));
    return templates;
  }

  /**
   * Get display text for a template
   */
  getItemText(template: TFile): string {
    // Show relative path from templates folder
    const relativePath = template.path.startsWith(this.templatesFolder + '/')
      ? template.path.slice(this.templatesFolder.length + 1)
      : template.path;
    return relativePath;
  }

  /**
   * Handle template selection
   */
  onChooseItem(template: TFile, _evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(template);
  }
}

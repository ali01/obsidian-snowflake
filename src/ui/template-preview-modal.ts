/**
 * Modal for previewing template content
 */

import { Modal } from 'obsidian';
import type { App } from 'obsidian';

export class TemplatePreviewModal extends Modal {
  private readonly templatePath: string;
  private readonly content: string;

  constructor(app: App, templatePath: string, content: string) {
    super(app);
    this.templatePath = templatePath;
    this.content = content;
  }

  public onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: `Preview: ${this.templatePath}` });

    // Create a pre element for the content
    const pre = contentEl.createEl('pre', {
      cls: 'template-preview-content'
    });

    // Create code element with markdown syntax highlighting
    pre.createEl('code', {
      cls: 'language-markdown',
      text: this.content
    });

    // Add some basic styling
    pre.style.maxHeight = '400px';
    pre.style.overflow = 'auto';
    pre.style.backgroundColor = 'var(--background-secondary)';
    pre.style.padding = '1em';
    pre.style.borderRadius = '4px';

    // Close button
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer
      .createEl('button', {
        text: 'Close',
        cls: 'mod-cta'
      })
      .addEventListener('click', () => {
        this.close();
      });
  }

  public onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

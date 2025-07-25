import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

/**
 * ConfirmationModal: A generic confirmation dialog
 *
 * Purpose: Provides a reusable modal for confirming potentially destructive actions
 */
export class ConfirmationModal extends Modal {
  private readonly title: string;
  private readonly message: string;
  private readonly onConfirm: () => void;
  private readonly onCancel: () => void;

  constructor(
    app: App,
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel: () => void
  ) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  public onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
          this.onCancel();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText('Confirm')
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          })
      );
  }

  public onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

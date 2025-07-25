/**
 * Folder selection modal for the Snowflake plugin
 */

import { FuzzySuggestModal, TFolder } from 'obsidian';
import type { App } from 'obsidian';

/**
 * Modal for selecting a folder from the vault
 */
export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private readonly onChoose: (folder: TFolder) => void;

  constructor(app: App, onChoose: (folder: TFolder) => void) {
    super(app);
    this.onChoose = onChoose;
  }

  public getItems(): TFolder[] {
    const folders: TFolder[] = [];
    const rootFolder = this.app.vault.getRoot();
    folders.push(rootFolder);

    const addFolders = (folder: TFolder): void => {
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          folders.push(child);
          addFolders(child);
        }
      }
    };

    addFolders(rootFolder);
    return folders;
  }

  public getItemText(folder: TFolder): string {
    return folder.path || '/';
  }

  public onChooseItem(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(folder);
  }
}

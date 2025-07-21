/**
 * Folder selection modal for the Snowflake plugin
 */

import { App, FuzzySuggestModal, TFolder } from 'obsidian';

/**
 * Modal for selecting a folder from the vault
 */
export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
    private onChoose: (folder: TFolder) => void;

    constructor(app: App, onChoose: (folder: TFolder) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    getItems(): TFolder[] {
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

    getItemText(folder: TFolder): string {
        return folder.path || "/";
    }

    onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(folder);
    }
}

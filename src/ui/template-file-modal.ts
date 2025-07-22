/**
 * Template file selection modal for the Snowflake plugin
 *
 * Provides a fuzzy search interface for selecting template files
 * from the configured templates folder.
 */

import { App, FuzzySuggestModal, TFile, TFolder } from 'obsidian';

/**
 * Modal for selecting a template file from the vault
 */
export class TemplateFileSuggestModal extends FuzzySuggestModal<TFile> {
    private onChoose: (file: TFile) => void;
    private templatesFolder: string;
    private templateFiles: TFile[] = [];

    constructor(app: App, templatesFolder: string, onChoose: (file: TFile) => void) {
        super(app);
        this.templatesFolder = templatesFolder;
        this.onChoose = onChoose;
        this.setPlaceholder("Choose a template file...");

        // Collect all markdown files from the templates folder
        this.collectTemplateFiles();
    }

    /**
     * Collect all markdown files from the templates folder
     */
    private collectTemplateFiles(): void {
        const folder = this.app.vault.getAbstractFileByPath(this.templatesFolder);

        if (!folder || !(folder instanceof TFolder)) {
            // Templates folder doesn't exist or is not a folder
            return;
        }

        this.collectMarkdownFiles(folder);
    }

    /**
     * Recursively collect markdown files from a folder
     */
    private collectMarkdownFiles(folder: TFolder): void {
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                this.templateFiles.push(child);
            } else if (child instanceof TFolder) {
                this.collectMarkdownFiles(child);
            }
        }
    }

    /**
     * Get all items for the suggester
     */
    getItems(): TFile[] {
        return this.templateFiles;
    }

    /**
     * Get the text to display for each item
     */
    getItemText(file: TFile): string {
        // Show relative path from templates folder for clarity
        if (file.path.startsWith(this.templatesFolder + '/')) {
            return file.path.substring(this.templatesFolder.length + 1);
        }
        return file.path;
    }

    /**
     * Render each item in the suggestion list
     */
    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.createEl("div", { text: this.getItemText(file) });
        el.createEl("small", {
            text: file.path,
            cls: "template-file-suggester-path"
        });
    }

    /**
     * Handle item selection
     */
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(file);
    }
}

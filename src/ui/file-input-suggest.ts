/**
 * File input suggestion component
 *
 * Provides autocomplete functionality for file paths in text inputs
 */

import { AbstractInputSuggest, TFile } from 'obsidian';
import type { App } from 'obsidian';

export class FileInputSuggest extends AbstractInputSuggest<TFile> {
  private readonly inputEl: HTMLInputElement;
  private readonly fileExtension: string;
  private readonly rootFolder?: string;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    fileExtension: string = 'md',
    rootFolder?: string
  ) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.fileExtension = fileExtension;
    this.rootFolder = rootFolder;
  }

  getSuggestions(query: string): TFile[] {
    const lowerQuery = query.toLowerCase();
    let allFiles = this.app.vault
      .getAllLoadedFiles()
      .filter(
        (file): file is TFile => file instanceof TFile && file.extension === this.fileExtension
      );

    // Filter by root folder if specified
    if (this.rootFolder !== undefined && this.rootFolder !== '') {
      const rootPath = this.rootFolder;
      allFiles = allFiles.filter((file) => file.path.startsWith(rootPath + '/'));
    }

    if (!query) {
      // Return all files sorted by path when query is empty
      return allFiles.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 10);
    }

    // Filter and sort files based on query
    return this.filterAndSortFiles(allFiles, lowerQuery).slice(0, 10);
  }

  private filterAndSortFiles(files: TFile[], lowerQuery: string): TFile[] {
    return files
      .filter((file) => {
        const path = file.path.toLowerCase();
        const basename = file.basename.toLowerCase();
        // Match if query appears in path or basename
        return path.includes(lowerQuery) || basename.includes(lowerQuery);
      })
      .sort((a, b) => {
        // Prioritize exact basename matches
        const aNameMatch = a.basename.toLowerCase() === lowerQuery;
        const bNameMatch = b.basename.toLowerCase() === lowerQuery;
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;

        // Then prioritize matches at the start of the basename
        const aStartsWith = a.basename.toLowerCase().startsWith(lowerQuery);
        const bStartsWith = b.basename.toLowerCase().startsWith(lowerQuery);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // Finally sort by path length (shorter paths first)
        return a.path.length - b.path.length;
      });
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createDiv({ cls: 'suggestion-content' }, (contentEl) => {
      contentEl.createDiv({ cls: 'suggestion-title', text: file.basename });
      contentEl.createDiv({ cls: 'suggestion-path', text: file.path });
    });
  }

  selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
    // If we have a root folder and the file is within it, return relative path
    if (this.rootFolder !== undefined && file.path.startsWith(this.rootFolder + '/')) {
      this.inputEl.value = file.path.slice(this.rootFolder.length + 1);
    } else {
      this.inputEl.value = file.path;
    }
    this.inputEl.trigger('input');
    this.close();
  }
}

/**
 * Folder input suggestion component
 *
 * Provides autocomplete functionality for folder paths in text inputs
 */

import { AbstractInputSuggest, TFolder } from 'obsidian';
import type { App } from 'obsidian';

export class FolderInputSuggest extends AbstractInputSuggest<TFolder> {
  private readonly inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
  }

  public getSuggestions(query: string): TFolder[] {
    const lowerQuery = query.toLowerCase();
    const allFolders = this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder);

    if (!query) {
      // Return top-level folders when query is empty
      return allFolders
        .filter((folder) => !folder.parent || folder.parent === this.app.vault.getRoot())
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 10);
    }

    // Filter and sort folders based on query
    return allFolders
      .filter((folder) => {
        const path = folder.path.toLowerCase();
        const name = folder.name.toLowerCase();
        // Match if query appears in path or name
        return path.includes(lowerQuery) || name.includes(lowerQuery);
      })
      .sort((a, b) => {
        // Prioritize exact name matches
        const aNameMatch = a.name.toLowerCase() === lowerQuery;
        const bNameMatch = b.name.toLowerCase() === lowerQuery;
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;

        // Then prioritize matches at the start of the name
        const aStartsWith = a.name.toLowerCase().startsWith(lowerQuery);
        const bStartsWith = b.name.toLowerCase().startsWith(lowerQuery);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // Finally sort by path length (shorter paths first)
        return a.path.length - b.path.length;
      })
      .slice(0, 10);
  }

  public renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
    el.addClass('folder-suggestion-item');
  }

  public selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.inputEl.value = folder.path;
    this.inputEl.trigger('input');
    this.close();
  }
}

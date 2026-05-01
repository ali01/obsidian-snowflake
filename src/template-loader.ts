/**
 * Template Loader
 *
 * Resolves which SCHEMA.md files apply to a newly-created markdown file by
 * walking the folder hierarchy root → leaf and collecting every ancestor
 * folder's SCHEMA.md (if present).
 */

import { TFile } from 'obsidian';
import type { Vault } from 'obsidian';
import type {
  SnowflakeSettings,
  MarkdownFile,
  ErrorContext,
  TemplateChain,
  TemplateChainItem
} from './types';
import { SCHEMA_FILE_NAME } from './constants';
import { matchesExclusionPattern } from './pattern-matcher';
import { ErrorHandler } from './error-handler';

export class TemplateLoader {
  private readonly vault: Vault;
  private settings: SnowflakeSettings;
  private readonly errorHandler: ErrorHandler;

  constructor(vault: Vault, settings: SnowflakeSettings) {
    this.vault = vault;
    this.settings = settings;
    this.errorHandler = ErrorHandler.getInstance();
  }

  public async loadTemplate(templatePath: string): Promise<string | null> {
    try {
      const templateFile = this.vault.getAbstractFileByPath(templatePath);

      if (!templateFile || !(templateFile instanceof TFile)) {
        console.warn(`Template not found: ${templatePath}`);
        return null;
      }

      const content = await this.vault.read(templateFile);
      return content;
    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'load_template',
        templatePath: templatePath
      };
      this.errorHandler.handleErrorSilently(error, errorContext);
      return null;
    }
  }

  public updateSettings(settings: SnowflakeSettings): void {
    this.settings = settings;
  }

  /**
   * Build the SCHEMA.md inheritance chain for a file.
   *
   * Walks from vault root down to the file's parent folder; every folder that
   * contains a SCHEMA.md contributes one entry to the chain (root first).
   * If the file matches a global exclude pattern, returns an empty chain.
   */
  public getTemplateChain(file: MarkdownFile): TemplateChain {
    if (this.isFileExcluded(file)) {
      return { templates: [], hasInheritance: false };
    }

    const templates: TemplateChainItem[] = [];
    const folderPaths = this.getFolderHierarchy(file);

    for (let i = 0; i < folderPaths.length; i++) {
      const folderPath = folderPaths[i];
      const schemaPath = this.schemaPathFor(folderPath);
      const schemaFile = this.vault.getAbstractFileByPath(schemaPath);

      if (schemaFile instanceof TFile) {
        templates.push({
          path: schemaPath,
          folderPath: folderPath,
          depth: i
        });
      }
    }

    return {
      templates,
      hasInheritance: templates.length > 1
    };
  }

  public async loadTemplateChain(chain: TemplateChain): Promise<TemplateChain> {
    const loadedTemplates: TemplateChainItem[] = [];

    for (const template of chain.templates) {
      const content = await this.loadTemplate(template.path);

      if (content !== null) {
        loadedTemplates.push({ ...template, content });
      } else {
        console.warn(`Skipping missing template in chain: ${template.path}`);
      }
    }

    return {
      templates: loadedTemplates,
      hasInheritance: loadedTemplates.length > 1
    };
  }

  /**
   * Folder paths from vault root to the file's immediate parent.
   * Root is represented as the empty string.
   */
  private getFolderHierarchy(file: MarkdownFile): string[] {
    const paths: string[] = [''];

    const folderPath = file.parent?.path;
    if (folderPath === undefined || folderPath === '' || folderPath === '/') {
      return paths;
    }

    const parts = folderPath.split('/').filter((p) => p !== '');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      paths.push(currentPath);
    }

    return paths;
  }

  /**
   * Returns the vault path of the SCHEMA.md that would govern files in the
   * given folder. Empty/root folder yields a top-level SCHEMA.md.
   */
  private schemaPathFor(folderPath: string): string {
    if (folderPath === '' || folderPath === '/') {
      return SCHEMA_FILE_NAME;
    }
    return `${folderPath}/${SCHEMA_FILE_NAME}`;
  }

  private isFileExcluded(file: MarkdownFile): boolean {
    const patterns = this.settings.globalExcludePatterns;
    if (!patterns || patterns.length === 0) {
      return false;
    }

    const filePath = file.path ?? '';
    return matchesExclusionPattern(filePath, patterns);
  }
}

/**
 * Test-only exports
 */
export const TemplateLoaderTestUtils = {
  isFileExcluded: (loader: TemplateLoader, file: MarkdownFile): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (loader as any).isFileExcluded(file);
  },
  schemaPathFor: (loader: TemplateLoader, folderPath: string): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (loader as any).schemaPathFor(folderPath);
  }
};

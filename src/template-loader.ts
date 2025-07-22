/**
 * Template Loader
 *
 * REQ-002: When a user creates a new markdown file in a folder that has a template
 * mapping, the plugin shall automatically apply that folder's template to the file.
 *
 * REQ-003: If a folder has no specific template mapping, then the plugin shall use
 * the default template (if configured).
 *
 * REQ-026: If a template file doesn't exist when needed, then the plugin shall
 * create the new file empty and show a notice.
 */

import { TFile, TFolder } from 'obsidian';
import type { TAbstractFile, Vault } from 'obsidian';
import type { SnowflakeSettings, MarkdownFile, ErrorContext } from './types';
import { ErrorHandler } from './error-handler';

/**
 * TemplateLoader: Responsible for loading template files from the vault
 *
 * Purpose: Provides a clean interface for loading templates with proper error
 * handling and user feedback.
 */
export class TemplateLoader {
  private readonly vault: Vault;
  private settings: SnowflakeSettings;
  private readonly errorHandler: ErrorHandler;

  constructor(vault: Vault, settings: SnowflakeSettings) {
    this.vault = vault;
    this.settings = settings;
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Load a template file by path
   *
   * REQ-026: Handle missing template files gracefully
   *
   * @param templatePath - Path to the template file
   * @returns Template content or null if not found
   */
  async loadTemplate(templatePath: string): Promise<string | null> {
    try {
      // Get the template file
      const templateFile = this.vault.getAbstractFileByPath(templatePath);

      if (!templateFile || !(templateFile instanceof TFile)) {
        // REQ-026: Template doesn't exist
        console.warn(`Template not found: ${templatePath}`);
        return null;
      }

      // Read template content
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

  /**
   * Get the template path for a file based on its location
   *
   * REQ-002: Use folder-specific template mapping
   * REQ-003: Fall back to default template
   *
   * @param file - The file to get template for
   * @returns Template path or null if no template configured
   */
  getTemplateForFile(file: MarkdownFile): string | null {
    // Get the folder path
    const folderPath = file.parent?.path ?? '';

    // Check for exact folder match first
    if (this.settings.templateMappings[folderPath]) {
      return this.settings.templateMappings[folderPath];
    }

    // Check parent folders (for nested folder support)
    let currentPath = folderPath;
    while (currentPath.includes('/')) {
      currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
      if (this.settings.templateMappings[currentPath]) {
        return this.settings.templateMappings[currentPath];
      }
    }

    // Check root folder mapping
    if (this.settings.templateMappings['']) {
      return this.settings.templateMappings[''];
    }

    // REQ-003: Use default template if no folder mapping found
    if (this.settings.defaultTemplate) {
      return this.settings.defaultTemplate;
    }

    return null;
  }

  /**
   * Validate that a template path exists
   *
   * @param templatePath - Path to validate
   * @returns True if template exists
   */
  templateExists(templatePath: string): boolean {
    const file = this.vault.getAbstractFileByPath(templatePath);
    return file instanceof TFile;
  }

  /**
   * Get all available template files in the templates folder
   *
   * @returns Array of template file paths
   */
  getAvailableTemplates(): string[] {
    const templates: string[] = [];
    const templatesFolder = this.settings.templatesFolder;

    // Get the folder
    const folder = this.vault.getAbstractFileByPath(templatesFolder);
    if (!folder) {
      return templates;
    }

    // Check if it's a TFolder (has children property)
    if (!('children' in folder)) {
      return templates;
    }

    // Recursively collect markdown files
    const collectTemplates = (abstractFile: TAbstractFile): void => {
      if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
        templates.push(abstractFile.path);
      } else if (abstractFile instanceof TFolder) {
        for (const child of abstractFile.children) {
          collectTemplates(child);
        }
      }
    };

    const abstractFolder = folder as TAbstractFile;
    collectTemplates(abstractFolder);
    return templates;
  }

  /**
   * Update settings reference (for when settings change)
   *
   * @param settings - New settings object
   */
  updateSettings(settings: SnowflakeSettings): void {
    this.settings = settings;
  }
}

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

import { Vault, TFile, Notice } from 'obsidian';
import { SnowflakeSettings, MarkdownFile } from './types';

/**
 * TemplateLoader: Responsible for loading template files from the vault
 *
 * Purpose: Provides a clean interface for loading templates with proper error
 * handling and user feedback.
 */
export class TemplateLoader {
  private vault: Vault;
  private settings: SnowflakeSettings;

  constructor(vault: Vault, settings: SnowflakeSettings) {
    this.vault = vault;
    this.settings = settings;
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
      console.error(`Error loading template ${templatePath}:`, error);
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
    const folderPath = file.parent?.path || '';

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
  async templateExists(templatePath: string): Promise<boolean> {
    const file = this.vault.getAbstractFileByPath(templatePath);
    return file instanceof TFile;
  }

  /**
   * Get all available template files in the templates folder
   *
   * @returns Array of template file paths
   */
  async getAvailableTemplates(): Promise<string[]> {
    const templates: string[] = [];
    const templatesFolder = this.settings.templatesFolder;

    // Get the folder
    const folder = this.vault.getAbstractFileByPath(templatesFolder);
    if (!folder || !(folder as any).children) {
      return templates;
    }

    // Recursively collect markdown files
    const collectTemplates = (abstractFile: any) => {
      if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
        templates.push(abstractFile.path);
      } else if (abstractFile.children) {
        for (const child of abstractFile.children) {
          collectTemplates(child);
        }
      }
    };

    collectTemplates(folder);
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

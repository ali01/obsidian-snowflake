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
import type {
  SnowflakeSettings,
  MarkdownFile,
  ErrorContext,
  TemplateChain,
  TemplateChainItem,
  TemplateMappingConfig
} from './types';
import { matchesExclusionPattern } from './pattern-matcher';
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
    const mapping = this.settings.templateMappings[folderPath];
    if (mapping !== undefined) {
      if (this.isFileExcluded(file, folderPath, mapping)) {
        return null;
      }
      return this.resolveTemplatePathFromMapping(mapping);
    }

    // Check parent folders (for nested folder support)
    let currentPath = folderPath;
    while (currentPath.includes('/')) {
      currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
      const parentMapping = this.settings.templateMappings[currentPath];
      if (parentMapping !== undefined) {
        if (this.isFileExcluded(file, currentPath, parentMapping)) {
          return null;
        }
        return this.resolveTemplatePathFromMapping(parentMapping);
      }
    }

    // Check root folder mapping (both empty string and "/")
    const rootMapping = this.settings.templateMappings[''] ?? this.settings.templateMappings['/'];
    if (rootMapping !== undefined) {
      if (this.isFileExcluded(file, '', rootMapping)) {
        return null;
      }
      return this.resolveTemplatePathFromMapping(rootMapping);
    }

    // No mapping found
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

  /**
   * Get the template chain for a file based on its location
   *
   * REQ-032: Check parent folders for template mappings and apply them
   * in order from root to leaf
   *
   * @param file - The file to get template chain for
   * @returns Template chain with all applicable templates
   */
  getTemplateChain(file: MarkdownFile): TemplateChain {
    const templates: TemplateChainItem[] = [];

    // Get all folder paths from file location to root
    const folderPaths = this.getFolderHierarchy(file);

    // Check each folder for template mappings (root to leaf order)
    for (let i = 0; i < folderPaths.length; i++) {
      const folderPath = folderPaths[i];
      const mapping = this.settings.templateMappings[folderPath];

      if (mapping !== undefined) {
        // Check if file is excluded at this level
        if (!this.isFileExcluded(file, folderPath, mapping)) {
          templates.push({
            path: this.resolveTemplatePathFromMapping(mapping),
            folderPath: folderPath,
            depth: i
          });
        }
      }
    }

    // If no folder mappings found, check for root mapping
    if (templates.length === 0) {
      const rootMapping = this.settings.templateMappings[''] ?? this.settings.templateMappings['/'];
      if (rootMapping !== undefined) {
        // Check if file is excluded at root level
        if (!this.isFileExcluded(file, '', rootMapping)) {
          templates.push({
            path: this.resolveTemplatePathFromMapping(rootMapping),
            folderPath: '',
            depth: 0
          });
        }
      }
    }

    return {
      templates,
      hasInheritance: templates.length > 1
    };
  }

  /**
   * Load content for all templates in a chain
   *
   * REQ-032: Handle missing templates gracefully
   *
   * @param chain - Template chain to load
   * @returns Template chain with content populated
   */
  async loadTemplateChain(chain: TemplateChain): Promise<TemplateChain> {
    const loadedTemplates: TemplateChainItem[] = [];

    for (const template of chain.templates) {
      const content = await this.loadTemplate(template.path);

      // Skip templates that couldn't be loaded
      if (content !== null) {
        loadedTemplates.push({
          ...template,
          content
        });
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
   * Get folder hierarchy from a file's location
   *
   * @param file - File to get hierarchy for
   * @returns Array of folder paths from root to immediate parent
   */
  private getFolderHierarchy(file: MarkdownFile): string[] {
    const paths: string[] = [];

    // Start with root
    paths.push('');

    // Get folder path
    const folderPath = file.parent?.path;
    if (folderPath === undefined || folderPath === '' || folderPath === '/') {
      return paths;
    }

    // Build hierarchy from root to leaf
    const parts = folderPath.split('/').filter((p) => p !== '');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      paths.push(currentPath);
    }

    return paths;
  }

  /**
   * Check if a file is excluded by the mapping's exclusion patterns
   *
   * @param file - The file to check
   * @param mappingFolderPath - The folder path of the mapping
   * @param mapping - The template mapping configuration
   * @returns True if the file should be excluded
   */
  private isFileExcluded(
    file: MarkdownFile,
    mappingFolderPath: string,
    mapping: string | TemplateMappingConfig
  ): boolean {
    // String mappings have no exclusions
    if (typeof mapping === 'string') {
      return false;
    }

    // Check if there are exclusion patterns
    if (!mapping.excludePatterns || mapping.excludePatterns.length === 0) {
      return false;
    }

    // Get the file path relative to the mapping folder
    const filePath = file.path;
    let relativePath: string;
    if (mappingFolderPath === '') {
      relativePath = filePath;
    } else if (filePath.startsWith(mappingFolderPath + '/')) {
      relativePath = filePath.slice(mappingFolderPath.length + 1);
    } else {
      relativePath = file.name;
    }

    return matchesExclusionPattern(relativePath, mapping.excludePatterns);
  }

  /**
   * Resolve template path from a mapping
   *
   * @param mapping - The template mapping (string or config object)
   * @returns Resolved template path
   */
  private resolveTemplatePathFromMapping(mapping: string | TemplateMappingConfig): string {
    const templatePath = typeof mapping === 'string' ? mapping : mapping.templatePath;
    return `${this.settings.templatesFolder}/${templatePath}`;
  }
}

/**
 * Template Applicator
 *
 * REQ-005: While the global "Enable auto-templating" setting is disabled,
 * the plugin shall NOT automatically apply templates to new files.
 *
 * REQ-006: When applying a template to an existing file, the plugin shall
 * merge the template content with the existing content.
 *
 * REQ-007: When merging template body content with existing content, the plugin
 * shall insert the template body at the cursor position.
 *
 * REQ-025: Where auto-templating is disabled but a user runs a manual command,
 * the plugin shall still apply the template.
 */

import { Vault, Notice, Editor } from 'obsidian';
import {
  MarkdownFile,
  SnowflakeSettings,
  CommandContext,
  ErrorContext
} from './types';
import { TemplateLoader } from './template-loader';
import { TemplateVariableProcessor } from './template-variables';
import { FrontmatterMerger } from './frontmatter-merger';

/**
 * Template application result
 */
interface ApplyResult {
  success: boolean;
  message: string;
  hadSnowflakeId?: boolean;
}

/**
 * TemplateApplicator: Orchestrates the template application process
 *
 * Purpose: Combines template loading, variable processing, and content merging
 * to apply templates to files according to the requirements.
 */
export class TemplateApplicator {
  private vault: Vault;
  private settings: SnowflakeSettings;
  private loader: TemplateLoader;
  private variableProcessor: TemplateVariableProcessor;
  private frontmatterMerger: FrontmatterMerger;

  constructor(vault: Vault, settings: SnowflakeSettings) {
    this.vault = vault;
    this.settings = settings;
    this.loader = new TemplateLoader(vault, settings);
    this.variableProcessor = new TemplateVariableProcessor();
    this.frontmatterMerger = new FrontmatterMerger();
  }

  /**
   * Apply a template to a file
   *
   * REQ-005: Check if auto-templating is enabled (unless manual)
   * REQ-025: Allow manual application regardless of auto-templating setting
   *
   * @param file - The file to apply template to
   * @param context - Command context (manual vs automatic)
   * @param editor - Optional editor for cursor position
   * @returns Application result
   */
  async applyTemplate(
    file: MarkdownFile,
    context: CommandContext = { isManualCommand: false },
    editor?: Editor
  ): Promise<ApplyResult> {
    try {
      // REQ-005/REQ-025: Check if we should apply template
      if (!context.isManualCommand && !this.settings.enableAutoTemplating) {
        return {
          success: false,
          message: 'Auto-templating is disabled'
        };
      }

      // Get template path for this file
      const templatePath = this.loader.getTemplateForFile(file);
      if (!templatePath) {
        return {
          success: false,
          message: 'No template configured for this location'
        };
      }

      // Load the template
      const templateContent = await this.loader.loadTemplate(templatePath);
      if (templateContent === null) {
        // REQ-026: Template doesn't exist
        new Notice(`Template not found: ${templatePath}`);
        return {
          success: false,
          message: `Template not found: ${templatePath}`
        };
      }

      // Process template variables
      const processedTemplate = await this.variableProcessor.processTemplate(
        templateContent,
        file
      );

      // Apply the processed template
      const result = await this.applyProcessedTemplate(
        file,
        processedTemplate.content,
        editor
      );

      if (result.success) {
        new Notice(`Template applied to ${file.basename}`);
      }

      return {
        ...result,
        hadSnowflakeId: processedTemplate.hasSnowflakeId
      };
    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'apply_template',
        filePath: file.path,
        error: error as Error
      };

      console.error('Error applying template:', errorContext);
      new Notice(`Failed to apply template: ${(error as Error).message}`);

      return {
        success: false,
        message: `Error: ${(error as Error).message}`
      };
    }
  }

  /**
   * Apply a specific template to a file (for manual commands)
   *
   * @param file - The file to apply template to
   * @param templatePath - Specific template to apply
   * @param editor - Optional editor for cursor position
   * @returns Application result
   */
  async applySpecificTemplate(
    file: MarkdownFile,
    templatePath: string,
    editor?: Editor
  ): Promise<ApplyResult> {
    try {
      // Load the template
      const templateContent = await this.loader.loadTemplate(templatePath);
      if (templateContent === null) {
        new Notice(`Template not found: ${templatePath}`);
        return {
          success: false,
          message: `Template not found: ${templatePath}`
        };
      }

      // Process template variables
      const processedTemplate = await this.variableProcessor.processTemplate(
        templateContent,
        file
      );

      // Apply the processed template
      const result = await this.applyProcessedTemplate(
        file,
        processedTemplate.content,
        editor
      );

      if (result.success) {
        new Notice(`Template applied to ${file.basename}`);
      }

      return {
        ...result,
        hadSnowflakeId: processedTemplate.hasSnowflakeId
      };
    } catch (error) {
      console.error('Error applying specific template:', error);
      new Notice(`Failed to apply template: ${(error as Error).message}`);

      return {
        success: false,
        message: `Error: ${(error as Error).message}`
      };
    }
  }

  /**
   * Apply processed template content to a file
   *
   * REQ-006: Merge template with existing content
   * REQ-007: Insert body at cursor position
   *
   * @param file - The file to apply to
   * @param processedContent - The processed template content
   * @param editor - Optional editor for cursor position
   * @returns Application result
   */
  private async applyProcessedTemplate(
    file: MarkdownFile,
    processedContent: string,
    editor?: Editor
  ): Promise<ApplyResult> {
    // Read current file content
    const currentContent = await this.vault.read(file);

    // Split template into frontmatter and body
    const templateParts = this.splitContent(processedContent);
    const currentParts = this.splitContent(currentContent);

    let finalContent: string;

    // Handle frontmatter merging
    if (templateParts.frontmatter || currentParts.frontmatter) {
      const mergeResult = this.frontmatterMerger.merge(
        currentContent,
        templateParts.frontmatter || ''
      );

      // Apply merged frontmatter
      finalContent = this.frontmatterMerger.applyToFile(
        currentContent,
        mergeResult.merged
      );

      // Update body content reference after frontmatter change
      const newParts = this.splitContent(finalContent);
      currentParts.body = newParts.body;
    } else {
      finalContent = currentContent;
    }

    // Handle body content
    if (templateParts.body) {
      if (currentParts.body) {
        // REQ-007: Insert at cursor position if available
        if (editor) {
          const cursor = editor.getCursor();
          const lines = currentParts.body.split('\n');

          // Insert at cursor position
          if (cursor.line < lines.length) {
            lines[cursor.line] =
              lines[cursor.line].slice(0, cursor.ch) +
              templateParts.body +
              lines[cursor.line].slice(cursor.ch);
          } else {
            // Cursor beyond content, append
            lines.push(templateParts.body);
          }

          // Reconstruct with merged body
          const finalParts = this.splitContent(finalContent);
          finalContent = finalParts.frontmatterBlock + lines.join('\n');
        } else {
          // No cursor, append to end
          finalContent = finalContent.trimEnd() + '\n\n' + templateParts.body;
        }
      } else {
        // No existing body, just add template body
        finalContent = finalContent.trimEnd() + '\n\n' + templateParts.body;
      }
    }

    // Write the final content
    await this.vault.modify(file, finalContent);

    return {
      success: true,
      message: 'Template applied successfully'
    };
  }

  /**
   * Split content into frontmatter and body parts
   *
   * @param content - Content to split
   * @returns Split content parts
   */
  private splitContent(content: string): {
    frontmatter: string | null;
    frontmatterBlock: string;
    body: string;
  } {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);

    if (frontmatterMatch) {
      return {
        frontmatter: frontmatterMatch[1],
        frontmatterBlock: frontmatterMatch[0],
        body: content.slice(frontmatterMatch[0].length)
      };
    }

    return {
      frontmatter: null,
      frontmatterBlock: '',
      body: content
    };
  }

  /**
   * Update settings reference
   *
   * @param settings - New settings
   */
  updateSettings(settings: SnowflakeSettings): void {
    this.settings = settings;
    this.loader.updateSettings(settings);
  }
}

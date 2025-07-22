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

import { Notice } from 'obsidian';
import type { Vault, Editor } from 'obsidian';
import type { MarkdownFile, SnowflakeSettings, CommandContext, ErrorContext } from './types';
import { TemplateLoader } from './template-loader';
import { TemplateVariableProcessor } from './template-variables';
import { FrontmatterMerger } from './frontmatter-merger';
import { ErrorHandler } from './error-handler';

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
  private readonly vault: Vault;
  private settings: SnowflakeSettings;
  private readonly loader: TemplateLoader;
  private readonly variableProcessor: TemplateVariableProcessor;
  private readonly frontmatterMerger: FrontmatterMerger;
  private readonly errorHandler: ErrorHandler;

  constructor(vault: Vault, settings: SnowflakeSettings) {
    this.vault = vault;
    this.settings = settings;
    this.loader = new TemplateLoader(vault, settings);
    this.variableProcessor = new TemplateVariableProcessor();
    this.frontmatterMerger = new FrontmatterMerger();
    this.errorHandler = ErrorHandler.getInstance();
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
    // REQ-005/REQ-025: Check if we should apply template
    if (!this.shouldApplyTemplate(context)) {
      return { success: false, message: 'Auto-templating is disabled' };
    }

    const templatePath = this.loader.getTemplateForFile(file);
    if (templatePath === null) {
      return { success: false, message: 'No template configured for this location' };
    }

    return this.loadAndApplyTemplate(file, templatePath, editor);
  }

  private shouldApplyTemplate(context: CommandContext): boolean {
    return context.isManualCommand || this.settings.enableAutoTemplating;
  }

  private async loadAndApplyTemplate(
    file: MarkdownFile,
    templatePath: string,
    editor?: Editor
  ): Promise<ApplyResult> {
    try {
      const templateContent = await this.loader.loadTemplate(templatePath);
      if (templateContent === null) {
        new Notice(`Template not found: ${templatePath}`);
        return { success: false, message: `Template not found: ${templatePath}` };
      }

      const processedTemplate = this.variableProcessor.processTemplate(templateContent, file);
      const result = await this.applyProcessedTemplate(file, processedTemplate.content, editor);

      if (result.success) {
        new Notice(`Template applied to ${file.basename}`);
      }

      return { ...result, hadSnowflakeId: processedTemplate.hasSnowflakeId };
    } catch (error) {
      return this.handleTemplateError(error, file.path, templatePath);
    }
  }

  private handleTemplateError(error: unknown, filePath: string, templatePath: string): ApplyResult {
    const errorContext: ErrorContext = {
      operation: 'apply_template',
      filePath,
      templatePath
    };
    const errorMessage = this.errorHandler.handleError(error, errorContext);
    return { success: false, message: errorMessage };
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
      const processedTemplate = this.variableProcessor.processTemplate(templateContent, file);

      // Apply the processed template
      const result = await this.applyProcessedTemplate(file, processedTemplate.content, editor);

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
        templatePath: templatePath
      };

      const errorMessage = this.errorHandler.handleError(error, errorContext);

      return {
        success: false,
        message: errorMessage
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
    const currentContent = await this.vault.read(file);
    const templateParts = this.splitContent(processedContent);
    const currentParts = this.splitContent(currentContent);

    // Process frontmatter
    const { content: contentAfterFrontmatter, updatedBody } = this.processFrontmatter(
      currentContent,
      templateParts,
      currentParts
    );

    // Process body content
    const finalContent = this.processBodyContent(
      contentAfterFrontmatter,
      templateParts.body,
      updatedBody,
      editor
    );

    await this.vault.modify(file, finalContent);
    return { success: true, message: 'Template applied successfully' };
  }

  private processFrontmatter(
    currentContent: string,
    templateParts: ReturnType<typeof this.splitContent>,
    currentParts: ReturnType<typeof this.splitContent>
  ): { content: string; updatedBody: string } {
    if (templateParts.frontmatter === null || templateParts.frontmatter === '') {
      return { content: currentContent, updatedBody: currentParts.body };
    }

    const mergeResult = this.frontmatterMerger.merge(currentContent, templateParts.frontmatter);
    const contentWithMergedFrontmatter = this.frontmatterMerger.applyToFile(
      currentContent,
      mergeResult.merged
    );
    const newParts = this.splitContent(contentWithMergedFrontmatter);

    return { content: contentWithMergedFrontmatter, updatedBody: newParts.body };
  }

  private processBodyContent(
    currentContent: string,
    templateBody: string,
    currentBody: string,
    editor?: Editor
  ): string {
    if (templateBody === '') {
      return currentContent;
    }

    if (currentBody === '' || editor === undefined) {
      return currentContent.trimEnd() + '\n\n' + templateBody;
    }

    return this.insertAtCursor(currentContent, templateBody, currentBody, editor);
  }

  private insertAtCursor(
    currentContent: string,
    templateBody: string,
    currentBody: string,
    editor: Editor
  ): string {
    const cursor = editor.getCursor();
    const lines = currentBody.split('\n');

    if (cursor.line < lines.length) {
      lines[cursor.line] =
        lines[cursor.line].slice(0, cursor.ch) + templateBody + lines[cursor.line].slice(cursor.ch);
    } else {
      lines.push(templateBody);
    }

    const parts = this.splitContent(currentContent);
    return parts.frontmatterBlock + lines.join('\n');
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

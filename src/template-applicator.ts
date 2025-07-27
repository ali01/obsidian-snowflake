/**
 * Template Applicator
 *
 * REQ-006: When applying a template to an existing file, the plugin shall
 * merge the template content with the existing content.
 *
 * REQ-007: When merging template body content with existing content, the plugin
 * shall insert the template body at the cursor position.
 *
 * REQ-025: Manual commands always apply templates regardless of other settings.
 */

// import { Notice } from 'obsidian';
import type { Vault, Editor } from 'obsidian';
import type {
  MarkdownFile,
  SnowflakeSettings,
  CommandContext,
  ErrorContext,
  TemplateChainItem
} from './types';
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
  private readonly loader: TemplateLoader;
  private readonly variableProcessor: TemplateVariableProcessor;
  private readonly frontmatterMerger: FrontmatterMerger;
  private readonly errorHandler: ErrorHandler;

  constructor(vault: Vault, settings: SnowflakeSettings) {
    this.vault = vault;
    this.loader = new TemplateLoader(vault, settings);
    this.variableProcessor = new TemplateVariableProcessor(
      settings.dateFormat,
      settings.timeFormat
    );
    this.frontmatterMerger = new FrontmatterMerger();
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Apply a template to a file
   *
   * REQ-025: Manual commands always work
   *
   * @param file - The file to apply template to
   * @param context - Command context (manual vs automatic)
   * @param editor - Optional editor for cursor position
   * @returns Application result
   */
  public async applyTemplate(
    file: MarkdownFile,
    context: CommandContext = { isManualCommand: false },
    editor?: Editor
  ): Promise<ApplyResult> {
    // Get template chain for inheritance support
    const chain = this.loader.getTemplateChain(file);
    if (chain.templates.length === 0) {
      return { success: false, message: 'No template configured for this location' };
    }

    // Load all templates in chain
    const loadedChain = await this.loader.loadTemplateChain(chain);
    if (loadedChain.templates.length === 0) {
      return { success: false, message: 'No templates could be loaded' };
    }

    // Always use mergeTemplates to ensure delete list processing
    const finalTemplateContent = this.mergeTemplates(loadedChain.templates);

    // Extract properties from the FINAL merged template (after delete lists are applied) for REQ-038
    const templateProperties = this.extractPropertiesFromFinalTemplate(finalTemplateContent);

    // Process variables and apply with property tracking
    const result = await this.applyProcessedTemplateContent(
      file,
      finalTemplateContent,
      templateProperties,
      editor,
      context
    );

    if (result.success && context.isBatchOperation !== true) {
      const templateNames = loadedChain.templates.map((t) => t.path).join(' → ');
      console.info(`Snowflake: Template(s) "${templateNames}" applied to ${file.path}`);
    }

    return result;
  }

  /**
   * Apply a specific template to a file (for manual commands)
   *
   * @param file - The file to apply template to
   * @param templatePath - Specific template to apply
   * @param editor - Optional editor for cursor position
   * @returns Application result
   */
  public async applySpecificTemplate(
    file: MarkdownFile,
    templatePath: string,
    editor?: Editor
  ): Promise<ApplyResult> {
    try {
      // Load the template
      const templateContent = await this.loader.loadTemplate(templatePath);
      if (templateContent === null) {
        console.error(`Snowflake: Template not found: ${templatePath}`);
        return {
          success: false,
          message: `Template not found: ${templatePath}`
        };
      }

      // Remove delete property from template before applying
      const cleanedTemplateContent = this.removeDeletePropertyFromTemplate(templateContent);

      // Process template variables
      const processedTemplate = this.variableProcessor.processTemplate(
        cleanedTemplateContent,
        file
      );

      // Apply the processed template
      const result = await this.applyProcessedTemplate(file, processedTemplate.content, editor);

      if (result.success) {
        console.info(`Snowflake: Template "${templatePath}" applied to ${file.path}`);
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
   * REQ-039: Apply only frontmatter in batch operations
   *
   * @param file - The file to apply to
   * @param processedContent - The processed template content
   * @param editor - Optional editor for cursor position
   * @param context - Command context with batch operation flag
   * @returns Application result
   */
  private async applyProcessedTemplate(
    file: MarkdownFile,
    processedContent: string,
    editor?: Editor,
    context?: CommandContext
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

    // REQ-039: Check if we should skip body processing in batch operations
    const isBatchOperation = context?.isBatchOperation === true;
    const shouldSkipBody = isBatchOperation && updatedBody.trim() !== '';

    // Process body content unless we're in batch mode with existing content
    let finalContent: string;
    if (shouldSkipBody) {
      // In batch mode with existing content: keep the current body
      finalContent = contentAfterFrontmatter;
    } else {
      // Normal mode or batch mode with whitespace-only body: process template body
      finalContent = this.processBodyContent(
        contentAfterFrontmatter,
        templateParts.body,
        updatedBody,
        editor
      );
    }

    // Ensure file ends with exactly one newline
    const normalizedContent = finalContent.trimEnd() + '\n';
    await this.vault.modify(file, normalizedContent);
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

    const mergeResult = this.frontmatterMerger.mergeWithFile(
      currentContent,
      templateParts.frontmatter
    );
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
      // Ensure we don't add extra newlines
      const trimmedContent = currentContent.trimEnd();
      const trimmedTemplate = templateBody.trimEnd();

      // Add single newline if there's existing content
      if (trimmedContent !== '') {
        return trimmedContent + '\n' + trimmedTemplate;
      }
      return trimmedTemplate;
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

    // Trim trailing newlines from template body to avoid extra lines
    const trimmedTemplateBody = templateBody.trimEnd();

    if (cursor.line < lines.length) {
      lines[cursor.line] =
        lines[cursor.line].slice(0, cursor.ch) +
        trimmedTemplateBody +
        lines[cursor.line].slice(cursor.ch);
    } else {
      lines.push(trimmedTemplateBody);
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
   * Apply processed template content with empty property cleanup
   *
   * REQ-038: Remove empty properties not from templates
   * REQ-039: Apply only frontmatter in batch operations
   *
   * @param file - The file to apply to
   * @param templateContent - The raw template content
   * @param templateProperties - Properties from the template chain
   * @param editor - Optional editor for cursor position
   * @param context - Command context with batch operation flag
   * @returns Application result
   */
  private async applyProcessedTemplateContent(
    file: MarkdownFile,
    templateContent: string,
    templateProperties: Set<string>,
    editor?: Editor,
    context?: CommandContext
  ): Promise<ApplyResult> {
    try {
      // Read current content to check if file has existing content
      const currentContent = await this.vault.read(file);
      const hasExistingContent = currentContent.trim() !== '';

      // Process template variables
      const processedTemplate = this.variableProcessor.processTemplate(templateContent, file);

      // Apply the processed template
      const result = await this.applyProcessedTemplate(
        file,
        processedTemplate.content,
        editor,
        context
      );

      // REQ-038: Clean up empty properties only for existing files
      if (result.success && hasExistingContent) {
        await this.cleanupEmptyProperties(file, templateProperties);
      }

      return {
        ...result,
        hadSnowflakeId: processedTemplate.hasSnowflakeId
      };
    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'apply_template',
        filePath: file.path
      };

      const errorMessage = this.errorHandler.handleError(error, errorContext);

      return {
        success: false,
        message: errorMessage
      };
    }
  }

  /**
   * Update settings reference
   *
   * @param settings - New settings
   */
  public updateSettings(settings: SnowflakeSettings): void {
    this.loader.updateSettings(settings);
    this.variableProcessor.setDateFormat(settings.dateFormat);
    this.variableProcessor.setTimeFormat(settings.timeFormat);
  }

  /**
   * Merge multiple templates into a single template
   *
   * REQ-033: Merge templates with child templates taking precedence
   * REQ-033a: Concatenate list-type fields across inheritance chain
   *
   * @param templates - Templates to merge (ordered from root to leaf)
   * @returns Merged template content
   */
  private mergeTemplates(templates: TemplateChainItem[]): string {
    if (templates.length === 0) {
      return '';
    }

    // Always use accumulateTemplateContent to ensure delete list processing
    const { frontmatter, body } = this.accumulateTemplateContent(templates);
    return this.formatMergedContent(frontmatter, body);
  }

  /**
   * Accumulate frontmatter and body content from templates
   *
   * REQ-034: Apply delete list exclusions from templates
   * REQ-035: Track cumulative delete list through inheritance chain
   * REQ-036: Remove "delete" property from final result
   * REQ-037: Allow explicit redefinition to override exclusions
   */
  private accumulateTemplateContent(templates: TemplateChainItem[]): {
    frontmatter: string;
    body: string;
  } {
    let accumulatedFrontmatter = '';
    let accumulatedBody = '';
    let cumulativeDeleteList: string[] = [];

    for (const template of templates) {
      if (template.content === undefined || template.content === '') {
        continue;
      }

      const parts = this.splitContent(template.content);

      // Process frontmatter with delete list handling
      if (parts.frontmatter !== null && parts.frontmatter.trim() !== '') {
        if (accumulatedFrontmatter === '') {
          // First template - process with empty delete list
          const deleteResult = this.frontmatterMerger.processWithDeleteList(
            parts.frontmatter,
            cumulativeDeleteList
          );
          accumulatedFrontmatter = deleteResult.processedContent;
          cumulativeDeleteList = deleteResult.newDeleteList;
        } else {
          // Use the new mergeWithDeleteList method that handles all delete list logic
          const result = this.frontmatterMerger.mergeWithDeleteList(
            accumulatedFrontmatter,
            parts.frontmatter,
            cumulativeDeleteList
          );

          accumulatedFrontmatter = result.mergedFrontmatter;
          cumulativeDeleteList = result.updatedDeleteList;
        }
      }

      // Append body content
      if (parts.body.trim() !== '') {
        if (accumulatedBody !== '') {
          accumulatedBody += '\n\n';
        }
        accumulatedBody += parts.body.trim();
      }
    }

    return { frontmatter: accumulatedFrontmatter, body: accumulatedBody };
  }

  /**
   * Format merged frontmatter and body into final content
   */
  private formatMergedContent(frontmatter: string, body: string): string {
    if (frontmatter !== '') {
      const trimmedFrontmatter = frontmatter.trimEnd();
      let mergedContent = `---\n${trimmedFrontmatter}\n---`;
      if (body !== '') {
        mergedContent += '\n' + body;
      }
      return mergedContent;
    }
    return body;
  }

  /**
   * Extract property names from the final merged template
   *
   * REQ-038: Track properties that actually exist in the final template after delete lists
   *
   * @param finalTemplateContent - The final merged template content
   * @returns Set of property names in the final template
   */
  private extractPropertiesFromFinalTemplate(finalTemplateContent: string): Set<string> {
    const parts = this.splitContent(finalTemplateContent);

    if (parts.frontmatter !== null && parts.frontmatter.trim() !== '') {
      const properties = this.frontmatterMerger.extractPropertyNames(parts.frontmatter);
      return properties;
    }

    return new Set<string>();
  }

  /**
   * Clean up empty properties not from templates
   *
   * REQ-038: Remove empty properties that weren't added by template chain
   *
   * @param file - The file to clean up
   * @param templateProperties - Properties from the template chain
   */
  private async cleanupEmptyProperties(
    file: MarkdownFile,
    templateProperties: Set<string>
  ): Promise<void> {
    const content = await this.vault.read(file);
    const parts = this.splitContent(content);

    if (parts.frontmatter !== null && parts.frontmatter.trim() !== '') {
      const cleanedFrontmatter = this.frontmatterMerger.cleanupEmptyProperties(
        parts.frontmatter,
        templateProperties
      );

      // Only rewrite if something changed
      if (cleanedFrontmatter !== parts.frontmatter) {
        const cleanedContent = `---\n${cleanedFrontmatter}---\n${parts.body}`;
        const normalizedContent = cleanedContent.trimEnd() + '\n';
        await this.vault.modify(file, normalizedContent);
      }
    }
  }

  /**
   * Remove delete property from template content
   *
   * When applying a specific template, we don't want the delete property
   * to be added to the file's frontmatter
   *
   * @param templateContent - The template content
   * @returns Template content without delete property
   */
  private removeDeletePropertyFromTemplate(templateContent: string): string {
    const parts = this.splitContent(templateContent);

    if (parts.frontmatter === null || parts.frontmatter.trim() === '') {
      return templateContent;
    }

    // Use processWithDeleteList with empty delete list to just remove the delete property
    const result = this.frontmatterMerger.processWithDeleteList(parts.frontmatter, []);

    if (result.processedContent.trim() === '') {
      // If frontmatter becomes empty after removing delete property, return just the body
      return parts.body;
    }

    return `---\n${result.processedContent}---\n${parts.body}`;
  }
}

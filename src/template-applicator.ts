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
  private settings: SnowflakeSettings;
  private readonly loader: TemplateLoader;
  private readonly variableProcessor: TemplateVariableProcessor;
  private readonly frontmatterMerger: FrontmatterMerger;
  private readonly errorHandler: ErrorHandler;

  constructor(vault: Vault, settings: SnowflakeSettings) {
    this.vault = vault;
    this.settings = settings;
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
  async applyTemplate(
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

    // Process variables and apply
    const result = await this.applyProcessedTemplateContent(file, finalTemplateContent, editor);

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
  async applySpecificTemplate(
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

      // Process template variables
      const processedTemplate = this.variableProcessor.processTemplate(templateContent, file);

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
   * Apply processed template content to a file (with variable processing)
   *
   * @param file - The file to apply to
   * @param templateContent - The raw template content
   * @param editor - Optional editor for cursor position
   * @returns Application result
   */
  private async applyProcessedTemplateContent(
    file: MarkdownFile,
    templateContent: string,
    editor?: Editor
  ): Promise<ApplyResult> {
    try {
      // Process template variables
      const processedTemplate = this.variableProcessor.processTemplate(templateContent, file);

      // Apply the processed template
      const result = await this.applyProcessedTemplate(file, processedTemplate.content, editor);

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
  updateSettings(settings: SnowflakeSettings): void {
    this.settings = settings;
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
}

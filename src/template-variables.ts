/**
 * Template Variable Processing Engine
 *
 * REQ-011: When processing templates, the plugin shall replace these variables:
 * - {{title}} → The filename without .md extension
 * - {{date}} → Current date (REQ-012: default "YYYY-MM-DD")
 * - {{time}} → Current time (REQ-013: default "HH:mm")
 * - {{snowflake_id}} → A unique 10-character ID (REQ-015)
 *
 * REQ-014: Where users have configured custom date/time formats in settings,
 * the plugin shall use those formats instead of defaults.
 *
 * REQ-016: If a template contains {{snowflake_id}} multiple times, then the
 * plugin shall replace ALL instances with the SAME ID value.
 */

import type { TemplateVariableContext, TemplateProcessResult, MarkdownFile } from './types';
import { generateNanoID } from './nanoid';
import { moment } from 'obsidian';

/**
 * Regular expression to match template variables
 * Matches: {{variable_name}}
 */
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Default date and time formats
 */
const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
const DEFAULT_TIME_FORMAT = 'HH:mm';

/**
 * Registry of available template variables and their handlers
 */
const VARIABLE_HANDLERS = {
  title: (context: TemplateVariableContext): string => context.title,
  date: (context: TemplateVariableContext): string => context.date,
  time: (context: TemplateVariableContext): string => context.time,
  snowflakeId: (context: TemplateVariableContext): string | undefined => context.snowflakeId
};

/**
 * TemplateVariableProcessor: Main class for processing template variables
 *
 * Purpose: Handles the replacement of template variables in content,
 * ensuring consistent values across multiple occurrences and supporting
 * extensible variable definitions.
 */
export class TemplateVariableProcessor {
  private dateFormat: string;
  private timeFormat: string;

  constructor(dateFormat: string = DEFAULT_DATE_FORMAT, timeFormat: string = DEFAULT_TIME_FORMAT) {
    this.dateFormat = dateFormat;
    this.timeFormat = timeFormat;
  }

  /**
   * Process template content and replace all variables
   *
   * REQ-011: Replace {{title}}, {{date}}, {{time}}, {{snowflake_id}}
   * REQ-016: Ensure same ID value for multiple {{snowflake_id}} instances
   *
   * @param templateContent - The template content to process
   * @param file - The markdown file being created
   * @returns Processed content with variables replaced
   */
  public processTemplate(templateContent: string, file: MarkdownFile): TemplateProcessResult {
    // Check if template contains snowflake_id variable
    const hasSnowflakeId = templateContent.includes('{{snowflake_id}}');

    // Build variable context
    const context = this.buildContext(file, hasSnowflakeId);

    // Replace all variables in the template
    const processedContent = this.replaceVariables(templateContent, context);

    return {
      content: processedContent,
      hasSnowflakeId,
      variables: context
    };
  }

  /**
   * Build the variable context for a file
   *
   * REQ-012: Use default date format "YYYY-MM-DD"
   * REQ-013: Use default time format "HH:mm"
   * REQ-014: Use custom formats if configured
   * REQ-015: Generate 10-character alphanumeric ID
   *
   * @param file - The file to build context for
   * @param generateId - Whether to generate a snowflake_id
   * @returns Variable context
   */
  private buildContext(file: MarkdownFile, generateId: boolean): TemplateVariableContext {
    // Use type assertion for moment as Obsidian's types are incomplete
    const now = (moment as unknown as () => { format: (fmt: string) => string })();

    const context: TemplateVariableContext = {
      title: file.basename, // filename without .md extension
      date: now.format(this.dateFormat),
      time: now.format(this.timeFormat)
    };

    // Only generate ID if template contains {{snowflake_id}}
    if (generateId) {
      context.snowflakeId = generateNanoID();
    }

    return context;
  }

  /**
   * Replace all variables in the content
   *
   * REQ-027: If a template contains malformed variable syntax, then the
   * plugin shall leave it unchanged in the output.
   *
   * @param content - The content to process
   * @param context - The variable context
   * @returns Content with variables replaced
   */
  private replaceVariables(content: string, context: TemplateVariableContext): string {
    return content.replace(VARIABLE_REGEX, (match, varName: string) => {
      // Get handler for this variable
      // Check if variable name is known
      // Special handling for snowflake_id alias
      const handlerKey = varName === 'snowflake_id' ? 'snowflakeId' : varName;

      if (!(handlerKey in VARIABLE_HANDLERS)) {
        // REQ-027: Leave malformed/unknown variables unchanged
        return match;
      }

      const handler = VARIABLE_HANDLERS[handlerKey as keyof typeof VARIABLE_HANDLERS];

      // Get value from context
      const value = handler(context);

      // If no value available, leave unchanged
      return value ?? match;
    });
  }

  /**
   * Update date format
   *
   * REQ-014: Support custom date formats
   *
   * @param format - New date format
   */
  public setDateFormat(format: string): void {
    this.dateFormat = format !== '' ? format : DEFAULT_DATE_FORMAT;
  }

  /**
   * Update time format
   *
   * REQ-014: Support custom time formats
   *
   * @param format - New time format
   */
  public setTimeFormat(format: string): void {
    this.timeFormat = format !== '' ? format : DEFAULT_TIME_FORMAT;
  }

  /**
   * Validate a template for malformed variables
   *
   * REQ-028: When encountering invalid template variables, the plugin
   * shall show a warning to help users fix their templates.
   *
   * @param templateContent - The template to validate
   * @returns Array of invalid variable names found
   */
  public validateTemplate(templateContent: string): string[] {
    const invalidVars: string[] = [];
    const matches = templateContent.matchAll(VARIABLE_REGEX);

    for (const match of matches) {
      const varName = match[1];
      // Check for both original name and alias
      if (!(varName in VARIABLE_HANDLERS) && varName !== 'snowflake_id') {
        invalidVars.push(varName);
      }
    }

    return [...new Set(invalidVars)]; // Remove duplicates
  }

  /**
   * Get list of available variables
   *
   * @returns Array of variable names
   */
  public getAvailableVariables(): string[] {
    return Object.keys(VARIABLE_HANDLERS);
  }
}

/**
 * Variable Registry Pattern for future extensibility
 *
 * This pattern allows plugins or future versions to register custom
 * variables without modifying the core processor.
 */
export interface VariableHandlerDef {
  name: string; // Variable name without braces (e.g., "weather")
  process: (context: unknown) => string; // Function to compute value
}

export interface VariableRegistry {
  register(handler: VariableHandlerDef): void;
  process(varName: string, context: unknown): string | undefined;
}

/**
 * ExtensibleVariableRegistry: Future-proof variable registration
 *
 * Currently not used but designed to support future features like:
 * - {{weather}} - Current weather
 * - {{moon_phase}} - Current moon phase
 * - {{git_branch}} - Active git branch
 * - Custom user-defined variables
 */
export class ExtensibleVariableRegistry implements VariableRegistry {
  private readonly handlers: Map<string, VariableHandlerDef> = new Map();

  constructor() {
    // Register built-in handlers
    this.registerBuiltins();
  }

  public register(handler: VariableHandlerDef): void {
    this.handlers.set(handler.name, handler);
  }

  public process(varName: string, context: unknown): string | undefined {
    const handler = this.handlers.get(varName);
    if (handler === undefined) {
      return undefined;
    }
    // Handler is guaranteed to exist and return string based on interface
    return handler.process(context);
  }

  private registerBuiltins(): void {
    // Register standard variables
    this.register({
      name: 'title',
      process: (ctx): string => {
        const context = ctx as TemplateVariableContext;
        return context.title;
      }
    });

    this.register({
      name: 'date',
      process: (ctx): string => {
        const context = ctx as TemplateVariableContext;
        return context.date;
      }
    });

    this.register({
      name: 'time',
      process: (ctx): string => {
        const context = ctx as TemplateVariableContext;
        return context.time;
      }
    });

    this.register({
      name: 'snowflake_id',
      process: (ctx): string => {
        const context = ctx as TemplateVariableContext;
        return context.snowflakeId ?? '';
      }
    });
  }
}

/**
 * Factory function for creating a processor with custom formats
 *
 * @param dateFormat - Custom date format
 * @param timeFormat - Custom time format
 * @returns Configured processor instance
 */
export function createTemplateProcessor(
  dateFormat?: string,
  timeFormat?: string
): TemplateVariableProcessor {
  return new TemplateVariableProcessor(dateFormat, timeFormat);
}

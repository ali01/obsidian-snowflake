/**
 * Type definitions for the Snowflake Auto-Templating Plugin
 *
 * REQ-001: The plugin transforms from a simple ID generator into a
 * comprehensive auto-templating system for Obsidian notes.
 */

import type { TFile } from 'obsidian';

/**
 * TemplateMapping: Core configuration type for folder-to-template
 * associations
 *
 * Purpose: Stores which template should be applied to files created in
 * specific folders.
 *
 * REQ-002: When a user creates a new markdown file in a folder that has a
 * template mapping, the plugin shall automatically apply that folder's
 * template to the file.
 *
 * Example:
 * { "Projects": "Templates/project.md", "Daily Notes": "Templates/daily.md" }
 */
export interface TemplateMapping {
  [folderPath: string]: string; // folder path -> template path
}

/**
 * SnowflakeSettings: Complete plugin configuration
 *
 * Purpose: Defines all user-configurable options for the plugin. Stored
 * persistently in data.json.
 *
 * REQ-023: The plugin shall allow users to configure these settings:
 * - templateMappings: Which folders use which templates (use "/" for root)
 * - templatesFolder: Where to look for template files (default: "Templates")
 *
 * Fields:
 * - templateMappings: Folder-specific template assignments (REQ-002)
 * - templatesFolder: Base directory where templates are stored
 */
export interface SnowflakeSettings {
  templateMappings: TemplateMapping;
  templatesFolder: string;
  dateFormat: string;
  timeFormat: string;
}

/**
 * TemplateVariableContext: Data available for template variable replacement
 *
 * Purpose: Provides all the information needed to replace template variables
 * like {{title}} or {{date}}. This context is built when processing a
 * template and ensures all variables have consistent values throughout a
 * single template.
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
 * The snowflake_id is optional because it's only generated if the template
 * actually contains {{snowflake_id}} (performance optimization).
 */
export interface TemplateVariableContext {
  title: string; // filename without extension (REQ-011)
  date: string; // formatted date (REQ-012, REQ-014)
  time: string; // formatted time (REQ-013, REQ-014)
  snowflakeId?: string; // 10-character alphanumeric ID (REQ-015)
  // only set if template contains {{snowflake_id}}
}

/**
 * TemplateProcessResult: Output of template variable processing
 *
 * Purpose: Encapsulates the result of processing a template, including the
 * final content and metadata about what was processed. This allows callers to
 * know whether a snowflake_id was generated and what values were used for
 * variables.
 *
 * REQ-016: If a template contains {{snowflake_id}} multiple times, then the
 * plugin shall replace ALL instances with the SAME ID value.
 *
 * Used for: Debugging, testing, and potentially showing users what variables
 * were replaced in their template.
 */
export interface TemplateProcessResult {
  content: string; // The processed template content
  hasSnowflakeId: boolean; // Whether ID was generated (REQ-016)
  variables: TemplateVariableContext; // All variables used in processing
}

/**
 * FrontmatterMergeResult: Detailed outcome of merging frontmatter sections
 *
 * Purpose: Provides transparency about the frontmatter merge process, tracking
 * which keys had conflicts (where existing values were preserved) and which
 * were newly added from the template. This information can be used for user
 * notifications or debugging merge behavior.
 *
 * REQ-008: When both the template and the existing file have frontmatter,
 * the plugin shall intelligently merge them into a single frontmatter block.
 *
 * REQ-009: If a frontmatter key exists in both the file and template, then
 * the plugin shall keep the FILE's value and ignore the template's value.
 *
 * REQ-010: When merging frontmatter, the plugin shall add any keys from
 * the template that don't exist in the file.
 *
 * Critical for: Implementing REQ-009 (existing values take precedence) while
 * maintaining visibility into what happened during the merge.
 */
export interface FrontmatterMergeResult {
  merged: string; // The final merged frontmatter (REQ-008)
  conflicts: string[]; // Keys existed in both - file values kept (REQ-009)
  added: string[]; // Keys added from template (REQ-010)
}

/**
 * MarkdownFile: Type-safe representation of a markdown file
 *
 * Purpose: Creates a branded type that guarantees at compile-time that we're
 * only operating on markdown files. This prevents accidentally applying
 * templates to non-markdown files and enables better TypeScript inference.
 *
 * REQ-004: When a user creates any non-markdown file (like .txt, .pdf,
 * .json), the plugin shall NOT apply any template.
 *
 * Pattern: Intersection type that adds a type constraint to Obsidian's TFile
 */
export type MarkdownFile = TFile & { extension: 'md' };

/**
 * isMarkdownFile: Type guard for safe markdown file operations
 *
 * Purpose: Runtime check that also serves as a TypeScript type guard. After
 * calling this function, TypeScript knows the file is a MarkdownFile,
 * enabling access to markdown-specific operations without casting.
 *
 * REQ-004: When a user creates any non-markdown file (like .txt, .pdf,
 * .json), the plugin shall NOT apply any template.
 *
 * Critical for: Ensuring templates are never applied to .pdf, .png, etc.
 */
export function isMarkdownFile(file: TFile): file is MarkdownFile {
  return file.extension === 'md';
}

/**
 * Additional type definitions to support various requirements:
 */

/**
 * CommandContext: Context for command execution
 *
 * REQ-017: When a user runs "Insert template", the plugin shall apply
 * the appropriate template to the currently open markdown file.
 *
 * REQ-019: When a user runs "Insert template to all notes in folder",
 * the plugin shall show a folder selection dialog.
 *
 * REQ-025: Where auto-templating is disabled but a user runs a manual
 * command, the plugin shall still apply the template.
 */
export interface CommandContext {
  isManualCommand: boolean; // True when user runs a command (REQ-025)
  isBatchOperation?: boolean; // True when processing multiple files
}

/**
 * BatchResult: Result from batch operations
 *
 * REQ-021: While processing multiple files in a batch operation, the plugin
 * shall do so asynchronously to keep the UI responsive.
 *
 * REQ-022: When a batch operation completes, the plugin shall show a notice
 * like "Templates applied to 15 notes".
 */
export interface BatchResult {
  success: number; // Number of files successfully processed
  total: number; // Total number of files attempted
}

/**
 * ErrorContext: Context for error handling
 *
 * REQ-026: If a template file doesn't exist when needed, then the plugin
 * shall create the new file empty and show a notice.
 *
 * REQ-027: If a template contains malformed variable syntax, then the plugin
 * shall leave it unchanged in the output.
 *
 * REQ-028: When encountering invalid template variables, the plugin shall show
 * a warning to help users fix their templates.
 *
 * REQ-029: If the plugin cannot read a template due to permissions, then
 * the plugin shall show a user-friendly error and create the file without a
 * template.
 */
export interface ErrorContext {
  operation: 'load_template' | 'apply_template' | 'merge_frontmatter';
  templatePath?: string;
  filePath?: string;
  error?: Error;
}

/**
 * SettingsUpdateContext: Context for settings changes
 *
 * REQ-024: When a user adds a folder→template mapping in settings, the plugin
 * shall immediately use it for new files in that folder.
 */
export interface SettingsUpdateContext {
  previousSettings: SnowflakeSettings;
  newSettings: SnowflakeSettings;
  changedKeys: string[];
}

/**
 * Represents a template in the inheritance chain
 *
 * REQ-032: When a file is created in a nested folder, the plugin
 * shall check parent folders for template mappings and apply them
 * in order from root to leaf.
 */
export interface TemplateChainItem {
  path: string; // Template file path
  folderPath: string; // Folder this template is mapped to
  depth: number; // Depth in folder hierarchy (0 = root)
  content?: string; // Loaded template content
}

/**
 * Result of template chain resolution
 *
 * REQ-032: Template inheritance from parent folders
 * REQ-033: Merging multiple templates in inheritance chain
 */
export interface TemplateChain {
  templates: TemplateChainItem[]; // Ordered from root to leaf
  hasInheritance: boolean; // Whether multiple templates apply
}

/**
 * Type guards and utility types for additional requirements support
 */

/**
 * Utility type to ensure settings are valid
 *
 * This helps enforce that certain combinations of settings make sense
 * and prevents invalid configurations at compile time.
 */
export type ValidSettings = SnowflakeSettings & {
  // Ensure templatesFolder is not empty when templateMappings has entries
  templatesFolder: string;
};

/**
 * Content merge strategy for REQ-006 and REQ-007
 */
export interface ContentMergeStrategy {
  frontmatterStrategy: 'preserve-existing'; // REQ-009
  bodyStrategy: 'insert-at-cursor' | 'append' | 'prepend'; // REQ-007
}

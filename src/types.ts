/**
 * Type definitions for the Snowflake Auto-Templating Plugin
 */

import type { TFile } from 'obsidian';

/**
 * SnowflakeSettings: Complete plugin configuration
 *
 * Stored persistently in data.json. Templates are discovered by convention
 * (a SCHEMA.md in any folder declares it as managed), so settings only
 * carry the truly user-tunable knobs: variable formats and global excludes.
 */
export interface SnowflakeSettings {
  dateFormat: string;
  timeFormat: string;
  globalExcludePatterns: string[];
}

/**
 * TemplateVariableContext: Data available for template variable replacement
 *
 * Variables: {{title}}, {{date}}, {{time}}, {{snowflake_id}}.
 * snowflakeId is optional because it's generated lazily only when the
 * template actually contains {{snowflake_id}}.
 */
export interface TemplateVariableContext {
  title: string;
  date: string;
  time: string;
  snowflakeId?: string;
}

export interface TemplateProcessResult {
  content: string;
  hasSnowflakeId: boolean;
  variables: TemplateVariableContext;
}

export interface FrontmatterMergeResult {
  merged: string;
  conflicts: string[];
  added: string[];
}

/**
 * MarkdownFile: Type-safe representation of a markdown file
 */
export type MarkdownFile = TFile & { extension: 'md' };

export function isMarkdownFile(file: TFile): file is MarkdownFile {
  return file.extension === 'md';
}

export interface CommandContext {
  isManualCommand: boolean;
  isBatchOperation?: boolean;
}

export interface BatchResult {
  success: number;
  total: number;
}

export interface ErrorContext {
  operation: 'load_template' | 'apply_template' | 'merge_frontmatter';
  templatePath?: string;
  filePath?: string;
  error?: Error;
}

export interface SettingsUpdateContext {
  previousSettings: SnowflakeSettings;
  newSettings: SnowflakeSettings;
  changedKeys: string[];
}

/**
 * One SCHEMA.md in a template inheritance chain.
 */
export interface TemplateChainItem {
  path: string;
  folderPath: string;
  depth: number;
  content?: string;
}

/**
 * Result of resolving the SCHEMA.md chain for a file.
 *
 * `templates` is ordered root → leaf; child overrides parent during merge.
 */
export interface TemplateChain {
  templates: TemplateChainItem[];
  hasInheritance: boolean;
}

export interface ContentMergeStrategy {
  frontmatterStrategy: 'preserve-existing';
  bodyStrategy: 'insert-at-cursor' | 'append' | 'prepend';
}

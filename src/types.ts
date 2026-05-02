/**
 * Type definitions for the Snowflake Auto-Templating Plugin
 */

import type { TFile } from 'obsidian';

/**
 * SnowflakeSettings: Complete plugin configuration
 *
 * Stored persistently in data.json. Templates are discovered by convention
 * (a `.schema.yaml` in any folder declares it as managed) and file exclusions
 * are declared in the same `.schema.yaml`, so settings only carry the truly
 * user-tunable knobs: the date and time variable formats.
 */
export interface SnowflakeSettings {
  dateFormat: string;
  timeFormat: string;
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
 * InlineTemplate: a template defined directly inside a `.schema.yaml`.
 *
 * Either `frontmatter` or `body` (or both) may be omitted. When materialized
 * it produces a standard `---\nfrontmatter\n---\nbody` content string for the
 * downstream merge engine.
 */
export interface InlineTemplate {
  frontmatter?: Record<string, unknown>;
  body?: string;
}

/**
 * SchemaTemplateBlock: shared shape of `default:` and each entry in `rules:`.
 *
 * `template` is either an external `.md` file path (string) or an inline
 * template object. `frontmatter-delete` lists property names to exclude from
 * the inherited frontmatter when this template is merged into the chain.
 */
export interface SchemaTemplateBlock {
  template: InlineTemplate | string;
  'frontmatter-delete'?: string[];
}

/**
 * SchemaRule: one ordered rule inside a `.schema.yaml`'s `rules:` list.
 */
export interface SchemaRule extends SchemaTemplateBlock {
  match: string;
}

/**
 * SchemaConfig: parsed shape of a `.schema.yaml` file.
 *
 * All fields are optional. A schema with no `default` and no matching `rules`
 * contributes nothing (the chain walk continues through ancestors). A
 * non-empty `exclude` short-circuits the chain entirely for matching files.
 */
export interface SchemaConfig {
  exclude?: string[];
  default?: SchemaTemplateBlock;
  rules?: SchemaRule[];
}

/**
 * ResolvedTemplate: the output of running the resolver against a parsed
 * SchemaConfig and a file's path-relative-to-schema-folder.
 */
export interface ResolvedTemplate {
  template: InlineTemplate | string;
  frontmatterDelete?: string[];
}

/**
 * One level in a template inheritance chain.
 *
 * Phase 1 (`getTemplateChain`) populates everything except `content`.
 * Phase 2 (`loadTemplateChain`) materializes `content` from the resolved
 * template (loading the external `.md` file or serializing the inline form),
 * with the rule's `frontmatter-delete` injected as a `delete:` list so the
 * existing merge engine handles it unchanged.
 */
export interface TemplateChainItem {
  schemaPath: string;
  folderPath: string;
  templateAnchor: string;
  depth: number;
  resolvedTemplate: ResolvedTemplate;
  content?: string;
}

/**
 * Result of resolving the schema chain for a file.
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

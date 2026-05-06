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
 * InlineSchema: a schema defined directly inside a rule.
 *
 * Frontmatter always lives in `schema.yaml` — external `.md` templates are
 * body-only. `body` (literal) and `body-file` (path to a body-only `.md`)
 * are mutually exclusive. Any field may be omitted; an empty schema
 * contributes nothing to the merge chain.
 */
export interface InlineSchema {
  frontmatter?: Record<string, unknown>;
  body?: string;
  'body-file'?: string;
}

/**
 * Closed set of keys that mark a frontmatter field's value as a structured
 * field spec rather than a literal default. Mapping values containing any of
 * these keys (or any `$`-prefixed key) are interpreted as specs at
 * materialization time: the plugin extracts `default:` (or null if absent)
 * and writes that into the new note's frontmatter. Tools that consume the
 * spec directly (lint, ingest) recognize the full vocabulary.
 *
 * Note: the plugin only acts on `default:` and the strip-meta-keys rule.
 * Other keys (`type`, `enum`, `optional`, lifecycle, etc.) are documentation
 * for tools and humans.
 */
export const SPEC_KEYS = new Set([
  'type',
  'default',
  'optional',
  'enum',
  'values',
  'format',
  'length',
  'target',
  'item',
  'pattern',
  'immutable'
]);

/**
 * FieldSpec: shape of a structured frontmatter field spec.
 *
 * Permissive on purpose — the plugin only inspects `default:` and ignores
 * the rest. Tools that consume specs (lint, ingest) walk the same shape and
 * apply their own validation.
 */
export interface FieldSpec {
  type?: string;
  default?: unknown;
  optional?: boolean;
  values?: unknown[];
  enum?: unknown[];
  format?: string;
  length?: number;
  target?: string;
  item?: FieldSpec | Record<string, unknown>;
  pattern?: string;
  immutable?: boolean;
  [metaKey: `$${string}`]: unknown;
}

/**
 * SchemaRule: one ordered entry inside a `.schema.yaml`'s `rules:` list.
 *
 * `schema` is always an inline object (no string form). `frontmatter-delete`
 * lists property names to exclude from the inherited frontmatter when this
 * rule's schema is merged into the chain.
 *
 * `match` is optional. It can be a single glob (string) or a list of globs
 * (string[]) — a list matches when any of its patterns matches. A rule with
 * no `match:` is the catch-all and matches every file. Any rule appearing
 * after a catch-all is unreachable.
 */
export interface SchemaRule {
  match?: string | string[];
  schema: InlineSchema;
  'frontmatter-delete'?: string[];
}

/**
 * SchemaConfig: parsed shape of a `.schema.yaml` file.
 *
 * All fields are optional. A schema with no matching `rules` contributes
 * nothing (the chain walk continues through ancestors). A non-empty
 * `exclude` short-circuits the chain entirely for matching files.
 */
export interface SchemaConfig {
  exclude?: string[];
  rules?: SchemaRule[];
}

/**
 * ResolvedTemplate: the output of running the resolver against a parsed
 * SchemaConfig and a file's path-relative-to-schema-folder.
 */
export interface ResolvedTemplate {
  schema: InlineSchema;
  frontmatterDelete?: string[];
}

/**
 * One level in a template inheritance chain.
 *
 * Phase 1 (`getTemplateChain`) populates everything except `content`.
 * Phase 2 (`loadTemplateChain`) materializes `content` by loading any
 * `body-file` referenced by the inline schema and serializing the result,
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

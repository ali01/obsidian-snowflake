/**
 * Configuration constants for the Snowflake plugin
 */

import type { SnowflakeSettings } from './types';

export const DEFAULT_SETTINGS: SnowflakeSettings = {
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HH:mm'
};

/**
 * Filenames the plugin recognizes for declaring a folder as Snowflake-managed.
 *
 * Three forms (precedence: folder > yaml > md):
 *   1. Folder:   <dir>/.schema/schema.yaml — full power, can bundle templates.
 *   2. Flat YAML: <dir>/.schema.yaml — full power.
 *   3. Markdown: <dir>/.schema.md — shorthand. The whole file (frontmatter +
 *      body) IS the catch-all template applied to every new note in the
 *      folder. No `rules:`, `exclude:`, or `frontmatter-delete:` available;
 *      use a `.yaml` form when those are needed.
 */
export const SCHEMA_FILE_NAME = '.schema.yaml';
export const SCHEMA_MD_FILE_NAME = '.schema.md';
export const SCHEMA_FOLDER_NAME = '.schema';
export const SCHEMA_FOLDER_FILE_NAME = 'schema.yaml';

export const ID_CONFIG = {
  length: 10,
  alphabet: '0123456789' + 'abcdefghijklmnopqrstuvwxyz' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
} as const;

export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

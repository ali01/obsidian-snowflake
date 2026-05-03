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
 * Two forms (precedence: folder > flat):
 *   1. Folder:   <dir>/.schema/schema.yaml — can bundle templates alongside.
 *   2. Flat YAML: <dir>/.schema.yaml — single-file form.
 */
export const SCHEMA_FILE_NAME = '.schema.yaml';
export const SCHEMA_FOLDER_NAME = '.schema';
export const SCHEMA_FOLDER_FILE_NAME = 'schema.yaml';

export const ID_CONFIG = {
  length: 10,
  alphabet: '0123456789' + 'abcdefghijklmnopqrstuvwxyz' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
} as const;

export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

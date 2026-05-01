/**
 * Configuration constants for the Snowflake plugin
 */

import type { SnowflakeSettings } from './types';

export const DEFAULT_SETTINGS: SnowflakeSettings = {
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HH:mm',
  globalExcludePatterns: []
};

/**
 * The conventional filename used to declare a folder as Snowflake-managed.
 */
export const SCHEMA_FILE_NAME = 'SCHEMA.md';

export const ID_CONFIG = {
  length: 10,
  alphabet: '0123456789' + 'abcdefghijklmnopqrstuvwxyz' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
} as const;

export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

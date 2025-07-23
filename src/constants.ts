/**
 * Configuration constants for the Snowflake plugin
 */

import type { SnowflakeSettings } from './types';

/**
 * Default settings for the plugin
 *
 * REQ-023: The plugin shall allow users to configure these settings:
 * - templateMappings: Which folders use which templates
 * - defaultTemplate: Fallback template for unmapped folders
 * - templatesFolder: Where to look for template files
 */
export const DEFAULT_SETTINGS: SnowflakeSettings = {
  // Folder-specific template assignments (REQ-002)
  templateMappings: {},

  // Fallback template for unmapped folders (REQ-003)
  // Empty string means no default template
  defaultTemplate: '',

  // Base directory where templates are stored
  templatesFolder: 'Templates'
};

/**
 * ID generation configuration
 */
export const ID_CONFIG = {
  // Length of generated IDs
  length: 10,

  // Alphabet of 62 alphanumeric characters
  // Includes: lowercase, uppercase, numbers
  // Excludes: Special characters (no dashes or underscores)
  alphabet: '0123456789' + 'abcdefghijklmnopqrstuvwxyz' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
} as const;

/**
 * Frontmatter regex pattern
 */
export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

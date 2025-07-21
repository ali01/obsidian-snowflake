/**
 * Configuration constants for the Snowflake plugin
 */

import { SnowflakeSettings } from './types';

/**
 * Default settings for the plugin
 */
export const DEFAULT_SETTINGS: SnowflakeSettings = {
    // Array of folder paths where auto-ID is enabled
    // Empty array means no automatic ID addition
    autoAddFolders: [],

    // Global toggle for auto-add feature
    // Even if folders are configured, this can disable the feature
    enableAutoAdd: true,
};

/**
 * ID generation configuration
 */
export const ID_CONFIG = {
    // Length of generated IDs
    LENGTH: 10,

    // Alphabet of 62 alphanumeric characters
    // Includes: lowercase, uppercase, numbers
    // Excludes: Special characters (no dashes or underscores)
    ALPHABET: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
} as const;

/**
 * Frontmatter regex pattern
 */
export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

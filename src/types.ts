/**
 * Type definitions for the Snowflake plugin
 */

/**
 * Plugin settings structure
 */
export interface SnowflakeSettings {
    /**
     * Array of folder paths where auto-ID is enabled
     * Empty array means no automatic ID addition
     */
    autoAddFolders: string[];

    /**
     * Global toggle for auto-add feature
     * Even if folders are configured, this can disable the feature
     */
    enableAutoAdd: boolean;
}

/**
 * Result from processing a file
 */
export interface ProcessResult {
    success: boolean;
    message: string;
    id?: string;
    alreadyHasID?: boolean;
    error?: boolean;
}

/**
 * Result from parsing frontmatter
 */
export interface FrontmatterParseResult {
    exists: boolean;
    content?: string;
    fullMatch?: string;
}

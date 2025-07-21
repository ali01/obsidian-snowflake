/**
 * Frontmatter utilities for parsing and manipulating YAML frontmatter
 */

import { FrontmatterParseResult } from './types';
import { FRONTMATTER_REGEX } from './constants';

/**
 * Parse frontmatter from markdown content
 *
 * @param content - The markdown content to parse
 * @returns Parsed frontmatter result
 */
export function parseFrontmatter(content: string): FrontmatterParseResult {
    const match = content.match(FRONTMATTER_REGEX);
    return match
        ? { exists: true, content: match[1], fullMatch: match[0] }
        : { exists: false };
}

/**
 * Check if content already has an ID in frontmatter
 *
 * @param content - The markdown content to check
 * @returns true if ID exists, false otherwise
 */
export function hasID(content: string): boolean {
    const fm = parseFrontmatter(content);
    return fm.exists && /^id:\s*.+$/m.test(fm.content!);
}

/**
 * Extract the ID value from content
 *
 * @param content - The markdown content to extract ID from
 * @returns The ID value or null if not found
 */
export function extractID(content: string): string | null {
    const fm = parseFrontmatter(content);
    if (!fm.exists) return null;

    const idMatch = fm.content!.match(/^id:\s*(.+)$/m);
    return idMatch ? idMatch[1].trim() : null;
}

/**
 * Add an ID to content's frontmatter
 *
 * @param content - The markdown content to add ID to
 * @param id - The ID to add
 * @returns The modified content with ID added
 */
export function addIDToContent(content: string, id: string): string {
    const fm = parseFrontmatter(content);

    if (fm.exists) {
        // Append ID to existing frontmatter
        const newFrontmatter = fm.content + `\nid: ${id}`;
        return content.replace(fm.fullMatch!, `---\n${newFrontmatter}\n---`);
    } else {
        // No frontmatter exists - create it at the start
        return `---\nid: ${id}\n---\n\n${content}`;
    }
}

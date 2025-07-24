/**
 * Pattern matching utilities for file exclusions
 *
 * Supports basic glob patterns similar to gitignore:
 * - * matches any sequence of characters (except /)
 * - ? matches any single character
 * - ** matches any number of directories
 */

/**
 * Check if a file path matches any of the exclusion patterns
 *
 * @param filePath - The file path to check (relative to the folder)
 * @param patterns - Array of exclusion patterns
 * @returns True if the file should be excluded
 */
export function matchesExclusionPattern(filePath: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  // Get just the filename for basename matching
  const fileName = filePath.split('/').pop() ?? filePath;

  return patterns.some((pattern) => {
    // Empty pattern matches nothing
    if (!pattern || pattern.trim() === '') {
      return false;
    }

    // Exact match
    if (pattern === filePath || pattern === fileName) {
      return true;
    }

    // Convert glob pattern to regex
    const regexPattern = globToRegex(pattern);

    // Test against full path and basename
    return regexPattern.test(filePath) || regexPattern.test(fileName);
  });
}

/**
 * Convert a glob pattern to a regular expression
 *
 * @param glob - The glob pattern
 * @returns RegExp for matching
 */
function globToRegex(glob: string): RegExp {
  // Escape special regex characters except our glob characters
  let pattern = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Handle glob patterns
  pattern = pattern
    .replace(/\*\*/g, '{{DOUBLESTAR}}') // Temporarily mark **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/\?/g, '.') // ? matches any single character
    .replace(/{{DOUBLESTAR}}/g, '.*'); // ** matches anything including /

  // Anchor the pattern
  pattern = '^' + pattern + '$';

  return new RegExp(pattern);
}

/**
 * Normalize a pattern for consistent matching
 *
 * @param pattern - The pattern to normalize
 * @returns Normalized pattern
 */
function normalizePattern(pattern: string): string {
  // Remove leading/trailing whitespace
  pattern = pattern.trim();

  // Remove leading slash if present (patterns are relative to folder)
  if (pattern.startsWith('/')) {
    pattern = pattern.slice(1);
  }

  return pattern;
}

/**
 * Process exclusion patterns from raw input
 * Normalizes and validates patterns in one operation
 *
 * @param input - Raw input string with patterns (one per line)
 * @returns Object with normalized patterns and validation results
 */
export function processExclusionPatterns(input: string): {
  patterns: string[];
  isValid: boolean;
  errors: string[];
} {
  if (!input || input.trim() === '') {
    return {
      patterns: [],
      isValid: true,
      errors: []
    };
  }

  // Split by newlines and normalize each pattern
  const rawPatterns = input.split('\n');
  const normalizedPatterns: string[] = [];
  const errors: string[] = [];

  rawPatterns.forEach((pattern, index) => {
    const normalized = normalizePattern(pattern);

    // Skip empty patterns after normalization
    if (normalized === '') {
      return;
    }

    // Check for invalid characters
    if (pattern.includes('\0')) {
      errors.push(`Line ${String(index + 1)}: Pattern contains invalid null character`);
      return;
    }

    normalizedPatterns.push(normalized);
  });

  return {
    patterns: normalizedPatterns,
    isValid: errors.length === 0,
    errors
  };
}

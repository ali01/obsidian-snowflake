/**
 * Pattern matching utilities for file exclusions
 *
 * Supports basic glob patterns similar to gitignore:
 * - * matches any sequence of characters (except /)
 * - ? matches any single character
 * - ** matches any number of directories
 * - directory/ matches all files under that directory
 */

/**
 * Check if a file path matches any of the exclusion patterns.
 *
 * Tests each pattern against both the full path and the basename so a bare
 * filename pattern (e.g. `MEETINGS.md`) matches at any depth.
 *
 * @param filePath - The file path to check
 * @param patterns - Array of exclusion patterns
 * @returns True if the file should be excluded
 */
export function matchesExclusionPattern(filePath: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  const fileName = filePath.split('/').pop() ?? filePath;

  return patterns.some((pattern) => {
    if (!pattern || pattern.trim() === '') {
      return false;
    }

    // Directory pattern: matches all files under that directory
    if (pattern.endsWith('/')) {
      const dirPath = pattern.slice(0, -1);
      return filePath.startsWith(dirPath + '/') || filePath === dirPath;
    }

    // Exact match (full path or basename)
    if (pattern === filePath || pattern === fileName) {
      return true;
    }

    // Glob match against full path or basename
    const regexPattern = globToRegex(pattern);
    return regexPattern.test(filePath) || regexPattern.test(fileName);
  });
}

/**
 * Check if a single path matches a single glob pattern.
 *
 * Anchored: returns true only if the entire path matches. Used by the schema
 * resolver for `match:` patterns.
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
  if (!pattern || pattern.trim() === '') {
    return false;
  }
  return globToRegex(pattern).test(filePath);
}

/**
 * Convert a glob pattern to a regular expression.
 *
 * - `*` matches anything except `/`
 * - `**` matches anything including `/`
 * - `?` matches a single character
 *
 * @param glob - The glob pattern
 * @returns RegExp anchored to the entire string
 */
export function globToRegex(glob: string): RegExp {
  // Escape regex specials except our glob characters
  let pattern = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  pattern = pattern
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/{{DOUBLESTAR}}/g, '.*');

  pattern = '^' + pattern + '$';
  return new RegExp(pattern);
}

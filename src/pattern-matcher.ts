/**
 * Pattern matching utilities for file exclusions
 *
 * Exclusion patterns use basic glob semantics similar to gitignore:
 * - * matches any sequence of characters (except /)
 * - ? matches any single character
 * - ** matches any number of directories
 * - directory/ matches all files under that directory
 *
 * Rule `match:` patterns use the same glob semantics plus named path captures:
 * - {{name}} captures one non-empty path segment
 * - repeated {{name}} placeholders must equal the first capture
 */

const PLACEHOLDER_PATTERN = /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/;

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
 * Check if a single path matches a single rule `match:` pattern.
 *
 * Anchored: returns true only if the entire path matches. Supports glob
 * syntax plus named path captures such as `{{company}}/{{company}}.md`.
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
  if (!pattern || pattern.trim() === '') {
    return false;
  }
  if (validateMatchPattern(pattern) !== null) {
    return false;
  }
  return matchPatternToRegex(pattern).test(filePath);
}

/**
 * Validate placeholder syntax for a rule `match:` pattern.
 */
export function validateMatchPattern(pattern: string): string | null {
  let searchIndex = 0;

  while (searchIndex < pattern.length) {
    const nextOpen = pattern.indexOf('{{', searchIndex);
    const nextClose = pattern.indexOf('}}', searchIndex);

    if (nextOpen === -1) {
      return nextClose === -1 ? null : 'malformed placeholder';
    }
    if (nextClose !== -1 && nextClose < nextOpen) {
      return 'malformed placeholder';
    }

    const end = pattern.indexOf('}}', nextOpen + 2);
    if (end === -1) {
      return 'malformed placeholder';
    }

    const placeholder = pattern.slice(nextOpen, end + 2);
    if (!PLACEHOLDER_PATTERN.test(placeholder)) {
      return `malformed placeholder ${placeholder}`;
    }

    searchIndex = end + 2;
  }

  return null;
}

/**
 * Convert a rule `match:` pattern to a regular expression.
 */
export function matchPatternToRegex(pattern: string): RegExp {
  const validationError = validateMatchPattern(pattern);
  if (validationError !== null) {
    throw new Error(validationError);
  }

  const capturedNames = new Set<string>();
  let regex = '';

  for (let i = 0; i < pattern.length; ) {
    if (pattern.startsWith('{{', i)) {
      const end = pattern.indexOf('}}', i + 2);
      const placeholder = pattern.slice(i, end + 2);
      const name = PLACEHOLDER_PATTERN.exec(placeholder)?.[1];
      if (name === undefined) {
        throw new Error(`malformed placeholder ${placeholder}`);
      }

      if (capturedNames.has(name)) {
        regex += `\\k<${name}>`;
      } else {
        capturedNames.add(name);
        regex += `(?<${name}>[^/]+)`;
      }
      i = end + 2;
      continue;
    }

    if (pattern.startsWith('**', i)) {
      regex += '.*';
      i += 2;
      continue;
    }

    const char = pattern[i];
    if (char === '*') {
      regex += '[^/]*';
    } else if (char === '?') {
      regex += '.';
    } else {
      regex += escapeRegexChar(char);
    }
    i++;
  }

  return new RegExp(`^${regex}$`);
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

function escapeRegexChar(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

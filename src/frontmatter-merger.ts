/**
 * Frontmatter Merge Engine
 *
 * REQ-008: When both the template and the existing file have frontmatter,
 * the plugin shall intelligently merge them into a single frontmatter block.
 *
 * REQ-009: If a frontmatter key exists in both the file and template, then
 * the plugin shall keep the FILE's value and ignore the template's value.
 *
 * REQ-010: When merging frontmatter, the plugin shall add any keys from
 * the template that don't exist in the file.
 */

import type { FrontmatterMergeResult } from './types';

/**
 * Regular expression to match YAML frontmatter
 */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*$/m;

/**
 * Parsed frontmatter data structure
 */
interface ParsedFrontmatter {
  exists: boolean;
  content: string;
  data: Record<string, unknown>;
  endPosition?: number;
}

/**
 * FrontmatterMerger: Handles intelligent merging of frontmatter sections
 *
 * Purpose: Merges template frontmatter with existing file frontmatter,
 * preserving existing values while adding new ones from the template.
 */
export class FrontmatterMerger {
  /**
   * Merge template frontmatter with existing file frontmatter
   *
   * REQ-008: Intelligently merge frontmatter blocks
   * REQ-009: Preserve existing file values
   * REQ-010: Add new keys from template
   *
   * @param fileContent - The existing file content (may or may not have frontmatter)
   * @param templateFrontmatter - The template's frontmatter content
   * @returns Merge result with conflicts and additions tracked
   */
  merge(fileContent: string, templateFrontmatter: string): FrontmatterMergeResult {
    // Parse both frontmatter sections
    const fileFm = this.parseFrontmatter(fileContent);
    const templateFm = this.parseYaml(templateFrontmatter);

    // Track conflicts and additions
    const conflicts: string[] = [];
    const added: string[] = [];

    // Start with existing file data (REQ-009: existing values take precedence)
    const mergedData = { ...fileFm.data };

    // Process template keys
    for (const [key, value] of Object.entries(templateFm)) {
      if (key in fileFm.data) {
        // REQ-009: Key exists in both - keep file's value, track conflict
        conflicts.push(key);
      } else {
        // REQ-010: Key only in template - add it
        mergedData[key] = value;
        added.push(key);
      }
    }

    // Convert merged data back to YAML
    const mergedYaml = this.dataToYaml(mergedData);

    return {
      merged: mergedYaml,
      conflicts,
      added
    };
  }

  /**
   * Apply merged frontmatter to file content
   *
   * @param fileContent - Original file content
   * @param mergedFrontmatter - The merged frontmatter YAML
   * @returns File content with updated frontmatter
   */
  applyToFile(fileContent: string, mergedFrontmatter: string): string {
    const parsed = this.parseFrontmatter(fileContent);

    // Format the frontmatter block
    const formattedFrontmatter = `---\n${mergedFrontmatter}---`;

    if (parsed.exists && parsed.endPosition !== undefined) {
      // Replace existing frontmatter
      return formattedFrontmatter + fileContent.slice(parsed.endPosition);
    } else {
      // Add frontmatter at the beginning
      return formattedFrontmatter + '\n\n' + fileContent;
    }
  }

  /**
   * Parse frontmatter from file content
   *
   * @param content - File content
   * @returns Parsed frontmatter information
   */
  private parseFrontmatter(content: string): ParsedFrontmatter {
    const match = content.match(FRONTMATTER_REGEX);

    if (!match) {
      return {
        exists: false,
        content: '',
        data: {}
      };
    }

    const frontmatterContent = match[1];
    const matchIndex = match.index;
    if (matchIndex === undefined) {
      return {
        exists: false,
        content: '',
        data: {}
      };
    }
    const endPosition = matchIndex + match[0].length;

    return {
      exists: true,
      content: frontmatterContent,
      data: this.parseYaml(frontmatterContent),
      endPosition
    };
  }

  /**
   * Parse YAML content into a data object
   *
   * This is a simple YAML parser that handles basic key-value pairs.
   * For more complex YAML structures, consider using a full YAML library.
   *
   * @param yaml - YAML content
   * @returns Parsed data object
   */
  private parseYaml(yaml: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const lines = yaml.split('\n');
    const state = this.createParserState();

    for (const line of lines) {
      this.processYamlLine(line, data, state);
    }

    // Save final multi-line value if exists
    this.savePendingValue(data, state);
    return data;
  }

  private createParserState(): { currentKey: string | null; currentValue: string[] } {
    return { currentKey: null, currentValue: [] };
  }

  private processYamlLine(
    line: string,
    data: Record<string, unknown>,
    state: { currentKey: string | null; currentValue: string[] }
  ): void {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      return;
    }

    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch) {
      this.handleKeyValueLine(keyMatch, data, state);
    } else if (state.currentKey !== null) {
      // Check for array items with dash notation
      const arrayMatch = line.match(/^\s+- (.+)$/);
      if (arrayMatch) {
        // This is an array item
        if (!Array.isArray(data[state.currentKey])) {
          data[state.currentKey] = [];
        }
        // Parse the array item value
        const itemValue = this.parseValue(arrayMatch[1].trim());
        (data[state.currentKey] as unknown[]).push(itemValue);
      } else if (line.startsWith('  ')) {
        // Continuation of multi-line value
        state.currentValue.push(line.slice(2));
      }
    }
  }

  private handleKeyValueLine(
    keyMatch: RegExpMatchArray,
    data: Record<string, unknown>,
    state: { currentKey: string | null; currentValue: string[] }
  ): void {
    // Save previous multi-line value if exists
    this.savePendingValue(data, state);

    state.currentKey = keyMatch[1];
    const value = keyMatch[2].trim();

    if (value === '|') {
      // Multi-line literal block
      state.currentValue = [];
    } else if (value !== '') {
      // Single-line value
      data[state.currentKey] = this.parseValue(value);
      state.currentKey = null;
      state.currentValue = [];
    } else {
      // Empty value or start of array/multi-line
      // Keep the key active to handle arrays or just store empty string
      data[state.currentKey] = '';
      state.currentValue = [];
    }
  }

  private savePendingValue(
    data: Record<string, unknown>,
    state: { currentKey: string | null; currentValue: string[] }
  ): void {
    if (state.currentKey !== null && state.currentValue.length > 0) {
      data[state.currentKey] = state.currentValue.join('\n').trim();
    }
  }

  /**
   * Parse a YAML value, handling basic types
   *
   * @param value - String value to parse
   * @returns Parsed value (string, number, boolean, or array)
   */
  private parseValue(value: string): unknown {
    const unquoted = this.tryUnquote(value);
    if (unquoted !== value) return unquoted;

    const booleanValue = this.tryParseBoolean(value);
    if (booleanValue !== undefined) return booleanValue;

    if (value === 'null' || value === '~') return null;

    const numberValue = this.tryParseNumber(value);
    if (numberValue !== undefined) return numberValue;

    const arrayValue = this.tryParseArray(value);
    if (arrayValue !== undefined) return arrayValue;

    return value;
  }

  private tryUnquote(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  private tryParseBoolean(value: string): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private tryParseNumber(value: string): number | undefined {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    return undefined;
  }

  private tryParseArray(value: string): unknown[] | undefined {
    if (value.startsWith('[') && value.endsWith(']')) {
      return value
        .slice(1, -1)
        .split(',')
        .map((item) => this.parseValue(item.trim()));
    }
    return undefined;
  }

  /**
   * Convert data object to YAML format
   *
   * @param data - Data object to convert
   * @returns YAML string
   */
  private dataToYaml(data: Record<string, unknown>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const yamlLine = this.formatYamlLine(key, value);
      if (Array.isArray(yamlLine)) {
        lines.push(...yamlLine);
      } else {
        lines.push(yamlLine);
      }
    }

    return lines.join('\n') + '\n';
  }

  private formatYamlLine(key: string, value: unknown): string | string[] {
    if (value === null || value === undefined) {
      return `${key}: null`;
    }

    if (value === '') {
      return `${key}: `;
    }

    if (typeof value === 'boolean' || typeof value === 'number') {
      return `${key}: ${String(value)}`;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return `${key}: []`;
      }
      // Use dash notation for arrays
      const lines = [`${key}:`];
      for (const item of value) {
        lines.push(`  - ${this.formatValue(item)}`);
      }
      return lines;
    }

    if (typeof value === 'string') {
      return this.formatStringValue(key, value);
    }

    if (typeof value === 'object') {
      return `${key}: ${JSON.stringify(value)}`;
    }

    // Fallback for other types
    return `${key}: ${JSON.stringify(value)}`;
  }

  private formatStringValue(key: string, value: string): string | string[] {
    if (!value.includes('\n')) {
      return `${key}: ${this.formatValue(value)}`;
    }

    // Multi-line string
    if (value.trim() === '|') {
      return `${key}: |`;
    }

    const lines = [`${key}: |`];
    const valueLines = value.split('\n');
    for (const line of valueLines) {
      lines.push(`  ${line}`);
    }
    return lines;
  }

  /**
   * Format a value for YAML output
   *
   * @param value - Value to format
   * @returns Formatted string
   */
  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      // Don't double-quote values that are already quoted
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        return value;
      }
      // Quote if contains special characters
      if (/[:[\]{},>|]/.test(value)) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    return String(value);
  }

  /**
   * Validate frontmatter syntax
   *
   * @param yaml - YAML content to validate
   * @returns True if valid, false otherwise
   */
  validateYaml(yaml: string): boolean {
    try {
      const parsed = this.parseYaml(yaml);
      // Basic validation - should have parsed at least something
      return typeof parsed === 'object';
    } catch {
      return false;
    }
  }
}

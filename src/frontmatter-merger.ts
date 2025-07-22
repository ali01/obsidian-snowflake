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

import { FrontmatterMergeResult } from './types';

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
  data: Record<string, any>;
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
    const endPosition = match.index! + match[0].length;

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
  private parseYaml(yaml: string): Record<string, any> {
    const data: Record<string, any> = {};
    const lines = yaml.split('\n');

    let currentKey: string | null = null;
    let currentValue: string[] = [];

    for (const line of lines) {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }

      // Check if this is a key-value pair
      const keyMatch = line.match(/^(\w+):\s*(.*)$/);

      if (keyMatch) {
        // Save previous multi-line value if exists
        if (currentKey && currentValue.length > 0) {
          data[currentKey] = currentValue.join('\n').trim();
        }

        currentKey = keyMatch[1];
        const value = keyMatch[2].trim();

        if (value === '|') {
          // Multi-line literal block
          currentValue = [];
        } else if (value) {
          // Single-line value
          data[currentKey] = this.parseValue(value);
          currentKey = null;
          currentValue = [];
        } else {
          // Start of multi-line value (other format)
          currentValue = [];
        }
      } else if (currentKey && line.startsWith('  ')) {
        // Continuation of multi-line value
        currentValue.push(line.slice(2));
      }
    }

    // Save final multi-line value if exists
    if (currentKey && currentValue.length > 0) {
      data[currentKey] = currentValue.join('\n').trim();
    }

    return data;
  }

  /**
   * Parse a YAML value, handling basic types
   *
   * @param value - String value to parse
   * @returns Parsed value (string, number, boolean, or array)
   */
  private parseValue(value: string): any {
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Boolean values
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Null values
    if (value === 'null' || value === '~') return null;

    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }

    // Arrays (simple format)
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1)
        .split(',')
        .map(item => this.parseValue(item.trim()));
    }

    // Default to string
    return value;
  }

  /**
   * Convert data object to YAML format
   *
   * @param data - Data object to convert
   * @returns YAML string
   */
  private dataToYaml(data: Record<string, any>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        lines.push(`${key}: null`);
      } else if (typeof value === 'boolean') {
        lines.push(`${key}: ${value}`);
      } else if (typeof value === 'number') {
        lines.push(`${key}: ${value}`);
      } else if (Array.isArray(value)) {
        lines.push(`${key}: [${value.map(v => this.formatValue(v)).join(', ')}]`);
      } else if (typeof value === 'string') {
        if (value.includes('\n')) {
          // Multi-line string - check if already formatted with |
          if (value.trim() === '|') {
            lines.push(`${key}: |`);
          } else {
            lines.push(`${key}: |`);
            value.split('\n').forEach(line => {
              lines.push(`  ${line}`);
            });
          }
        } else {
          // Single-line string
          lines.push(`${key}: ${this.formatValue(value)}`);
        }
      } else if (typeof value === 'object') {
        // Nested object (simplified handling)
        lines.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Format a value for YAML output
   *
   * @param value - Value to format
   * @returns Formatted string
   */
  private formatValue(value: any): string {
    if (typeof value === 'string') {
      // Quote if contains special characters
      if (value.match(/[:\[\]{},>|]/)) {
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
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }
}

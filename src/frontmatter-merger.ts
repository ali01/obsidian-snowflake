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
   * Merge two frontmatter sections
   *
   * REQ-008: Intelligently merge frontmatter blocks
   * REQ-009: Incoming values take precedence (except for lists)
   * REQ-010: Add new keys from incoming frontmatter
   * REQ-010a: Concatenate list-type fields (base first, then incoming)
   *
   * @param baseFrontmatter - The base frontmatter content
   * @param incomingFrontmatter - The incoming frontmatter to merge
   * @returns Merge result with conflicts and additions tracked
   */
  public mergeFrontmatter(
    baseFrontmatter: string,
    incomingFrontmatter: string
  ): FrontmatterMergeResult {
    // Parse both frontmatter sections
    const baseFm = this.parseYaml(baseFrontmatter);
    const incomingFm = this.parseYaml(incomingFrontmatter);

    // Track conflicts and additions
    const conflicts: string[] = [];
    const added: string[] = [];

    // Start with base data
    const mergedData = { ...baseFm };

    // Process incoming keys
    for (const [key, value] of Object.entries(incomingFm)) {
      if (key in baseFm) {
        // REQ-010a: Special handling for arrays - concatenate them
        const baseVal = baseFm[key];
        const isBaseArray = Array.isArray(baseVal);
        const isIncomingArray = Array.isArray(value);
        const isBaseEmpty = baseVal === '' || baseVal === null || baseVal === undefined;
        const isIncomingEmpty = value === '' || value === null || value === undefined;

        if ((isBaseArray || isBaseEmpty) && (isIncomingArray || isIncomingEmpty)) {
          // Special case: if both are empty (not arrays), preserve empty string
          if (isBaseEmpty && isIncomingEmpty && !isBaseArray && !isIncomingArray) {
            mergedData[key] = '';
          } else {
            // Treat empty values as empty arrays for list concatenation
            const baseArray = isBaseArray ? (baseVal as unknown[]) : [];
            const incomingArray = isIncomingArray ? (value as unknown[]) : [];
            mergedData[key] = this.concatenateArrays(baseArray, incomingArray);
          }
          conflicts.push(key); // Still track as conflict for transparency
        } else {
          // REQ-009: Key exists in both - incoming value takes precedence
          mergedData[key] = value;
          conflicts.push(key);
        }
      } else {
        // REQ-010: Key only in incoming - add it
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
   * Merge template frontmatter with existing file frontmatter
   *
   * Convenience method that extracts frontmatter from file content
   *
   * @param fileContent - The existing file content (may or may not have frontmatter)
   * @param templateFrontmatter - The template's frontmatter content
   * @returns Merge result with conflicts and additions tracked
   */
  public mergeWithFile(fileContent: string, templateFrontmatter: string): FrontmatterMergeResult {
    // Extract frontmatter from file
    const fileFm = this.parseFrontmatter(fileContent);

    // Use the general-purpose merge (template is base, file is incoming)
    return this.mergeFrontmatter(templateFrontmatter, fileFm.content);
  }

  /**
   * Apply merged frontmatter to file content
   *
   * @param fileContent - Original file content
   * @param mergedFrontmatter - The merged frontmatter YAML
   * @returns File content with updated frontmatter
   */
  public applyToFile(fileContent: string, mergedFrontmatter: string): string {
    const parsed = this.parseFrontmatter(fileContent);

    // Format the frontmatter block
    const formattedFrontmatter = `---\n${mergedFrontmatter}---`;

    if (parsed.exists && parsed.endPosition !== undefined) {
      // Replace existing frontmatter
      return formattedFrontmatter + fileContent.slice(parsed.endPosition);
    } else {
      // Add frontmatter at the beginning
      return formattedFrontmatter + '\n' + fileContent;
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
      const arrayMatch = line.match(/^\s*- (.*)$/);
      if (arrayMatch) {
        // This is an array item
        if (!Array.isArray(data[state.currentKey])) {
          data[state.currentKey] = [];
        }
        // Handle empty array items
        const itemContent = arrayMatch[1].trim();
        if (itemContent === '') {
          (data[state.currentKey] as unknown[]).push('');
        } else {
          // Parse the array item value
          const itemValue = this.parseValue(itemContent);
          (data[state.currentKey] as unknown[]).push(itemValue);
        }
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
      // Don't set a value yet - wait to see if it's an array
      state.currentValue = [];
    }
  }

  private savePendingValue(
    data: Record<string, unknown>,
    state: { currentKey: string | null; currentValue: string[] }
  ): void {
    if (state.currentKey !== null) {
      if (state.currentValue.length > 0) {
        data[state.currentKey] = state.currentValue.join('\n').trim();
      } else if (!(state.currentKey in data)) {
        // Only set empty string if the key wasn't already set (e.g., by an array)
        data[state.currentKey] = '';
      }
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
      const inner = value.slice(1, -1).trim();
      // Handle empty arrays
      if (inner === '') {
        return [];
      }
      return inner
        .split(',')
        .map((item) => this.parseValue(item.trim()))
        .filter((item) => item !== ''); // Filter out empty strings
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
   * Concatenate two arrays with deduplication
   *
   * REQ-010a: When merging list-type fields, concatenate values
   * Preserves order: base array items first, then incoming items
   * Removes duplicates based on first occurrence
   *
   * @param baseArray - The base array
   * @param incomingArray - The array to concatenate
   * @returns Concatenated array with duplicates removed
   */
  private concatenateArrays(baseArray: unknown[], incomingArray: unknown[]): unknown[] {
    const result: unknown[] = [];
    const seen = new Set<string>();

    // Helper to add unique items
    const addUniqueItem = (item: unknown): void => {
      // Convert to string for comparison (handles objects/arrays)
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    };

    // Add base array items first (preserving order)
    for (const item of baseArray) {
      addUniqueItem(item);
    }

    // Then add incoming array items (only if not already present)
    for (const item of incomingArray) {
      addUniqueItem(item);
    }

    return result;
  }

  /**
   * Validate frontmatter syntax
   *
   * @param yaml - YAML content to validate
   * @returns True if valid, false otherwise
   */
  public validateYaml(yaml: string): boolean {
    try {
      const parsed = this.parseYaml(yaml);
      // Basic validation - should have parsed at least something
      return typeof parsed === 'object';
    } catch {
      return false;
    }
  }

  /**
   * Extract delete list from frontmatter content
   *
   * REQ-034: Templates can have delete: [prop1, prop2] to exclude properties
   * REQ-037: The delete property defines exclusions for inheritance
   *
   * @param frontmatterContent - The frontmatter YAML content
   * @returns Array of property names to exclude, or null if no delete list
   */
  public extractDeleteList(frontmatterContent: string): string[] | null {
    const data = this.parseYaml(frontmatterContent);
    const deleteValue = data['delete'];

    // If no delete property, return null
    if (deleteValue === undefined) {
      return null;
    }

    // Ensure delete value is an array
    if (!Array.isArray(deleteValue)) {
      // Invalid delete list - treat as empty
      return null;
    }

    // Filter to only string values and return
    const validProperties = deleteValue.filter(
      (item) => typeof item === 'string' && item.trim() !== ''
    );

    return validProperties.length > 0 ? validProperties : null;
  }

  /**
   * Apply delete list exclusions to frontmatter
   *
   * REQ-034: Remove properties listed in delete list
   * REQ-036: Always remove the "delete" property itself
   * REQ-037: Don't remove properties that are explicitly defined
   *
   * @param frontmatterContent - The frontmatter YAML content
   * @param deleteList - Array of property names to exclude
   * @param explicitlyDefined - Optional set of properties defined in current template
   * @returns Frontmatter with exclusions applied
   */
  public applyDeleteList(
    frontmatterContent: string,
    deleteList: string[],
    explicitlyDefined?: Set<string>
  ): string {
    const data = this.parseYaml(frontmatterContent);
    const processedData: Record<string, unknown> = {};

    // Process each property
    for (const [key, value] of Object.entries(data)) {
      // REQ-036: Always exclude the "delete" property itself
      if (key === 'delete') {
        continue;
      }

      // REQ-037: Keep properties that are explicitly defined
      if (explicitlyDefined && explicitlyDefined.has(key)) {
        processedData[key] = value;
        continue;
      }

      // REQ-034: Exclude properties in the delete list
      if (deleteList.includes(key)) {
        continue;
      }

      // Keep all other properties
      processedData[key] = value;
    }

    return this.dataToYaml(processedData);
  }

  /**
   * Process frontmatter with delete list handling during template inheritance
   *
   * REQ-034: Apply delete list exclusions
   * REQ-035: Handle cumulative exclusions with override capability
   * REQ-036: Remove "delete" property from result
   * REQ-037: Explicit definitions override exclusions
   *
   * @param frontmatter - The frontmatter content to process
   * @param cumulativeDeleteList - Cumulative delete list from parent templates
   * @returns Processed result with delete list tracking
   */
  public processWithDeleteList(
    frontmatter: string,
    cumulativeDeleteList: string[] = []
  ): { processedContent: string; newDeleteList: string[] } {
    // Extract current template's delete list
    const currentDeleteList = this.extractDeleteList(frontmatter) || [];

    // Parse frontmatter to identify explicitly defined properties
    const data = this.parseYaml(frontmatter);
    const explicitlyDefined = new Set<string>();

    // All properties in current template are explicitly defined
    for (const key of Object.keys(data)) {
      if (key !== 'delete') {
        explicitlyDefined.add(key);
      }
    }

    // Apply cumulative delete list with explicit overrides
    const processedContent = this.applyDeleteList(
      frontmatter,
      cumulativeDeleteList,
      explicitlyDefined
    );

    // Update cumulative delete list
    const newDeleteList = [...cumulativeDeleteList];
    for (const prop of currentDeleteList) {
      if (!explicitlyDefined.has(prop) && !newDeleteList.includes(prop)) {
        newDeleteList.push(prop);
      }
    }

    return { processedContent, newDeleteList };
  }

  /**
   * Merge template frontmatter with accumulated frontmatter considering delete lists
   *
   * This method handles the complete merge process including:
   * - Extracting and managing cumulative delete lists
   * - Tracking explicitly defined properties
   * - Applying delete lists after merging
   *
   * @param accumulatedFrontmatter - The accumulated frontmatter from parent templates
   * @param currentTemplateFrontmatter - The current template's frontmatter
   * @param cumulativeDeleteList - The cumulative delete list from parent templates
   * @returns Object containing merged frontmatter and updated delete list
   */
  public mergeWithDeleteList(
    accumulatedFrontmatter: string,
    currentTemplateFrontmatter: string,
    cumulativeDeleteList: string[]
  ): { mergedFrontmatter: string; updatedDeleteList: string[] } {
    // Extract current template's delete list
    const currentDeleteList = this.extractDeleteList(currentTemplateFrontmatter);

    // Parse frontmatter to identify explicitly defined properties
    const data = this.parseYaml(currentTemplateFrontmatter);
    const explicitlyDefined = new Set(Object.keys(data).filter((k) => k !== 'delete'));

    // Remove properties from cumulative delete list if they are explicitly redefined
    const updatedDeleteList = cumulativeDeleteList.filter((prop) => !explicitlyDefined.has(prop));

    // Add current template's delete list items
    if (currentDeleteList) {
      for (const prop of currentDeleteList) {
        if (!explicitlyDefined.has(prop) && !updatedDeleteList.includes(prop)) {
          updatedDeleteList.push(prop);
        }
      }
    }

    // Process current template with cumulative delete list
    const deleteResult = this.processWithDeleteList(
      currentTemplateFrontmatter,
      cumulativeDeleteList
    );

    // Merge accumulated with processed current template
    const mergeResult = this.mergeFrontmatter(
      accumulatedFrontmatter,
      deleteResult.processedContent
    );

    // Apply the cumulative delete list to the merged result
    const mergedFrontmatter = this.applyDeleteList(
      mergeResult.merged,
      updatedDeleteList,
      explicitlyDefined
    );

    return { mergedFrontmatter, updatedDeleteList };
  }
}

/**
 * Settings utilities for the Snowflake plugin
 *
 * This module provides functions for validating, migrating, and managing plugin settings.
 */

import { DEFAULT_SETTINGS } from './constants';
import type { SnowflakeSettings } from './types';

/**
 * Create default settings
 *
 * @returns Default settings object
 */
export function createDefaultSettings(): SnowflakeSettings {
  return { ...DEFAULT_SETTINGS };
}

/**
 * Type guard to check if a value is a valid template mapping object
 *
 * @param value - Value to check
 * @returns True if value is a valid template mapping
 */
function isValidTemplateMapping(
  value: unknown
): value is Record<string, string | { templatePath: string; excludePatterns?: string[] }> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).every(([key, val]) => {
    if (typeof key !== 'string') return false;

    // Allow string values (backwards compatible)
    if (typeof val === 'string') return true;

    // Allow TemplateMappingConfig objects
    if (typeof val === 'object' && val !== null && 'templatePath' in val) {
      const config = val as { templatePath: unknown; excludePatterns?: unknown };
      if (typeof config.templatePath !== 'string') return false;

      // If excludePatterns exists, it must be an array of strings
      if ('excludePatterns' in config) {
        if (!Array.isArray(config.excludePatterns)) return false;
        return config.excludePatterns.every((p: unknown) => typeof p === 'string');
      }

      return true;
    }

    return false;
  });
}

/**
 * Type guard to check if settings are valid
 *
 * @param settings - Settings to validate
 * @returns True if settings are valid
 */
export function areSettingsValid(settings: unknown): settings is SnowflakeSettings {
  if (settings === null || settings === undefined || typeof settings !== 'object') {
    return false;
  }

  const s = settings as Record<string, unknown>;

  return (
    'templateMappings' in s &&
    isValidTemplateMapping(s.templateMappings) &&
    'templatesFolder' in s &&
    typeof s.templatesFolder === 'string' &&
    'dateFormat' in s &&
    typeof s.dateFormat === 'string' &&
    'timeFormat' in s &&
    typeof s.timeFormat === 'string'
  );
}

/**
 * Check if a path is valid
 *
 * @param path - Path to validate
 * @returns True if path is valid
 */
export function isValidTemplatePath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  // Empty path is invalid
  if (path.trim() === '') {
    return false;
  }

  // Path should not contain invalid characters
  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(path)) {
    return false;
  }

  // Path should not end with dots or spaces
  if (/[. ]$/.test(path)) {
    return false;
  }

  // Path should not contain double slashes
  if (path.includes('//')) {
    return false;
  }

  // Path components should not start with dots (hidden files)
  const components = path.split('/');
  if (components.some((comp) => comp.startsWith('.') && comp !== '.')) {
    return false;
  }

  // Path must end with .md extension (case sensitive)
  if (!path.endsWith('.md')) {
    return false;
  }

  return true;
}

/**
 * Normalize template path
 *
 * @param path - Path to normalize
 * @returns Normalized path
 */
export function normalizeTemplatePath(path: string): string {
  if (!path) {
    return '';
  }

  // Remove leading/trailing slashes and whitespace
  let normalized = path.trim().replace(/^\/+|\/+$/g, '');

  // Replace multiple slashes with single slash
  normalized = normalized.replace(/\/+/g, '/');

  return normalized;
}

/**
 * Helper function to validate required fields
 *
 * @param s - Settings record to check
 * @param errors - Array to collect errors
 */
function validateRequiredFields(s: Record<string, unknown>, errors: string[]): void {
  const requiredFields = ['templateMappings', 'templatesFolder', 'dateFormat', 'timeFormat'];
  for (const field of requiredFields) {
    if (!(field in s)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
}

/**
 * Helper function to validate field types
 *
 * @param s - Settings record to check
 * @param errors - Array to collect errors
 */
function validateFieldTypes(s: Record<string, unknown>, errors: string[]): void {
  if ('templateMappings' in s && !isValidTemplateMapping(s.templateMappings)) {
    errors.push('templateMappings must be an object');
  }
  if ('templatesFolder' in s && typeof s.templatesFolder !== 'string') {
    errors.push('templatesFolder must be a string');
  }
  if ('dateFormat' in s && typeof s.dateFormat !== 'string') {
    errors.push('dateFormat must be a string');
  }
  if ('timeFormat' in s && typeof s.timeFormat !== 'string') {
    errors.push('timeFormat must be a string');
  }
}

/**
 * Helper function to validate template mapping values
 *
 * @param templateMappings - Template mappings to validate
 * @param errors - Array to collect errors
 */
function validateTemplateMappingValues(templateMappings: unknown, errors: string[]): void {
  if (
    templateMappings !== null &&
    templateMappings !== undefined &&
    typeof templateMappings === 'object'
  ) {
    for (const [key, value] of Object.entries(templateMappings)) {
      if (typeof value === 'string') {
        // String value is valid
        continue;
      } else if (typeof value === 'object' && value !== null && 'templatePath' in value) {
        const config = value as { templatePath?: unknown; excludePatterns?: unknown };
        if (typeof config.templatePath !== 'string') {
          errors.push(`Template mapping for "${key}" must have a valid templatePath`);
        }
        if ('excludePatterns' in config && !Array.isArray(config.excludePatterns)) {
          errors.push(`Template mapping for "${key}" excludePatterns must be an array`);
        }
      } else {
        errors.push(`Template mapping for "${key}" must be a string or config object`);
      }
    }
  }
}

/**
 * Validates settings and returns validation results
 *
 * @param settings - Settings to validate
 * @returns Validation result with isValid flag and error messages
 */
export function validateSettings(settings: unknown): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (settings === null || settings === undefined || typeof settings !== 'object') {
    return { isValid: false, errors: ['Settings must be an object'] };
  }

  const s = settings as Record<string, unknown>;

  validateRequiredFields(s, errors);
  validateFieldTypes(s, errors);
  validateTemplateMappingValues(s.templateMappings, errors);

  return { isValid: errors.length === 0, errors };
}

/**
 * Migrates settings from old format to current format
 *
 * @param settings - Settings that may be in old format
 * @returns Settings in current format
 */
export function migrateSettings(settings: unknown): SnowflakeSettings {
  // If settings are already valid, clean and return them
  if (areSettingsValid(settings)) {
    return cleanSettings(settings);
  }

  // If settings is an object, try to salvage what we can
  if (settings !== null && settings !== undefined && typeof settings === 'object') {
    const s = settings as Record<string, unknown>;
    const migrated: SnowflakeSettings = { ...DEFAULT_SETTINGS };

    // Migrate templateMappings if present and valid
    if ('templateMappings' in s && isValidTemplateMapping(s.templateMappings)) {
      migrated.templateMappings = s.templateMappings;
    }

    // Migrate templatesFolder if present and valid
    if (
      'templatesFolder' in s &&
      typeof s.templatesFolder === 'string' &&
      s.templatesFolder.trim() !== ''
    ) {
      migrated.templatesFolder = s.templatesFolder;
    }

    // Migrate date/time formats if present and valid
    if ('dateFormat' in s && typeof s.dateFormat === 'string' && s.dateFormat.trim() !== '') {
      migrated.dateFormat = s.dateFormat;
    }
    if ('timeFormat' in s && typeof s.timeFormat === 'string' && s.timeFormat.trim() !== '') {
      migrated.timeFormat = s.timeFormat;
    }

    return migrated;
  }

  // Otherwise, return default settings
  return { ...DEFAULT_SETTINGS };
}

/**
 * Removes old/deprecated fields from settings to keep data.json clean
 *
 * @param settings - Valid settings that may contain old fields
 * @returns Settings with only current fields
 */
export function cleanSettings(settings: SnowflakeSettings): SnowflakeSettings {
  // Create a new object with only the fields we want to keep
  const cleaned: SnowflakeSettings = {
    templateMappings: settings.templateMappings,
    templatesFolder: settings.templatesFolder,
    dateFormat: settings.dateFormat || DEFAULT_SETTINGS.dateFormat,
    timeFormat: settings.timeFormat || DEFAULT_SETTINGS.timeFormat
  };

  return cleaned;
}

/**
 * Merge partial settings with existing settings
 *
 * @param existing - Existing settings
 * @param partial - Partial settings to merge
 * @returns Merged settings
 */
export function mergeSettings(
  existing: SnowflakeSettings,
  partial: Partial<SnowflakeSettings>
): SnowflakeSettings {
  return {
    ...existing,
    ...partial,
    templateMappings: {
      ...existing.templateMappings,
      ...(partial.templateMappings ?? {})
    }
  };
}

/**
 * Update template mappings
 *
 * @param settings - Current settings
 * @param folder - Folder to update
 * @param template - Template path
 * @returns Updated settings
 */
export function updateTemplateMappings(
  settings: SnowflakeSettings,
  folder: string,
  template: string | null
): SnowflakeSettings {
  const mappings = { ...settings.templateMappings };

  if (template === null) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete mappings[folder];
  } else {
    mappings[folder] = template;
  }

  return { ...settings, templateMappings: mappings };
}

/**
 * Remove template mapping for a folder
 *
 * @param settings - Current settings
 * @param folder - Folder to remove mapping for
 * @returns Updated settings
 */
export function removeTemplateMapping(
  settings: SnowflakeSettings,
  folder: string
): SnowflakeSettings {
  return updateTemplateMappings(settings, folder, null);
}

/**
 * Serialize settings to JSON
 *
 * @param settings - Settings to serialize
 * @returns JSON string
 */
export function serializeSettings(settings: SnowflakeSettings): string {
  return JSON.stringify(settings, null, 2);
}

/**
 * Deserialize settings from JSON
 *
 * @param json - JSON string
 * @returns Settings object or null if invalid
 */
export function deserializeSettings(json: string): SnowflakeSettings | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    const validation = validateSettings(parsed);
    if (!validation.isValid) {
      console.error('Invalid settings:', validation.errors);
      return null;
    }
    return parsed as SnowflakeSettings;
  } catch (e) {
    console.error('Failed to parse settings:', e);
    return null;
  }
}

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
function isValidTemplateMapping(value: unknown): value is Record<string, string> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).every(
    ([key, val]) => typeof key === 'string' && typeof val === 'string'
  );
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

  // Check required fields
  if (!('templateMappings' in s)) {
    errors.push('Missing required field: templateMappings');
  }
  if (!('templatesFolder' in s)) {
    errors.push('Missing required field: templatesFolder');
  }
  if (!('dateFormat' in s)) {
    errors.push('Missing required field: dateFormat');
  }
  if (!('timeFormat' in s)) {
    errors.push('Missing required field: timeFormat');
  }

  // Check types
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

  // Validate template mapping values
  if (
    s.templateMappings !== null &&
    s.templateMappings !== undefined &&
    typeof s.templateMappings === 'object'
  ) {
    for (const [key, value] of Object.entries(s.templateMappings)) {
      if (typeof value !== 'string') {
        errors.push(`Template mapping for "${key}" must be a string`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Migrates settings from old format to current format
 *
 * @param settings - Settings that may be in old format
 * @returns Settings in current format
 */
export function migrateSettings(settings: unknown): SnowflakeSettings {
  if (areSettingsValid(settings)) {
    // Already in current format
    return settings;
  }

  const s = (settings ?? {}) as Record<string, unknown>;
  const migrated: SnowflakeSettings = { ...DEFAULT_SETTINGS };

  // Migrate from v1 format
  if ('templates' in s && typeof s.templates === 'object') {
    migrated.templateMappings = {};
    for (const [key, value] of Object.entries(s.templates as Record<string, unknown>)) {
      if (typeof value === 'string') {
        // Add Templates folder prefix if not absolute path
        migrated.templateMappings[key] = value.startsWith('/') ? value : `Templates/${value}`;
      }
    }
  } else if ('templateMappings' in s && typeof s.templateMappings === 'object') {
    migrated.templateMappings = {};
    for (const [key, value] of Object.entries(s.templateMappings as Record<string, unknown>)) {
      if (typeof value === 'string') {
        // Add Templates folder prefix if not absolute path and doesn't already have it
        migrated.templateMappings[key] =
          value.startsWith('/') || value.startsWith('Templates/') ? value : `Templates/${value}`;
      }
    }
  }

  // Migrate default template to root mapping
  if ('defaultTemplateFile' in s && typeof s.defaultTemplateFile === 'string') {
    const defaultPath = s.defaultTemplateFile.startsWith('/')
      ? s.defaultTemplateFile
      : `Templates/${s.defaultTemplateFile}`;
    migrated.templateMappings['/'] = defaultPath;
  } else if (
    'defaultTemplate' in s &&
    typeof s.defaultTemplate === 'string' &&
    s.defaultTemplate !== ''
  ) {
    const defaultPath =
      s.defaultTemplate.startsWith('/') || s.defaultTemplate.startsWith('Templates/')
        ? s.defaultTemplate
        : `Templates/${s.defaultTemplate}`;
    migrated.templateMappings['/'] = defaultPath;
  }

  // Templates folder
  if ('templatesFolder' in s && typeof s.templatesFolder === 'string') {
    migrated.templatesFolder = s.templatesFolder;
  }

  // Date format
  if ('dateFormat' in s && typeof s.dateFormat === 'string') {
    migrated.dateFormat = s.dateFormat;
  }

  // Time format
  if ('timeFormat' in s && typeof s.timeFormat === 'string') {
    migrated.timeFormat = s.timeFormat;
  }

  return migrated;
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

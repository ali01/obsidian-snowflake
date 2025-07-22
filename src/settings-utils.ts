/**
 * Settings utilities for the Snowflake plugin
 *
 * This module provides helper functions for working with plugin settings,
 * including validation and type checking.
 */

import type { SnowflakeSettings, TemplateMapping } from './types';
import { DEFAULT_SETTINGS } from './constants';

/**
 * Checks if a template mapping is valid
 *
 * REQ-023: Validates that folder paths and template paths are properly formed
 *
 * @param mapping - The template mapping to validate
 * @returns true if valid, false otherwise
 */
export function isValidTemplateMapping(mapping: unknown): mapping is TemplateMapping {
  if (
    mapping === null ||
    mapping === undefined ||
    typeof mapping !== 'object' ||
    Array.isArray(mapping)
  ) {
    return false;
  }

  // Check that all keys and values are strings
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Validates that settings object has all required properties with correct
 * types
 *
 * REQ-023: Ensures all required settings exist with valid values
 *
 * @param settings - The settings object to validate
 * @returns true if all properties are valid
 */
export function areSettingsValid(settings: unknown): settings is SnowflakeSettings {
  if (
    settings === null ||
    settings === undefined ||
    typeof settings !== 'object' ||
    Array.isArray(settings)
  ) {
    return false;
  }

  const s = settings as Record<string, unknown>;

  return (
    isValidTemplateMapping(s.templateMappings) &&
    typeof s.defaultTemplate === 'string' &&
    typeof s.enableAutoTemplating === 'boolean' &&
    typeof s.templatesFolder === 'string' &&
    s.templatesFolder.trim() !== ''
  );
}

/**
 * Creates a deep copy of settings to prevent mutation
 *
 * @param settings - The settings to copy
 * @returns A deep copy of the settings
 */
export function cloneSettings(settings: SnowflakeSettings): SnowflakeSettings {
  return {
    templateMappings: { ...settings.templateMappings },
    defaultTemplate: settings.defaultTemplate,
    enableAutoTemplating: settings.enableAutoTemplating,
    templatesFolder: settings.templatesFolder
  };
}

/**
 * Merges partial settings with defaults
 *
 * @param partial - Partial settings to merge
 * @returns Complete settings object
 */
export function mergeWithDefaults(partial: Partial<SnowflakeSettings>): SnowflakeSettings {
  const merged: SnowflakeSettings = {
    ...DEFAULT_SETTINGS,
    ...partial
  };

  // Ensure nested objects are properly merged
  if (partial.templateMappings) {
    merged.templateMappings = { ...partial.templateMappings };
  }

  return merged;
}

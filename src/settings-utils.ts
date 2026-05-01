/**
 * Settings utilities for the Snowflake plugin.
 */

import { DEFAULT_SETTINGS } from './constants';
import type { SnowflakeSettings } from './types';

export function createDefaultSettings(): SnowflakeSettings {
  return { ...DEFAULT_SETTINGS };
}

/**
 * Type guard for valid settings.
 */
export function areSettingsValid(settings: unknown): settings is SnowflakeSettings {
  if (settings === null || settings === undefined || typeof settings !== 'object') {
    return false;
  }

  const s = settings as Record<string, unknown>;

  if (
    !(
      'dateFormat' in s &&
      typeof s.dateFormat === 'string' &&
      'timeFormat' in s &&
      typeof s.timeFormat === 'string' &&
      'globalExcludePatterns' in s &&
      Array.isArray(s.globalExcludePatterns) &&
      (s.globalExcludePatterns as unknown[]).every((p: unknown) => typeof p === 'string')
    )
  ) {
    return false;
  }

  return true;
}

export function validateSettings(settings: unknown): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (settings === null || settings === undefined || typeof settings !== 'object') {
    return { isValid: false, errors: ['Settings must be an object'] };
  }

  const s = settings as Record<string, unknown>;

  for (const field of ['dateFormat', 'timeFormat', 'globalExcludePatterns']) {
    if (!(field in s)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if ('dateFormat' in s && typeof s.dateFormat !== 'string') {
    errors.push('dateFormat must be a string');
  }
  if ('timeFormat' in s && typeof s.timeFormat !== 'string') {
    errors.push('timeFormat must be a string');
  }
  if ('globalExcludePatterns' in s) {
    if (!Array.isArray(s.globalExcludePatterns)) {
      errors.push('globalExcludePatterns must be an array');
    } else if (
      !(s.globalExcludePatterns as unknown[]).every((p: unknown) => typeof p === 'string')
    ) {
      errors.push('globalExcludePatterns must contain only strings');
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Migrate possibly-old settings to the current shape, salvaging valid fields
 * and dropping anything else (including legacy templateMappings/templatesFolder).
 */
export function migrateSettings(settings: unknown): SnowflakeSettings {
  if (areSettingsValid(settings)) {
    return cleanSettings(settings);
  }

  if (settings !== null && settings !== undefined && typeof settings === 'object') {
    const s = settings as Record<string, unknown>;
    const migrated: SnowflakeSettings = { ...DEFAULT_SETTINGS };

    if (typeof s.dateFormat === 'string' && s.dateFormat.trim() !== '') {
      migrated.dateFormat = s.dateFormat;
    }
    if (typeof s.timeFormat === 'string' && s.timeFormat.trim() !== '') {
      migrated.timeFormat = s.timeFormat;
    }
    if (
      Array.isArray(s.globalExcludePatterns) &&
      (s.globalExcludePatterns as unknown[]).every((p: unknown) => typeof p === 'string')
    ) {
      migrated.globalExcludePatterns = s.globalExcludePatterns as string[];
    }

    return migrated;
  }

  return { ...DEFAULT_SETTINGS };
}

/**
 * Strip any unknown keys so data.json doesn't accumulate stale fields.
 */
export function cleanSettings(settings: SnowflakeSettings): SnowflakeSettings {
  return {
    dateFormat: settings.dateFormat || DEFAULT_SETTINGS.dateFormat,
    timeFormat: settings.timeFormat || DEFAULT_SETTINGS.timeFormat,
    globalExcludePatterns: settings.globalExcludePatterns || DEFAULT_SETTINGS.globalExcludePatterns
  };
}

export function mergeSettings(
  existing: SnowflakeSettings,
  partial: Partial<SnowflakeSettings>
): SnowflakeSettings {
  return { ...existing, ...partial };
}

export function serializeSettings(settings: SnowflakeSettings): string {
  return JSON.stringify(settings, null, 2);
}

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

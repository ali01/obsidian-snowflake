/**
 * Tests for Settings Utilities
 */

import {
  createDefaultSettings,
  validateSettings,
  migrateSettings,
  areSettingsValid,
  cleanSettings
} from './settings-utils';
import { SnowflakeSettings } from './types';

describe('Settings Utilities', () => {
  describe('createDefaultSettings', () => {
    test('Should create default settings object', () => {
      expect(createDefaultSettings()).toEqual({
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      });
    });
  });

  describe('areSettingsValid', () => {
    test('Should return true for valid settings', () => {
      const settings: SnowflakeSettings = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      };
      expect(areSettingsValid(settings)).toBe(true);
    });

    test('Should return false for invalid settings', () => {
      expect(areSettingsValid(null)).toBe(false);
      expect(areSettingsValid(undefined)).toBe(false);
      expect(areSettingsValid({})).toBe(false);
      expect(areSettingsValid({ dateFormat: 'YYYY-MM-DD' })).toBe(false);
    });

    test('Should require globalExcludePatterns to be an array of strings', () => {
      expect(
        areSettingsValid({
          dateFormat: 'YYYY-MM-DD',
          timeFormat: 'HH:mm',
          globalExcludePatterns: 'not-an-array'
        })
      ).toBe(false);

      expect(
        areSettingsValid({
          dateFormat: 'YYYY-MM-DD',
          timeFormat: 'HH:mm',
          globalExcludePatterns: [123]
        })
      ).toBe(false);
    });
  });

  describe('validateSettings', () => {
    test('Should validate correct settings', () => {
      const settings: SnowflakeSettings = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      };
      const result = validateSettings(settings);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('Should detect missing required fields', () => {
      const result = validateSettings({});
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: dateFormat');
      expect(result.errors).toContain('Missing required field: timeFormat');
      expect(result.errors).toContain('Missing required field: globalExcludePatterns');
    });

    test('Should detect invalid types', () => {
      const result = validateSettings({
        dateFormat: 123,
        timeFormat: false,
        globalExcludePatterns: 'nope'
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dateFormat must be a string');
      expect(result.errors).toContain('timeFormat must be a string');
      expect(result.errors).toContain('globalExcludePatterns must be an array');
    });
  });

  describe('migrateSettings', () => {
    test('Should return valid settings unchanged', () => {
      const currentSettings: SnowflakeSettings = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      };
      expect(migrateSettings(currentSettings)).toEqual(currentSettings);
    });

    test('Should drop legacy templateMappings/templatesFolder fields silently', () => {
      const legacySettings = {
        templateMappings: { Projects: 'project.md' },
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: ['*.tmp']
      };
      const migrated = migrateSettings(legacySettings);
      expect(migrated).toEqual({
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: ['*.tmp']
      });
      expect('templateMappings' in migrated).toBe(false);
      expect('templatesFolder' in migrated).toBe(false);
    });

    test('Should return default settings for null/undefined', () => {
      const expected = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      };
      expect(migrateSettings(null)).toEqual(expected);
      expect(migrateSettings(undefined)).toEqual(expected);
    });

    test('Should preserve valid date/time/excludes fields when others are missing', () => {
      const partialSettings = {
        dateFormat: 'DD/MM/YYYY'
      };
      expect(migrateSettings(partialSettings)).toEqual({
        dateFormat: 'DD/MM/YYYY',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      });
    });
  });

  describe('cleanSettings', () => {
    test('Should preserve all valid fields', () => {
      const validSettings: SnowflakeSettings = {
        dateFormat: 'DD/MM/YYYY',
        timeFormat: 'h:mm A',
        globalExcludePatterns: ['*.tmp']
      };
      expect(cleanSettings(validSettings)).toEqual(validSettings);
    });

    test('Should fall back to defaults for missing date/time formats', () => {
      const cleaned = cleanSettings({
        globalExcludePatterns: []
      } as unknown as SnowflakeSettings);
      expect(cleaned).toEqual({
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      });
    });

    test('Should not include any fields beyond the current schema', () => {
      const withLegacy = {
        templateMappings: { Projects: 'project.md' },
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        globalExcludePatterns: []
      } as unknown as SnowflakeSettings;
      const cleaned = cleanSettings(withLegacy);
      expect(Object.keys(cleaned).sort()).toEqual([
        'dateFormat',
        'globalExcludePatterns',
        'timeFormat'
      ]);
    });
  });
});

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
        timeFormat: 'HH:mm'
      });
    });
  });

  describe('areSettingsValid', () => {
    test('Should return true for valid settings', () => {
      const settings: SnowflakeSettings = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };
      expect(areSettingsValid(settings)).toBe(true);
    });

    test('Should return false for invalid settings', () => {
      expect(areSettingsValid(null)).toBe(false);
      expect(areSettingsValid(undefined)).toBe(false);
      expect(areSettingsValid({})).toBe(false);
      expect(areSettingsValid({ dateFormat: 'YYYY-MM-DD' })).toBe(false);
    });

    test('Should accept extra unknown keys (cleanSettings strips them later)', () => {
      expect(
        areSettingsValid({
          dateFormat: 'YYYY-MM-DD',
          timeFormat: 'HH:mm',
          legacyField: 'ignored'
        })
      ).toBe(true);
    });
  });

  describe('validateSettings', () => {
    test('Should validate correct settings', () => {
      const settings: SnowflakeSettings = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
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
    });

    test('Should detect invalid types', () => {
      const result = validateSettings({
        dateFormat: 123,
        timeFormat: false
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dateFormat must be a string');
      expect(result.errors).toContain('timeFormat must be a string');
    });
  });

  describe('migrateSettings', () => {
    test('Should return valid settings unchanged', () => {
      const currentSettings: SnowflakeSettings = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };
      expect(migrateSettings(currentSettings)).toEqual(currentSettings);
    });

    test('Should drop legacy fields silently', () => {
      const legacySettings = {
        templateMappings: { Projects: 'project.md' },
        templatesFolder: 'Templates',
        globalExcludePatterns: ['*.tmp'],
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };
      const migrated = migrateSettings(legacySettings);
      expect(migrated).toEqual({
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });
      expect('templateMappings' in migrated).toBe(false);
      expect('templatesFolder' in migrated).toBe(false);
      expect('globalExcludePatterns' in migrated).toBe(false);
    });

    test('Should return default settings for null/undefined', () => {
      const expected = {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };
      expect(migrateSettings(null)).toEqual(expected);
      expect(migrateSettings(undefined)).toEqual(expected);
    });

    test('Should preserve valid date/time fields when others are missing', () => {
      const partialSettings = {
        dateFormat: 'DD/MM/YYYY'
      };
      expect(migrateSettings(partialSettings)).toEqual({
        dateFormat: 'DD/MM/YYYY',
        timeFormat: 'HH:mm'
      });
    });

    test('Warns when legacy globalExcludePatterns is found', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      try {
        migrateSettings({
          dateFormat: 'YYYY-MM-DD',
          timeFormat: 'HH:mm',
          globalExcludePatterns: ['*.tmp']
        });
        // areSettingsValid is true here (only requires date/time), so no warn
        expect(warnSpy).not.toHaveBeenCalled();

        // But if the settings shape is broken AND legacy excludes are present,
        // the migration path triggers the warning.
        migrateSettings({
          globalExcludePatterns: ['*.tmp']
        });
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('cleanSettings', () => {
    test('Should preserve all valid fields', () => {
      const validSettings: SnowflakeSettings = {
        dateFormat: 'DD/MM/YYYY',
        timeFormat: 'h:mm A'
      };
      expect(cleanSettings(validSettings)).toEqual(validSettings);
    });

    test('Should fall back to defaults for missing date/time formats', () => {
      const cleaned = cleanSettings({} as unknown as SnowflakeSettings);
      expect(cleaned).toEqual({
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });
    });

    test('Should not include any fields beyond the current schema', () => {
      const withLegacy = {
        templateMappings: { Projects: 'project.md' },
        templatesFolder: 'Templates',
        globalExcludePatterns: ['*.tmp'],
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      } as unknown as SnowflakeSettings;
      const cleaned = cleanSettings(withLegacy);
      expect(Object.keys(cleaned).sort()).toEqual(['dateFormat', 'timeFormat']);
    });
  });
});

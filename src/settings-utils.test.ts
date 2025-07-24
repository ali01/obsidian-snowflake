/**
 * Tests for Settings Utilities
 */

import {
  createDefaultSettings,
  validateSettings,
  migrateSettings,
  updateTemplateMappings,
  removeTemplateMapping,
  isValidTemplatePath
} from './settings-utils';
import { SnowflakeSettings } from './types';

describe('Settings Utilities', () => {
  describe('createDefaultSettings', () => {
    test('Should create default settings object', () => {
      const settings = createDefaultSettings();

      expect(settings).toEqual({
        templateMappings: {},

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });
    });
  });

  describe('validateSettings', () => {
    test('Should validate correct settings', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const result = validateSettings(settings);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('Should detect missing required fields', () => {
      const settings = {
        templateMappings: {}
      } as any;

      const result = validateSettings(settings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: templatesFolder');
      expect(result.errors).toContain('Missing required field: dateFormat');
      expect(result.errors).toContain('Missing required field: timeFormat');
    });

    test('Should detect invalid types', () => {
      const settings = {
        templateMappings: 'invalid',
        templatesFolder: null,
        dateFormat: 123,
        timeFormat: false
      } as any;

      const result = validateSettings(settings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('templateMappings must be an object');

      expect(result.errors).toContain('templatesFolder must be a string');
      expect(result.errors).toContain('dateFormat must be a string');
      expect(result.errors).toContain('timeFormat must be a string');
    });

    test('Should validate template mapping values', () => {
      const settings: SnowflakeSettings = {
        templateMappings: {
          Projects: 'project.md',
          Invalid: 123 as any
        },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const result = validateSettings(settings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template mapping for "Invalid" must be a string');
    });
  });

  describe('migrateSettings', () => {
    test('Should return valid settings unchanged', () => {
      const currentSettings: SnowflakeSettings = {
        templateMappings: { Projects: 'project.md' },
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const migrated = migrateSettings(currentSettings);
      expect(migrated).toEqual(currentSettings);
    });

    test('Should return default settings for invalid settings', () => {
      const invalidSettings = {
        idField: 'id',
        templates: {
          Projects: 'project.md'
        },
        autoApply: false
      };

      const migrated = migrateSettings(invalidSettings as any);

      expect(migrated).toEqual({
        templateMappings: {},
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });
    });

    test('Should return default settings for null/undefined', () => {
      expect(migrateSettings(null as any)).toEqual({
        templateMappings: {},
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });

      expect(migrateSettings(undefined as any)).toEqual({
        templateMappings: {},
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });
    });

    test('Should return default settings for partial settings', () => {
      const partialSettings = {
        templateMappings: { Projects: 'project.md' }
        // Missing required fields
      };

      const migrated = migrateSettings(partialSettings as any);

      expect(migrated).toEqual({
        templateMappings: {},
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });
    });
  });

  describe('updateTemplateMappings', () => {
    test('Should add new mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = updateTemplateMappings(settings, 'Daily', 'daily.md');

      expect(updated.templateMappings).toEqual({
        Projects: 'project.md',
        Daily: 'daily.md'
      });
    });

    test('Should update existing mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'old-project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = updateTemplateMappings(settings, 'Projects', 'new-project.md');

      expect(updated.templateMappings['Projects']).toBe('new-project.md');
    });

    test('Should create new object to maintain immutability', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = updateTemplateMappings(settings, 'Daily', 'daily.md');

      expect(updated).not.toBe(settings);
      expect(updated.templateMappings).not.toBe(settings.templateMappings);
    });
  });

  describe('removeTemplateMapping', () => {
    test('Should remove existing mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: {
          Projects: 'project.md',
          Daily: 'daily.md'
        },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = removeTemplateMapping(settings, 'Daily');

      expect(updated.templateMappings).toEqual({
        Projects: 'project.md'
      });
    });

    test('Should handle non-existent mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = removeTemplateMapping(settings, 'NonExistent');

      expect(updated.templateMappings).toEqual(settings.templateMappings);
    });
  });

  describe('isValidTemplatePath', () => {
    test('Should validate markdown files', () => {
      expect(isValidTemplatePath('template.md')).toBe(true);
      expect(isValidTemplatePath('folder/template.md')).toBe(true);
      expect(isValidTemplatePath('folder/sub/template.md')).toBe(true);
    });

    test('Should reject non-markdown files', () => {
      expect(isValidTemplatePath('template.txt')).toBe(false);
      expect(isValidTemplatePath('template.pdf')).toBe(false);
      expect(isValidTemplatePath('template')).toBe(false);
    });

    test('Should reject empty or invalid paths', () => {
      expect(isValidTemplatePath('')).toBe(false);
      expect(isValidTemplatePath(' ')).toBe(false);
      expect(isValidTemplatePath('.md')).toBe(false);
    });

    test('Should handle edge cases', () => {
      expect(isValidTemplatePath('template.MD')).toBe(false); // Case sensitive
      expect(isValidTemplatePath('template.md.txt')).toBe(false);
      expect(isValidTemplatePath('template.markdown')).toBe(false);
    });
  });
});

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
        templateMappings: { Projects: 'Templates/project.md' },

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
          Projects: 'Templates/project.md',
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
    test('Should migrate v1 settings to current version', () => {
      const oldSettings = {
        idField: 'id',
        templates: {
          Projects: 'project.md'
        },
        autoApply: false,
        defaultTemplateFile: 'default.md'
      };

      const migrated = migrateSettings(oldSettings as any);

      expect(migrated).toEqual({
        templateMappings: {
          Projects: 'Templates/project.md',
          '/': 'Templates/default.md'
        },
        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      });
    });

    test('Should handle already migrated settings', () => {
      const currentSettings: SnowflakeSettings = {
        templateMappings: { Projects: 'Templates/project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const migrated = migrateSettings(currentSettings);
      expect(migrated).toEqual(currentSettings);
    });

    test('Should handle partial migration', () => {
      const partialSettings = {
        templateMappings: { Projects: 'project.md' }
      };

      const migrated = migrateSettings(partialSettings as any);

      expect(migrated.templateMappings).toEqual({ Projects: 'Templates/project.md' });
      expect(migrated.templatesFolder).toBe('Templates');
      expect(migrated.dateFormat).toBe('YYYY-MM-DD');
      expect(migrated.timeFormat).toBe('HH:mm');
    });

    test('Should preserve absolute template paths', () => {
      const settings = {
        templateMappings: { Projects: '/absolute/path/project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const migrated = migrateSettings(settings as any);

      expect(migrated.templateMappings['Projects']).toBe('/absolute/path/project.md');
    });
  });

  describe('updateTemplateMappings', () => {
    test('Should add new mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'Templates/project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = updateTemplateMappings(settings, 'Daily', 'Templates/daily.md');

      expect(updated.templateMappings).toEqual({
        Projects: 'Templates/project.md',
        Daily: 'Templates/daily.md'
      });
    });

    test('Should update existing mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'Templates/old-project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = updateTemplateMappings(settings, 'Projects', 'Templates/new-project.md');

      expect(updated.templateMappings['Projects']).toBe('Templates/new-project.md');
    });

    test('Should create new object to maintain immutability', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'Templates/project.md' },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = updateTemplateMappings(settings, 'Daily', 'Templates/daily.md');

      expect(updated).not.toBe(settings);
      expect(updated.templateMappings).not.toBe(settings.templateMappings);
    });
  });

  describe('removeTemplateMapping', () => {
    test('Should remove existing mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: {
          Projects: 'Templates/project.md',
          Daily: 'Templates/daily.md'
        },

        templatesFolder: 'Templates',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm'
      };

      const updated = removeTemplateMapping(settings, 'Daily');

      expect(updated.templateMappings).toEqual({
        Projects: 'Templates/project.md'
      });
    });

    test('Should handle non-existent mapping', () => {
      const settings: SnowflakeSettings = {
        templateMappings: { Projects: 'Templates/project.md' },

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

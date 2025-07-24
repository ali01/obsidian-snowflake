/**
 * Snowflake Plugin for Obsidian
 *
 * This plugin automatically adds unique IDs to notes in their frontmatter.
 * IDs are generated using the Nano ID algorithm for collision resistance.
 *
 * Features:
 * - Automatic ID addition to new notes in configured folders
 * - Manual command to add ID to current note
 * - Bulk command to add IDs to all notes in a folder
 * - Configurable folders for automatic ID addition
 *
 * Author: Ali Yahya
 */

import { Plugin } from 'obsidian';
import type { SnowflakeSettings } from './types';
import { SnowflakeSettingTab } from './ui/settings-tab';
import { migrateSettings, areSettingsValid, cleanSettings } from './settings-utils';
import { FileCreationHandler } from './file-creation-handler';
import { SnowflakeCommands } from './commands';

/**
 * Main plugin class for Snowflake
 */
export default class SnowflakePlugin extends Plugin {
  settings!: SnowflakeSettings;
  private fileCreationHandler?: FileCreationHandler;
  private commands?: SnowflakeCommands;

  async onload(): Promise<void> {
    // Load saved settings or use defaults
    await this.loadSettings();

    // Initialize commands first so they're available for settings tab
    this.commands = new SnowflakeCommands(this, this.settings);
    this.commands.registerCommands();

    // Add settings tab to Obsidian settings (after commands are initialized)
    this.addSettingTab(new SnowflakeSettingTab(this.app, this, this.commands));

    // Initialize file creation handler but don't start it yet
    this.fileCreationHandler = new FileCreationHandler(this, this.app.vault, this.settings);

    // Only start listening for file creation after workspace is ready
    // This prevents applying templates to existing files during startup
    this.app.workspace.onLayoutReady(() => {
      this.fileCreationHandler?.start();
    });
  }

  onunload(): void {
    // Stop file creation handler
    if (this.fileCreationHandler !== undefined) {
      this.fileCreationHandler.stop();
    }
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as unknown;

    // Use the settings utilities to properly merge with defaults
    if (areSettingsValid(data)) {
      // Data is already valid, use it directly
      this.settings = data;
    } else {
      // Migrate settings if needed or use defaults
      this.settings = migrateSettings(data);
    }

    // Validate settings to ensure they're properly formed
    this.validateSettings();

    // Clean settings and save to remove old fields
    // This ensures users with old config files get them cleaned up
    await this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    // Clean settings to remove any old fields
    this.settings = cleanSettings(this.settings);

    // Validate before saving
    this.validateSettings();

    // Write settings with exactly one trailing newline
    const configDir = this.manifest.dir;
    if (configDir !== undefined && configDir !== '') {
      const configPath = `${configDir}/data.json`;
      const content = JSON.stringify(this.settings, null, 2) + '\n';
      await this.app.vault.adapter.write(configPath, content);
    } else {
      // Fallback to standard saveData if manifest.dir is not available
      await this.saveData(this.settings);
    }

    // Update file creation handler with new settings
    if (this.fileCreationHandler !== undefined) {
      this.fileCreationHandler.updateSettings(this.settings);
    }

    // Update commands with new settings
    if (this.commands !== undefined) {
      this.commands.updateSettings(this.settings);
    }
  }

  /**
   * Validates and fixes settings to ensure they're properly formed
   *
   * REQ-023: Ensures all required settings exist with valid values
   */
  validateSettings(): void {
    // Ensure templateMappings is an object (not null or array)
    if (
      typeof this.settings.templateMappings !== 'object' ||
      Array.isArray(this.settings.templateMappings)
    ) {
      this.settings.templateMappings = {};
    }

    // Ensure templatesFolder is a non-empty string
    if (
      typeof this.settings.templatesFolder !== 'string' ||
      this.settings.templatesFolder.trim() === ''
    ) {
      this.settings.templatesFolder = 'Templates';
    }
  }
}

// Export for testing
export { SnowflakePlugin };

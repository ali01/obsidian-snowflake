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

import { Plugin, TFile, Notice } from 'obsidian';
import { SnowflakeSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { FolderSuggestModal } from './ui/folder-modal';
import { SnowflakeSettingTab } from './ui/settings-tab';
import { mergeWithDefaults } from './settings-utils';
import { FileCreationHandler } from './file-creation-handler';
import { SnowflakeCommands } from './commands';

/**
 * Main plugin class for Snowflake
 */
export default class SnowflakePlugin extends Plugin {
    settings!: SnowflakeSettings;
    private fileCreationHandler?: FileCreationHandler;
    private commands?: SnowflakeCommands;

    async onload() {
        console.log("Loading Snowflake plugin");

        // Load saved settings or use defaults
        await this.loadSettings();

        // Add settings tab to Obsidian settings
        this.addSettingTab(new SnowflakeSettingTab(this.app, this));

        // Initialize file creation handler
        this.fileCreationHandler = new FileCreationHandler(
            this,
            this.app.vault,
            this.settings
        );
        this.fileCreationHandler.start();

        // Initialize and register commands
        this.commands = new SnowflakeCommands(this, this.settings);
        this.commands.registerCommands();
    }

    onunload() {
        console.log("Unloading Snowflake plugin");

        // Stop file creation handler
        if (this.fileCreationHandler) {
            this.fileCreationHandler.stop();
        }
    }

    async loadSettings() {
        const data = await this.loadData();

        // Use the settings utilities to properly merge with defaults
        this.settings = mergeWithDefaults(data || {});

        // Validate settings to ensure they're properly formed
        this.validateSettings();
    }

    async saveSettings() {
        // Validate before saving
        this.validateSettings();
        await this.saveData(this.settings);

        // Update file creation handler with new settings
        if (this.fileCreationHandler) {
            this.fileCreationHandler.updateSettings(this.settings);
        }

        // Update commands with new settings
        if (this.commands) {
            this.commands.updateSettings(this.settings);
        }
    }

    /**
     * Validates and fixes settings to ensure they're properly formed
     *
     * REQ-023: Ensures all required settings exist with valid values
     */
    validateSettings() {
        // Ensure templateMappings is an object (not null or array)
        if (!this.settings.templateMappings ||
            typeof this.settings.templateMappings !== 'object' ||
            Array.isArray(this.settings.templateMappings)) {
            this.settings.templateMappings = {};
        }

        // Ensure defaultTemplate is a string
        if (typeof this.settings.defaultTemplate !== 'string') {
            this.settings.defaultTemplate = "";
        }

        // Ensure enableAutoTemplating is a boolean
        if (typeof this.settings.enableAutoTemplating !== 'boolean') {
            this.settings.enableAutoTemplating = true;
        }

        // Ensure templatesFolder is a non-empty string
        if (typeof this.settings.templatesFolder !== 'string' ||
            this.settings.templatesFolder.trim() === '') {
            this.settings.templatesFolder = "Templates";
        }
    }

}

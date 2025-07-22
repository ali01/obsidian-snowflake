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
import { hasID } from './frontmatter'; // TODO(Stage 5): Remove frontmatter import
import { processFile, processFolder } from './file-processor'; // TODO(Stage 5): Remove file-processor import
import { FolderSuggestModal } from './ui/folder-modal';
import { SnowflakeSettingTab } from './ui/settings-tab';
import { mergeWithDefaults } from './settings-utils';

/**
 * Main plugin class for Snowflake
 */
export default class SnowflakePlugin extends Plugin {
    settings!: SnowflakeSettings;

    async onload() {
        console.log("Loading Snowflake plugin");

        // Load saved settings or use defaults
        await this.loadSettings();

        // Add settings tab to Obsidian settings
        this.addSettingTab(new SnowflakeSettingTab(this.app, this));

        // Register command: Add ID to current note
        this.addCommand({
            id: "add-id-to-current-note",
            name: "Add ID to current note",
            callback: () => this.addIDToCurrentNote(),
        });

        // Register command: Add IDs to all notes in a folder
        this.addCommand({
            id: "add-ids-to-folder",
            name: "Add IDs to all notes in folder",
            callback: () => this.addIDsToFolder(),
        });

        // Event handler: Automatically add ID when creating new files
        this.registerEvent(
            this.app.vault.on("create", (file) => {
                // Only process markdown files
                if (file instanceof TFile && file.extension === "md") {
                    this.handleFileCreate(file);
                }
            }),
        );
    }

    onunload() {
        console.log("Unloading Snowflake plugin");
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

    async handleFileCreate(file: TFile) {
        // TODO(Stage 6): Replace this entire method with new template processing logic
        // Check if auto-add is enabled globally
        if (!this.settings.enableAutoAdd) {
            return;
        }

        // Check if file is in one of the configured folders
        const shouldAddID = this.settings.autoAddFolders.some((folderPath) => {
            // Empty string means root folder (entire vault)
            if (folderPath === "") {
                return true;
            }
            // Check if file path starts with the folder path
            return (
                file.path.startsWith(folderPath + "/") ||
                file.path === folderPath
            );
        });

        if (!shouldAddID) {
            return;
        }

        // Wait a bit for file to be fully created and any
        // template to be applied
        setTimeout(async () => {
            try {
                const content = await this.app.vault.read(file);

                // Don't add ID if file already has one (e.g., from a template)
                if (!hasID(content)) {
                    const result = await processFile(file, this.app.vault);
                    if (result.success) {
                        console.log(`Auto-added ID to new file: ${file.path}`);
                    }
                }
            } catch (error) {
                console.error("Error in auto-add ID:", error);
            }
        }, 100);
    }

    // TODO(Stage 7): Replace with "Insert template" command
    async addIDToCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice("No active file");
            return;
        }

        if (activeFile.extension !== "md") {
            new Notice("Current file is not a markdown file");
            return;
        }

        const result = await processFile(activeFile, this.app.vault);

        if (result.success) {
            new Notice(result.message);
        } else if (result.alreadyHasID) {
            new Notice(`Note already has ID: ${result.id}`);
        } else {
            new Notice("Failed to add ID: " + result.message);
        }
    }

    // TODO(Stage 7): Replace with "Insert template to all notes in folder" command
    async addIDsToFolder() {
        new FolderSuggestModal(this.app, async (folder) => {
            await processFolder(folder, this.app.vault, this.app);
        }).open();
    }
}

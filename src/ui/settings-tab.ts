/**
 * Settings tab for the Snowflake plugin
 *
 * TODO(Stage 8): Completely rewrite this file to implement the new settings UI
 * with template mappings, file pickers, and visual polish.
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import SnowflakePlugin from '../main';
import { FolderSuggestModal } from './folder-modal';

/**
 * Settings tab for configuring the Snowflake plugin
 */
export class SnowflakeSettingTab extends PluginSettingTab {
    plugin: SnowflakePlugin;

    constructor(app: App, plugin: SnowflakePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Snowflake Settings" });
        containerEl.createEl("p", {
            text: "Configure which folders should automatically add IDs to new notes.",
        });

        // Global toggle for auto-add feature
        new Setting(containerEl)
            .setName("Enable automatic ID addition")
            .setDesc(
                "When enabled, new notes in configured folders will automatically get IDs",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAutoAdd)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAutoAdd = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Folder list section
        containerEl.createEl("h3", {
            text: "Folders with automatic ID addition",
        });

        if (this.plugin.settings.autoAddFolders.length === 0) {
            containerEl.createEl("p", {
                text: "No folders configured. Click 'Add folder' to get started.",
                cls: "setting-item-description",
            });
        }

        // Display each configured folder
        this.plugin.settings.autoAddFolders.forEach((folderPath, index) => {
            new Setting(containerEl)
                .setName(folderPath || "/ (entire vault)")
                .setDesc(
                    `New notes in ${folderPath || "the entire vault"} will get IDs automatically`,
                )
                .addButton((button) =>
                    button.setButtonText("Remove").onClick(async () => {
                        this.plugin.settings.autoAddFolders.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }),
                );
        });

        // Add folder button
        new Setting(containerEl)
            .setName("Add folder")
            .setDesc("Select a folder to enable automatic ID addition")
            .addButton((button) =>
                button.setButtonText("Add folder").onClick(() => {
                    new FolderSuggestModal(this.app, async (folder) => {
                        const folderPath = folder.path;

                        if (
                            this.plugin.settings.autoAddFolders.includes(
                                folderPath,
                            )
                        ) {
                            new Notice("This folder is already in the list");
                            return;
                        }

                        this.plugin.settings.autoAddFolders.push(folderPath);
                        await this.plugin.saveSettings();
                        this.display();

                        new Notice(
                            `Added ${folderPath || "root folder"} to auto-ID list`,
                        );
                    }).open();
                }),
            );
    }
}

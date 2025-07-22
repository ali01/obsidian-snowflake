/**
 * Settings tab for the Snowflake plugin
 *
 * REQ-023: The plugin shall allow users to configure these settings:
 * - templateMappings: Which folders use which templates
 * - defaultTemplate: Fallback template for unmapped folders
 * - enableAutoTemplating: Turn automatic templating on/off
 * - templatesFolder: Where to look for template files
 *
 * REQ-024: When a user adds a folder→template mapping in settings, the plugin
 * shall immediately use it for new files in that folder.
 */

import { App, PluginSettingTab, Setting, Notice, TFile, Modal } from 'obsidian';
import SnowflakePlugin from '../main';
import { FolderSuggestModal } from './folder-modal';
import { TemplateFileSuggestModal } from './template-file-modal';
import { ErrorHandler } from '../error-handler';
import { ErrorContext } from '../types';

/**
 * Settings tab for configuring the Snowflake plugin
 */
export class SnowflakeSettingTab extends PluginSettingTab {
    plugin: SnowflakePlugin;
    private errorHandler: ErrorHandler;

    constructor(app: App, plugin: SnowflakePlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.errorHandler = ErrorHandler.getInstance();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Header
        containerEl.createEl("h1", { text: "Snowflake Template Settings" });
        containerEl.createEl("p", {
            text: "Configure automatic template application for new notes.",
            cls: "setting-item-description"
        });

        // Global Settings Section
        containerEl.createEl("h2", { text: "General Settings" });

        // Enable auto-templating toggle
        new Setting(containerEl)
            .setName("Enable automatic templating")
            .setDesc(
                "When enabled, new notes will automatically have templates applied " +
                "based on their folder location"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAutoTemplating)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAutoTemplating = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Templates folder setting
        new Setting(containerEl)
            .setName("Templates folder")
            .setDesc("The folder where your template files are stored")
            .addText((text) =>
                text
                    .setPlaceholder("Templates")
                    .setValue(this.plugin.settings.templatesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.templatesFolder = value || "Templates";
                        await this.plugin.saveSettings();
                    })
            );

        // Default template setting
        new Setting(containerEl)
            .setName("Default template")
            .setDesc("Template to use for folders without specific mappings (leave empty for none)")
            .addText((text) => {
                text
                    .setPlaceholder("Templates/default.md")
                    .setValue(this.plugin.settings.defaultTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultTemplate = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton((button) =>
                button
                    .setButtonText("Browse")
                    .onClick(() => {
                        new TemplateFileSuggestModal(
                            this.app,
                            this.plugin.settings.templatesFolder,
                            async (file) => {
                                this.plugin.settings.defaultTemplate = file.path;
                                await this.plugin.saveSettings();
                                this.display();
                            }
                        ).open();
                    })
            );

        // Template Mappings Section
        containerEl.createEl("h2", { text: "Folder Template Mappings" });
        containerEl.createEl("p", {
            text: "Configure which template to use for each folder",
            cls: "setting-item-description"
        });

        // Display existing mappings
        const mappings = Object.entries(this.plugin.settings.templateMappings);

        if (mappings.length === 0) {
            containerEl.createEl("p", {
                text: "No folder mappings configured. Click 'Add mapping' to get started.",
                cls: "setting-item-description mod-warning"
            });
        } else {
            // Sort mappings by folder path for better organization
            mappings.sort((a, b) => a[0].localeCompare(b[0]));

            mappings.forEach(([folderPath, templatePath]) => {
                const setting = new Setting(containerEl)
                    .setName(folderPath || "/ (root folder)")
                    .setDesc(templatePath);

                // Add preview button
                setting.addButton((button) =>
                    button
                        .setIcon("eye")
                        .setTooltip("Preview template")
                        .onClick(async () => {
                            await this.previewTemplate(templatePath);
                        })
                );

                // Add remove button
                setting.addButton((button) =>
                    button
                        .setButtonText("Remove")
                        .setWarning()
                        .onClick(async () => {
                            delete this.plugin.settings.templateMappings[folderPath];
                            await this.plugin.saveSettings();
                            this.display();
                            new Notice(`Removed mapping for ${folderPath || "root folder"}`);
                        })
                );
            });
        }

        // Add new mapping
        new Setting(containerEl)
            .setName("Add folder mapping")
            .setDesc("Map a folder to a specific template")
            .addButton((button) =>
                button
                    .setButtonText("Add mapping")
                    .setCta()
                    .onClick(() => {
                        this.showAddMappingDialog();
                    })
            );

        // Help section
        containerEl.createEl("h2", { text: "Template Variables" });
        containerEl.createEl("p", {
            text: "You can use these variables in your templates:",
            cls: "setting-item-description"
        });

        const variableList = containerEl.createEl("ul", {
            cls: "setting-item-description"
        });

        variableList.createEl("li", { text: "{{title}} - The filename without extension" });
        variableList.createEl("li", { text: "{{date}} - Current date (YYYY-MM-DD format)" });
        variableList.createEl("li", { text: "{{time}} - Current time (HH:mm format)" });
        variableList.createEl("li", { text: "{{snowflake_id}} - Unique 10-character ID" });
    }

    /**
     * Show dialog to add a new folder mapping
     */
    private showAddMappingDialog(): void {
        // First, select the folder
        new FolderSuggestModal(this.app, async (folder) => {
            const folderPath = folder.path;

            // Check if already mapped
            if (this.plugin.settings.templateMappings[folderPath] !== undefined) {
                new Notice("This folder already has a template mapping");
                return;
            }

            // Then, select the template
            new TemplateFileSuggestModal(
                this.app,
                this.plugin.settings.templatesFolder,
                async (templateFile) => {
                    // Add the mapping
                    this.plugin.settings.templateMappings[folderPath] = templateFile.path;
                    await this.plugin.saveSettings();
                    this.display();

                    new Notice(
                        `Mapped ${folderPath || "root folder"} to ${templateFile.path}`
                    );
                }
            ).open();
        }).open();
    }

    /**
     * Preview a template file
     */
    private async previewTemplate(templatePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(templatePath);

        if (!file || !(file instanceof TFile)) {
            new Notice(`Template not found: ${templatePath}`);
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            new TemplatePreviewModal(this.app, templatePath, content).open();
        } catch (error) {
            const errorContext: ErrorContext = {
                operation: 'load_template',
                templatePath: templatePath
            };
            this.errorHandler.handleError(error, errorContext);
        }
    }
}

/**
 * Modal for previewing template content
 */
class TemplatePreviewModal extends Modal {
    private templatePath: string;
    private content: string;

    constructor(app: App, templatePath: string, content: string) {
        super(app);
        this.templatePath = templatePath;
        this.content = content;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: `Preview: ${this.templatePath}` });

        // Create a pre element for the content
        const pre = contentEl.createEl("pre", {
            cls: "template-preview-content"
        });

        // Create code element with markdown syntax highlighting
        const code = pre.createEl("code", {
            cls: "language-markdown",
            text: this.content
        });

        // Add some basic styling
        pre.style.maxHeight = "400px";
        pre.style.overflow = "auto";
        pre.style.backgroundColor = "var(--background-secondary)";
        pre.style.padding = "1em";
        pre.style.borderRadius = "4px";

        // Close button
        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
        buttonContainer.createEl("button", {
            text: "Close",
            cls: "mod-cta"
        }).addEventListener("click", () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

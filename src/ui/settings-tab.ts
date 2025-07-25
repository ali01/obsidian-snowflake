/**
 * Settings tab for the Snowflake plugin
 *
 * REQ-023: The plugin shall allow users to configure these settings:
 * - templateMappings: Which folders use which templates
 * - templatesFolder: Where to look for template files
 *
 * REQ-024: When a user adds a folder→template mapping in settings, the plugin
 * shall immediately use it for new files in that folder.
 */

import { PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type SnowflakePlugin from '../main';
import { FolderInputSuggest } from './folder-input-suggest';
import { TemplateMappingModal } from './template-mapping-modal';
import { ConfirmationModal } from './confirmation-modal';
import { TemplatePreviewModal } from './template-preview-modal';
import { ErrorHandler } from '../error-handler';
import type { ErrorContext, TemplateMappingConfig } from '../types';
import type { SnowflakeCommands } from '../commands';

/**
 * Settings tab for configuring the Snowflake plugin
 */
export class SnowflakeSettingTab extends PluginSettingTab {
  plugin: SnowflakePlugin;
  private readonly errorHandler: ErrorHandler;
  private readonly commands: SnowflakeCommands;

  constructor(app: App, plugin: SnowflakePlugin, commands: SnowflakeCommands) {
    super(app, plugin);
    this.plugin = plugin;
    this.errorHandler = ErrorHandler.getInstance();
    this.commands = commands;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.addHeader(containerEl);
    this.addGeneralSettings(containerEl);
    this.addTemplateMappings(containerEl);
    this.addVariableFormatSettings(containerEl);
    this.addHelpSection(containerEl);
  }

  private addHeader(containerEl: HTMLElement): void {
    containerEl.createEl('h1', { text: 'Snowflake Settings' });
    containerEl.createEl('p', {
      text: 'Configure automatic template application for new notes.',
      cls: 'setting-item-description'
    });
  }

  private addGeneralSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'General Settings' });

    this.addTemplatesFolderSetting(containerEl);
  }

  private addTemplatesFolderSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Templates folder')
      .setDesc('The folder where your template files are stored')
      .addText((text) => {
        new FolderInputSuggest(this.app, text.inputEl);
        text
          .setPlaceholder('Templates')
          .setValue(this.plugin.settings.templatesFolder)
          .onChange(async (value) => {
            this.plugin.settings.templatesFolder = value || 'Templates';
            await this.plugin.saveSettings();
          });

        // Prevent auto-focus when opening settings
        setTimeout(() => {
          text.inputEl.blur();
        }, 0);

        return text;
      });
  }

  private addVariableFormatSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Variable Formats' });
    containerEl.createEl('p', {
      text: 'Customize the format for date and time variables in templates',
      cls: 'setting-item-description'
    });

    // Date format setting
    new Setting(containerEl)
      .setName('Date format')
      .setDesc('Format for {{date}} variable (uses moment.js format)')
      .addText((text) => {
        text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat);

        // Add example preview
        const preview = text.inputEl.parentElement?.createDiv({
          cls: 'setting-item-description',
          text: `Preview: ${window.moment().format(this.plugin.settings.dateFormat)}`
        });

        // Update preview on change
        text.onChange(async (value) => {
          const format = value || 'YYYY-MM-DD';
          this.plugin.settings.dateFormat = format;
          await this.plugin.saveSettings();
          if (preview) {
            try {
              preview.textContent = `Preview: ${window.moment().format(format)}`;
            } catch {
              preview.textContent = 'Preview: Invalid format';
            }
          }
        });

        return text;
      });

    // Time format setting
    new Setting(containerEl)
      .setName('Time format')
      .setDesc('Format for {{time}} variable (uses moment.js format)')
      .addText((text) => {
        text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat);

        // Add example preview
        const preview = text.inputEl.parentElement?.createDiv({
          cls: 'setting-item-description',
          text: `Preview: ${window.moment().format(this.plugin.settings.timeFormat)}`
        });

        // Update preview on change
        text.onChange(async (value) => {
          const format = value || 'HH:mm';
          this.plugin.settings.timeFormat = format;
          await this.plugin.saveSettings();
          if (preview) {
            try {
              preview.textContent = `Preview: ${window.moment().format(format)}`;
            } catch {
              preview.textContent = 'Preview: Invalid format';
            }
          }
        });

        return text;
      });

    // Add format reference link
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Common formats: YYYY-MM-DD, DD/MM/YYYY, MMM DD YYYY, HH:mm:ss, h:mm A'
    });
  }

  private addTemplateMappings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Folder Template Mappings' });
    containerEl.createEl('p', {
      text: 'Configure which template to use for each folder',
      cls: 'setting-item-description'
    });

    const mappings = Object.entries(this.plugin.settings.templateMappings);

    if (mappings.length === 0) {
      this.showNoMappingsMessage(containerEl);
    } else {
      this.showExistingMappings(containerEl, mappings);
    }

    this.addNewMappingButton(containerEl);

    // Only show Apply All button if there are 2 or more mappings
    if (mappings.length >= 2) {
      this.addApplyAllButton(containerEl);
    }
  }

  private showNoMappingsMessage(containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: "No folder mappings configured. Click 'Add mapping' to get started.",
      cls: 'setting-item-description mod-warning'
    });
  }

  private showExistingMappings(
    containerEl: HTMLElement,
    mappings: [string, string | TemplateMappingConfig][]
  ): void {
    mappings.sort((a, b) => a[0].localeCompare(b[0]));

    mappings.forEach(([folderPath, config]) => {
      this.createMappingSetting(containerEl, folderPath, config);
    });
  }

  private createMappingSetting(
    containerEl: HTMLElement,
    folderPath: string,
    config: string | TemplateMappingConfig
  ): void {
    // Extract template path and exclusions
    const templatePath = typeof config === 'string' ? config : config.templatePath;
    const excludePatterns = typeof config === 'object' ? config.excludePatterns : undefined;

    // Create setting
    const setting = new Setting(containerEl);

    // Set name with exclusion count if applicable
    const nameEl = setting.nameEl;
    nameEl.createSpan({ text: folderPath || '/ (root folder)' });
    if (excludePatterns && excludePatterns.length > 0) {
      nameEl.createSpan({
        text: ` (${String(excludePatterns.length)} exclusion${excludePatterns.length > 1 ? 's' : ''})`,
        cls: 'snowflake-exclusion-count'
      });
    }

    // Set description to just the template path
    setting.setDesc(templatePath);

    setting.addButton((button) =>
      button
        .setIcon('eye')
        .setTooltip('Preview template')
        .onClick(async () => {
          await this.previewTemplate(templatePath);
        })
    );

    setting.addButton((button) =>
      button
        .setIcon('play')
        .setTooltip('Apply template to all notes in folder')
        .onClick(async () => {
          await this.commands.applyTemplateToFolderPath(folderPath);
        })
    );

    setting.addButton((button) =>
      button
        .setIcon('pencil')
        .setTooltip('Edit mapping')
        .onClick(() => {
          this.showEditMappingDialog(folderPath, config);
        })
    );

    setting.addButton((button) =>
      button
        .setButtonText('Remove')
        .setWarning()
        .onClick(async () => {
          delete this.plugin.settings.templateMappings[folderPath];
          await this.plugin.saveSettings();
          this.display();
          new Notice(`Removed mapping for ${folderPath || 'root folder'}`);
        })
    );
  }

  private addApplyAllButton(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Apply all mappings')
      .setDesc('Apply templates to all mapped folders')
      .addButton((button) =>
        button
          .setButtonText('Apply All')
          .setTooltip('Apply templates to all mapped folders')
          .onClick(() => {
            this.applyAllMappings();
          })
      );
  }

  private addNewMappingButton(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Add folder mapping')
      .setDesc('Map a folder to a specific template')
      .addButton((button) =>
        button
          .setButtonText('Add Mapping')
          .setCta()
          .onClick(() => {
            this.showAddMappingDialog();
          })
      );
  }

  private addHelpSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Template Variables' });
    containerEl.createEl('p', {
      text: 'You can use these variables in your templates:',
      cls: 'setting-item-description'
    });

    const variableList = containerEl.createEl('ul', {
      cls: 'setting-item-description'
    });

    variableList.createEl('li', { text: '{{title}} - The filename without extension' });
    variableList.createEl('li', {
      text: `{{date}} - Current date (using your format: ${this.plugin.settings.dateFormat})`
    });
    variableList.createEl('li', {
      text: `{{time}} - Current time (using your format: ${this.plugin.settings.timeFormat})`
    });
    variableList.createEl('li', { text: '{{snowflake_id}} - Unique 10-character ID' });
  }

  /**
   * Show dialog to add a new folder mapping
   */
  private showAddMappingDialog(): void {
    new TemplateMappingModal(
      this.app,
      this.plugin.settings.templatesFolder,
      (
        folderPath: string,
        templatePath: string,
        excludePatterns?: string[],
        originalFolderPath?: string
      ) => {
        // Check if already mapped (only for new mappings)
        if (!originalFolderPath && folderPath in this.plugin.settings.templateMappings) {
          new Notice('This folder already has a template mapping');
          return;
        }

        // Add the mapping
        if (excludePatterns && excludePatterns.length > 0) {
          this.plugin.settings.templateMappings[folderPath] = {
            templatePath,
            excludePatterns
          };
        } else {
          this.plugin.settings.templateMappings[folderPath] = templatePath;
        }

        void this.plugin.saveSettings();
        this.display();

        new Notice(`Mapped ${folderPath || 'root folder'} to ${templatePath}`);
      }
    ).open();
  }

  /**
   * Show dialog to edit an existing folder mapping
   */
  private showEditMappingDialog(folderPath: string, config: string | TemplateMappingConfig): void {
    new TemplateMappingModal(
      this.app,
      this.plugin.settings.templatesFolder,
      (
        newFolderPath: string,
        templatePath: string,
        excludePatterns?: string[],
        originalFolderPath?: string
      ) => {
        // If folder path changed, check if new path is already mapped
        if (
          originalFolderPath &&
          newFolderPath !== originalFolderPath &&
          newFolderPath in this.plugin.settings.templateMappings
        ) {
          new Notice('This folder already has a template mapping');
          return;
        }

        // Remove old mapping if folder path changed
        if (originalFolderPath && newFolderPath !== originalFolderPath) {
          delete this.plugin.settings.templateMappings[originalFolderPath];
        }

        // Update the mapping
        if (excludePatterns && excludePatterns.length > 0) {
          this.plugin.settings.templateMappings[newFolderPath] = {
            templatePath,
            excludePatterns
          };
        } else {
          this.plugin.settings.templateMappings[newFolderPath] = templatePath;
        }

        void this.plugin.saveSettings();
        this.display();

        new Notice(`Updated mapping for ${newFolderPath || 'root folder'}`);
      },
      {
        folderPath,
        config
      }
    ).open();
  }

  /**
   * Preview a template file
   */
  private async previewTemplate(templatePath: string): Promise<void> {
    // Resolve the template path to include the templates folder if needed
    const fullPath = templatePath.startsWith(this.plugin.settings.templatesFolder + '/')
      ? templatePath
      : `${this.plugin.settings.templatesFolder}/${templatePath}`;

    const file = this.app.vault.getAbstractFileByPath(fullPath);

    if (!file || !(file instanceof TFile)) {
      new Notice(`Template not found: ${fullPath}`);
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

  /**
   * Apply templates to all mapped folders
   */
  private applyAllMappings(): void {
    const mappings = Object.entries(this.plugin.settings.templateMappings);

    if (mappings.length === 0) {
      new Notice('No template mappings configured');
      return;
    }

    // Show confirmation dialog
    new ConfirmationModal(
      this.app,
      'Apply All Template Mappings',
      `This will apply templates to all notes in ${String(mappings.length)} mapped folder${mappings.length > 1 ? 's' : ''}. Are you sure you want to continue?`,
      () => {
        // Apply templates to all mapped folders without individual confirmations
        void (async (): Promise<void> => {
          let totalSuccess = 0;
          let totalFiles = 0;

          // Process all folders without individual confirmations
          for (const [folderPath] of mappings) {
            const result = await this.commands.applyTemplateToFolderPath(folderPath, true);
            if (result) {
              totalSuccess += result.success;
              totalFiles += result.total;
            }
          }

          // Show final completion notice
          if (totalFiles === 0) {
            new Notice('No markdown files found in selected folders');
          } else if (totalSuccess === totalFiles) {
            new Notice(`Templates applied to ${String(totalSuccess)} notes`);
          } else {
            new Notice(
              `Templates applied to ${String(totalSuccess)} of ${String(totalFiles)} notes`
            );
          }
        })();
      },
      () => {
        // User cancelled - do nothing
      }
    ).open();
  }
}

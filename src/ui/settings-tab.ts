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

import { PluginSettingTab, Setting, Notice, TFile, Modal } from 'obsidian';
import type { App } from 'obsidian';
// eslint-disable-next-line @typescript-eslint/naming-convention
import type SnowflakePlugin from '../main';
import { FolderInputSuggest } from './folder-input-suggest';
import { AddMappingModal } from './add-mapping-modal';
import { ConfirmationModal } from './confirmation-modal';
import { ErrorHandler } from '../error-handler';
import type { ErrorContext } from '../types';
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
        return text;
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

  private showExistingMappings(containerEl: HTMLElement, mappings: [string, string][]): void {
    mappings.sort((a, b) => a[0].localeCompare(b[0]));

    mappings.forEach(([folderPath, templatePath]) => {
      this.createMappingSetting(containerEl, folderPath, templatePath);
    });
  }

  private createMappingSetting(
    containerEl: HTMLElement,
    folderPath: string,
    templatePath: string
  ): void {
    const setting = new Setting(containerEl)
      .setName(folderPath || '/ (root folder)')
      .setDesc(templatePath);

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
        .setButtonText('Remove')
        .setWarning()
        .onClick(async () => {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
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
    variableList.createEl('li', { text: '{{date}} - Current date (YYYY-MM-DD format)' });
    variableList.createEl('li', { text: '{{time}} - Current time (HH:mm format)' });
    variableList.createEl('li', { text: '{{snowflake_id}} - Unique 10-character ID' });
  }

  /**
   * Show dialog to add a new folder mapping
   */
  private showAddMappingDialog(): void {
    new AddMappingModal(
      this.app,
      this.plugin.settings.templatesFolder,
      (folderPath: string, templatePath: string) => {
        // Check if already mapped
        if (folderPath in this.plugin.settings.templateMappings) {
          new Notice('This folder already has a template mapping');
          return;
        }

        // Add the mapping
        this.plugin.settings.templateMappings[folderPath] = templatePath;
        // eslint-disable-next-line no-void
        void this.plugin.saveSettings();
        this.display();

        new Notice(`Mapped ${folderPath || 'root folder'} to ${templatePath}`);
      }
    ).open();
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
        // eslint-disable-next-line no-void
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

/**
 * Modal for previewing template content
 */
class TemplatePreviewModal extends Modal {
  private readonly templatePath: string;
  private readonly content: string;

  constructor(app: App, templatePath: string, content: string) {
    super(app);
    this.templatePath = templatePath;
    this.content = content;
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: `Preview: ${this.templatePath}` });

    // Create a pre element for the content
    const pre = contentEl.createEl('pre', {
      cls: 'template-preview-content'
    });

    // Create code element with markdown syntax highlighting
    pre.createEl('code', {
      cls: 'language-markdown',
      text: this.content
    });

    // Add some basic styling
    pre.style.maxHeight = '400px';
    pre.style.overflow = 'auto';
    pre.style.backgroundColor = 'var(--background-secondary)';
    pre.style.padding = '1em';
    pre.style.borderRadius = '4px';

    // Close button
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer
      .createEl('button', {
        text: 'Close',
        cls: 'mod-cta'
      })
      .addEventListener('click', () => {
        this.close();
      });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

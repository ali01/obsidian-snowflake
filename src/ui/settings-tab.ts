/**
 * Settings tab for the Snowflake plugin.
 *
 * Templates and per-folder excludes are declared by convention via
 * `.schema.yaml` files in folders, so the only user-tunable knobs left are
 * the date and time variable formats.
 */

import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type SnowflakePlugin from '../main';

export class SnowflakeSettingTab extends PluginSettingTab {
  public plugin: SnowflakePlugin;

  constructor(app: App, plugin: SnowflakePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.addHeader(containerEl);
    this.addVariableFormatSettings(containerEl);
    this.addHelpSection(containerEl);
  }

  private addHeader(containerEl: HTMLElement): void {
    containerEl.createEl('h1', { text: 'Snowflake Settings' });
    containerEl.createEl('p', {
      text:
        'Snowflake applies templates to new notes from a `.schema.yaml` (or ' +
        '`.schema/schema.yaml`) in their folder, plus any ancestor folders. ' +
        'Add one to a folder to make it Snowflake-managed, including ' +
        'pattern-routed templates and per-folder file excludes.',
      cls: 'setting-item-description'
    });
  }

  private addVariableFormatSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Variable Formats' });
    containerEl.createEl('p', {
      text: 'Customize the format for date and time variables in templates',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Date format')
      .setDesc('Format for {{date}} variable (uses moment.js format)')
      .addText((text) => {
        text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat);

        const preview = text.inputEl.parentElement?.createDiv({
          cls: 'setting-item-description',
          text: `Preview: ${window.moment().format(this.plugin.settings.dateFormat)}`
        });

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

    new Setting(containerEl)
      .setName('Time format')
      .setDesc('Format for {{time}} variable (uses moment.js format)')
      .addText((text) => {
        text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat);

        const preview = text.inputEl.parentElement?.createDiv({
          cls: 'setting-item-description',
          text: `Preview: ${window.moment().format(this.plugin.settings.timeFormat)}`
        });

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

    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Common formats: YYYY-MM-DD, DD/MM/YYYY, MMM DD YYYY, HH:mm:ss, h:mm A'
    });
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

    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text:
        'File excludes: add an `exclude:` list to any `.schema.yaml` to skip ' +
        'matching files in that subtree (replaces the old global exclude ' +
        'patterns setting).'
    });
  }
}

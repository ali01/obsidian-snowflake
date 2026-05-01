/**
 * Settings tab for the Snowflake plugin.
 *
 * Templates are now declared by convention via SCHEMA.md files in folders, so
 * there's nothing folder-specific to configure here. The tab keeps only:
 *   1. Global exclude patterns
 *   2. Date / time variable formats
 *   3. Variable reference
 */

import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type SnowflakePlugin from '../main';
import { processExclusionPatterns } from '../pattern-matcher';

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
    this.addGlobalExcludeSettings(containerEl);
    this.addVariableFormatSettings(containerEl);
    this.addHelpSection(containerEl);
  }

  private addHeader(containerEl: HTMLElement): void {
    containerEl.createEl('h1', { text: 'Snowflake Settings' });
    containerEl.createEl('p', {
      text:
        'Snowflake applies templates to new notes from a SCHEMA.md file ' +
        'in their folder (and any ancestor folders, root → leaf). ' +
        'Add a SCHEMA.md to any folder to make it Snowflake-managed.',
      cls: 'setting-item-description'
    });
  }

  private addGlobalExcludeSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Global Exclude Patterns' });
    containerEl.createEl('p', {
      text: 'Files matching these patterns are skipped by Snowflake. One pattern per line.',
      cls: 'setting-item-description'
    });

    const patterns = this.plugin.settings.globalExcludePatterns;
    const currentValue = patterns.length > 0 ? patterns.join('\n') : '';

    new Setting(containerEl)
      .setName('Exclude patterns')
      .setDesc(
        'Glob patterns: * matches characters,' +
          ' ** matches directories,' +
          ' ? matches single character'
      )
      .addTextArea((text) => {
        text
          .setPlaceholder('*.tmp\n_archive/**\n~*.md')
          .setValue(currentValue)
          .onChange(async (value) => {
            const result = processExclusionPatterns(value);
            this.plugin.settings.globalExcludePatterns = result.patterns;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 30;
        return text;
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
      text: 'You can use these variables in your SCHEMA.md templates:',
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
}

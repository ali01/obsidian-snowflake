/**
 * Snowflake Plugin for Obsidian
 *
 * Applies templates to new notes by walking the folder hierarchy root → leaf
 * and consulting each ancestor folder's `.schema.yaml` (or
 * `.schema/schema.yaml`) for routing rules.
 *
 * Author: Ali Yahya
 */

import { Plugin } from 'obsidian';
import type { SnowflakeSettings } from './types';
import { SnowflakeSettingTab } from './ui/settings-tab';
import { migrateSettings, areSettingsValid, cleanSettings } from './settings-utils';
import { FileCreationHandler } from './file-creation-handler';
import { SnowflakeCommands } from './commands';

export default class SnowflakePlugin extends Plugin {
  public settings!: SnowflakeSettings;
  private fileCreationHandler?: FileCreationHandler;
  private commands?: SnowflakeCommands;

  public async onload(): Promise<void> {
    await this.loadSettings();

    this.commands = new SnowflakeCommands(this, this.settings);
    this.commands.registerCommands();

    this.addSettingTab(new SnowflakeSettingTab(this.app, this));

    this.fileCreationHandler = new FileCreationHandler(this, this.app.vault, this.settings);

    // Only start listening after workspace is ready, so we don't templatify
    // existing files during startup.
    this.app.workspace.onLayoutReady(() => {
      this.fileCreationHandler?.start();
    });
  }

  public onunload(): void {
    if (this.fileCreationHandler !== undefined) {
      this.fileCreationHandler.stop();
    }
  }

  public async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as unknown;

    if (areSettingsValid(data)) {
      this.settings = data;
    } else {
      this.settings = migrateSettings(data);
    }

    this.validateSettings();

    // Save back so legacy fields (templateMappings, templatesFolder, ...) get
    // dropped from data.json on first load after upgrade.
    await this.saveSettings();
  }

  public async saveSettings(): Promise<void> {
    this.settings = cleanSettings(this.settings);
    this.validateSettings();

    const configDir = this.manifest.dir;
    if (configDir !== undefined && configDir !== '') {
      const configPath = `${configDir}/data.json`;
      const content = JSON.stringify(this.settings, null, 2) + '\n';
      await this.app.vault.adapter.write(configPath, content);
    } else {
      await this.saveData(this.settings);
    }

    if (this.fileCreationHandler !== undefined) {
      this.fileCreationHandler.updateSettings(this.settings);
    }

    if (this.commands !== undefined) {
      this.commands.updateSettings(this.settings);
    }
  }

  public validateSettings(): void {
    if (typeof this.settings.dateFormat !== 'string' || this.settings.dateFormat.trim() === '') {
      this.settings.dateFormat = 'YYYY-MM-DD';
    }
    if (typeof this.settings.timeFormat !== 'string' || this.settings.timeFormat.trim() === '') {
      this.settings.timeFormat = 'HH:mm';
    }
  }
}

export { SnowflakePlugin };

/**
 * Schema locator
 *
 * For a given folder, finds the `.schema.yaml` (flat form) or
 * `.schema/schema.yaml` (folder form) that governs files in that folder.
 *
 * Resolution rule: folder form wins when both exist; a console warning is
 * emitted once per directory where the conflict occurs.
 */

import { TFile } from 'obsidian';
import type { Vault } from 'obsidian';
import { SCHEMA_FILE_NAME, SCHEMA_FOLDER_NAME, SCHEMA_FOLDER_FILE_NAME } from './constants';

export interface SchemaLocation {
  /** Path of the schema file inside the vault. */
  schemaPath: string;
  /** Folder that the schema "owns" — used for relative pattern matching. */
  matchAnchor: string;
  /**
   * Folder for resolving relative external template paths. Equals
   * `matchAnchor` for the flat form; equals `matchAnchor + '/.schema'` for
   * the folder form (so `./web.md` resolves inside `.schema/`).
   */
  templateAnchor: string;
}

const warnedConflicts = new Set<string>();

export function findSchemaFile(vault: Vault, folderPath: string): SchemaLocation | null {
  const dirPrefix = folderPath === '' || folderPath === '/' ? '' : folderPath + '/';
  const flatPath = dirPrefix + SCHEMA_FILE_NAME;
  const folderFilePath = dirPrefix + SCHEMA_FOLDER_NAME + '/' + SCHEMA_FOLDER_FILE_NAME;

  const flatFile = vault.getAbstractFileByPath(flatPath);
  const folderFile = vault.getAbstractFileByPath(folderFilePath);

  const flatExists = flatFile instanceof TFile;
  const folderExists = folderFile instanceof TFile;

  if (folderExists && flatExists) {
    const key = folderPath || '/';
    if (!warnedConflicts.has(key)) {
      warnedConflicts.add(key);
      console.warn(
        `Snowflake: both ${flatPath} and ${folderFilePath} exist; using the ` +
          `${SCHEMA_FOLDER_NAME}/ form. Remove one to silence this warning.`
      );
    }
  }

  if (folderExists) {
    return {
      schemaPath: folderFilePath,
      matchAnchor: folderPath === '/' ? '' : folderPath,
      templateAnchor: dirPrefix + SCHEMA_FOLDER_NAME
    };
  }

  if (flatExists) {
    return {
      schemaPath: flatPath,
      matchAnchor: folderPath === '/' ? '' : folderPath,
      templateAnchor: folderPath === '/' ? '' : folderPath
    };
  }

  return null;
}

/** Test-only: clear the de-dup cache between tests. */
export function _resetWarningCacheForTests(): void {
  warnedConflicts.clear();
}

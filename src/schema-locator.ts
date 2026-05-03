/**
 * Schema locator
 *
 * For a given folder, finds the schema file that governs files in that folder.
 * Two forms are supported, in precedence order:
 *
 *   1. `.schema/schema.yaml` (folder form) — can bundle templates alongside.
 *   2. `.schema.yaml`        (flat YAML)   — single-file form.
 *
 * Higher-precedence form wins when both coexist; a console warning is emitted
 * once per directory where the conflict occurs.
 *
 * Existence checks go through `vault.adapter` rather than the indexed file
 * tree because Obsidian's high-level vault API does not expose dotfiles, and
 * every schema form lives in dotfile paths.
 */

import type { Vault } from 'obsidian';
import {
  SCHEMA_FILE_NAME,
  SCHEMA_FOLDER_NAME,
  SCHEMA_FOLDER_FILE_NAME
} from './constants';

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

export async function findSchemaFile(
  vault: Vault,
  folderPath: string
): Promise<SchemaLocation | null> {
  const dirPrefix = folderPath === '' || folderPath === '/' ? '' : folderPath + '/';
  const folderFilePath = dirPrefix + SCHEMA_FOLDER_NAME + '/' + SCHEMA_FOLDER_FILE_NAME;
  const flatPath = dirPrefix + SCHEMA_FILE_NAME;

  const [folderExists, flatExists] = await Promise.all([
    vault.adapter.exists(folderFilePath),
    vault.adapter.exists(flatPath)
  ]);

  if (folderExists && flatExists) {
    const key = folderPath || '/';
    if (!warnedConflicts.has(key)) {
      warnedConflicts.add(key);
      console.warn(
        `Snowflake: both ${folderFilePath} and ${flatPath} exist; ` +
          `using ${folderFilePath}. Remove the other to silence this warning.`
      );
    }
  }

  const matchAnchor = folderPath === '/' ? '' : folderPath;

  if (folderExists) {
    return {
      schemaPath: folderFilePath,
      matchAnchor,
      templateAnchor: dirPrefix + SCHEMA_FOLDER_NAME
    };
  }

  if (flatExists) {
    return {
      schemaPath: flatPath,
      matchAnchor,
      templateAnchor: matchAnchor
    };
  }

  return null;
}

/** Test-only: clear the de-dup cache between tests. */
export function _resetWarningCacheForTests(): void {
  warnedConflicts.clear();
}

/**
 * Schema locator
 *
 * For a given folder, finds the schema file that governs files in that folder.
 * Three forms are supported, in precedence order:
 *
 *   1. `.schema/schema.yaml` (folder form) — full power; can bundle templates.
 *   2. `.schema.yaml`        (flat YAML)   — full power.
 *   3. `.schema.md`          (markdown)    — shorthand: the file IS the
 *                                            catch-all template applied to
 *                                            every new note in the folder.
 *
 * Higher-precedence form wins when multiple coexist; a console warning is
 * emitted once per directory where the conflict occurs.
 *
 * Existence checks go through `vault.adapter` rather than the indexed file
 * tree because Obsidian's high-level vault API does not expose dotfiles, and
 * every schema form lives in dotfile paths.
 */

import type { Vault } from 'obsidian';
import {
  SCHEMA_FILE_NAME,
  SCHEMA_MD_FILE_NAME,
  SCHEMA_FOLDER_NAME,
  SCHEMA_FOLDER_FILE_NAME
} from './constants';

export interface SchemaLocation {
  /** Path of the schema file inside the vault. */
  schemaPath: string;
  /**
   * `'yaml'` — the file is parsed as a `SchemaConfig`.
   * `'markdown'` — the whole file is the catch-all template.
   */
  kind: 'yaml' | 'markdown';
  /** Folder that the schema "owns" — used for relative pattern matching. */
  matchAnchor: string;
  /**
   * Folder for resolving relative external template paths. Equals
   * `matchAnchor` for the flat and markdown forms; equals
   * `matchAnchor + '/.schema'` for the folder form (so `./web.md` resolves
   * inside `.schema/`).
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
  const mdPath = dirPrefix + SCHEMA_MD_FILE_NAME;

  const [folderExists, flatExists, mdExists] = await Promise.all([
    vault.adapter.exists(folderFilePath),
    vault.adapter.exists(flatPath),
    vault.adapter.exists(mdPath)
  ]);

  const present: string[] = [];
  if (folderExists) present.push(folderFilePath);
  if (flatExists) present.push(flatPath);
  if (mdExists) present.push(mdPath);

  if (present.length > 1) {
    const key = folderPath || '/';
    if (!warnedConflicts.has(key)) {
      warnedConflicts.add(key);
      console.warn(
        `Snowflake: multiple schema forms exist (${present.join(', ')}); ` +
          `using ${present[0]}. Remove the others to silence this warning.`
      );
    }
  }

  const matchAnchor = folderPath === '/' ? '' : folderPath;

  if (folderExists) {
    return {
      schemaPath: folderFilePath,
      kind: 'yaml',
      matchAnchor,
      templateAnchor: dirPrefix + SCHEMA_FOLDER_NAME
    };
  }

  if (flatExists) {
    return {
      schemaPath: flatPath,
      kind: 'yaml',
      matchAnchor,
      templateAnchor: matchAnchor
    };
  }

  if (mdExists) {
    return {
      schemaPath: mdPath,
      kind: 'markdown',
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

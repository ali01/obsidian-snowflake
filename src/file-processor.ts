/**
 * File processing module for adding IDs to notes
 *
 * TODO(Stage 5): Remove this entire file when implementing the Template Loader & Applicator.
 * This functionality will be replaced by the new template processing system.
 */

import { TFile, TFolder, Vault, App, Notice } from 'obsidian';
import { ProcessResult } from './types'; // TODO(Stage 5): Remove ProcessResult
import { hasID, extractID, addIDToContent } from './frontmatter';
import { generateNanoID } from './nanoid';

/**
 * Process a single file to add an ID
 *
 * @param file - The file to process
 * @param vault - The Obsidian vault instance
 * @returns Processing result
 */
export async function processFile(file: TFile, vault: Vault): Promise<ProcessResult> {
    try {
        // Read current file content
        const content = await vault.read(file);

        // Check if file already has an ID
        if (hasID(content)) {
            const existingID = extractID(content);
            return {
                success: false,
                alreadyHasID: true,
                message: `Already has ID: ${existingID}`,
                id: existingID || undefined,
            };
        }

        // Generate new ID
        const id = generateNanoID();

        // Add ID to content
        const newContent = addIDToContent(content, id);

        // Save modified content back to file
        await vault.modify(file, newContent);

        return {
            success: true,
            message: `Added ID: ${id}`,
            id: id,
        };
    } catch (error) {
        console.error(`Error processing file ${file.path}:`, error);
        return {
            success: false,
            error: true,
            message: `Failed to process: ${(error as Error).message}`,
        };
    }
}

/**
 * Process all markdown files in a folder
 *
 * @param folder - The folder to process
 * @param vault - The Obsidian vault instance
 * @param app - The Obsidian app instance
 */
export async function processFolder(folder: TFolder, vault: Vault, app: App): Promise<void> {
    const files: TFile[] = [];

    // Recursively collect all markdown files
    function collectFiles(folder: TFolder): void {
        for (const child of folder.children) {
            if (child instanceof TFolder) {
                // It's a subfolder, recurse
                collectFiles(child);
            } else if (child instanceof TFile && child.extension === "md") {
                // It's a markdown file, add to list
                files.push(child);
            }
        }
    }

    collectFiles(folder);

    if (files.length === 0) {
        new Notice("No markdown files found in this folder");
        return;
    }

    // Show starting notification
    new Notice(`Processing ${files.length} files...`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Process each file
    for (const file of files) {
        const result = await processFile(file, vault);

        if (result.success) {
            processed++;
        } else if (result.alreadyHasID) {
            skipped++;
        } else if (result.error) {
            errors++;
        }
    }

    // Show summary
    const summary: string[] = [`Processed ${processed} files`];
    if (skipped > 0) summary.push(`${skipped} already had IDs`);
    if (errors > 0) summary.push(`${errors} errors`);

    new Notice(summary.join(", "));
}

const { Plugin, Notice } = require("obsidian");

/**
 * Nano ID generator - creates URL-safe unique identifiers
 * Based on the Nano ID algorithm for collision-resistant IDs
 */
class NanoID {
    // URL-safe characters (no ambiguous characters)
    static alphabet =
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

    /**
     * Generate a Nano ID of specified length
     * @param {number} size - Length of the ID (default: 12)
     * @returns {string} - Generated Nano ID
     */
    static generate(size = 10) {
        let id = "";
        // Use crypto.getRandomValues for cryptographically secure randomness
        const bytes = new Uint8Array(size);
        crypto.getRandomValues(bytes);

        // Convert random bytes to characters from our alphabet
        for (let i = 0; i < size; i++) {
            // Use modulo to map byte value to alphabet index
            id += this.alphabet[bytes[i] % this.alphabet.length];
        }

        return id;
    }
}

/**
 * Snowflake Plugin - Adds unique IDs to Obsidian notes
 */
class SnowflakePlugin extends Plugin {
    async onload() {
        console.log("Loading Snowflake plugin");

        // Register event handler for new file creation
        this.registerEvent(
            this.app.vault.on("create", async (file) => {
                // Only process markdown files
                if (file.extension === "md") {
                    // Small delay to ensure file is fully created
                    setTimeout(() => this.addIDToFile(file), 100);
                }
            }),
        );

        // Add command to add ID to current note
        this.addCommand({
            id: "add-id-to-current-note",
            name: "Add ID to current note",
            editorCallback: (editor, view) => {
                this.addIDToCurrentNote(editor, view);
            },
        });

        // Add command to add IDs to all notes
        this.addCommand({
            id: "add-ids-to-all-notes",
            name: "Add IDs to all notes in vault",
            callback: () => {
                this.addIDsToAllNotes();
            },
        });
    }

    /**
     * Check if content has an ID in frontmatter
     */
    hasID(content) {
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
        const match = content.match(frontmatterRegex);

        if (!match) return false;

        // Check if frontmatter contains an id field
        const frontmatter = match[1];
        return /^id:\s*.+$/m.test(frontmatter);
    }

    /**
     * Extract ID from content if it exists
     */
    extractID(content) {
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
        const match = content.match(frontmatterRegex);

        if (!match) return null;

        const idMatch = match[1].match(/^id:\s*(.+)$/m);
        return idMatch ? idMatch[1].trim() : null;
    }

    /**
     * Add ID to content
     */
    addIDToContent(content, id) {
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
        const match = content.match(frontmatterRegex);

        if (match) {
            // Add ID to existing frontmatter
            const frontmatter = match[1];
            const newFrontmatter = frontmatter + `\nid: ${id}`;
            return content.replace(match[0], `---\n${newFrontmatter}\n---`);
        } else {
            // Create new frontmatter with ID
            return `---\nid: ${id}\n---\n\n${content}`;
        }
    }

    /**
     * Add ID to a file
     */
    async addIDToFile(file) {
        try {
            const content = await this.app.vault.read(file);

            // Check if already has ID
            if (this.hasID(content)) {
                return;
            }

            // Generate new Nano ID
            const id = NanoID.generate();

            // Add ID to content
            const newContent = this.addIDToContent(content, id);

            // Write back to file
            await this.app.vault.modify(file, newContent);

            console.log(`Added ID ${id} to ${file.path}`);
        } catch (error) {
            console.error(`Error adding ID to ${file.path}:`, error);
        }
    }

    /**
     * Add ID to currently active note
     */
    async addIDToCurrentNote(editor, view) {
        const file = view.file;
        if (!file) {
            new Notice("No active file");
            return;
        }

        const content = editor.getValue();

        // Check if already has ID
        if (this.hasID(content)) {
            const existingID = this.extractID(content);
            new Notice(`Note already has ID: ${existingID}`);
            return;
        }

        // Generate new ID
        const id = NanoID.generate();

        // Add to content
        const newContent = this.addIDToContent(content, id);

        // Update editor
        editor.setValue(newContent);

        new Notice(`Added ID: ${id}`);
    }

    /**
     * Add IDs to all notes in vault
     */
    async addIDsToAllNotes() {
        const files = this.app.vault.getMarkdownFiles();
        const totalFiles = files.length;
        let processedCount = 0;
        let addedCount = 0;

        // Create progress notice
        const progressNotice = new Notice(
            `Processing ${totalFiles} files...`,
            0,
        );

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);

                // Skip if already has ID
                if (!this.hasID(content)) {
                    const id = NanoID.generate();
                    const newContent = this.addIDToContent(content, id);
                    await this.app.vault.modify(file, newContent);
                    addedCount++;
                }

                processedCount++;

                // Update progress every 10 files
                if (
                    processedCount % 10 === 0 ||
                    processedCount === totalFiles
                ) {
                    progressNotice.setMessage(
                        `Processing: ${processedCount}/${totalFiles} files... (${addedCount} IDs added)`,
                    );
                }
            } catch (error) {
                console.error(`Error processing ${file.path}:`, error);
            }
        }

        // Hide progress notice
        progressNotice.hide();

        // Show completion notice
        new Notice(
            `✅ Completed! Added IDs to ${addedCount} of ${totalFiles} notes.`,
        );
    }

    onunload() {
        console.log("Unloading Snowflake plugin");
    }
}

module.exports = SnowflakePlugin;

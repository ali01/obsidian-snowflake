/**
 * Snowflake Plugin for Obsidian
 *
 * This plugin automatically adds unique IDs to notes in their frontmatter.
 * IDs are generated using the Nano ID algorithm for collision resistance.
 *
 * Features:
 * - Automatic ID addition to new notes in configured folders
 * - Manual command to add ID to current note
 * - Bulk command to add IDs to all notes in a folder
 * - Configurable folders for automatic ID addition
 *
 * Author: Ali Yahya
 */

const {
    Plugin,
    Notice,
    FuzzySuggestModal,
    PluginSettingTab,
    Setting,
} = require("obsidian");

// ===== CONSTANTS MODULE =====
const DEFAULT_SETTINGS = {
    // Array of folder paths where auto-ID is enabled
    // Empty array means no automatic ID addition
    autoAddFolders: [],

    // Global toggle for auto-add feature
    // Even if folders are configured, this can disable the feature
    enableAutoAdd: true,
};

// ===== NANO ID MODULE =====
class NanoID {
    // Alphabet of 62 alphanumeric characters
    // Includes: lowercase, uppercase, numbers
    // Excludes: Special characters (no dashes or underscores)
    static alphabet =
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    /**
     * Generate a cryptographically secure random ID
     *
     * @param {number} size - Length of ID (default: 10 characters)
     * @returns {string} - Generated ID like "x8K2n5pQ7A"
     */
    static generate(size = 10) {
        let id = "";

        // crypto.getRandomValues provides cryptographically strong random values
        const bytes = new Uint8Array(size);
        crypto.getRandomValues(bytes);

        // Convert each random byte to a character
        for (let i = 0; i < size; i++) {
            // Modulo operation maps byte value (0-255) to alphabet index (0-61)
            id += this.alphabet[bytes[i] % this.alphabet.length];
        }

        return id;
    }
}

// ===== FRONTMATTER UTILITIES MODULE =====
// Regular expression to match YAML frontmatter block
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content) {
    const match = content.match(FRONTMATTER_REGEX);
    return match
        ? { exists: true, content: match[1], fullMatch: match[0] }
        : { exists: false };
}

/**
 * Check if content already has an ID in frontmatter
 */
function hasID(content) {
    const fm = parseFrontmatter(content);
    return fm.exists && /^id:\s*.+$/m.test(fm.content);
}

/**
 * Extract the ID value from content
 */
function extractID(content) {
    const fm = parseFrontmatter(content);
    if (!fm.exists) return null;

    const idMatch = fm.content.match(/^id:\s*(.+)$/m);
    return idMatch ? idMatch[1].trim() : null;
}

/**
 * Add an ID to content's frontmatter
 */
function addIDToContent(content, id) {
    const fm = parseFrontmatter(content);

    if (fm.exists) {
        // Append ID to existing frontmatter
        const newFrontmatter = fm.content + `\nid: ${id}`;
        return content.replace(fm.fullMatch, `---\n${newFrontmatter}\n---`);
    } else {
        // No frontmatter exists - create it at the start
        return `---\nid: ${id}\n---\n\n${content}`;
    }
}

// ===== FILE PROCESSOR MODULE =====
/**
 * Process a single file to add an ID
 */
async function processFile(file, vault) {
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
                id: existingID,
            };
        }

        // Generate new ID
        const id = NanoID.generate();

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
            message: `Failed to process: ${error.message}`,
        };
    }
}

/**
 * Process all markdown files in a folder
 */
async function processFolder(folder, vault, app) {
    const files = [];

    // Recursively collect all markdown files
    function collectFiles(folder) {
        for (const child of folder.children) {
            if (child.children) {
                // It's a subfolder, recurse
                collectFiles(child);
            } else if (child.extension === "md") {
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
    const summary = [`Processed ${processed} files`];
    if (skipped > 0) summary.push(`${skipped} already had IDs`);
    if (errors > 0) summary.push(`${errors} errors`);

    new Notice(summary.join(", "));
}

// ===== FOLDER MODAL MODULE =====
class FolderSuggestModal extends FuzzySuggestModal {
    constructor(app, onChoose) {
        super(app);
        this.onChoose = onChoose;
    }

    getItems() {
        const folders = [];
        const rootFolder = this.app.vault.getRoot();
        folders.push(rootFolder);

        const addFolders = (folder) => {
            for (const child of folder.children) {
                if (child.children) {
                    folders.push(child);
                    addFolders(child);
                }
            }
        };

        addFolders(rootFolder);
        return folders;
    }

    getItemText(folder) {
        return folder.path || "/";
    }

    onChooseItem(folder, evt) {
        this.onChoose(folder);
    }
}

// ===== SETTINGS TAB MODULE =====
class SnowflakeSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Snowflake Settings" });
        containerEl.createEl("p", {
            text: "Configure which folders should automatically add IDs to new notes.",
        });

        // Global toggle for auto-add feature
        new Setting(containerEl)
            .setName("Enable automatic ID addition")
            .setDesc(
                "When enabled, new notes in configured folders will automatically get IDs",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAutoAdd)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAutoAdd = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Folder list section
        containerEl.createEl("h3", {
            text: "Folders with automatic ID addition",
        });

        if (this.plugin.settings.autoAddFolders.length === 0) {
            containerEl.createEl("p", {
                text: "No folders configured. Click 'Add folder' to get started.",
                cls: "setting-item-description",
            });
        }

        // Display each configured folder
        this.plugin.settings.autoAddFolders.forEach((folderPath, index) => {
            new Setting(containerEl)
                .setName(folderPath || "/ (entire vault)")
                .setDesc(
                    `New notes in ${folderPath || "the entire vault"} will get IDs automatically`,
                )
                .addButton((button) =>
                    button.setButtonText("Remove").onClick(async () => {
                        this.plugin.settings.autoAddFolders.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }),
                );
        });

        // Add folder button
        new Setting(containerEl)
            .setName("Add folder")
            .setDesc("Select a folder to enable automatic ID addition")
            .addButton((button) =>
                button.setButtonText("Add folder").onClick(() => {
                    new FolderSuggestModal(this.app, async (folder) => {
                        const folderPath = folder.path;

                        if (
                            this.plugin.settings.autoAddFolders.includes(
                                folderPath,
                            )
                        ) {
                            new Notice("This folder is already in the list");
                            return;
                        }

                        this.plugin.settings.autoAddFolders.push(folderPath);
                        await this.plugin.saveSettings();
                        this.display();

                        new Notice(
                            `Added ${folderPath || "root folder"} to auto-ID list`,
                        );
                    }).open();
                }),
            );
    }
}

// ===== MAIN PLUGIN CLASS =====
class SnowflakePlugin extends Plugin {
    async onload() {
        console.log("Loading Snowflake plugin");

        // Load saved settings or use defaults
        await this.loadSettings();

        // Add settings tab to Obsidian settings
        this.addSettingTab(new SnowflakeSettingTab(this.app, this));

        // Register command: Add ID to current note
        this.addCommand({
            id: "add-id-to-current-note",
            name: "Add ID to current note",
            callback: () => this.addIDToCurrentNote(),
        });

        // Register command: Add IDs to all notes in a folder
        this.addCommand({
            id: "add-ids-to-folder",
            name: "Add IDs to all notes in folder",
            callback: () => this.addIDsToFolder(),
        });

        // Event handler: Automatically add ID when creating new files
        this.registerEvent(
            this.app.vault.on("create", (file) => {
                // Only process markdown files
                if (file.extension === "md") {
                    this.handleFileCreate(file);
                }
            }),
        );
    }

    onunload() {
        console.log("Unloading Snowflake plugin");
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async handleFileCreate(file) {
        // Check if auto-add is enabled globally
        if (!this.settings.enableAutoAdd) {
            return;
        }

        // Check if file is in one of the configured folders
        const shouldAddID = this.settings.autoAddFolders.some((folderPath) => {
            // Empty string means root folder (entire vault)
            if (folderPath === "") {
                return true;
            }
            // Check if file path starts with the folder path
            return (
                file.path.startsWith(folderPath + "/") ||
                file.path === folderPath
            );
        });

        if (!shouldAddID) {
            return;
        }

        // Wait a bit for file to be fully created and any template to be applied
        setTimeout(async () => {
            try {
                const content = await this.app.vault.read(file);

                // Don't add ID if file already has one (e.g., from a template)
                if (!hasID(content)) {
                    const result = await processFile(file, this.app.vault);
                    if (result.success) {
                        console.log(`Auto-added ID to new file: ${file.path}`);
                    }
                }
            } catch (error) {
                console.error("Error in auto-add ID:", error);
            }
        }, 100);
    }

    async addIDToCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice("No active file");
            return;
        }

        if (activeFile.extension !== "md") {
            new Notice("Current file is not a markdown file");
            return;
        }

        const result = await processFile(activeFile, this.app.vault);

        if (result.success) {
            new Notice(result.message);
        } else if (result.alreadyHasID) {
            new Notice(`Note already has ID: ${result.id}`);
        } else {
            new Notice("Failed to add ID: " + result.message);
        }
    }

    async addIDsToFolder() {
        new FolderSuggestModal(this.app, async (folder) => {
            await processFolder(folder, this.app.vault, this.app);
        }).open();
    }
}

module.exports = SnowflakePlugin;

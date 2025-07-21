# Snowflake: Unique IDs for Obsidian

A lightweight Obsidian plugin that automatically adds unique IDs to your notes' frontmatter. This helps maintain stable references across your knowledge base, even when notes are renamed or moved.

## Features

- **Automatic ID Generation**: Newly created notes in configured folders automatically receive unique IDs
- **Folder-Specific Configuration**: Choose which folders should have automatic ID addition
- **Manual ID Addition**: Add IDs to existing notes with a simple command
- **Bulk Addition**: Add IDs to all notes in a selected folder at once
- **Collision-Resistant**: Uses Nano ID algorithm for extremely low collision probability
- **Fast & Lightweight**: Minimal performance impact with efficient implementation

## Why Snowflake?

When building a knowledge management system, you often need stable references between notes. Using note titles or file paths as references breaks when you rename or reorganize files. Snowflake solves this by adding permanent unique IDs to your notes' frontmatter:

```yaml
---
id: x8K2n5pQ7A
---

Note Contents
```

These IDs:
- Persist across file renames and moves
- Are short (10 characters) and URL-safe
- Have virtually zero collision probability (even with 50k+ notes)
- Can be used in links, databases, or external systems

### Manual Installation

1. Download the latest release from the [Releases](https://github.com/ali01/obsidian-snowflake/releases) page
2. Extract the files to your vault's plugins folder: `VaultFolder/.obsidian/plugins/obsidian-snowflake/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community plugins

## Usage

### Automatic ID Addition

1. Open Settings → Snowflake
2. Click "Add folder" and select folders where new notes should automatically get IDs
3. Toggle "Enable automatic ID addition" to turn the feature on/off

When you create a new note in a configured folder, it will automatically receive a unique ID in its frontmatter.

### Manual Commands

Access these commands via the Command Palette (Ctrl/Cmd + P):

- **Add ID to current note**: Adds a unique ID to the active note
- **Add IDs to all notes in folder**: Opens a folder selector, then adds IDs to all notes in that folder

### Configuration

The plugin settings allow you to:
- Enable/disable automatic ID addition globally
- Manage which folders have automatic ID addition
- View and remove configured folders

## How It Works

Snowflake uses the [Nano ID](https://github.com/ai/nanoid) algorithm to generate unique identifiers:

- **Format**: 10 alphanumeric characters (e.g., `x8K2n5pQ7A`)
- **Alphabet**: `0-9`, `a-z`, `A-Z` (62 characters)
- **Randomness**: Cryptographically secure via `crypto.getRandomValues()`
- **Collision Probability**: Negligible (1 in 10^15 for 10-character IDs)


## Development

The plugin is now built using TypeScript with a modular architecture. The code is organized into separate modules for better maintainability and type safety.

### Project Structure

```
obsidian-snowflake/
├── src/                    # TypeScript source files
│   ├── main.ts             # Main plugin class
│   ├── types.ts            # Type definitions
│   ├── constants.ts        # Configuration constants
│   ├── nanoid.ts           # ID generation module
│   ├── frontmatter.ts      # Frontmatter utilities
│   ├── file-processor.ts   # File processing logic
│   └── ui/                 # UI components
│       ├── folder-modal.ts # Folder selection modal
│       └── settings-tab.ts # Settings interface
├── main.js                 # Compiled output (generated)
├── manifest.json           # Plugin metadata
├── package.json            # NPM configuration
├── tsconfig.json           # TypeScript configuration
├── esbuild.config.mjs      # Build configuration
├── README.md               # Documentation
└── LICENSE                 # MIT license
```

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ali01/obsidian-snowflake.git
   cd obsidian-snowflake
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development mode** (watches for changes)
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   ```

### Development Workflow

1. Make changes to TypeScript files in the `src/` directory
2. The development build will automatically recompile on changes
3. Reload Obsidian or disable/enable the plugin to test changes
4. Use the browser developer console (Ctrl/Cmd+Shift+I) for debugging

### Code Organization

- **types.ts**: TypeScript interfaces and type definitions
- **constants.ts**: Default settings and configuration values
- **nanoid.ts**: Nano ID generation algorithm
- **frontmatter.ts**: YAML frontmatter parsing and manipulation
- **file-processor.ts**: Core logic for processing files and folders
- **ui/folder-modal.ts**: Folder selection modal component
- **ui/settings-tab.ts**: Plugin settings interface
- **main.ts**: Main plugin class with lifecycle methods


## Compatibility

- Requires Obsidian v0.12.0 or higher
- Works with all themes and other plugins
- No external dependencies required


## Author

**Ali Yahya**

## Acknowledgments

- Inspired by the need for stable note references in large knowledge bases
- Uses concepts from the [Nano ID](https://github.com/ai/nanoid) project
- Built for the [Obsidian](https://obsidian.md) community

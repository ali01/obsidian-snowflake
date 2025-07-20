# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Obsidian Snowflake plugin - a simple tool that automatically adds unique Nano IDs to notes in frontmatter. The project uses a deliberately minimal, single-file architecture with no build process or external dependencies.

## Key Architecture Decisions

### Single-File Design
All plugin functionality is contained in `main.js` (462 lines). This is intentional - the plugin runs directly as vanilla JavaScript without compilation. The code is organized into logical modules within this single file:

- **Constants Module** (lines 24-33): Default settings configuration
- **Nano ID Module** (lines 36-64): Self-contained ID generation using crypto API
- **Frontmatter Utilities** (lines 67-113): YAML parsing and manipulation
- **File Processor Module** (lines 116-211): Async file operations and batch processing
- **UI Components** (lines 214-335): Modal dialogs and settings interface
- **Main Plugin Class** (lines 338-461): Core plugin lifecycle and event handling

### No Build Process
- No `package.json` or npm dependencies
- No TypeScript compilation
- No bundling or minification
- Direct JavaScript execution in Obsidian

## Development Workflow

Since there's no build process, development is straightforward:

1. Edit `main.js` directly
2. Reload the plugin in Obsidian (Settings → Community plugins → Reload)
3. Test changes manually within Obsidian

For debugging:
- Use `console.log()` and `console.error()` statements
- View output in Obsidian's developer console (Ctrl/Cmd+Shift+I)

## Important Implementation Details

### ID Generation
- Uses Nano ID algorithm with custom implementation
- 10-character alphanumeric IDs (62-character alphabet)
- Cryptographically secure via `crypto.getRandomValues()`
- Example ID format: `x8K2n5pQ7A`

### Frontmatter Handling
- Regular expression-based YAML parsing
- Preserves existing frontmatter structure
- Creates frontmatter block if missing
- Safe string manipulation without external YAML libraries

### File Processing
- All file operations are async for performance
- 100ms delay after file creation (allows templates to apply first)
- Only processes `.md` files
- Recursive folder traversal for batch operations

### Settings Storage
- Settings saved to `data.json` (gitignored)
- Uses Obsidian's built-in `loadData()` and `saveData()` methods
- Structure defined in DEFAULT_SETTINGS constant

## Working with Obsidian API

Key Obsidian API patterns used:

```javascript
// Event listening
this.app.vault.on("create", (file) => { ... })

// Command registration
this.addCommand({ id: "...", name: "...", callback: () => { ... } })

// File operations
await this.app.vault.read(file)
await this.app.vault.modify(file, content)

// UI components
new Modal(this.app)
new Setting(containerEl)
```

## Testing Approach

Manual testing within Obsidian is the primary approach. Key test scenarios:

1. Create new note → Should auto-add ID if folder is configured
2. Run "Add ID to current note" command → Should add ID to active note
3. Run "Add IDs to all notes in folder" → Should process all notes recursively
4. Settings changes → Should persist after plugin reload
5. Edge cases: Files with existing IDs, malformed frontmatter, non-markdown files

## Code Style Guidelines

- Use clear module separation with comment headers
- Maintain comprehensive error handling with try-catch blocks
- Provide user feedback via `new Notice()` for all operations
- Keep all code in single file per project architecture
- Use async/await for all file operations
- Add descriptive comments for complex logic

## Common Tasks

### Adding New Features
1. Identify appropriate module in `main.js`
2. Add functionality maintaining existing patterns
3. Update manifest.json version if needed
4. Test thoroughly in Obsidian
5. Update README.md if user-facing changes

### Debugging Issues
1. Add console.log statements in relevant functions
2. Check Obsidian developer console for errors
3. Verify file permissions and vault structure
4. Test with minimal vault to isolate issues

### Modifying ID Generation
- Edit `NanoIDGenerator` class (lines 36-64)
- Adjust `ID_LENGTH` or `ALPHABET` constants
- Ensure cryptographic security is maintained

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Obsidian Snowflake plugin - a tool that automatically adds unique Nano IDs to notes in frontmatter. The project uses TypeScript with a modern build system based on esbuild.

## Key Architecture Decisions

### TypeScript-Based Architecture
The plugin is written in TypeScript and organized into modular source files:

- **src/main.ts**: Plugin entry point and lifecycle management
- **src/constants.ts**: Default settings configuration
- **src/nanoid.ts**: Self-contained ID generation using crypto API
- **src/frontmatter.ts**: YAML parsing and manipulation utilities
- **src/file-processor.ts**: Async file operations and batch processing
- **src/types.ts**: TypeScript type definitions
- **src/ui/folder-modal.ts**: Folder selection dialog
- **src/ui/settings-tab.ts**: Plugin settings interface

### Build Process
The project uses esbuild for fast TypeScript compilation and bundling:

- **Build tool**: esbuild (configured in `esbuild.config.mjs`)
- **Entry point**: `src/main.ts`
- **Output**: Single bundled `main.js` file
- **Format**: CommonJS (required for Obsidian plugins)
- **Target**: ES2018 for broad compatibility

#### Build Configuration Details
- **TypeScript**: Strict mode enabled with full type checking
- **Bundling**: All dependencies bundled except Obsidian API
- **External modules**: `obsidian`, `@codemirror/*`, Node.js built-ins
- **Source maps**: Inline in development, none in production
- **Tree shaking**: Enabled for optimal bundle size

## Development Workflow

### Build Commands

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Clean build artifacts
npm run clean
```

### Development Process

1. Edit TypeScript files in the `src/` directory
2. Run `npm run dev` to start the build watcher
3. The plugin will automatically rebuild when files change
4. Reload the plugin in Obsidian (Settings → Community plugins → Reload)
5. Test changes manually within Obsidian

For debugging:
- Use `console.log()` and `console.error()` statements
- View output in Obsidian's developer console (Ctrl/Cmd+Shift+I)
- Development builds include inline source maps for easier debugging

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

- Write idiomatic TypeScript with proper type annotations
- Use clear module separation in different files
- Maintain comprehensive error handling with try-catch blocks
- Provide user feedback via `new Notice()` for all operations
- Use async/await for all file operations
- Add descriptive comments for complex logic
- Follow TypeScript strict mode requirements
- **Enforce Line Length Limits**: Make sure all TypeScript lines of code are under 100 characters in length

## Common Tasks

### Adding New Features
1. Create or modify appropriate TypeScript files in `src/`
2. Add functionality maintaining existing patterns and types
3. Run `npm run build` to compile changes
4. Update manifest.json version if needed
5. Test thoroughly in Obsidian
6. Update README.md if user-facing changes

### Debugging Issues
1. Run `npm run dev` for watch mode with source maps
2. Add console.log statements in relevant functions
3. Check Obsidian developer console for errors
4. Use TypeScript type checking to catch issues early
5. Verify file permissions and vault structure
6. Test with minimal vault to isolate issues

### Modifying ID Generation
- Edit `NanoIDGenerator` class in `src/nanoid.ts`
- Adjust `ID_LENGTH` or `ALPHABET` constants
- Ensure cryptographic security is maintained
- Run tests to verify ID uniqueness and format

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

### Automated Testing

The project uses Jest for unit testing with comprehensive test coverage:

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

**Test Structure:**
- Test files are located alongside source files with `.test.ts` extension
- Mock Obsidian API using `src/__mocks__/obsidian.ts`
- Tests cover all major functionality including:
  - Command execution
  - Template loading and application
  - Error handling
  - File creation handling
  - Frontmatter merging
  - Variable processing

**Writing Tests:**
- Use descriptive test names that explain the expected behavior
- Group related tests using `describe` blocks
- Mock external dependencies (Obsidian API, file system)
- Test both success and failure cases
- Verify requirement compliance (REQ-XXX comments)

### Manual Testing

After automated tests pass, perform manual testing within Obsidian:

1. **Template Application**
   - Create new note in mapped folder → Template should apply automatically
   - Create note in unmapped folder → Default template or no template
   - Use manual commands on existing notes

2. **Settings Configuration**
   - Add/remove folder mappings
   - Change default template
   - Toggle auto-templating on/off
   - Verify settings persist after reload

3. **Edge Cases**
   - Files with existing frontmatter
   - Malformed YAML frontmatter
   - Non-markdown files (.txt, .pdf)
   - Missing template files
   - Large batch operations (100+ files)

4. **Error Scenarios**
   - Invalid template syntax
   - Permission errors
   - Concurrent file operations
   - Plugin conflicts

## Code Style Guidelines

- Write idiomatic TypeScript with proper type annotations
- Use clear module separation in different files
- Maintain comprehensive error handling with try-catch blocks
- Provide user feedback via `new Notice()` for all operations
- Use async/await for all file operations
- Add descriptive comments for complex logic
- Follow TypeScript strict mode requirements
- **Enforce Line Length Limits**: Make sure all TypeScript lines of code are under 100 characters in length

### Method Visibility Guidelines

- **All methods should be private by default** unless they are part of the public API
- Mark methods as `public` only when they are:
  - Called from other classes in production code
  - Part of a required interface (e.g., Obsidian Plugin API)
  - Intended for external use by plugin consumers
- For methods that need to be tested but aren't part of the public API:
  - Keep them private
  - Create a test utility export at the end of the file
  - Use the pattern shown below to provide test-only access

#### Test Access Pattern for Private Methods

When you need to test private methods, add a test utility export at the end of the file:

```typescript
/**
 * Test-only exports
 */
export const ClassNameTestUtils = {
  privateMethodName: (instance: ClassName, ...args: Parameters<ClassName['privateMethodName']>): ReturnType<ClassName['privateMethodName']> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (instance as any).privateMethodName(...args);
  }
};
```

This pattern:
- Maintains proper encapsulation in production code
- Provides type-safe access for tests
- Makes it clear which exports are for testing only
- Uses localized eslint-disable comments for the necessary type assertions

## Quality Assurance

**IMPORTANT**: On completing any changes to TypeScript code ALWAYS run:

```bash
npm run check
```

This command will:
1. Run the type-checker (`npm run typecheck`)
2. Run all tests (`npm run test`)

If any issues are found:
1. Fix all of the problems
2. Run `npm run check` again to verify

Only return control to the user when `npm run check` completes successfully with no errors or warnings.

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

# Snowflake Auto-Templating Implementation Plan

## Overview
This document provides a detailed, incremental implementation plan for transforming Snowflake from an ID generator to a comprehensive templating system. Each stage is atomic and testable, leveraging TypeScript's static analysis for compile-time safety.

---

## Stage 1: Type System Foundation

### Objective
Establish TypeScript interfaces and types that enforce requirements at compile-time.

### New Type Definitions

```typescript
// src/types.ts - Updated types

/**
 * TemplateMapping: Core configuration type for folder-to-template associations
 *
 * Purpose: Stores which template should be applied to files created in specific folders.
 * This is the heart of the auto-templating feature, allowing users to configure
 * different templates for different parts of their vault.
 *
 * Example: { "Projects": "Templates/project.md", "Daily Notes": "Templates/daily.md" }
 */
export interface TemplateMapping {
    [folderPath: string]: string; // folder path -> template path
}

/**
 * SnowflakeSettings: Complete plugin configuration (REQ-023)
 *
 * Purpose: Defines all user-configurable options for the plugin. This interface
 * ensures type safety when loading/saving settings and provides intellisense
 * throughout the codebase. Stored persistently in data.json.
 *
 * Fields:
 * - templateMappings: Folder-specific template assignments
 * - defaultTemplate: Fallback template for unmapped folders (empty = none)
 * - enableAutoTemplating: Master switch for automatic template application
 * - templatesFolder: Base directory where templates are stored
 */
export interface SnowflakeSettings {
    templateMappings: TemplateMapping;
    defaultTemplate: string; // empty string = no default
    enableAutoTemplating: boolean;
    templatesFolder: string;
}

/**
 * TemplateVariableContext: Data available for template variable replacement
 *
 * Purpose: Provides all the information needed to replace template variables like
 * {{title}} or {{date}}. This context is built when processing a template and
 * ensures all variables have consistent values throughout a single template.
 *
 * The snowflake_id is optional because it's only generated if the template
 * actually contains {{snowflake_id}} (performance optimization).
 */
export interface TemplateVariableContext {
    title: string;      // filename without extension
    date: string;       // formatted date
    time: string;       // formatted time
    snowflake_id?: string; // 10-character alphanumeric ID (only set if template contains {{snowflake_id}})
}

/**
 * TemplateProcessResult: Output of template variable processing
 *
 * Purpose: Encapsulates the result of processing a template, including the final
 * content and metadata about what was processed. This allows callers to know
 * whether a snowflake_id was generated and what values were used for variables.
 *
 * Used for: Debugging, testing, and potentially showing users what variables
 * were replaced in their template.
 */
export interface TemplateProcessResult {
    content: string;
    hasSnowflakeId: boolean;
    variables: TemplateVariableContext;
}

/**
 * FrontmatterMergeResult: Detailed outcome of merging frontmatter sections
 *
 * Purpose: Provides transparency about the frontmatter merge process, tracking
 * which keys had conflicts (where existing values were preserved) and which
 * were newly added from the template. This information can be used for user
 * notifications or debugging merge behavior.
 *
 * Critical for: Implementing REQ-009 (existing values take precedence) while
 * maintaining visibility into what happened during the merge.
 */
export interface FrontmatterMergeResult {
    merged: string;
    conflicts: string[]; // keys that existed in both
    added: string[];     // keys added from template
}

/**
 * MarkdownFile: Type-safe representation of a markdown file
 *
 * Purpose: Creates a branded type that guarantees at compile-time that we're
 * only operating on markdown files. This prevents accidentally applying templates
 * to non-markdown files (REQ-004) and enables better TypeScript inference.
 *
 * Pattern: Intersection type that adds a type constraint to Obsidian's TFile
 */
export type MarkdownFile = TFile & { extension: 'md' };

/**
 * isMarkdownFile: Type guard for safe markdown file operations
 *
 * Purpose: Runtime check that also serves as a TypeScript type guard. After
 * calling this function, TypeScript knows the file is a MarkdownFile, enabling
 * access to markdown-specific operations without casting.
 *
 * Critical for: Ensuring templates are never applied to .pdf, .png, etc.
 */
export function isMarkdownFile(file: TFile): file is MarkdownFile {
    return file.extension === 'md';
}
```

### Compile-Time Safety
- **Template mappings** are typed as an object, preventing invalid folder→template assignments
- **MarkdownFile type** ensures template operations only occur on .md files (REQ-004)
- **Required vs optional fields** enforce which settings must have values

### Implementation Tasks
1. Update `src/types.ts` with new interfaces
2. Create type guard functions for runtime validation
3. Update existing code to use new types

---

## Stage 2: Settings Storage

### Objective
Implement the new settings structure for data.json storage.

### Implementation Approach

**Note: No migration logic is needed since the plugin has no existing users.**

The settings implementation will:
- Define DEFAULT_SETTINGS constant with the new structure
- Implement straightforward loading and saving to data.json
- Add validation to ensure settings are properly formed

### Implementation Tasks
1. Create DEFAULT_SETTINGS constant in constants.ts
2. Implement loadSettings() and saveSettings() methods
3. Add settings validation
4. Test loading and saving settings

---

## Stage 3: Template Variable Processing Engine

### Objective
Implement the variable replacement system (REQ-011 through REQ-016).

### Core Approach

The TemplateVariableProcessor will:
- Use regex pattern `/\{\{(\w+)\}\}/g` to find variables
- Generate a single snowflake_id if needed and reuse it for all occurrences (REQ-016)
  - Use existing NanoIDGenerator class to create 10-character alphanumeric IDs
- Format dates with default "YYYY-MM-DD" or custom format using moment.js patterns (REQ-012, REQ-014)
- Format times with default "HH:mm" or custom format using moment.js patterns (REQ-013, REQ-014)
- Leave invalid variable syntax unchanged (REQ-027)
- Return processed content with metadata about which variables were used

### Variable Registry Pattern (for extensibility)
```typescript
/**
 * VariableHandler: Plugin point for custom template variables
 *
 * Purpose: Defines the contract for adding new template variables beyond the
 * built-in ones (title, date, time, snowflake_id). This allows future extensions
 * to add variables like {{weather}}, {{moon_phase}}, or {{git_branch}} without
 * modifying core code.
 *
 * Design pattern: Strategy pattern for variable processing
 */
interface VariableHandler {
    name: string;                      // Variable name without braces (e.g., "weather")
    process: (context: any) => string; // Function to compute the variable's value
}

/**
 * VariableRegistry: Central registry for all template variables
 *
 * Purpose: Manages all available template variables in a single location,
 * allowing dynamic registration of new variables at runtime. This makes the
 * system extensible without modifying the core variable processor.
 *
 * Future use: Community plugins could register their own variables
 */
interface VariableRegistry {
    register(handler: VariableHandler): void;              // Add a new variable type
    process(varName: string, context: any): string | undefined; // Get variable value
}
```

### Implementation Tasks
1. Create `TemplateVariableProcessor` class
2. Implement date/time formatting with configurable formats
3. Ensure single snowflake_id generation per template
4. Add warning system for invalid variables (REQ-028)
5. Unit test all variable replacements

---

## Stage 4: Frontmatter Merge Engine

### Objective
Implement intelligent frontmatter merging (REQ-008, REQ-009, REQ-010).

### Implementation Approach

The FrontmatterMerger will:
- Parse both existing and template frontmatter into objects
- Merge with existing values taking precedence (REQ-009)
- Track which keys had conflicts and which were added
- Handle malformed YAML gracefully
- Return a properly formatted frontmatter string

### Implementation Tasks
1. Create robust YAML parser/stringifier
2. Implement merge logic with precedence rules
3. Handle edge cases (malformed YAML, arrays, nested objects)
4. Create comprehensive test suite for merging scenarios

---

## Stage 5: Template Loader & Applicator

### Objective
Implement template loading and application logic (REQ-002, REQ-003, REQ-006).

### Implementation Approach

**TemplateLoader** will:
- Load template files from the vault
- Handle missing files gracefully (REQ-026)
- Return null for missing templates rather than throwing

**TemplateApplicator** will:
- Check if auto-templating is enabled (REQ-005)
- Determine template based on folder mapping or default (REQ-002, REQ-003)
- Process template variables
- Merge content intelligently (REQ-006)
  - Frontmatter: Merge with existing values taking precedence
  - Body: Insert template body at cursor position when merging with existing content
- Perform single write operation

### Implementation Tasks
1. Implement `TemplateLoader` with error handling
2. Create `TemplateApplicator` with folder resolution logic
3. Implement content merging algorithm
4. Add notice system for user feedback
5. Test with various folder structures

---

## Stage 6: Event Handler System

### Objective
Implement file creation event handling (REQ-002, REQ-004, REQ-005).

### Implementation Approach

**FileCreationHandler** will:
- Use type guard to only process markdown files (REQ-004)
- Maintain a processing queue to prevent double processing
- Call TemplateApplicator for valid files

### Implementation Tasks
1. Create event handler class
2. Implement queue to prevent double processing
3. Add proper lifecycle management
4. Test with rapid file creation

---

## Stage 7: User Commands Implementation

### Objective
Implement manual commands (REQ-017 through REQ-022).

### Implementation Approach

**SnowflakeCommands** will register:
- "Insert template" command (REQ-017)
- "Insert template to all notes in folder" command (REQ-019)

For manual application:
- Check if current file is markdown
- Temporarily enable auto-templating to reuse logic (REQ-025)
- Show success/error notices

For batch operations:
- Show folder selection modal
- Process files in batches of 10 (REQ-021)
- Show progress and completion notice (REQ-022)
- Handle errors gracefully

### Implementation Tasks
1. Create command registration system
2. Implement folder selection modal
3. Create batch processing with progress indication
4. Add error handling and user feedback
5. Test with large folders

---

## Stage 8: Settings UI Implementation

### Objective
Create the settings interface (REQ-023, REQ-024).

### Implementation Approach

**Note: The settings UI must be visually appealing and follow Obsidian's design patterns for a polished user experience.**

The settings UI will have:
- **Template Mappings Section**: Add/edit/remove folder-to-template mappings
  - Template file picker with fuzzy search for easy selection
  - Preview template button to view template content before selection
- **Global Settings Section**: Toggle auto-templating, set default template, configure templates folder
- Immediate persistence of changes (REQ-024)
- Validation for template paths
- File/folder suggester modals using Obsidian's built-in components

### Implementation Tasks
1. Create comprehensive settings UI
2. Implement folder/file suggester modals
3. Add template preview functionality
4. Ensure immediate setting application
5. Add validation for template paths

---

## Stage 9: Error Handling & User Feedback

### Objective
Implement comprehensive error handling (REQ-026 through REQ-029).

### Error Context Interface
```typescript
/**
 * ErrorContext: Structured error information for debugging and user feedback
 *
 * Purpose: Provides consistent error context throughout the application, making
 * it easier to diagnose issues and show helpful error messages. The operation
 * field uses a discriminated union to ensure only valid operation types are used.
 *
 * Benefits:
 * - Consistent error reporting across the codebase
 * - Easy to add new error contexts without breaking existing code
 * - Enables targeted error messages based on what operation failed
 */
interface ErrorContext {
    operation: 'load_template' | 'apply_template' | 'merge_frontmatter';
    templatePath?: string;  // Which template file caused the error
    filePath?: string;      // Which note file was being processed
}
```

### Implementation Approach

Create centralized ErrorHandler that:
- Catches and categorizes errors (missing file, permission, generic)
- Shows user-friendly notices
- Logs detailed errors for debugging
- Ensures operations fail gracefully

### Implementation Tasks
1. Create centralized error handling
2. Implement user-friendly error messages
3. Add logging for debugging
4. Test all error scenarios
5. Ensure graceful degradation

---

## Stage 10: Testing & Validation

### Objective
Comprehensive testing strategy leveraging TypeScript's type system.

### Testing Approach

- Use Jest with TypeScript configuration
- Create type-safe test fixtures
- Test each requirement explicitly
- Include integration tests for full workflows
- Validate error scenarios

### Implementation Tasks
1. Set up Jest with TypeScript
2. Create comprehensive test suites for each module
3. Test all requirement scenarios
4. Add integration tests
5. Create test fixtures for common scenarios

---

## Stage 11: Performance Optimization

### Objective
Ensure responsive UI for batch operations (REQ-021).

### Batch Processing Interface
```typescript
/**
 * BatchOptions: Configuration for processing multiple files efficiently
 *
 * Purpose: Provides control over how batch operations are performed, particularly
 * important for the "Insert template to all notes in folder" command (REQ-021).
 * This interface allows callers to tune performance and provide user feedback.
 *
 * Use cases:
 * - Process 10 files at a time to avoid UI freezing
 * - Show progress bar updates via onProgress callback
 * - Adjust batch size based on device performance
 */
interface BatchOptions {
    batchSize?: number;     // How many files to process in parallel (default: 10)
    onProgress?: (current: number, total: number) => void; // Progress callback
}
```

### Implementation Approach

- Process files in configurable batch sizes
- Yield to UI thread between batches
- Provide progress callbacks
- Use Promise.all for parallel processing within batches

### Implementation Tasks
1. Implement batch processing utilities
2. Add progress indication for long operations
3. Profile and optimize hot paths
4. Implement caching where beneficial
5. Test with large vaults

---

## Stage 12: Future Enhancement Preparation

### Objective
Prepare architecture for template inheritance (REQ-032, REQ-033).

### Type Definitions for Future

```typescript
// src/future-types.ts
/**
 * TemplateChain: Ordered list of templates for inheritance (REQ-032)
 *
 * Purpose: Represents a hierarchy of templates that should be applied to a file,
 * from most general (root folder) to most specific (immediate parent). This
 * enables template inheritance where subfolder templates build upon parent
 * folder templates.
 *
 * Example: File in Projects/Active/Web would have chain:
 * - level 0: Default template
 * - level 1: Projects template
 * - level 2: Active template
 * - level 3: Web template
 */
export interface TemplateChain {
    templates: Array<{
        path: string;       // Path to the template file
        content: string;    // Template content
        level: number;      // 0 = root, higher = more specific
    }>;
}

/**
 * InheritanceResolver: Contract for implementing template inheritance (REQ-033)
 *
 * Purpose: Defines how template inheritance will work when implemented. This
 * interface is designed now to ensure the architecture supports this future
 * feature without major refactoring.
 *
 * Strategy:
 * - resolveTemplateChain: Walk up folder hierarchy collecting templates
 * - mergeTemplateChain: Combine templates with child overriding parent
 */
export interface InheritanceResolver {
    resolveTemplateChain(filePath: string): Promise<TemplateChain>;
    mergeTemplateChain(chain: TemplateChain): Promise<string>;
}
```

### Implementation Tasks
1. Design extensible architecture
2. Add hooks for future features
3. Document extension points
4. Ensure backward compatibility

---

## Overall Plugin Changes

### Manifest and Metadata
1. Update plugin name and description in manifest.json to reflect templating functionality
2. Update README.md to document the new templating features
3. ID generation is now just one of many template variables

### File Structure
The implementation will use a modular TypeScript structure:
```
src/
- constants.ts (settings defaults)
- types.ts (TypeScript interfaces)
- template-variables.ts (NEW - variable processing)
- frontmatter-merger.ts (NEW - intelligent merging)
- template-loader.ts (NEW - template file handling)
- template-applicator.ts (NEW - apply templates to files)
- event-handlers.ts (NEW - file creation events)
- commands.ts (NEW - user commands)
- nanoid.ts (existing - ID generation)
- ui/
  - folder-modal.ts (existing)
  - settings-tab.ts (enhanced)
- main.ts (plugin entry point)
```

---

## Implementation Sequence

### Phase 1: Foundation (Stages 1-3)
1. Update type system
2. Implement settings storage (no migration needed)
3. Create variable processing engine

### Phase 2: Core Features (Stages 4-6)
4. Build frontmatter merger
5. Implement template loader/applicator
6. Set up event handlers

### Phase 3: User Interface (Stages 7-8)
7. Add user commands
8. Create settings UI

### Phase 4: Polish (Stages 9-11)
9. Implement error handling
10. Add comprehensive tests
11. Optimize performance

### Phase 5: Future Ready (Stage 12)
12. Prepare for enhancements

---

## Key TypeScript Patterns Used

1. **Type Guards**: Ensure operations only on markdown files
2. **Branded Types**: Distinguish between different string types
3. **Const Assertions**: Lock down configuration objects
4. **Discriminated Unions**: Handle different result types safely
5. **Strict Null Checks**: Prevent null reference errors
6. **Interface Segregation**: Small, focused interfaces
7. **Generic Constraints**: Type-safe batch processing

This implementation plan ensures each requirement is met with type-safe, testable code that can be developed incrementally.

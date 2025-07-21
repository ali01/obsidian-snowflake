# Auto-Templating Implementation Plan for Snowflake Plugin

## Overview
Transform Snowflake from a simple ID generator into a comprehensive auto-templating plugin that applies templates to new files based on their directory, with optional unique ID generation.

## Phase 1: Update Settings Structure

### New Settings Schema
```javascript
DEFAULT_SETTINGS = {
    // Template mappings: folder path -> template path
    templateMappings: {},
    // Example: { "Projects": "Templates/project-template.md" }

    // Folders where IDs should be added (kept from original)
    autoAddIDFolders: [],

    // Global toggles
    enableAutoTemplating: true,
    enableAutoID: true,

    // Template settings
    templatesFolder: "Templates", // Default templates directory
    processTemplateVariables: true
}
```

## Phase 2: Template Processing Module

### Core Functions
1. **Template Loader**
   - Read template file from vault
   - Cache templates for performance
   - Handle missing templates gracefully

2. **Variable Processor**
   - Support standard Obsidian variables: `{{date}}`, `{{time}}`, `{{title}}`
   - Add custom `{{id}}` variable for Snowflake IDs
   - Extensible for future variables

3. **Template Applicator**
   - Apply template content to new files
   - Preserve any existing content
   - Handle frontmatter merging

## Phase 3: Event Flow Redesign

### New File Creation Flow
1. File created in vault
2. Check if folder has template mapping
3. If yes, apply template first
4. Then check if folder needs auto-ID
5. If yes, add/update ID in frontmatter
6. Single file write operation

### Timing Solution
- Use "modify" event pattern to detect template completion
- Track files awaiting template application
- Apply templates and IDs in correct sequence

## Phase 4: UI Enhancements

### Settings Tab Updates
1. **Template Mappings Section**
   - Add/edit/remove folder-to-template mappings
   - Template file picker with fuzzy search
   - Preview template button

2. **ID Settings Section**
   - Keep existing folder list for auto-ID
   - Option to add ID to all templated files

3. **Global Settings**
   - Toggle auto-templating on/off
   - Toggle auto-ID on/off
   - Configure templates folder

### New Commands
1. "Set template for current folder"
2. "Apply template to current note"
3. "View folder template mappings"

## Phase 5: Implementation Details

### File Structure (Single File Maintained)
```
main.js sections:
- Constants & Settings
- Template Processing Module (NEW)
- Nano ID Module (existing)
- Frontmatter Utilities (enhanced)
- File Processor (rewritten)
- UI Components (expanded)
- Main Plugin Class (updated)
```

### Key Changes
1. Rename plugin to reflect broader purpose
2. Update manifest description
3. Maintain backward compatibility for ID features
4. Add template-specific error handling

## Phase 6: Migration & Compatibility

### Backward Compatibility
- Existing ID settings preserved
- Old folder configurations work as before
- Gradual migration path for users

### Plugin Compatibility
- Detect and respect other template plugins
- Option to disable for specific folders
- Work alongside Templater gracefully

## Benefits
1. **Single Plugin Solution**: Templates + IDs in one plugin
2. **Folder-Based Organization**: Automatic file setup based on location
3. **Reduced Manual Work**: No need to manually apply templates
4. **Consistent Structure**: Ensures all files in folders have proper format
5. **Extensible**: Easy to add new template variables or features

## Implementation Notes

### Template Variable Processing
The plugin will support these variables:
- `{{title}}` - File name without extension
- `{{date}}` - Current date (format configurable)
- `{{time}}` - Current time
- `{{id}}` - Snowflake-generated unique ID
- `{{folder}}` - Parent folder name

### Error Handling
- Missing template files: Show notice, create empty file
- Invalid template syntax: Apply template as-is, show warning
- Permission errors: Graceful fallback with user notification

### Performance Considerations
- Cache loaded templates in memory
- Debounce rapid file creation events
- Async processing to avoid blocking UI

### Future Enhancements
- Multiple templates per folder (with selection logic)
- Template inheritance (folder hierarchy)
- Custom variable definitions
- Template preview in settings
- Import/export template mappings

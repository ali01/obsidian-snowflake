# Snowflake: Automatic Templates for Obsidian

An Obsidian plugin that automatically applies templates to new notes based on their folder location. Create consistent note structures with dynamic variables like dates, times, and unique IDs.

## Features

- **Automatic Templates**: Assign templates to folders. New files get those templates automatically.
- **Template Inheritance**: Nested folders inherit templates from parent folders
- **Dynamic Variables**: Insert current date, time, note title, and unique IDs
- **Smart Merging**: Safely merges templates with existing content without data loss
- **Manual Commands**: Apply templates on-demand to existing notes
- **Bulk Operations**: Apply templates to all notes in a folder at once


## Quick Start

1. **Create a templates folder** (default: "Templates")
2. **Create template files** in that folder (e.g., `project-template.md`, `meeting-template.md`)
3. **Configure folder mappings** in Settings → Snowflake
4. **Create new notes** in mapped folders to see templates applied automatically

### Configuring Folder Mappings

1. Open Settings → Snowflake
2. Click "Add folder mapping"
3. Select a folder and its corresponding template
4. Notes created in that folder will now use the template

### Template Inheritance

Templates inherit from parent folders automatically:

```
Projects/              → uses: project-template.md
  └── Web/             → uses: web-template.md
      └── Frontend/    → inherits both templates with smart merging
```

### Manual Commands

Access via Command Palette (Ctrl/Cmd + P):

- **Apply template to current note**: Applies the appropriate template based on the note's location
- **Apply specific template**: Choose any template to apply to the current note
- **Apply templates to folder**: Bulk apply templates to all notes in a selected folder

## Advanced Features

### Template Variables

Snowflake supports the following dynamic variables that are replaced when templates are applied:

- **`{{title}}`** - The filename without the .md extension
  - Example: "Meeting Notes.md" → "Meeting Notes"
- **`{{date}}`** - Current date (format customizable in settings)
  - Default format: YYYY-MM-DD (e.g., "2024-01-15")
- **`{{time}}`** - Current time (format customizable in settings)
  - Default format: HH:mm (e.g., "14:30")
- **`{{snowflake_id}}`** - A unique 10-character alphanumeric ID
  - Format: Mix of letters and numbers (e.g., "x8K2n5pQ7A")
  - Uses cryptographically secure random generation
  - Multiple instances in the same template receive the same ID

Example template with variables:
```markdown
---
id: {{snowflake_id}}
created: {{date}} {{time}}
modified: {{date}} {{time}}
---

# {{title}}

Created on {{date}} at {{time}}
```

### Custom Date/Time Formats

In settings, customize formats using moment.js syntax:
- Date: `DD/MM/YYYY`, `MMM DD, YYYY`, etc.
- Time: `h:mm A`, `HH:mm:ss`, etc.

### Exclusion Lists

- Specify files that should be excluded from template application
- Use regex patterns (e.g. `*.tmp` or `draft-*`) to match multiple files

## Development

Built with TypeScript:

```
src/
├── main.ts                    # Plugin entry point
├── template-applicator.ts     # Core template logic
├── template-loader.ts         # Template file management
├── template-variables.ts      # Variable replacement
├── frontmatter-merger.ts      # YAML merging logic
├── commands.ts                # Command registration
└── ui/                        # Settings and modals
```

### Development Setup

```bash
# Clone and install
git clone https://github.com/ali01/obsidian-snowflake.git
cd obsidian-snowflake
npm install

# Development (with watch)
npm run dev

# Production build
npm run build

# Run tests
npm test

# Quality checks
npm run check
```

## Compatibility

- Requires Obsidian v0.12.0 or higher
- Works with all themes and other plugins
- No external dependencies

## Community

- **Issues**: [GitHub Issues](https://github.com/ali01/obsidian-snowflake/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ali01/obsidian-snowflake/discussions)

## License

MIT License - see [LICENSE](LICENSE) file

## Acknowledgments

- Built for the [Obsidian](https://obsidian.md) community
- ID generation inspired by [Nano ID](https://github.com/ai/nanoid)

## Author

**Ali Yahya**

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
- **Create new note in folder**: Creates a new note in the selected folder and applies all mapped templates

### Keyboard Shortcuts

You can assign keyboard shortcuts to any Snowflake command:

1. Go to Settings → Hotkeys
2. Search for "Snowflake"
3. Click the + icon next to any command
4. Press your desired key combination

**Tip**: Replace Obsidian's default "New note" behavior:
Assign `Cmd/Ctrl + N` to "Snowflake: Create new note in folder." This gives you folder selection and automatic template application. The original Obsidian behavior can still be accessed via the Command Palette.

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

### Template Property Exclusions (Delete Lists)

Templates can exclude properties from parent templates using the `delete` property. This is useful when you want to remove inherited properties that don't apply to specific note types.

#### Basic Usage

Add a `delete` property to your template's frontmatter with an array of property names to exclude:

```yaml
---
delete: [author, project]
category: personal
tags: [diary]
---
```

#### How It Works

1. Properties listed in `delete` are removed from the inherited template
2. Child templates can re-add excluded properties by defining them explicitly
3. The `delete` property itself is never included in the final note

#### Example Inheritance Chain

Consider this template hierarchy:

**base-template.md** (parent):
```yaml
---
author: Team
project: Default Project
status: draft
tags: [base]
---
```

**personal-template.md** (child):
```yaml
---
delete: [author, project]
category: personal
tags: [personal]
---
```

**journal-template.md** (grandchild):
```yaml
---
author: Me  # Re-adds the author property
mood: neutral
tags: [journal]
---
```

When a note uses the journal template:
- `project` is excluded (removed by personal-template)
- `author` is included with value "Me" (re-added by journal-template)
- `status` is included (never excluded)
- All tags are concatenated: `[base, personal, journal]`

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

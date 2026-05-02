# Snowflake: Schema-driven Templates for Obsidian

Snowflake applies templates to new notes based on a `.schema.yaml` file in
their folder (or any ancestor folder). A schema can route different files to
different templates by path pattern, declare per-folder file excludes, and
inherit from ancestor schemas.

## Quick Start

1. Pick a folder you want Snowflake to manage.
2. Create a `.schema.yaml` file at the root of that folder. Minimal example:
   ```yaml
   default:
     template:
       frontmatter:
         type: note
         tags: [auto]
       body: |
         # {{title}}
         Created {{date}}
   ```
3. Create a new note in that folder. Snowflake applies the template
   automatically.

> **Note:** `.schema.yaml` starts with a dot, which Obsidian hides by default
> in the file explorer. Edit it from the file system or an external editor,
> or use a "show hidden files" setting if your platform exposes one.

## Schema Format

A schema can declare three top-level fields, all optional:

```yaml
exclude:
  - MEETINGS.md
  - Archive/
  - "**/*.tmp"

default:
  template: ./_templates/note.md

rules:
  - match: "Web/**"
    template: ./_templates/web.md
  - match: "**/quick-*.md"
    template:
      frontmatter:
        type: quick
      body: "# {{title}}"
    frontmatter-delete: [scratch_only]
```

### `exclude`

A list of patterns. If a new file matches any of them, no template is applied
— ever, including from ancestor schemas. Patterns are evaluated relative to
the schema's folder using gitignore-style semantics:

| Pattern        | Matches                                                |
| -------------- | ------------------------------------------------------ |
| `MEETINGS.md`  | Any file named `MEETINGS.md` at any depth in subtree   |
| `Archive/`     | Everything under the `Archive/` directory              |
| `*.tmp`        | Files ending in `.tmp` (top level only)                |
| `**/*.tmp`     | Files ending in `.tmp` at any depth                    |
| `draft-*`      | Files whose name starts with `draft-` (top level)      |
| `**/draft-*`   | Same, at any depth                                     |

This replaces the old plugin-wide "global exclude patterns" setting. To
exclude vault-wide, put an `exclude:` list in a vault-root `.schema.yaml`.

### `default`

The template to use when no `rules` entry matches.

### `rules`

An ordered list. Each rule has:

- `match` — a glob pattern (`*`, `**`, `?` supported), evaluated relative to
  the schema's folder. **First match wins.**
- `template` — either an inline template (object with optional `frontmatter`
  and `body`) or a path to a `.md` template file (string).
- `frontmatter-delete` — optional list of property names to exclude from
  inherited frontmatter when this rule's template is merged.

If no rule matches, `default:` is used. If neither is set, the schema
contributes nothing — but the inheritance walk continues through ancestors.

### Inline vs external templates

A `template:` value may be either inline:

```yaml
default:
  template:
    frontmatter:
      type: note
      tags: [auto]
    body: |
      # {{title}}
      Created {{date}}
```

…or an external `.md` file:

```yaml
default:
  template: ./_templates/note.md
```

Both forms support all variables (`{{title}}`, `{{date}}`, `{{time}}`,
`{{snowflake_id}}`).

#### External template paths

- Bare and `./` paths resolve relative to the schema's folder
  (`./web.md` from `Projects/.schema.yaml` → `Projects/web.md`).
- `../` walks up one directory.
- A leading `/` means vault-absolute (`/Templates/note.md`).
- Paths that escape the vault root are rejected.

## Two equivalent schema locations

You can put the schema directly in the folder it governs, or bundle it in a
`.schema/` subdirectory together with the template `.md` files it references.

**Flat form:**
```
Projects/
├── .schema.yaml
├── note-1.md
└── note-2.md
```

**Folder form:**
```
Projects/
├── .schema/
│   ├── schema.yaml      # note: no leading dot — parent is already hidden
│   └── web.md           # bundled template referenced from schema.yaml
├── note-1.md
└── note-2.md
```

In the folder form, `./web.md` in `schema.yaml` resolves inside `.schema/`,
so templates can be co-located with the schema that references them. The
folder form wins if both forms exist in the same directory (a console
warning is emitted).

## Template Inheritance

When a file is created at `Projects/Web/Frontend/note.md`, Snowflake walks
the folder hierarchy root → leaf and consults every ancestor schema:

```
.schema.yaml                   → uses: root template
Projects/.schema.yaml          → uses: project template
Projects/Web/.schema.yaml      → uses: web template
Projects/Web/Frontend/         → no schema, skipped
```

Templates merge root → leaf. Frontmatter values from descendants override
ancestor values; arrays (e.g. `tags:`) concatenate; bodies append.

### `frontmatter-delete`

Use a rule's `frontmatter-delete` list to drop inherited keys at that level:

```yaml
default:
  template: ./project.md
  frontmatter-delete: [legacy_field]
```

Per-rule and per-`default`-block only. There is no top-level
`frontmatter-delete` — repeat it across rules if you need it everywhere.

## Variables

| Variable           | Replacement                                          |
| ------------------ | ---------------------------------------------------- |
| `{{title}}`        | Filename without `.md`                               |
| `{{date}}`         | Current date (configurable format, default `YYYY-MM-DD`) |
| `{{time}}`         | Current time (configurable format, default `HH:mm`)  |
| `{{snowflake_id}}` | Cryptographically-secure 10-character ID            |

Customize date and time formats in **Settings → Snowflake**. Both fields
accept moment.js format strings.

## Commands

Available via the command palette (`Ctrl/Cmd + P`):

- **Apply schema to current note** — re-runs the schema chain on the active
  file.
- **Insert current date** / **Insert current time** — direct insertion at
  cursor.
- **Create new note in folder** — opens a folder picker, creates a new note,
  and applies the matching schema's template.

## Migrating from `SCHEMA.md`

The previous version used a single `SCHEMA.md` file that doubled as both
schema and template. The new format separates routing (schema) from content
(template) and adds pattern matching.

Manual migration:

1. Rename each `SCHEMA.md` to `.schema.yaml`.
2. Wrap its frontmatter and body inside a `default: template:` block:
   ```yaml
   default:
     template:
       frontmatter:
         type: note
       body: |
         # {{title}}
   ```
   Or move the body+frontmatter into a sibling `.md` file and reference it:
   ```yaml
   default:
     template: ./note.md
   ```
3. If the old file had `delete: [...]` in its frontmatter, move it up to
   `default.frontmatter-delete:` (or per-rule `frontmatter-delete:`). The
   `delete:` key inside template frontmatter is no longer the canonical
   location; using `frontmatter-delete` keeps template `.md` files clean.
4. If you used the old "global exclude patterns" setting, port those
   patterns to an `exclude:` list in a vault-root `.schema.yaml`.

## Development

```bash
npm install
npm run dev        # watch mode build
npm run build      # production build
npm test           # jest
npm run check      # typecheck + tests (quality gate)
npm run style:fix  # ESLint + Prettier auto-fix
```

Source layout:

```
src/
├── main.ts                    # plugin entry
├── commands.ts                # command registration
├── file-creation-handler.ts   # vault create/rename hooks
├── template-applicator.ts     # orchestrates merging + variables
├── template-loader.ts         # walks the schema chain & materializes templates
├── schema-locator.ts          # finds .schema.yaml or .schema/schema.yaml
├── schema-parser.ts           # validates and parses schema YAML
├── schema-resolver.ts         # picks a template via rule + default fallthrough
├── frontmatter-merger.ts      # YAML frontmatter merge engine
├── pattern-matcher.ts         # glob → regex
├── template-variables.ts      # {{title}} / {{date}} / {{time}} / {{snowflake_id}}
├── nanoid.ts                  # ID generation
└── ui/                        # settings + modals
```

## License

MIT — see [LICENSE](LICENSE).

## Author

**Ali Yahya** ([@ali01](https://github.com/ali01))

# Snowflake: Schema-driven Templates for Obsidian

Snowflake applies templates to new notes based on a `.schema.yaml` file in
their folder (or any ancestor folder). A schema can route different files to
different templates by path pattern, declare per-folder file excludes, and
inherit from ancestor schemas.

## Quick Start

1. Pick a folder you want Snowflake to manage.
2. Create a `.schema.yaml` file at the root of that folder. Minimal example:
   ```yaml
   rules:
     - schema:
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

A schema can declare two top-level fields, both optional:

```yaml
exclude:
  - MEETINGS.md
  - Archive/
  - "**/*.tmp"

rules:
  - match: ["Web/**", "Mobile/**"]      # list = match any of the patterns
    schema:
      frontmatter:
        type: app
      body-file: ./_templates/app.md   # external body (no frontmatter inside)
  - match: "**/quick-*.md"
    schema:
      frontmatter:
        type: quick
      body: "# {{title}}"
    frontmatter-delete: [scratch_only]
  - schema:                            # catch-all (no `match:`)
      frontmatter:
        type: note
```

**Frontmatter always lives in `schema.yaml`.** External `.md` files
referenced via `body-file:` must contain the body only — Snowflake rejects
any `body-file` whose contents start with a `---` frontmatter delimiter.

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

### `rules`

An ordered list. Each rule has:

- `match` — optional glob (`*`, `**`, `?` supported) evaluated relative to
  the schema's folder. May be a single string or a list of patterns; a list
  matches when **any** of its patterns matches. **Every rule whose `match:`
  fires contributes**, in declaration order — later rules override earlier
  ones for scalar frontmatter and append to lists. A rule with no `match:`
  is a base layer that fires for every file; rules after it are overlays,
  not "unreachable".
- `schema` — an inline mapping with any of:
  - `frontmatter` — inline frontmatter map (the only place frontmatter
    can live).
  - `body` — inline literal body string.
  - `body-file` — path to an external body-only `.md` file. Mutually
    exclusive with `body`.
- `frontmatter-delete` — optional list of property names to exclude from
  inherited frontmatter when this rule's schema is merged.

If no rule matches and there is no catch-all, the schema contributes nothing
— but the inheritance walk continues through ancestors.

#### Layering rules within one schema

Because all matching rules contribute, a more-specific rule can layer extra
fields on top of a more-general rule without restating the general fields:

```yaml
rules:
  - match: ["inbox/**", "source/**"]
    schema:
      frontmatter:
        id: "{{snowflake_id}}"
        title:
        author:
        # …all the library fields…

  # Archive items get everything above, plus `archived:`.
  - match: ["inbox/archive/**", "source/archive/**"]
    schema:
      frontmatter:
        archived: "{{time}}"
```

### Body: inline vs external file

Use `body:` for short, inline bodies:

```yaml
rules:
  - schema:
      frontmatter:
        type: note
        tags: [auto]
      body: |
        # {{title}}
        Created {{date}}
```

Use `body-file:` to load the body from a body-only `.md` file (the file
must contain no frontmatter):

```yaml
rules:
  - schema:
      frontmatter:
        type: note
      body-file: ./_templates/note.md
```

Both forms support all variables (`{{title}}`, `{{date}}`, `{{time}}`,
`{{snowflake_id}}`).

#### `body-file` paths

- Bare and `./` paths resolve relative to the schema's folder
  (`./web.md` from `Projects/.schema.yaml` → `Projects/web.md`).
- `../` walks up one directory.
- A leading `/` means vault-absolute (`/Templates/note.md`).
- Paths that escape the vault root are rejected.

## Two schema locations

A folder can declare its schema in either form; the folder form wins over
the flat form when both coexist (a console warning is emitted on conflict).

**Flat YAML (`.schema.yaml`):**
```
Projects/
├── .schema.yaml
├── note-1.md
└── note-2.md
```

**Folder form (`.schema/schema.yaml`):**
```
Projects/
├── .schema/
│   ├── schema.yaml      # note: no leading dot — parent is already hidden
│   └── web.md           # bundled template referenced from schema.yaml
├── note-1.md
└── note-2.md
```

In the folder form, `./web.md` in `schema.yaml` resolves inside `.schema/`,
so templates can be co-located with the schema that references them.

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
rules:
  - schema:
      frontmatter:
        type: project
    frontmatter-delete: [legacy_field]
```

Per-rule only. There is no top-level `frontmatter-delete` — repeat it across
rules if you need it everywhere.

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

## Migrating from earlier formats

- **`SCHEMA.md`** (the original combined schema-and-template file) — rename
  each to `.schema.yaml` and wrap its frontmatter and body inside a single
  catch-all `rules:` entry. If the old file had a `delete: [...]` key in its
  frontmatter, move it to the rule's `frontmatter-delete:` list.
- **String-form `schema:` paths** (e.g. `schema: ./note.md`) — replace with
  an inline mapping. Move the `.md` template's frontmatter into the rule's
  `schema.frontmatter:`, strip the frontmatter from the `.md` file, and
  reference the now body-only file via `body-file:`.
- **Global exclude patterns setting** — port those patterns to an
  `exclude:` list in a vault-root `.schema.yaml`.

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
├── schema-resolver.ts         # picks a template via first-match-wins (catch-all = no `match:`)
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

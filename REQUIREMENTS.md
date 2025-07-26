# Snowflake Auto-Templating Requirements

## What is this document?
This document defines the precise behavior of the Snowflake plugin using EARS (Easy Approach to Requirements Syntax). EARS helps us write clear, unambiguous requirements that are easy to understand and test.

### How to read EARS requirements:
- **"When..."** = Something happens (like creating a file)
- **"While..."** = The system is in a certain state (like templating being disabled)
- **"Where..."** = An optional feature is present (like having a default template)
- **"If...then..."** = Handling edge cases or errors
- **"shall"** = What the system must do (this is the key word in every requirement)

Each requirement has a unique ID (like REQ-001) for easy reference.

---

## 🎯 Core Purpose

**REQ-001**: The Snowflake plugin shall transform from a simple ID generator into a comprehensive auto-templating system for Obsidian notes.

*Context: Previously, Snowflake only added unique IDs to files. Now it will apply full templates based on folder location, with ID generation as just one template variable.*

---

## 📁 Template Application Rules

### When to Apply Templates

**REQ-002**: When a user creates a new markdown file (.md) in a folder that has a template mapping, the Snowflake plugin shall automatically apply that folder's template to the file.

*Example: If "Projects" folder → "project-template.md", then creating "my-project.md" in Projects gets the template applied.*

**REQ-003**: When a user creates a new markdown file in a folder WITHOUT a specific template mapping, the Snowflake plugin shall apply the default template (if one is configured).

*This provides a fallback so users can have a baseline template for all notes.*

**REQ-004**: When a user creates any non-markdown file (like .txt, .pdf, .json), the Snowflake plugin shall NOT apply any template.

*Rationale: Templates could corrupt binary files or data files. Only .md files are safe to template.*

**REQ-005**: While auto-templating is disabled in settings, the Snowflake plugin shall NOT automatically apply templates to any new files.

*But manual commands should still work - see REQ-023.*

### How Templates Are Applied

**REQ-006**: When applying a template to a file that already has content, the Snowflake plugin shall merge the template with existing content rather than overwriting it.

*Critical behavior: User content must never be lost*

**REQ-007**: When inserting template body content into a file with existing content, the Snowflake plugin shall insert it at the cursor position.

*This gives users control over where template content appears.*

---

## 🏷️ Frontmatter Handling

*Frontmatter is the YAML metadata at the top of markdown files between --- markers*

**REQ-008**: When both the template and the existing file have frontmatter, the Snowflake plugin shall intelligently merge them into a single frontmatter block.

**REQ-009**: If a frontmatter key exists in both the file and template, then the Snowflake plugin shall keep the FILE's value and ignore the template's value.

*Example: If file has `id: 12345` and template has `id: {{snowflake_id}}`, keep `12345`*
*Rationale: Preserve user data! Never overwrite existing metadata.*

**REQ-010**: When merging frontmatter, the Snowflake plugin shall add any keys from the template that don't exist in the file.

*Result: Union of both frontmatters, with file values winning conflicts.*

**REQ-010a**: When merging frontmatter fields that are of list type (like arrays or tags), the Snowflake plugin shall concatenate the values from both the template and the existing file rather than overwriting them.

*Example: If file has `tags: [project, urgent]` and template has `tags: [template-tag, default]`, the result should be `tags: [project, urgent, template-tag, default]`*
*Rationale: List-type fields often represent accumulative data where both sets of values are meaningful.*

### Simple Template Inheritance

**REQ-032**: When a file is created in a nested folder, the Snowflake plugin shall check parent folders for template mappings and apply them in order from root to leaf.

*Example: If "Projects" uses base-template.md and "Projects/Web" uses web-template.md, files in Projects/Web get both templates applied.*

**REQ-033**: When multiple templates apply due to folder nesting, the Snowflake plugin shall merge them with the same rules as REQ-008/009/010 (child folder templates override parent folder templates).

*Just like existing merge behavior - predictable and simple.*

**REQ-033a**: When merging list-type fields (arrays/tags) across multiple templates in an inheritance chain, the Snowflake plugin shall concatenate values from all templates in the chain, maintaining order from parent to child.

*Example: If root template has `tags: [base]`, Projects template has `tags: [project]`, and Projects/Web template has `tags: [web, frontend]`, a file in Projects/Web gets `tags: [base, project, web, frontend]`*
*Rationale: Template inheritance for lists should be additive, allowing each level to contribute its own values.*

### Property Exclusion with "delete" Lists

**REQ-034**: When a template contains a frontmatter property called "delete" with a list of property names, the Snowflake plugin shall exclude those properties from being inherited by files using that template.

*Example: If a template has `delete: [author, date]`, then files using this template won't inherit the `author` or `date` properties from parent templates.*
*Rationale: Allows templates to selectively override inheritance for specific properties.*

**REQ-035**: When processing the "delete" list during template inheritance, the Snowflake plugin shall apply exclusions at each level of the inheritance chain, but allow child templates to re-add excluded properties.

*Example scenario:*
- *Template A has `author: John` and `date: 2024-01-01`*
- *Template B inherits from A and has `delete: [author]` - excludes author*
- *Template C inherits from B and has `author: Jane` - re-adds author*
- *Result: Files using Template C will have `author: Jane` and `date: 2024-01-01`*

**REQ-036**: The Snowflake plugin shall not include the "delete" property itself in the final merged frontmatter of files.

*Rationale: The "delete" list is a template directive, not content that should appear in actual notes.*

**REQ-037**: If a property is both defined in a template's frontmatter AND listed in its "delete" list, then the Snowflake plugin shall include the property (the explicit definition takes precedence over the delete list).

*Example: If a template has `tags: [template-specific]` and `delete: [tags]`, the `tags: [template-specific]` will be included.*
*Rationale: Explicit definitions should always win over exclusions.*

### Property Cleanup After Template Application

**REQ-038**: When applying a template chain to an existing file, if the file has properties that were not added as part of the template chain AND are empty (have no values), then the Snowflake plugin shall remove those properties. This cleanup shall NOT occur when applying a specific template using the "Apply specific template" command.

*Example scenario:*
- *Existing file has: `author: `, `date: 2024-01-01`, `tags: [personal]`*
- *Template chain provides: `date: {{date}}`, `tags: [template-tag]`*
- *Result when applying mapped templates: `author` property is removed (empty and not from template), `date` and `tags` are merged*
- *Result when applying specific template: All existing properties are preserved, including empty `author`*
*Rationale: Clean up empty properties when applying the full template configuration for a folder, but preserve all properties when manually applying individual templates to avoid unintended data loss.*


---

## 🔤 Template Variables

### Supported Variables

**REQ-011**: When processing templates, the Snowflake plugin shall replace these variables:
- `{{title}}` → The filename without .md extension
- `{{date}}` → Current date
- `{{time}}` → Current time
- `{{snowflake_id}}` → A unique 10-character ID

*Example: `{{title}}` in a file named "Meeting Notes.md" becomes "Meeting Notes"*

### Variable Formatting

**REQ-012**: The Snowflake plugin shall use "YYYY-MM-DD" as the default format for {{date}} (e.g., "2024-01-15").

**REQ-013**: The Snowflake plugin shall use "HH:mm" as the default format for {{time}} (e.g., "14:30").

**REQ-014**: Where users have configured custom date/time formats in settings, the Snowflake plugin shall use those formats instead of defaults.

*Format patterns use moment.js syntax, like "DD/MM/YYYY" or "h:mm A"*

### Unique ID Behavior

**REQ-015**: When generating a {{snowflake_id}}, the Snowflake plugin shall create a 10-character string using only letters and numbers.

*These IDs use crypto-secure random generation to ensure uniqueness.*

**REQ-016**: If a template contains {{snowflake_id}} multiple times, then the Snowflake plugin shall replace ALL instances with the SAME ID value.

*Example: A template with ID in both frontmatter and footer gets the same ID in both places.*

---

## 🎮 User Commands

### Manual Template Application

**REQ-017**: When a user runs "Apply template to current note", the Snowflake plugin shall apply the appropriate template to the currently open markdown file.

*This replaces the old "Add ID to current note" command.*
*The "appropriate template" is determined by the file's folder mapping.*

**REQ-018**: When manually applying a template to a file with existing content, the Snowflake plugin shall follow the same merging rules as automatic application.

*Consistency is key - manual and auto should behave the same way.*

### Batch Operations

**REQ-019**: When a user runs "Insert template to all notes in folder", the Snowflake plugin shall show a folder selection dialog.

**REQ-020**: After folder selection, the Snowflake plugin shall apply templates to ALL markdown files in that folder.

*This replaces the old "Add IDs to all notes in folder" command.*

**REQ-021**: While processing multiple files in a batch operation, the Snowflake plugin shall do so asynchronously to keep the UI responsive.

*Nobody likes a frozen interface!*

**REQ-022**: When a batch operation completes, the Snowflake plugin shall show a notice like "Templates applied to 15 notes".

---

## ⚙️ Settings Configuration

### What Users Can Configure

**REQ-023**: The Snowflake plugin shall allow users to configure these settings:
- **templateMappings**: Which folders use which templates
- **templatesFolder**: Where to look for template files (default: "Templates")

*All stored in data.json for persistence across sessions.*

### How Settings Work

**REQ-024**: When a user adds a folder→template mapping in settings, the Snowflake plugin shall immediately use it for new files in that folder.

*No restart required - changes take effect instantly.*

**REQ-025**: Where auto-templating is disabled but a user runs a manual command, the Snowflake plugin shall still apply the template.

*Disabling only affects automatic behavior, not manual commands.*

---

## ⚠️ Error Handling

### Missing Template Files

**REQ-026**: If a template file doesn't exist when needed, then the Snowflake plugin shall:
1. Create the new file empty (no template)
2. Show a notice: "Template file not found: [path]"

*Better to create an empty file than block the user's workflow.*

### Invalid Template Content

**REQ-027**: If a template contains malformed variable syntax (like `{{date}`), then the Snowflake plugin shall leave it unchanged in the output.

*Don't crash on bad syntax - just pass it through.*

**REQ-028**: When encountering invalid template variables, the Snowflake plugin shall show a warning to help users fix their templates.

### File Access Issues

**REQ-029**: If the plugin cannot read a template due to permissions, then the Snowflake plugin shall show a user-friendly error and create the file without a template.

*Graceful degradation - always let the user keep working.*

## 📋 Summary

This requirements document defines how Snowflake evolves from a simple ID generator to a full template system. The key principles are:

1. **Never lose user data** - Always merge, never overwrite
2. **Be predictable** - Same behavior whether automatic or manual
3. **Fail gracefully** - Errors shouldn't block users
4. **Stay simple** - Templates are just text files with variables
5. **Respect user choice** - Existing values always win over template values

Each requirement can be independently tested and verified, ensuring the plugin behaves correctly in all scenarios.

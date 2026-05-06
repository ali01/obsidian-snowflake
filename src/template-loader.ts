/**
 * Template Loader
 *
 * Resolves which schemas apply to a given file by walking the folder
 * hierarchy root → leaf and consulting each ancestor folder's `.schema.yaml`
 * (or `.schema/schema.yaml`). Within a single schema, every rule whose
 * `match:` fires contributes a chain item, in declaration order — later
 * items override earlier ones for scalar frontmatter, arrays concatenate.
 *
 * Frontmatter always lives in the inline schema; bodies may be inline
 * (`body:`) or loaded from an external body-only `.md` file (`body-file:`).
 * The chain is materialized into `{ content }` strings and fed into the
 * existing merge engine in `template-applicator.ts` unchanged.
 */

import type { Vault } from 'obsidian';
import { dump as dumpYaml } from 'js-yaml';
import type {
  MarkdownFile,
  ErrorContext,
  TemplateChain,
  TemplateChainItem,
  ResolvedTemplate,
  InlineSchema
} from './types';
import { SPEC_KEYS } from './types';
import { findSchemaFile } from './schema-locator';
import { parseSchema } from './schema-parser';
import { selectTemplates } from './schema-resolver';
import { matchesExclusionPattern } from './pattern-matcher';
import { ErrorHandler } from './error-handler';

export class TemplateLoader {
  private readonly vault: Vault;
  private readonly errorHandler: ErrorHandler;

  constructor(vault: Vault) {
    this.vault = vault;
    this.errorHandler = ErrorHandler.getInstance();
  }

  public async loadTemplate(templatePath: string): Promise<string | null> {
    try {
      // Use the adapter rather than the indexed vault tree: schema files and
      // any template files bundled inside `.schema/` are dotfile paths that
      // `vault.getAbstractFileByPath` does not expose.
      const exists = await this.vault.adapter.exists(templatePath);
      if (!exists) {
        console.warn(`Template not found: ${templatePath}`);
        return null;
      }
      return await this.vault.adapter.read(templatePath);
    } catch (error) {
      const errorContext: ErrorContext = {
        operation: 'load_template',
        templatePath
      };
      this.errorHandler.handleErrorSilently(error, errorContext);
      return null;
    }
  }

  /**
   * Build the schema inheritance chain for a file.
   *
   * Walks from vault root down to the file's parent folder. At each level,
   * looks up the governing schema, evaluates its `exclude:` (which
   * short-circuits the entire chain), runs the rule resolver, and pushes a
   * chain item if the schema selected a template.
   *
   * Phase 1 only — the chain item's `content` is materialized in
   * `loadTemplateChain`.
   */
  public async getTemplateChain(file: MarkdownFile): Promise<TemplateChain> {
    const templates: TemplateChainItem[] = [];
    const folderPaths = this.getFolderHierarchy(file);

    for (let i = 0; i < folderPaths.length; i++) {
      const folderPath = folderPaths[i];
      const location = await findSchemaFile(this.vault, folderPath);
      if (!location) continue;

      const yamlText = await this.loadTemplate(location.schemaPath);
      if (yamlText === null) continue;

      const config = parseSchema(yamlText, location.schemaPath);
      if (config === null) continue;

      const relativePath = relativeTo(file.path, location.matchAnchor);

      // Hard exclude: any matching pattern aborts the chain entirely.
      if (config.exclude && matchesExclusionPattern(relativePath, config.exclude)) {
        return { templates: [], hasInheritance: false };
      }

      const resolvedRules = selectTemplates(config, relativePath);
      for (const resolved of resolvedRules) {
        templates.push({
          schemaPath: location.schemaPath,
          folderPath: location.matchAnchor,
          templateAnchor: location.templateAnchor,
          depth: i,
          resolvedTemplate: resolved
        });
      }
    }

    return { templates, hasInheritance: templates.length > 1 };
  }

  public async loadTemplateChain(chain: TemplateChain): Promise<TemplateChain> {
    const loadedTemplates: TemplateChainItem[] = [];

    for (const item of chain.templates) {
      const content = await this.materializeContent(item.resolvedTemplate, item.templateAnchor);
      if (content === null) {
        console.warn(
          `Skipping missing template in chain: ${describeResolved(item.resolvedTemplate)}`
        );
        continue;
      }
      loadedTemplates.push({ ...item, content });
    }

    return {
      templates: loadedTemplates,
      hasInheritance: loadedTemplates.length > 1
    };
  }

  /**
   * Folder paths from vault root to the file's immediate parent.
   * Root is represented as the empty string.
   */
  private getFolderHierarchy(file: MarkdownFile): string[] {
    const paths: string[] = [''];

    const folderPath = file.parent?.path;
    if (folderPath === undefined || folderPath === '' || folderPath === '/') {
      return paths;
    }

    const parts = folderPath.split('/').filter((p) => p !== '');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      paths.push(currentPath);
    }

    return paths;
  }

  /**
   * Materialize a resolved template into the standard
   * `---\nfrontmatter\n---\nbody` content string consumed by the merger.
   *
   * Frontmatter always comes from the inline schema. The body is either the
   * inline `body:` literal or the contents of the file referenced by
   * `body-file:` (which must be body-only — frontmatter in that file is
   * rejected). When `frontmatterDelete` is set, a `delete:` entry is
   * injected into the serialized frontmatter so the existing
   * `processWithDeleteList` / `mergeWithDeleteList` semantics apply
   * unchanged.
   */
  private async materializeContent(
    resolved: ResolvedTemplate,
    templateAnchor: string
  ): Promise<string | null> {
    const inline = resolved.schema;
    let body = inline.body ?? '';

    const bodyFile = inline['body-file'];
    if (bodyFile !== undefined) {
      const path = resolveTemplatePath(bodyFile, templateAnchor);
      if (path === null) {
        console.warn(`Snowflake: body-file path escapes the vault: ${bodyFile}`);
        return null;
      }
      const fileContent = await this.loadTemplate(path);
      if (fileContent === null) return null;
      if (FRONTMATTER_LEAD.test(fileContent)) {
        console.warn(
          `Snowflake: body-file ${path} must not contain frontmatter — ` +
            `frontmatter belongs in schema.yaml.`
        );
        return null;
      }
      body = fileContent;
    }

    return serializeInlineSchema(
      { frontmatter: inline.frontmatter, body },
      resolved.frontmatterDelete
    );
  }
}

const FRONTMATTER_LEAD = /^---\s*\n/;

/**
 * Compute the path of a file relative to the schema's `matchAnchor` folder.
 * The returned path uses forward slashes and has no leading slash.
 */
function relativeTo(filePath: string, anchor: string): string {
  if (anchor === '' || anchor === '/') return filePath;
  const prefix = anchor + '/';
  if (filePath.startsWith(prefix)) return filePath.slice(prefix.length);
  return filePath;
}

/**
 * Resolve an external template reference against the schema's templateAnchor.
 *
 * - Leading `/` means vault-absolute (e.g. `/Templates/note.md`).
 * - `./` and `../` segments are normalized.
 * - Returns `null` if the path escapes the vault root.
 */
function resolveTemplatePath(ref: string, templateAnchor: string): string | null {
  let combined: string;
  if (ref.startsWith('/')) {
    combined = ref.slice(1);
  } else if (templateAnchor === '' || templateAnchor === '/') {
    combined = ref;
  } else {
    combined = templateAnchor + '/' + ref;
  }

  const segments: string[] = [];
  for (const segment of combined.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

function serializeInlineSchema(
  schema: InlineSchema,
  frontmatterDelete: string[] | undefined
): string {
  const fmObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema.frontmatter ?? {})) {
    if (key.startsWith('$')) continue;
    fmObj[key] = stripMetaKeys(fieldDefault(value));
  }
  if (frontmatterDelete && frontmatterDelete.length > 0) {
    fmObj['delete'] = frontmatterDelete;
  }

  const fmKeys = Object.keys(fmObj);
  const body = schema.body ?? '';

  if (fmKeys.length === 0) {
    return body;
  }

  // `'!!null': 'empty'` makes `key: null` render as `key:` (empty value)
  // so an inline `frontmatter: { foo: }` produces `foo:` in the rendered
  // template — matching how a hand-written placeholder field looks.
  const yaml = dumpYaml(fmObj, {
    lineWidth: -1,
    noRefs: true,
    styles: { '!!null': 'empty' }
  });
  const fmBlock = '---\n' + yaml + '---\n';
  return body === '' ? fmBlock : fmBlock + body;
}

/**
 * If `value` is a structured field spec (a mapping containing any key from
 * `SPEC_KEYS` or any `$`-prefixed meta key), return its `default:` (or null
 * if absent). Otherwise return the value verbatim — preserves backward-
 * compatible literal-default behavior for every existing schema.
 */
function fieldDefault(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  if (!hasAnySpecKey(value)) return value;
  return 'default' in value ? value.default : null;
}

/**
 * Recursively remove keys starting with `$` from any mapping or array of
 * mappings. The `$` prefix marks plugin metadata (`$contract:`, future meta
 * keys) that must never leak into materialized note frontmatter.
 */
function stripMetaKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripMetaKeys(v));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$')) continue;
      out[k] = stripMetaKeys(v);
    }
    return out;
  }
  return value;
}

function hasAnySpecKey(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (SPEC_KEYS.has(key)) return true;
    if (key.startsWith('$')) return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeResolved(r: ResolvedTemplate): string {
  const bodyFile = r.schema['body-file'];
  if (bodyFile !== undefined) return bodyFile;
  return '<inline schema>';
}

/**
 * Test-only exports
 */
export const TemplateLoaderTestUtils = {
  resolveTemplatePath: (ref: string, templateAnchor: string): string | null =>
    resolveTemplatePath(ref, templateAnchor),
  serializeInlineSchema: (
    schema: InlineSchema,
    frontmatterDelete: string[] | undefined
  ): string => serializeInlineSchema(schema, frontmatterDelete),
  relativeTo: (filePath: string, anchor: string): string => relativeTo(filePath, anchor),
  fieldDefault: (value: unknown): unknown => fieldDefault(value),
  stripMetaKeys: (value: unknown): unknown => stripMetaKeys(value)
};

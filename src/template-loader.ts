/**
 * Template Loader
 *
 * Resolves which schema applies to a given file by walking the folder
 * hierarchy root → leaf and consulting each ancestor folder's `.schema.yaml`
 * (or `.schema/schema.yaml`). Each schema either selects an inline template,
 * routes to an external template `.md` file, or contributes nothing (in
 * which case the walk continues through ancestors).
 *
 * The chain is materialized into `{ content }` strings and fed into the
 * existing merge engine in `template-applicator.ts` unchanged.
 */

import { TFile } from 'obsidian';
import type { Vault } from 'obsidian';
import { dump as dumpYaml } from 'js-yaml';
import type {
  MarkdownFile,
  ErrorContext,
  TemplateChain,
  TemplateChainItem,
  ResolvedTemplate,
  InlineTemplate
} from './types';
import { findSchemaFile } from './schema-locator';
import { parseSchema } from './schema-parser';
import { selectTemplate } from './schema-resolver';
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
      const templateFile = this.vault.getAbstractFileByPath(templatePath);
      if (!templateFile || !(templateFile instanceof TFile)) {
        console.warn(`Template not found: ${templatePath}`);
        return null;
      }
      return await this.vault.read(templateFile);
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
      const location = findSchemaFile(this.vault, folderPath);
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

      const resolved = selectTemplate(config, relativePath);
      if (!resolved) continue;

      templates.push({
        schemaPath: location.schemaPath,
        folderPath: location.matchAnchor,
        templateAnchor: location.templateAnchor,
        depth: i,
        resolvedTemplate: resolved
      });
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
   * - Inline templates are serialized via `js-yaml.dump`.
   * - External templates are read from their resolved path.
   * - In both cases, when `frontmatterDelete` is set, a `delete:` entry is
   *   injected into the serialized frontmatter so the existing
   *   `processWithDeleteList` / `mergeWithDeleteList` semantics apply
   *   unchanged.
   */
  private async materializeContent(
    resolved: ResolvedTemplate,
    templateAnchor: string
  ): Promise<string | null> {
    const fmDelete = resolved.frontmatterDelete;

    if (typeof resolved.template === 'string') {
      const path = resolveTemplatePath(resolved.template, templateAnchor);
      if (path === null) {
        console.warn(`Snowflake: template path escapes the vault: ${resolved.template}`);
        return null;
      }
      const content = await this.loadTemplate(path);
      if (content === null) return null;
      return fmDelete ? injectDeleteList(content, fmDelete) : content;
    }

    return serializeInlineTemplate(resolved.template, fmDelete);
  }
}

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

function serializeInlineTemplate(
  template: InlineTemplate,
  frontmatterDelete: string[] | undefined
): string {
  const fmObj: Record<string, unknown> = { ...(template.frontmatter ?? {}) };
  if (frontmatterDelete && frontmatterDelete.length > 0) {
    fmObj['delete'] = frontmatterDelete;
  }

  const fmKeys = Object.keys(fmObj);
  const body = template.body ?? '';

  if (fmKeys.length === 0) {
    return body;
  }

  const yaml = dumpYaml(fmObj, { lineWidth: -1, noRefs: true });
  const fmBlock = '---\n' + yaml + '---\n';
  return body === '' ? fmBlock : fmBlock + body;
}

function injectDeleteList(content: string, deleteList: string[]): string {
  const line = `delete: [${deleteList.map(quoteYamlScalar).join(', ')}]`;
  const fmRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = content.match(fmRegex);
  if (match) {
    const newFm = match[1] + '\n' + line;
    return content.replace(fmRegex, '---\n' + newFm + '\n---');
  }
  return `---\n${line}\n---\n` + content;
}

function quoteYamlScalar(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

function describeResolved(r: ResolvedTemplate): string {
  return typeof r.template === 'string' ? r.template : '<inline template>';
}

/**
 * Test-only exports
 */
export const TemplateLoaderTestUtils = {
  resolveTemplatePath: (ref: string, templateAnchor: string): string | null =>
    resolveTemplatePath(ref, templateAnchor),
  serializeInlineTemplate: (
    template: InlineTemplate,
    frontmatterDelete: string[] | undefined
  ): string => serializeInlineTemplate(template, frontmatterDelete),
  injectDeleteList: (content: string, deleteList: string[]): string =>
    injectDeleteList(content, deleteList),
  relativeTo: (filePath: string, anchor: string): string => relativeTo(filePath, anchor)
};

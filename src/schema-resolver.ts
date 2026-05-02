/**
 * Schema resolver
 *
 * Given a parsed `SchemaConfig` and a file's path relative to the schema's
 * folder, returns the matched template and its `frontmatter-delete` list.
 *
 * Matching strategy: first matching rule wins (top-down order); if no rule
 * matches, fall through to `default`; if neither, return `null`.
 */

import type { SchemaConfig, SchemaTemplateBlock, ResolvedTemplate } from './types';
import { matchesGlob } from './pattern-matcher';

export function selectTemplate(
  config: SchemaConfig,
  relativePath: string
): ResolvedTemplate | null {
  if (config.rules) {
    for (const rule of config.rules) {
      if (matchesGlob(relativePath, rule.match)) {
        return blockToResolved(rule);
      }
    }
  }
  if (config.default) {
    return blockToResolved(config.default);
  }
  return null;
}

function blockToResolved(block: SchemaTemplateBlock): ResolvedTemplate {
  const resolved: ResolvedTemplate = { template: block.template };
  const fmDelete = block['frontmatter-delete'];
  if (fmDelete && fmDelete.length > 0) {
    resolved.frontmatterDelete = fmDelete;
  }
  return resolved;
}

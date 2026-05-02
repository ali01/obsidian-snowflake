/**
 * Schema resolver
 *
 * Given a parsed `SchemaConfig` and a file's path relative to the schema's
 * folder, returns the matched rule's `schema` value and its
 * `frontmatter-delete` list.
 *
 * Matching strategy: first matching rule wins (top-down order). A rule with
 * no `match:` is the catch-all and matches every file. Returns `null` when no
 * rule matches.
 */

import type { SchemaConfig, SchemaRule, ResolvedTemplate } from './types';
import { matchesGlob } from './pattern-matcher';

export function selectTemplate(
  config: SchemaConfig,
  relativePath: string
): ResolvedTemplate | null {
  if (!config.rules) return null;
  for (const rule of config.rules) {
    if (rule.match === undefined || matchesGlob(relativePath, rule.match)) {
      return ruleToResolved(rule);
    }
  }
  return null;
}

function ruleToResolved(rule: SchemaRule): ResolvedTemplate {
  const resolved: ResolvedTemplate = { schema: rule.schema };
  const fmDelete = rule['frontmatter-delete'];
  if (fmDelete && fmDelete.length > 0) {
    resolved.frontmatterDelete = fmDelete;
  }
  return resolved;
}

/**
 * Schema resolver
 *
 * Given a parsed `SchemaConfig` and a file's path relative to the schema's
 * folder, returns every rule whose `match:` fires for that file, in
 * declaration order. Each becomes one item in the template chain and is
 * merged by the existing engine — later items override earlier ones for
 * scalars, arrays concatenate. A rule with no `match:` is a base layer
 * that fires for every file; rules listed after it are overlays, not
 * "unreachable".
 */

import type { SchemaConfig, SchemaRule, ResolvedTemplate } from './types';
import { matchesGlob } from './pattern-matcher';

export function selectTemplates(
  config: SchemaConfig,
  relativePath: string
): ResolvedTemplate[] {
  if (!config.rules) return [];
  const out: ResolvedTemplate[] = [];
  for (const rule of config.rules) {
    if (ruleMatches(rule, relativePath)) {
      out.push(ruleToResolved(rule));
    }
  }
  return out;
}

function ruleMatches(rule: SchemaRule, relativePath: string): boolean {
  if (rule.match === undefined) return true;
  const patterns = Array.isArray(rule.match) ? rule.match : [rule.match];
  return patterns.some((p) => matchesGlob(relativePath, p));
}

function ruleToResolved(rule: SchemaRule): ResolvedTemplate {
  const resolved: ResolvedTemplate = { schema: rule.schema };
  const fmDelete = rule['frontmatter-delete'];
  if (fmDelete && fmDelete.length > 0) {
    resolved.frontmatterDelete = fmDelete;
  }
  return resolved;
}

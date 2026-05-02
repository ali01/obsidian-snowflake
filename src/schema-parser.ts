/**
 * Schema parser
 *
 * Parses the YAML text of a `.schema.yaml` (or `.schema/schema.yaml`) into a
 * typed `SchemaConfig`. Validates the top-level shape and each rule entry.
 *
 * Returns `null` and emits a `console.warn` for malformed input. Downstream
 * code treats `null` as "no schema at this level" and continues walking the
 * inheritance chain.
 */

import { load as parseYaml, YAMLException } from 'js-yaml';
import type { SchemaConfig, SchemaRule, InlineSchema } from './types';

/**
 * Parse `.schema.yaml` text into a typed `SchemaConfig`.
 *
 * @param yamlText - Raw file contents
 * @param schemaPath - Path of the schema file (used in warning messages only)
 * @returns Parsed config, or `null` if malformed
 */
export function parseSchema(yamlText: string, schemaPath = '<schema>'): SchemaConfig | null {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    const reason = err instanceof YAMLException ? err.message : String(err);
    console.warn(`Snowflake: Failed to parse ${schemaPath}: ${reason}`);
    return null;
  }

  if (raw === null || raw === undefined) {
    // Empty file is treated as a no-op schema.
    return {};
  }

  if (!isPlainObject(raw)) {
    console.warn(`Snowflake: ${schemaPath} must be a YAML mapping at the top level.`);
    return null;
  }

  const config: SchemaConfig = {};

  // exclude
  if ('exclude' in raw) {
    const exclude = parseStringList(raw.exclude, schemaPath, 'exclude');
    if (exclude === null) return null;
    if (exclude.length > 0) config.exclude = exclude;
  }

  // rules
  if ('rules' in raw && raw.rules !== undefined && raw.rules !== null) {
    if (!Array.isArray(raw.rules)) {
      console.warn(`Snowflake: ${schemaPath}: \`rules\` must be a list.`);
      return null;
    }
    const rules: SchemaRule[] = [];
    let catchAllIndex = -1;
    for (let i = 0; i < raw.rules.length; i++) {
      const rule = parseRule(raw.rules[i], schemaPath, i);
      if (rule === null) return null;
      if (catchAllIndex !== -1) {
        console.warn(
          `Snowflake: ${schemaPath}: rules[${String(i)}] is unreachable; ` +
            `rules[${String(catchAllIndex)}] is a catch-all (no \`match\`).`
        );
      }
      if (rule.match === undefined) catchAllIndex = i;
      rules.push(rule);
    }
    if (rules.length > 0) config.rules = rules;
  }

  return config;
}

function parseRule(raw: unknown, schemaPath: string, index: number): SchemaRule | null {
  if (!isPlainObject(raw)) {
    console.warn(`Snowflake: ${schemaPath}: rules[${String(index)}] must be a mapping.`);
    return null;
  }

  let match: string | undefined;
  if ('match' in raw && raw.match !== undefined && raw.match !== null) {
    if (typeof raw.match !== 'string' || raw.match.trim() === '') {
      console.warn(
        `Snowflake: ${schemaPath}: rules[${String(index)}] has an empty or non-string \`match\`.`
      );
      return null;
    }
    match = raw.match;
  }

  if (!('schema' in raw)) {
    console.warn(`Snowflake: ${schemaPath}: rules[${String(index)}] is missing \`schema\`.`);
    return null;
  }
  const schema = parseRuleSchema(raw.schema, schemaPath, `rules[${String(index)}]`);
  if (schema === null) return null;

  const rule: SchemaRule = { schema };
  if (match !== undefined) rule.match = match;

  if ('frontmatter-delete' in raw) {
    const list = parseStringList(
      raw['frontmatter-delete'],
      schemaPath,
      `rules[${String(index)}].frontmatter-delete`
    );
    if (list === null) return null;
    if (list.length > 0) rule['frontmatter-delete'] = list;
  }

  return rule;
}

function parseRuleSchema(
  raw: unknown,
  schemaPath: string,
  context: string
): string | InlineSchema | null {
  if (typeof raw === 'string') {
    if (raw.trim() === '') {
      console.warn(`Snowflake: ${schemaPath}: ${context}.schema path is empty.`);
      return null;
    }
    return raw;
  }
  if (isPlainObject(raw)) {
    const inline: InlineSchema = {};
    if ('frontmatter' in raw && raw.frontmatter !== undefined && raw.frontmatter !== null) {
      if (!isPlainObject(raw.frontmatter)) {
        console.warn(
          `Snowflake: ${schemaPath}: ${context}.schema.frontmatter must be a mapping.`
        );
        return null;
      }
      inline.frontmatter = raw.frontmatter;
    }
    if ('body' in raw && raw.body !== undefined && raw.body !== null) {
      if (typeof raw.body !== 'string') {
        console.warn(`Snowflake: ${schemaPath}: ${context}.schema.body must be a string.`);
        return null;
      }
      inline.body = raw.body;
    }
    return inline;
  }
  console.warn(
    `Snowflake: ${schemaPath}: ${context}.schema must be a path string or inline mapping.`
  );
  return null;
}

function parseStringList(raw: unknown, schemaPath: string, context: string): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    console.warn(`Snowflake: ${schemaPath}: \`${context}\` must be a list of strings.`);
    return null;
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      console.warn(`Snowflake: ${schemaPath}: \`${context}\` entries must all be strings.`);
      return null;
    }
    if (item.trim() !== '') out.push(item);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

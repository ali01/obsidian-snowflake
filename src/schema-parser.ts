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
import type { SchemaConfig, SchemaRule, SchemaTemplateBlock, InlineTemplate } from './types';

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

  // default
  if ('default' in raw && raw.default !== undefined && raw.default !== null) {
    const block = parseTemplateBlock(raw.default, schemaPath, 'default');
    if (block === null) return null;
    config.default = block;
  }

  // rules
  if ('rules' in raw && raw.rules !== undefined && raw.rules !== null) {
    if (!Array.isArray(raw.rules)) {
      console.warn(`Snowflake: ${schemaPath}: \`rules\` must be a list.`);
      return null;
    }
    const rules: SchemaRule[] = [];
    for (let i = 0; i < raw.rules.length; i++) {
      const rule = parseRule(raw.rules[i], schemaPath, i);
      if (rule === null) return null;
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
  if (typeof raw.match !== 'string' || raw.match.trim() === '') {
    console.warn(
      `Snowflake: ${schemaPath}: rules[${String(index)}] is missing a non-empty \`match\`.`
    );
    return null;
  }
  const block = parseTemplateBlock(raw, schemaPath, `rules[${String(index)}]`);
  if (block === null) return null;
  return { match: raw.match, ...block };
}

function parseTemplateBlock(
  raw: unknown,
  schemaPath: string,
  context: string
): SchemaTemplateBlock | null {
  if (!isPlainObject(raw)) {
    console.warn(`Snowflake: ${schemaPath}: ${context} must be a mapping.`);
    return null;
  }

  if (!('template' in raw)) {
    console.warn(`Snowflake: ${schemaPath}: ${context} is missing \`template\`.`);
    return null;
  }
  const template = parseTemplate(raw.template, schemaPath, context);
  if (template === null) return null;

  const block: SchemaTemplateBlock = { template };

  if ('frontmatter-delete' in raw) {
    const list = parseStringList(
      raw['frontmatter-delete'],
      schemaPath,
      `${context}.frontmatter-delete`
    );
    if (list === null) return null;
    if (list.length > 0) block['frontmatter-delete'] = list;
  }

  return block;
}

function parseTemplate(
  raw: unknown,
  schemaPath: string,
  context: string
): string | InlineTemplate | null {
  if (typeof raw === 'string') {
    if (raw.trim() === '') {
      console.warn(`Snowflake: ${schemaPath}: ${context}.template path is empty.`);
      return null;
    }
    return raw;
  }
  if (isPlainObject(raw)) {
    const inline: InlineTemplate = {};
    if ('frontmatter' in raw && raw.frontmatter !== undefined && raw.frontmatter !== null) {
      if (!isPlainObject(raw.frontmatter)) {
        console.warn(
          `Snowflake: ${schemaPath}: ${context}.template.frontmatter must be a mapping.`
        );
        return null;
      }
      inline.frontmatter = raw.frontmatter;
    }
    if ('body' in raw && raw.body !== undefined && raw.body !== null) {
      if (typeof raw.body !== 'string') {
        console.warn(`Snowflake: ${schemaPath}: ${context}.template.body must be a string.`);
        return null;
      }
      inline.body = raw.body;
    }
    return inline;
  }
  console.warn(
    `Snowflake: ${schemaPath}: ${context}.template must be a path string or inline mapping.`
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

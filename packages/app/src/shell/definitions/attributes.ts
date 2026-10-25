/**
 * Attribute definitions as the component editor changes them: one trait at a time, each change a
 * whole definition of the attribute that the core checks before anything is stored.
 */
import { valueFitsType } from '@visual-anything/core';
import type { AttributeDefinition, JsonValue } from '@visual-anything/schema';
import { readJson, readNumber, type AttributeType, type Reading } from '../inspector/attributes';

/**
 * The attribute with another type. Its default stays while it fits the new type, its choices while it
 * is a string and its unit while it is a number; its name and description always stay.
 */
export function retyped(definition: AttributeDefinition, type: AttributeType): AttributeDefinition {
  const next: AttributeDefinition = { name: definition.name, type };
  if (definition.default !== undefined && valueFitsType(definition.default, type)) {
    next.default = definition.default;
  }
  if (definition.description !== undefined) next.description = definition.description;
  if (type === 'string' && definition.choices !== undefined) next.choices = definition.choices;
  if (type === 'number' && definition.unit !== undefined) next.unit = definition.unit;
  return next;
}

/** The attribute with one optional trait set, or taken out when `value` is `undefined`. */
export function withTrait<K extends 'default' | 'description' | 'choices' | 'unit'>(
  definition: AttributeDefinition,
  key: K,
  value: AttributeDefinition[K] | undefined,
): AttributeDefinition {
  const next = { ...definition };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** Choices typed one per line: each line trimmed, blank and repeated lines left out; none for no line. */
export function readChoices(text: string): string[] | undefined {
  const choices = [...new Set(text.split('\n').map((line) => line.trim()))].filter(
    (line) => line !== '',
  );
  return choices.length === 0 ? undefined : choices;
}

/** The text of choices, one per line. */
export function choicesText(choices: readonly string[] | undefined): string {
  return (choices ?? []).join('\n');
}

/** A default typed for an attribute of a type; blank text stands for no default. */
export function readDefault(text: string, type: AttributeType): Reading<JsonValue | undefined> {
  if (text.trim() === '') return { ok: true, value: undefined };
  switch (type) {
    case 'string':
      return { ok: true, value: text };
    case 'number':
      return readNumber(text);
    case 'boolean':
      return text === 'true' || text === 'false'
        ? { ok: true, value: text === 'true' }
        : { ok: false, message: 'Write true or false.' };
    case 'json':
      return readJson(text);
  }
}

/** A default as text to edit; blank for none. */
export function defaultText(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The order of a definition's own attributes after one moves up (`-1`) or down (`1`) among them;
 * `undefined` when it cannot move that way.
 */
export function movedOrder(
  names: readonly string[],
  name: string,
  by: -1 | 1,
): string[] | undefined {
  const at = names.indexOf(name);
  const to = at + by;
  if (at === -1 || to < 0 || to >= names.length) return undefined;
  const next = [...names];
  next[at] = names[to] as string;
  next[to] = name;
  return next;
}

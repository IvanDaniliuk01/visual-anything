/**
 * The attributes of an element or a relation as the inspector shows them: every attribute its
 * component's or relation type's chain defines, then those it has that the chain does not define.
 */
import { valueFitsType } from '@visual-anything/core';
import type { AttributeDefinition, Attributes, JsonValue } from '@visual-anything/schema';

/** The types an attribute's value can have. */
export type AttributeType = AttributeDefinition['type'];

/** The attribute types, in the order the inspector offers them. */
export const ATTRIBUTE_TYPES: readonly AttributeType[] = ['string', 'number', 'boolean', 'json'];

/** How the inspector names an attribute type: as project files write it, and JSON in capitals. */
export function typeName(type: AttributeType): string {
  return type === 'json' ? 'JSON' : type;
}

/** One attribute of an element or a relation. */
export interface AttributeRow {
  name: string;
  /** Its definition in the chain; absent for an attribute the chain does not define. */
  definition: AttributeDefinition | undefined;
  /** The type its value is edited as: its definition's, or else the type of its value. */
  type: AttributeType;
  /** Whether the element or relation stores a value of its own. */
  stored: boolean;
  /** Its own value, or else its definition's default; `undefined` when it has neither. */
  value: JsonValue | undefined;
  /** Whether its own value differs from the default its definition gives. */
  differs: boolean;
  /** Whether its value does not fit the type its definition gives. */
  mismatched: boolean;
  /**
   * How its own value can be taken back: by going back to the default, by clearing a value that has no
   * default to go back to, or by removing an attribute the chain does not define. `undefined` when it
   * stores no value, or one equal to the default.
   */
  reset: 'default' | 'clear' | 'remove' | undefined;
}

/** The rows for the attributes a chain defines, in its order, then for the other values, in theirs. */
export function attributeRows(
  defined: readonly AttributeDefinition[],
  values: Attributes | undefined,
): AttributeRow[] {
  const own = new Map(Object.entries(values ?? {}));
  const rows: AttributeRow[] = defined.map((definition) => {
    const stored = own.has(definition.name);
    const value = stored ? own.get(definition.name) : definition.default;
    const hasDefault = definition.default !== undefined;
    const differs = stored && hasDefault && !sameJson(value, definition.default);
    return {
      name: definition.name,
      definition,
      type: definition.type,
      stored,
      value,
      differs,
      mismatched: value !== undefined && !valueFitsType(value, definition.type),
      reset: !stored ? undefined : !hasDefault ? 'clear' : differs ? 'default' : undefined,
    };
  });
  const names = new Set(defined.map((definition) => definition.name));
  for (const [name, value] of own) {
    if (names.has(name)) continue;
    rows.push({
      name,
      definition: undefined,
      type: typeOfValue(value),
      stored: true,
      value,
      differs: false,
      mismatched: false,
      reset: 'remove',
    });
  }
  return rows;
}

/** Whether two JSON values are equal, whatever the order of their keys. */
export function sameJson(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((each, index) => sameJson(each, b[index]))
    );
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]))
  );
}

/** Whether a value fits an attribute type: the core's rule, which every command checks. */
export { valueFitsType as fitsType } from '@visual-anything/core';

/** The type of a value: a string, a number or a boolean; anything else is JSON. */
export function typeOfValue(value: JsonValue): AttributeType {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'json';
}

/** The value a new attribute of a type starts with. */
export function initialValue(type: AttributeType): JsonValue {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'json':
      return null;
  }
}

/** A JSON value as text to edit, indented; empty for no value. */
export function jsonText(value: JsonValue | undefined): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

/** What was typed, read as a value, or why it cannot be. */
export type Reading<T> = { ok: true; value: T } | { ok: false; message: string };

/** Reads typed JSON. */
export function readJson(text: string): Reading<JsonValue> {
  if (text.trim() === '') return { ok: false, message: 'Enter a JSON value, such as null.' };
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Not valid JSON: ${reason}` };
  }
}

/** Reads a typed number. */
export function readNumber(text: string): Reading<number> {
  const value = Number(text);
  return text.trim() === '' || !Number.isFinite(value)
    ? { ok: false, message: 'Enter a number.' }
    : { ok: true, value };
}

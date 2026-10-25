/** A step's data in and out as text, edited as JSON in the step panel. */
import type { JsonValue } from '@visual-anything/schema';
import { fill } from '../i18n/translate';

/** The text a value is edited as: indented JSON, or nothing for no value. */
export function jsonText(value: JsonValue | undefined): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

/** What text says: a value, no value when it is blank, or why it is not JSON. */
export function readJson(
  text: string,
): { ok: true; value: JsonValue | undefined } | { ok: false; reason: string } {
  if (text.trim() === '') return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: fill('This is not JSON: {detail}', { detail }) };
  }
}

/** Whether two texts hold the same JSON, however they are spaced. */
export function sameJson(a: string, b: string): boolean {
  const first = readJson(a);
  const second = readJson(b);
  return (
    first.ok &&
    second.ok &&
    JSON.stringify(first.value ?? null) === JSON.stringify(second.value ?? null) &&
    (first.value === undefined) === (second.value === undefined)
  );
}

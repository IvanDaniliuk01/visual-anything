/**
 * Conditions on attribute values: how filters (ADR-0025) and scopes (ADR-0040) test an attribute,
 * the same way in the app and in the core.
 */
import type { JsonValue } from '@visual-anything/schema';
import type { FILTER_TESTS } from './protocol';
import { plainText } from './text/emphasis';

/** How a condition tests an attribute's value. */
export type AttributeTest = (typeof FILTER_TESTS)[number];

/**
 * Whether a value meets a test: text without minding case or the spaces around it, numbers as
 * numbers. The value of an attribute that takes text emphasis (ADR 0082) is tested by its plain
 * text, so that "**orders**" is "orders".
 */
export function meetsCondition(
  raw: JsonValue | undefined,
  test: AttributeTest,
  wanted: string,
  format: 'plain' | 'emphasis' = 'plain',
): boolean {
  const value =
    format === 'emphasis' && typeof raw === 'string' ? plainText(raw, { blocks: false }) : raw;
  const present = value !== undefined && value !== null && value !== '';
  switch (test) {
    case 'set':
      return present;
    case 'unset':
      return !present;
    case 'is':
      return present && equals(value, wanted);
    case 'is-not':
      return !present || !equals(value, wanted);
    case 'contains':
      return present && textOf(value).toLowerCase().includes(wanted.trim().toLowerCase());
    case 'below':
    case 'above': {
      const number = value === undefined ? undefined : numberOf(value);
      const limit = numberOf(wanted);
      if (number === undefined || limit === undefined) return false;
      return test === 'below' ? number < limit : number > limit;
    }
  }
}

function equals(value: JsonValue, wanted: string): boolean {
  const number = numberOf(value);
  const other = numberOf(wanted);
  if (number !== undefined && other !== undefined) return number === other;
  return textOf(value).trim().toLowerCase() === wanted.trim().toLowerCase();
}

function textOf(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function numberOf(value: JsonValue | string): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

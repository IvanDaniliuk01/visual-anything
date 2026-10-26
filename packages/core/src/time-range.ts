/**
 * Time ranges (R43, ADR 0025's clarification): a filter that keeps the shapes whose value of a date,
 * time or number attribute falls in a range, or whose period between two attributes meets it. The
 * values are read as points on one axis: numbers as they are, dates and date-times written as ISO 8601
 * as milliseconds since 1970 in UTC, and times of day written `HH:MM` or `HH:MM:SS` as seconds since
 * midnight. Text that reads as none of them has no point.
 */
import type { JsonValue } from '@visual-anything/schema';

/** What a time range is on: numbers, dates (and date-times), or times of day. */
export type RangeKind = 'number' | 'date' | 'time';

/** The kinds, in the order a range tries them for an attribute. */
export const RANGE_KINDS: readonly RangeKind[] = ['number', 'date', 'time'];

const DATE =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** The point a value is on an axis of this kind; undefined when it is none. */
export function rangePointOf(value: JsonValue | undefined, kind: RangeKind): number | undefined {
  switch (kind) {
    case 'number':
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      if (typeof value === 'string' && /^\s*-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*$/i.test(value)) {
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
      }
      return undefined;
    case 'date':
      return typeof value === 'string' ? dateOf(value.trim()) : undefined;
    case 'time':
      return typeof value === 'string' ? timeOf(value.trim()) : undefined;
  }
}

/**
 * The kind of axis a set of values reads on: the first of number, date and time that every value
 * with a point on any of them has, and that at least one has. Undefined when there is none.
 */
export function rangeKindOf(values: Iterable<JsonValue | undefined>): RangeKind | undefined {
  const fits = new Set<RangeKind>(RANGE_KINDS);
  let any = false;
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    any = true;
    for (const kind of [...fits]) if (rangePointOf(value, kind) === undefined) fits.delete(kind);
    if (fits.size === 0) return undefined;
  }
  if (!any) return undefined;
  return RANGE_KINDS.find((kind) => fits.has(kind));
}

/**
 * Whether a point is in the range from `from` to `to`, both included, whichever way round they are
 * given; undefined when there is no point, for "has no value".
 */
export function pointInRange(
  point: number | undefined,
  from: number,
  to: number,
): boolean | undefined {
  if (point === undefined) return undefined;
  return point >= Math.min(from, to) && point <= Math.max(from, to);
}

/**
 * Whether a period from `start` to `end` meets the range from `from` to `to`, both included. A period
 * without a start began before anything, and one without an end goes on; one with neither has no
 * value, and is undefined.
 */
export function periodMeetsRange(
  start: number | undefined,
  end: number | undefined,
  from: number,
  to: number,
): boolean | undefined {
  if (start === undefined && end === undefined) return undefined;
  const begins = start ?? Number.NEGATIVE_INFINITY;
  const ends = end ?? Number.POSITIVE_INFINITY;
  return begins <= Math.max(from, to) && ends >= Math.min(from, to);
}

/**
 * A time range of the filters (ADR-0025's clarification of W37): what is on one side of it is hidden,
 * and what has no value for it stays shown. View states, and so view addresses and tour steps, carry
 * it with the filters, and so does Claude's guidance that filters (ADR 0057).
 */
export interface ViewTimeRange {
  of: 'elements' | 'relations';
  /** The attribute of the point, or of the start of a period. */
  attribute: string;
  /** The attribute of the end of a period, when the range is on periods. */
  until?: string;
  /** What the values read as: numbers, dates (milliseconds since 1970, UTC) or times of day (seconds). */
  kind: RangeKind;
  /** The range's ends on that axis, both included, whichever way round they are given. */
  from: number;
  to: number;
}

const RANGE_KEYS: ReadonlySet<string> = new Set(['of', 'attribute', 'until', 'kind', 'from', 'to']);

/** What a time range's ends are, when they are not two numbers. */
export const RANGE_ENDS = 'A time range runs between two numbers.';

/**
 * Checks a time range as filters keep it: an object with only its own keys, on elements or relations,
 * naming one or two attributes of at most `maxText` characters, reading one kind of value, between two
 * finite numbers. View states and guidance check it here alike.
 */
export function checkTimeRange(
  value: unknown,
  maxText: number,
): { ok: true; range: ViewTimeRange } | { ok: false; message: string } {
  const refused = (message: string) => ({ ok: false as const, message });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return refused('A time range is an object.');
  }
  const given = value as Record<string, unknown>;
  for (const key of Object.keys(given)) {
    if (!RANGE_KEYS.has(key)) return refused(`A time range has no "${shortened(key)}".`);
  }
  const { of, attribute, until, kind, from, to } = given;
  if (of !== 'elements' && of !== 'relations') {
    return refused(`A time range is on elements or on relations, not "${shortened(String(of))}".`);
  }
  const names = until === undefined ? [attribute] : [attribute, until];
  for (const name of names) {
    if (typeof name !== 'string' || name.trim() === '') {
      return refused('A time range names the attributes it reads.');
    }
    if (name.length > maxText) {
      return refused(`A time range's attributes hold at most ${maxText} characters.`);
    }
    if (!encodable(name)) {
      return refused("A time range's attributes are text without broken characters.");
    }
  }
  if (!RANGE_KINDS.some((each) => each === kind)) {
    return refused(`A time range reads its values as one of: ${RANGE_KINDS.join(', ')}.`);
  }
  if (
    typeof from !== 'number' ||
    typeof to !== 'number' ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    return refused(RANGE_ENDS);
  }
  return {
    ok: true,
    range: {
      of,
      attribute: attribute as string,
      ...(until === undefined ? {} : { until: until as string }),
      kind: kind as RangeKind,
      from: from === 0 ? 0 : from,
      to: to === 0 ? 0 : to,
    },
  };
}

/** A text shown in a message, cut short when it is long. */
function shortened(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/** Whether a text can be percent-encoded: it holds no half of a surrogate pair on its own. */
function encodable(text: string): boolean {
  try {
    encodeURIComponent(text);
    return true;
  } catch {
    return false;
  }
}

function dateOf(text: string): number | undefined {
  const match = DATE.exec(text);
  if (!match) return undefined;
  const [, year, month = '01', day = '01', hour, minute, second = '00', ms = '0', zone] = match;
  const parts = [year, month, day, hour ?? '00', minute ?? '00', second].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const [y, mo, d, h, mi, s] = parts;
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo) || h > 23 || mi > 59 || s > 59) {
    return undefined;
  }
  let time = Date.UTC(y, mo - 1, d, h, mi, s, Number(ms.padEnd(3, '0')));
  // Date.UTC reads the years 0 to 99 as 1900 to 1999.
  if (y < 100) time = new Date(time).setUTCFullYear(y);
  if (zone !== undefined && zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const zoneHours = Number(zone.slice(1, 3));
    const zoneMinutes = Number(zone.slice(4, 6));
    if (zoneHours > 23 || zoneMinutes > 59) return undefined;
    time -= sign * (zoneHours * 60 + zoneMinutes) * 60_000;
  }
  return Number.isFinite(time) ? time : undefined;
}

function timeOf(text: string): number | undefined {
  const match = TIME.exec(text);
  if (!match) return undefined;
  const [, hours = '', minutes = '', seconds = '00'] = match;
  const h = Number(hours);
  const m = Number(minutes);
  const s = Number(seconds);
  if (h > 23 || m > 59 || s > 59) return undefined;
  return h * 3600 + m * 60 + s;
}

function daysIn(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

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

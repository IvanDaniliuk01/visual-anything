/**
 * How long ago something changed, in relative words of the language the app reads in: "yesterday",
 * "2 days ago", "hace 3 meses". The Projects screen says when each project last changed this way
 * (ADR 0093), and keeps the date and time whole in its tooltip.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The largest unit that fits first, with its length; a month is 30 days and a year 365. */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
];

/** When `changed` was, from `now`, both in milliseconds since 1970; a time ahead of now is "now". */
export function ago(language: string, changed: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - changed);
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  for (const [unit, length] of UNITS) {
    if (elapsed >= length) return format.format(-Math.floor(elapsed / length), unit);
  }
  return format.format(0, 'second');
}

/** The date and time in full, as the language writes them. */
export function fullDate(language: string, changed: number): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    changed,
  );
}

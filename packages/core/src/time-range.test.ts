import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { periodMeetsRange, pointInRange, rangeKindOf, rangePointOf } from './time-range';

describe('rangePointOf', () => {
  it('reads numbers, and text that is a number', () => {
    expect(rangePointOf(3, 'number')).toBe(3);
    expect(rangePointOf(' 2.5 ', 'number')).toBe(2.5);
    expect(rangePointOf('1e3', 'number')).toBe(1000);
    expect(rangePointOf('three', 'number')).toBeUndefined();
    expect(rangePointOf(true, 'number')).toBeUndefined();
  });

  it('reads dates and date-times written as ISO 8601, in UTC unless they say', () => {
    expect(rangePointOf('2026-10-25', 'date')).toBe(Date.UTC(2026, 9, 25));
    expect(rangePointOf('2026-10', 'date')).toBe(Date.UTC(2026, 9, 1));
    expect(rangePointOf('2026', 'date')).toBe(Date.UTC(2026, 0, 1));
    expect(rangePointOf('2026-10-25T13:45', 'date')).toBe(Date.UTC(2026, 9, 25, 13, 45));
    expect(rangePointOf('2026-10-25T13:45:10.5Z', 'date')).toBe(
      Date.UTC(2026, 9, 25, 13, 45, 10, 500),
    );
    expect(rangePointOf('2026-10-25T10:45:00-03:00', 'date')).toBe(Date.UTC(2026, 9, 25, 13, 45));
    expect(rangePointOf('0050-01-01', 'date')).toBe(
      new Date(Date.UTC(2000, 0, 1)).setUTCFullYear(50),
    );
  });

  it('refuses dates that are not on the calendar', () => {
    for (const text of [
      '2026-02-30',
      '2025-02-29',
      '2026-13-01',
      '2026-10-25T24:00',
      '26-10-25',
      'today',
    ]) {
      expect(rangePointOf(text, 'date'), text).toBeUndefined();
    }
    expect(rangePointOf('2024-02-29', 'date')).toBe(Date.UTC(2024, 1, 29));
    expect(rangePointOf(2026, 'date')).toBeUndefined();
  });

  it('reads times of day as seconds since midnight', () => {
    expect(rangePointOf('09:30', 'time')).toBe(9 * 3600 + 30 * 60);
    expect(rangePointOf('23:59:59', 'time')).toBe(86_399);
    expect(rangePointOf('24:00', 'time')).toBeUndefined();
    expect(rangePointOf('9:30', 'time')).toBeUndefined();
  });

  it('keeps the order of dates as text', () => {
    const date = fc.date({
      min: new Date(Date.UTC(1000, 0, 1)),
      max: new Date(Date.UTC(9999, 11, 31)),
      noInvalidDate: true,
    });
    fc.assert(
      fc.property(date, date, (a, b) => {
        const pa = rangePointOf(a.toISOString(), 'date') as number;
        const pb = rangePointOf(b.toISOString(), 'date') as number;
        expect(pa).toBe(a.getTime());
        expect(Math.sign(pa - pb)).toBe(Math.sign(a.getTime() - b.getTime()));
      }),
    );
  });
});

describe('rangeKindOf', () => {
  it('is the first kind every value is a point on', () => {
    expect(rangeKindOf([1, 2, '3', undefined, ''])).toBe('number');
    expect(rangeKindOf(['2026-01-01', '2026-06'])).toBe('date');
    expect(rangeKindOf(['09:00', '17:30'])).toBe('time');
    // A year written as text is both a number and a date: a number first.
    expect(rangeKindOf(['2019', '2026'])).toBe('number');
    expect(rangeKindOf(['2019', '2026-03'])).toBe('date');
    expect(rangeKindOf(['2026-01-01', 'soon'])).toBeUndefined();
    expect(rangeKindOf([undefined, null])).toBeUndefined();
    expect(rangeKindOf([true])).toBeUndefined();
  });
});

describe('ranges', () => {
  it('keeps a point in the range, both ends included, whichever way round', () => {
    expect(pointInRange(5, 1, 5)).toBe(true);
    expect(pointInRange(5, 5, 1)).toBe(true);
    expect(pointInRange(6, 1, 5)).toBe(false);
    expect(pointInRange(undefined, 1, 5)).toBeUndefined();
  });

  it('keeps a period that meets the range, open at an end it has not', () => {
    expect(periodMeetsRange(0, 2, 2, 5)).toBe(true);
    expect(periodMeetsRange(0, 1, 2, 5)).toBe(false);
    expect(periodMeetsRange(6, undefined, 2, 5)).toBe(false);
    expect(periodMeetsRange(3, undefined, 2, 5)).toBe(true);
    expect(periodMeetsRange(1, undefined, 2, 5)).toBe(true);
    expect(periodMeetsRange(undefined, 1, 2, 5)).toBe(false);
    expect(periodMeetsRange(undefined, undefined, 2, 5)).toBeUndefined();
  });

  it('a period of one point meets a range as that point is in it', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true }),
        fc.double({ noNaN: true }),
        fc.double({ noNaN: true }),
        (p, a, b) => {
          expect(periodMeetsRange(p, p, a, b)).toBe(pointInRange(p, a, b));
        },
      ),
    );
  });
});

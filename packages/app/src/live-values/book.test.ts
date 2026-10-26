import type { LiveValue } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { ageStep, shortAge } from './words';
import {
  LIVE_NOTICE_MS,
  LiveValueBook,
  NO_LIVE_VALUES,
  nextChangeOf,
  type BookClock,
} from './book';

/** A clock the test moves, running what is due. */
function fakeClock() {
  let now = 10_000;
  const timers: { at: number; task: () => void; cancelled: boolean }[] = [];
  const clock: BookClock = {
    now: () => now,
    later: (task, ms) => {
      const timer = { at: now + ms, task, cancelled: false };
      timers.push(timer);
      return {
        cancel: () => {
          timer.cancelled = true;
        },
      };
    },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = timers
        .filter((each) => !each.cancelled && each.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      due.cancelled = true;
      now = Math.max(now, due.at);
      due.task();
    }
    now = until;
  };
  return { clock, advance, now: () => now };
}

function value(target: string, attribute: string, v: number, arrivedAt = 10_000): LiveValue {
  return { target, attribute, value: v, sender: { kind: 'claude' }, arrivedAt, freshFor: 60_000 };
}

describe('LiveValueBook', () => {
  it('tells its readers at most four times a second, however fast values come', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    let heard = 0;
    book.subscribe(() => (heard += 1));
    book.apply({ type: 'live/values', values: [value('api', 'latency', 1)], removed: [] });
    advance(0);
    expect(heard).toBe(1);
    for (let i = 0; i < 10; i += 1) {
      book.apply({ type: 'live/values', values: [value('api', 'latency', i)], removed: [] });
      advance(20);
    }
    expect(heard).toBe(1);
    advance(LIVE_NOTICE_MS);
    expect(heard).toBe(2);
    expect(book.current().of('api')?.get('latency')?.value).toBe(9);
  });

  it('gives views that never change under their readers, sharing what did not change', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    book.apply({
      type: 'live/values',
      values: [value('api', 'latency', 1), value('db', 'load', 2)],
      removed: [],
    });
    advance(0);
    const first = book.current();
    book.apply({
      type: 'live/values',
      values: [value('api', 'latency', 3)],
      removed: [{ target: 'db', attribute: 'load' }],
    });
    advance(LIVE_NOTICE_MS);
    const second = book.current();
    expect(first.of('api')?.get('latency')?.value).toBe(1);
    expect(first.of('db')?.size).toBe(1);
    expect(second.of('api')?.get('latency')?.value).toBe(3);
    expect(second.of('db')).toBeUndefined();
    expect([...second.targets]).toEqual(['api']);
    expect(second.size).toBe(1);
    expect(second.version).toBe(first.version + 1);
  });

  it('keeps every view as it was over many publishes, each copying only what changed', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    const views: { view: ReturnType<LiveValueBook['current']>; expected: Map<string, number> }[] =
      [];
    const now = new Map<string, number>();
    for (let round = 0; round < 30; round++) {
      const target = `t${round % 7}`;
      if (round % 5 === 4) {
        book.apply({ type: 'live/values', values: [], removed: [{ target, attribute: 'a' }] });
        now.delete(target);
      } else {
        book.apply({ type: 'live/values', values: [value(target, 'a', round)], removed: [] });
        now.set(target, round);
      }
      advance(LIVE_NOTICE_MS);
      views.push({ view: book.current(), expected: new Map(now) });
    }
    for (const { view, expected } of views) {
      for (let each = 0; each < 7; each++) {
        expect(view.of(`t${each}`)?.get('a')?.value).toBe(expected.get(`t${each}`));
      }
      expect([...view.targets].sort()).toEqual([...expected.keys()].sort());
    }
  });

  it('tells its readers again once a value goes stale, with nothing new', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    let heard = 0;
    book.subscribe(() => (heard += 1));
    book.apply({ type: 'live/values', values: [value('api', 'latency', 1)], removed: [] });
    advance(0);
    expect(heard).toBe(1);
    advance(59_000);
    expect(heard).toBe(1);
    advance(2_000);
    expect(heard).toBe(2);
    expect(book.current().now).toBeGreaterThan(70_000);
  });

  it('forgets everything when cleared', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    book.apply({ type: 'live/values', values: [value('api', 'latency', 1)], removed: [] });
    advance(0);
    book.clear();
    advance(LIVE_NOTICE_MS);
    expect(book.current().size).toBe(0);
    expect(book.current().of('api')).toBeUndefined();
  });
});

describe('what changed since an earlier view', () => {
  it('names the targets whose values changed, over one publish or several', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    expect(book.current()).toBe(NO_LIVE_VALUES);
    book.apply({
      type: 'live/values',
      values: [value('api', 'latency', 1), value('db', 'load', 2), value('web', 'load', 3)],
      removed: [],
    });
    advance(0);
    const first = book.current();
    expect(sorted(first.changedSince?.(NO_LIVE_VALUES))).toEqual(['api', 'db', 'web']);
    expect(sorted(first.changedSince?.(first))).toEqual([]);
    book.apply({ type: 'live/values', values: [value('api', 'latency', 4)], removed: [] });
    advance(LIVE_NOTICE_MS);
    const second = book.current();
    expect(sorted(second.changedSince?.(first))).toEqual(['api']);
    book.apply({
      type: 'live/values',
      values: [],
      removed: [{ target: 'db', attribute: 'load' }],
    });
    advance(LIVE_NOTICE_MS);
    const third = book.current();
    expect(sorted(third.changedSince?.(second))).toEqual(['db']);
    expect(sorted(third.changedSince?.(first))).toEqual(['api', 'db']);
    // A later view cannot say what changed before it, nor another book's.
    expect(first.changedSince?.(third)).toBeUndefined();
    const other = new LiveValueBook(fakeClock().clock);
    expect(third.changedSince?.(other.current())).toEqual(new Set(['api', 'web']));
    book.clear();
    advance(LIVE_NOTICE_MS);
    expect(sorted(book.current().changedSince?.(third))).toEqual(['api', 'web']);
  });

  it('names a target whose value went stale, or whose age as the canvas writes it moved on', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    book.apply({
      type: 'live/values',
      values: [value('api', 'latency', 1), value('db', 'load', 2, 40_000)],
      removed: [],
    });
    advance(0);
    const fresh = book.current();
    // A minute on, the API's value is stale; the database's, which arrived later, is not.
    advance(60_001);
    const stale = book.current();
    expect(stale.version).toBe(fresh.version + 1);
    expect(sorted(stale.changedSince?.(fresh))).toEqual(['api']);
    // A value that arrives says nothing of what it leaves as it was, but for the ages that moved on.
    book.apply({ type: 'live/values', values: [value('db', 'load', 5, 70_002)], removed: [] });
    advance(LIVE_NOTICE_MS);
    const later = book.current();
    expect(sorted(later.changedSince?.(stale))).toEqual(['db']);
    // Then the API's age moves on to two minutes, and the database's value goes stale.
    advance(59_749);
    expect(book.current().now).toBe(130_000);
    expect(sorted(book.current().changedSince?.(later))).toEqual(['api']);
    advance(10);
    expect(sorted(book.current().changedSince?.(later))).toEqual(['api', 'db']);
  });

  it('cannot say what changed since a view too far back', () => {
    const { clock, advance } = fakeClock();
    const book = new LiveValueBook(clock);
    book.apply({ type: 'live/values', values: [value('api', 'latency', 0)], removed: [] });
    advance(0);
    const first = book.current();
    for (let round = 1; round <= 100; round++) {
      book.apply({ type: 'live/values', values: [value('api', 'latency', round)], removed: [] });
      advance(LIVE_NOTICE_MS);
    }
    expect(book.current().changedSince?.(first)).toBeUndefined();
  });
});

describe('ageStep', () => {
  it('moves on exactly when the age the canvas writes does', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const age = fc.oneof(fc.nat(120_000), fc.nat(3 * DAY), fc.nat(40 * DAY));
    fc.assert(
      fc.property(age, age, (a, b) => {
        expect(ageStep(a) === ageStep(b)).toBe(shortAge(t, a) === shortAge(t, b));
      }),
    );
  });
});

function sorted(targets: ReadonlySet<string> | undefined): string[] | undefined {
  return targets === undefined ? undefined : [...targets].sort();
}

describe('nextChangeOf', () => {
  it('is when the first fresh value goes stale, or a stale one’s age moves on a minute', () => {
    const fresh = new Map([['api', new Map([['a', value('api', 'a', 1, 0)]])]]);
    expect(nextChangeOf(fresh, 1_000)).toBe(60_001);
    const stale = new Map([['api', new Map([['a', value('api', 'a', 1, 0)]])]]);
    expect(nextChangeOf(stale, 90_000)).toBe(120_000);
    expect(nextChangeOf(new Map(), 0)).toBeUndefined();
  });
});

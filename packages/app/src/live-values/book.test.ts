import type { LiveValue } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { LIVE_NOTICE_MS, LiveValueBook, nextChangeOf, type BookClock } from './book';

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

describe('nextChangeOf', () => {
  it('is when the first fresh value goes stale, or a stale one’s age moves on a minute', () => {
    const fresh = new Map([['api', new Map([['a', value('api', 'a', 1, 0)]])]]);
    expect(nextChangeOf(fresh, 1_000)).toBe(60_001);
    const stale = new Map([['api', new Map([['a', value('api', 'a', 1, 0)]])]]);
    expect(nextChangeOf(stale, 90_000)).toBe(120_000);
    expect(nextChangeOf(new Map(), 0)).toBeUndefined();
  });
});

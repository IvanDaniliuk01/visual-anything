/**
 * The live values the program keeps (ADR 0057): the latest of each target and attribute, each
 * sender's taken from at most twenty messages a second, the oldest dropped past the caps, said once.
 */
import type { LiveValuesMessage } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { LiveValues } from './live';

interface Timer {
  at: number;
  task: () => void;
  cancelled: boolean;
}

/** A program's live values on a clock the test moves. */
function setup(limit?: number) {
  let now = 1_000;
  const timers: Timer[] = [];
  const broadcasts: LiveValuesMessage[] = [];
  const notices: string[] = [];
  const errors: string[] = [];
  const live = new LiveValues({
    now: () => now,
    broadcast: (message) => broadcasts.push(message),
    notice: (message) => notices.push(message),
    err: (line) => errors.push(line),
    later: (task, ms) => {
      const timer = { at: now + ms, task, cancelled: false };
      timers.push(timer);
      return {
        cancel: () => {
          timer.cancelled = true;
        },
      };
    },
    ...(limit === undefined ? {} : { limit }),
  });
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers.splice(0)) {
      if (timer.cancelled) continue;
      if (timer.at <= now) timer.task();
      else timers.push(timer);
    }
  };
  return { live, broadcasts, notices, errors, advance, now: () => now };
}

const KNOWN = new Set(['api', 'db', 'calls']);
const options = { exists: (id: string) => KNOWN.has(id), senderName: 'Claude' };
const CLAUDE = { kind: 'claude' } as const;

describe('LiveValues', () => {
  it('keeps the values of targets it knows, stamped, and tells every app', () => {
    const { live, broadcasts } = setup();
    const connection = {};
    const kept = live.set(
      connection,
      CLAUDE,
      [
        { target: 'api', attribute: 'latency', value: 120, measuredAt: 900 },
        { target: 'nowhere', attribute: 'latency', value: 1 },
        { target: 'db', attribute: 'load', value: { cpu: 0.5 } },
        'not a value',
      ],
      { ...options, freshFor: 10_000 },
    );
    expect(kept).toEqual({
      kept: 2,
      waiting: 0,
      dropped: 0,
      unknown: ['nowhere'],
      refused: [{ at: 3, reason: 'is not an object' }],
    });
    expect(broadcasts).toEqual([
      {
        type: 'live/values',
        values: [
          {
            target: 'api',
            attribute: 'latency',
            value: 120,
            measuredAt: 900,
            sender: CLAUDE,
            arrivedAt: 1_000,
            freshFor: 10_000,
          },
          {
            target: 'db',
            attribute: 'load',
            value: { cpu: 0.5 },
            sender: CLAUDE,
            arrivedAt: 1_000,
            freshFor: 10_000,
          },
        ],
        removed: [],
      },
    ]);
    expect(live.greeting()).toEqual([{ type: 'live/values', values: live.all(), removed: [] }]);
  });

  it('refuses values the sender may not send, by their place', () => {
    const { live } = setup();
    const kept = live.set(
      {},
      { kind: 'package', package: 'gauges' },
      [
        { target: 'api', attribute: 'a', value: 1 },
        { target: 'db', attribute: 'a', value: 1 },
      ],
      {
        ...options,
        refuseTarget: (id) => (id === 'db' ? 'is not one of its elements' : undefined),
      },
    );
    expect(kept.kept).toBe(1);
    expect(kept.refused).toEqual([{ at: 1, reason: 'is not one of its elements' }]);
  });

  it('takes twenty messages a second from a sender, then merges what comes faster, said once', () => {
    const { live, broadcasts, notices, errors, advance } = setup();
    const claude = {};
    for (let i = 0; i < 20; i += 1) {
      live.set(claude, CLAUDE, [{ target: 'api', attribute: 'n', value: i }], options);
    }
    expect(broadcasts).toHaveLength(20);
    // Another connection is another sender, with its own second.
    live.set({}, { kind: 'command-line' }, [{ target: 'db', attribute: 'n', value: 0 }], {
      ...options,
      senderName: 'the command line',
    });
    expect(broadcasts).toHaveLength(21);
    const waiting = live.set(
      claude,
      CLAUDE,
      [
        { target: 'api', attribute: 'n', value: 20 },
        { target: 'db', attribute: 'n', value: 20 },
      ],
      options,
    );
    expect(waiting).toMatchObject({ kept: 0, waiting: 2, dropped: 0 });
    live.set(claude, CLAUDE, [{ target: 'api', attribute: 'n', value: 21 }], options);
    expect(broadcasts).toHaveLength(21);
    expect(notices).toEqual([]);
    advance(1_000);
    expect(broadcasts).toHaveLength(22);
    expect(broadcasts[21]?.values.map((each) => [each.target, each.value])).toEqual([
      ['db', 20],
      ['api', 21],
    ]);
    // Past a message's worth waiting, the oldest go, and the program says so once.
    for (let i = 0; i < 25; i += 1) {
      live.set(
        claude,
        CLAUDE,
        Array.from({ length: 1000 }, (_, at) => ({
          target: 'api',
          attribute: `a${(i * 1000 + at) % 3000}`,
          value: i,
        })),
        options,
      );
    }
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(
      /^Live values from Claude come faster than Visual Anything takes them/,
    );
    expect(errors).toEqual(notices);
  });

  it('drops the oldest past a message’s thousand values', () => {
    const { live, notices } = setup();
    const kept = live.set(
      {},
      CLAUDE,
      Array.from({ length: 1002 }, (_, at) => ({ target: 'api', attribute: `a${at}`, value: at })),
      options,
    );
    expect(kept).toMatchObject({ kept: 1000, dropped: 2 });
    expect(live.all()[0]?.attribute).toBe('a2');
    expect(notices).toHaveLength(1);
  });

  it('keeps at most its cap in all, dropping the oldest, said once', () => {
    const { live, broadcasts, notices } = setup(3);
    const connection = {};
    live.set(
      connection,
      CLAUDE,
      ['a', 'b', 'c'].map((attribute) => ({ target: 'api', attribute, value: 1 })),
      options,
    );
    live.set(connection, CLAUDE, [{ target: 'db', attribute: 'd', value: 1 }], options);
    live.set(connection, CLAUDE, [{ target: 'db', attribute: 'e', value: 1 }], options);
    expect(live.all().map((each) => each.attribute)).toEqual(['c', 'd', 'e']);
    expect(broadcasts[1]?.removed).toEqual([{ target: 'api', attribute: 'a' }]);
    expect(notices).toEqual([
      'Visual Anything keeps at most 100,000 live values, so it drops the oldest to make room for newer ones.',
    ]);
  });

  it('clears by sender, target and attribute, what waits included', () => {
    const { live, broadcasts, advance } = setup();
    const claude = {};
    live.set(claude, CLAUDE, [{ target: 'api', attribute: 'a', value: 1 }], options);
    live.set({}, { kind: 'command-line' }, [{ target: 'db', attribute: 'a', value: 1 }], options);
    for (let i = 0; i < 20; i += 1) {
      live.set(claude, CLAUDE, [{ target: 'calls', attribute: 'a', value: i }], options);
    }
    expect(live.clear({ sender: CLAUDE })).toBe(2);
    expect(broadcasts.at(-1)?.removed).toEqual([
      { target: 'api', attribute: 'a' },
      { target: 'calls', attribute: 'a' },
    ]);
    advance(1_000);
    expect(live.all().map((each) => each.target)).toEqual(['db']);
    expect(live.clear({ targets: ['db'], attributes: ['b'] })).toBe(0);
    expect(live.clear({})).toBe(1);
  });

  it('forgets the values of what the model no longer holds', () => {
    const { live, broadcasts } = setup();
    live.set({}, CLAUDE, [{ target: 'api', attribute: 'a', value: 1 }], options);
    live.prune((target) => target !== 'api');
    expect(live.size).toBe(0);
    expect(broadcasts.at(-1)).toEqual({
      type: 'live/values',
      values: [],
      removed: [{ target: 'api', attribute: 'a' }],
    });
  });

  it('greets an app with every value, a thousand to a message', () => {
    const { live } = setup();
    for (let round = 0; round < 3; round += 1) {
      live.set(
        {},
        CLAUDE,
        Array.from({ length: 1000 }, (_, at) => ({
          target: 'api',
          attribute: `r${round}a${at}`,
          value: at,
        })),
        options,
      );
    }
    live.set({}, CLAUDE, [{ target: 'db', attribute: 'x', value: 0 }], options);
    expect(live.greeting().map((each) => each.values.length)).toEqual([1000, 1000, 1000, 1]);
  });

  it('keeps nothing once closed, and lets what waits go', () => {
    const { live, broadcasts, advance } = setup();
    const claude = {};
    for (let i = 0; i < 21; i += 1) {
      live.set(claude, CLAUDE, [{ target: 'api', attribute: 'a', value: i }], options);
    }
    live.close();
    advance(2_000);
    expect(broadcasts).toHaveLength(20);
    expect(
      live.set(claude, CLAUDE, [{ target: 'api', attribute: 'a', value: 1 }], options).kept,
    ).toBe(0);
  });
});

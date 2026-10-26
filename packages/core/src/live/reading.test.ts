import { describe, expect, it } from 'vitest';
import { liveAge, readAttribute } from './reading';
import type { LiveValue } from './values';

const LIVE: LiveValue = {
  target: 'api',
  attribute: 'latency',
  value: 95,
  sender: { kind: 'claude' },
  arrivedAt: 10_000,
  freshFor: 60_000,
};

describe('readAttribute', () => {
  const own = { latency: 120, owner: 'Team A' };
  const defaultOf = (name: string) => (name === 'tier' ? 'gold' : undefined);
  const computed = new Map([
    ['latency', { value: 110, package: 'gauges' }],
    ['load', { value: 0.5, package: 'gauges' }],
  ]);
  const live = new Map([['latency', LIVE]]);

  it('reads a live value over a computed one, a computed over the stored, the stored over a default', () => {
    expect(readAttribute({ own, defaultOf, computed, live }, 'latency')).toEqual({
      name: 'latency',
      value: 95,
      origin: 'live',
      live: LIVE,
    });
    expect(readAttribute({ own, defaultOf, computed }, 'latency')).toEqual({
      name: 'latency',
      value: 110,
      origin: 'computed',
      package: 'gauges',
    });
    expect(readAttribute({ own, defaultOf }, 'latency')).toEqual({
      name: 'latency',
      value: 120,
      origin: 'stored',
    });
    expect(readAttribute({ own, defaultOf }, 'tier')).toEqual({
      name: 'tier',
      value: 'gold',
      origin: 'default',
    });
    expect(readAttribute({ own, defaultOf }, 'nothing')).toBeUndefined();
  });

  it('reads only what the attributes hold themselves', () => {
    expect(readAttribute({ own: {} }, 'toString')).toBeUndefined();
  });
});

describe('liveAge', () => {
  it('counts from when it arrived, and goes stale past its freshness', () => {
    expect(liveAge(LIVE, 15_000)).toEqual({
      since: 10_000,
      age: 5_000,
      stale: false,
      staleAt: 70_000,
    });
    expect(liveAge(LIVE, 70_001).stale).toBe(true);
  });

  it('counts from when it was measured, unless that is after it arrived', () => {
    expect(liveAge({ ...LIVE, measuredAt: 4_000 }, 10_000).age).toBe(6_000);
    expect(liveAge({ ...LIVE, measuredAt: 20_000 }, 10_000).age).toBe(0);
  });

  it('is never younger than nothing, even on a clock that went back', () => {
    expect(liveAge(LIVE, 0).age).toBe(0);
  });
});

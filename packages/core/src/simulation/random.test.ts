import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TICK_RANDOM_SOURCE, tickRandom, tickSeed } from './random';

function draws(next: () => number, count: number): number[] {
  return Array.from({ length: count }, next);
}

describe('a tick’s generator', () => {
  it('draws the same numbers for the same seed and tick, in [0, 1)', () => {
    fc.assert(
      fc.property(fc.nat({ max: 0xffff_ffff }), fc.nat({ max: 10_000 }), (seed, tick) => {
        const first = draws(tickRandom(seed, tick), 8);
        expect(draws(tickRandom(seed, tick), 8)).toEqual(first);
        for (const each of first) {
          expect(each).toBeGreaterThanOrEqual(0);
          expect(each).toBeLessThan(1);
        }
      }),
    );
  });

  it('gives each tick and each seed its own numbers', () => {
    const seeds = new Set<number>();
    for (let tick = 0; tick < 1000; tick++) seeds.add(tickSeed(1, tick));
    for (let seed = 0; seed < 1000; seed++) seeds.add(tickSeed(seed, 0));
    expect(seeds.size).toBeGreaterThan(1990);
    expect(tickRandom(1, 0)()).not.toBe(tickRandom(2, 0)());
    expect(tickRandom(1, 0)()).not.toBe(tickRandom(1, 1)());
  });

  it('spreads its numbers evenly', () => {
    const next = tickRandom(7, 3);
    const buckets = Array.from({ length: 10 }, () => 0);
    for (let i = 0; i < 100_000; i++) buckets[Math.floor(next() * 10)]! += 1;
    for (const each of buckets) expect(Math.abs(each - 10_000)).toBeLessThan(500);
  });

  it('draws the same numbers from the source the sandbox runs', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- the source is ours, run here as the sandbox runs it
    const made = new Function(`return ${TICK_RANDOM_SOURCE};`)() as (
      seed: number,
      tick: number,
    ) => () => number;
    fc.assert(
      fc.property(fc.nat({ max: 0xffff_ffff }), fc.nat({ max: 10_000 }), (seed, tick) => {
        expect(draws(made(seed, tick), 8)).toEqual(draws(tickRandom(seed, tick), 8));
      }),
    );
  });
});

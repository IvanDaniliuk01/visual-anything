/**
 * The chance in a simulation (ADR 0085). Each tick draws from its own generator, seeded from the
 * run's seed and the tick, so the same seed always gives the same ticks, and a tick can be worked
 * out again from the state before it with nothing else kept. The sandbox gives code this generator
 * as `context.random()` and in place of `Math.random()`.
 */

/** The seed of one tick's generator: the run's seed and the tick, mixed (splitmix32's finalizer). */
export function tickSeed(seed: number, tick: number): number {
  let h = (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(tick >>> 0, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/** One tick's generator: numbers in [0, 1) that the run's seed and the tick determine (mulberry32). */
export function tickRandom(seed: number, tick: number): () => number {
  return seededRandom(tickSeed(seed, tick));
}

/** Numbers in [0, 1) that the seed determines (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The source of `seededRandom` and `tickSeed`, as one function `(seed, tick) => () => number` the
 * sandbox runs inside the interpreter before any package code, so that code draws the same numbers
 * there as the core does here.
 */
export const TICK_RANDOM_SOURCE = `(seed, tick) => {
  let h = (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(tick >>> 0, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  let state = (h ^ (h >>> 15)) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}`;

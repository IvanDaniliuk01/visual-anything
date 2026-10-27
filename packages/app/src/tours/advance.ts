/**
 * A tour step that advances by itself (ADR 0077). It follows the core's `advanceAfter`: a number of
 * milliseconds, never fewer than its text takes to read, or once the scenario it plays ends. A step
 * with reveals spreads them evenly over its time, one press forward at a time, and moves on when its
 * time ends; one that advances after its scenario moves on to the next step once its range ends.
 * Advancing waits while a transition goes, while the person paused it, and while the steps' index is
 * open; it never interrupts a transition.
 */
import type { PlayableStep } from '@visual-anything/core';
import type { TransitionTimers } from './transition';

/**
 * How long a step waits before each press forward it makes by itself: its time shared evenly between
 * its start and each of its reveals; `after-scenario` once its scenario ends; none for a step that
 * waits for the person.
 */
export function advanceEvery(
  playable: Pick<PlayableStep, 'advance' | 'reveals'>,
): number | 'after-scenario' | undefined {
  const { advance } = playable;
  if (advance === undefined || advance === 'after-scenario') return advance;
  const presses = (playable.reveals?.length ?? 0) + 1;
  return Math.max(1, Math.round(advance / presses));
}

const BROWSER_TIMERS: TransitionTimers = {
  now: () => performance.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/** Waits for the next press a step makes by itself, keeping the time waited through a pause. */
export class AdvanceTimer {
  /** The press waited for, and how long it has waited so far. */
  #key: string | undefined;
  #waited = 0;

  constructor(private readonly clock: TransitionTimers = BROWSER_TIMERS) {}

  /**
   * Presses forward with `press` once `ms` have passed for the press `key` names, counting the time
   * already waited for it; the function it returns stops it, keeping that time.
   */
  run(key: string, ms: number, press: () => void): () => void {
    if (key !== this.#key) {
      this.#key = key;
      this.#waited = 0;
    }
    const start = this.clock.now();
    let done = false;
    const cancel = this.clock.after(Math.max(0, ms - this.#waited), () => {
      done = true;
      this.#key = undefined;
      this.#waited = 0;
      press();
    });
    return () => {
      if (done) return;
      cancel();
      if (this.#key === key) this.#waited += this.clock.now() - start;
    };
  }
}

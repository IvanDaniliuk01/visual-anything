/**
 * Plays a tour step's scenario from one of its steps to another (ADR 0058), through the tab's
 * scenario session, as the person would from the scenario panel. The step's view state opens the
 * scenario at its first step; once it is there, it plays; past the last step, it pauses back on it.
 * The person can pause or close it at any time, and then it lets go. Playing changes nothing.
 *
 * Where playback is, is compared by the timeline's entries, not by steps: under a collapsed container
 * one aggregated entry plays several steps, and going to any of them lands on the first.
 */
import type { Id } from '@visual-anything/schema';
import type { ScenarioSession } from '../scenarios/session';

/** What the range needs of the scenario session. */
export type RangeSession = Pick<
  ScenarioSession,
  'getState' | 'play' | 'pause' | 'goToStep' | 'entryOf'
>;

/** A scenario to play, by the indices of its first and last steps played. */
export interface ScenarioPlay {
  scenario: Id;
  from: number;
  to: number;
}

export class ScenarioRange {
  private range: ScenarioPlay | undefined;
  private phase: 'opening' | 'playing' = 'opening';

  constructor(private readonly session: RangeSession) {}

  /** Plays a range from now on, in place of any other; none stops looking after one. */
  start(range: ScenarioPlay | undefined): void {
    this.range = range;
    this.phase = 'opening';
    this.check();
  }

  /** Looks at the session again: call it whenever the session's state changes. */
  check(): void {
    const range = this.range;
    if (!range) return;
    const state = this.session.getState();
    const at = state.scenario === range.scenario ? this.session.entryOf(state.step) : undefined;
    if (this.phase === 'opening') {
      if (at !== undefined && at === this.session.entryOf(range.from)) {
        this.phase = 'playing';
        this.session.play();
      }
      return;
    }
    if (state.scenario !== range.scenario || state.mode === 'paused') {
      // Closed, paused, or played to its end: the range is done.
      this.range = undefined;
      return;
    }
    const last = this.session.entryOf(range.to);
    if (at !== undefined && last !== undefined && at > last) {
      this.range = undefined;
      this.session.pause();
      this.session.goToStep(range.to);
    }
  }
}

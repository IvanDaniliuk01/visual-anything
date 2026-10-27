/**
 * Plays a tour step's scenario from one of its steps to another (ADR 0058), through the tab's
 * scenario session, as the person would from the scenario panel. The step's view state opens the
 * scenario at its first step; once it is there, it plays; past the last step, it pauses back on it.
 *
 * A pause asked for from the stage's card keeps the range (ADR 0077): resuming still stops at its
 * last step, and the range can be played again from its first. A pause or a close from anywhere
 * else lets it go, and the scenario is the person's from then on. Playing changes nothing.
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
> & {
  /** Whether playback played the scenario's last step to its end; when unknown, it did. */
  readonly finished?: boolean;
};

/** A scenario to play, by the indices of its first and last steps played. */
export interface ScenarioPlay {
  scenario: Id;
  from: number;
  to: number;
}

/**
 * Where the range is: none to play; waiting for its scenario to open at its first step; playing;
 * paused from the card, keeping the range; ended on its last step; or let go, as when the person
 * paused or closed the scenario elsewhere.
 */
export type RangePhase = 'none' | 'opening' | 'playing' | 'paused' | 'ended' | 'let-go';

export class ScenarioRange {
  private range: ScenarioPlay | undefined;
  private phase: RangePhase = 'none';
  private readonly listeners = new Set<() => void>();

  constructor(private readonly session: RangeSession) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): RangePhase => this.phase;

  /** The range played now, if any. */
  get played(): ScenarioPlay | undefined {
    return this.range;
  }

  /** Plays a range from now on, in place of any other; none stops looking after one. */
  start(range: ScenarioPlay | undefined): void {
    this.range = range;
    this.set(range ? 'opening' : 'none');
    this.check();
  }

  /** Pauses the range from the card: it keeps the range, which resuming plays on to its end. */
  pause(): void {
    if (this.phase !== 'opening' && this.phase !== 'playing') return;
    const playing = this.session.getState().mode !== 'paused';
    this.set('paused');
    if (playing) this.session.pause();
  }

  /** Resumes a range paused from the card; it still stops at its last step. */
  resume(): void {
    const range = this.range;
    if (!range || this.phase !== 'paused') return;
    if (this.at(range) === undefined) {
      // Paused before its scenario opened: it plays once the scenario is at its first step.
      this.set('opening');
      this.check();
      return;
    }
    this.set('playing');
    this.session.play();
  }

  /** Plays the range again from its first step, whatever it did before. */
  replay(): void {
    const range = this.range;
    if (!range) return;
    this.set('opening');
    this.session.goToStep(range.from);
    this.check();
  }

  /** Looks at the session again: call it whenever the session's state changes. */
  check(): void {
    const range = this.range;
    if (!range) return;
    const state = this.session.getState();
    const at = this.at(range);
    if (this.phase === 'opening') {
      if (at !== undefined && at === this.session.entryOf(range.from)) {
        this.set('playing');
        this.session.play();
      }
      return;
    }
    if (this.phase === 'paused') {
      if (state.scenario !== range.scenario) this.set('let-go');
      else if (state.mode === 'playing') this.set('playing');
      return;
    }
    if (this.phase !== 'playing') return;
    const last = this.session.entryOf(range.to);
    if (state.scenario !== range.scenario) {
      this.set('let-go');
      return;
    }
    if (state.mode === 'paused') {
      // Played to its end on the range's last step, or paused elsewhere, which lets it go.
      const ended = at !== undefined && at === last && (this.session.finished ?? true);
      this.set(ended ? 'ended' : 'let-go');
      return;
    }
    if (at !== undefined && last !== undefined && at > last) {
      this.set('ended');
      this.session.pause();
      this.session.goToStep(range.to);
    }
  }

  /** The timeline entry playback is on in the range's scenario; none while another is open. */
  private at(range: ScenarioPlay): number | undefined {
    const state = this.session.getState();
    return state.scenario === range.scenario ? this.session.entryOf(state.step) : undefined;
  }

  private set(phase: RangePhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    for (const listener of [...this.listeners]) listener();
  }
}

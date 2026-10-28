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
 *
 * A range plays the alternatives its step chooses at the scenario's decisions (ADR 0078), which the
 * step's view state gives the session as it opens the scenario; playing it again gives them back
 * when they changed meanwhile.
 */
import type { DecisionChoices, Id } from '@visual-anything/schema';
import { NO_CHOICES } from '../scenarios/choosing';
import type { ScenarioSession } from '../scenarios/session';

/** What the range needs of the scenario session. */
export type RangeSession = Pick<
  ScenarioSession,
  'getState' | 'play' | 'pause' | 'goToStep' | 'entryOf' | 'guide'
> & {
  /** Whether playback played the scenario's last step to its end; when unknown, it did. */
  readonly finished?: boolean;
};

/**
 * A scenario to play, by the indices of its first and last steps played, and the alternatives it
 * plays at its decisions; every default when it gives none.
 */
export interface ScenarioPlay {
  scenario: Id;
  from: number;
  to: number;
  choices?: DecisionChoices;
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

  /**
   * Plays the range again from its first step, whatever it did before, in the alternatives it plays:
   * choices changed meanwhile are given back, as its step's view state gave them.
   */
  replay(): void {
    const range = this.range;
    if (!range) return;
    this.set('opening');
    const choices = range.choices ?? NO_CHOICES;
    if (sameChoices(this.session.getState().choices, choices)) {
      this.session.goToStep(range.from);
    } else {
      this.session.guide(
        { scenario: range.scenario, action: 'go-to-step', step: range.from, choices },
        { quiet: true },
      );
    }
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

/** Whether two sets of choices choose the same alternatives at the same decisions. */
function sameChoices(a: DecisionChoices, b: DecisionChoices): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

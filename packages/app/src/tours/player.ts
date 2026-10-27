/**
 * The tour a tab plays full screen (ADR 0058), the step it is on and how many of the step's reveals
 * show (ADR 0077). It lives outside React's state, like the scenario session, and is kept by the tab
 * only: playing a tour changes nothing in the project, as playing a scenario changes nothing (ADR
 * 0031).
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, TourFile } from '@visual-anything/schema';

/** Where the tab is in a tour. */
export interface TourPlayback {
  /** The tour played full screen; none while no tour plays. */
  tour: Id | undefined;
  /** The index of the step shown, among the tour's steps. */
  step: number;
  /** How many of the step's reveals show, from 0 to as many as it has. */
  reveal: number;
}

const STOPPED: TourPlayback = { tour: undefined, step: 0, reveal: 0 };

export class TourPlayer {
  private state: TourPlayback = STOPPED;
  private steps = 0;
  /** How many reveals each step of the tour played brings in. */
  private reveals: readonly number[] = [];
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): TourPlayback => this.state;

  /** Whether a tour plays. */
  get playing(): boolean {
    return this.state.tour !== undefined;
  }

  /**
   * Takes in the project as it is now: a tour deleted while it plays ends, and one whose steps change
   * stays on a step it still has, and on a reveal its step still has.
   */
  sync(project: ProjectSnapshot): void {
    const { tour } = this.state;
    if (tour === undefined) return;
    const found = project.tours.find((each) => each.id === tour);
    if (!found || found.steps.length === 0) {
      this.end();
      return;
    }
    this.take(found);
    const step = Math.min(this.state.step, this.steps - 1);
    const reveal = Math.min(this.state.reveal, this.revealsOf(step));
    if (step !== this.state.step || reveal !== this.state.reveal) {
      this.set({ ...this.state, step, reveal });
    }
  }

  /** Starts a tour full screen, at a step: the first unless another is given. */
  start(tour: TourFile, step = 0): void {
    if (tour.steps.length === 0) return;
    this.take(tour);
    this.set({ tour: tour.id, step: clamp(step, this.steps), reveal: 0 });
  }

  /** Goes forward one press: the step's next reveal, or the next step after its last (ADR 0077). */
  next(): void {
    if (!this.playing) return;
    const { step, reveal } = this.state;
    if (reveal < this.revealsOf(step)) this.set({ ...this.state, reveal: reveal + 1 });
    else this.goTo(step + 1);
  }

  /**
   * Goes back one press: takes the step's last reveal away, or goes to the step before, with all it
   * reveals, as it was left.
   */
  previous(): void {
    if (!this.playing) return;
    const { step, reveal } = this.state;
    if (reveal > 0) this.set({ ...this.state, reveal: reveal - 1 });
    else if (step > 0)
      this.set({ ...this.state, step: step - 1, reveal: this.revealsOf(step - 1) });
  }

  first(): void {
    if (this.playing) this.goTo(0);
  }

  last(): void {
    if (this.playing) this.goTo(this.steps - 1);
  }

  /**
   * Goes to a step, by its index, at its start, before any of its reveals; one past either end stays
   * at that end.
   */
  goTo(step: number): void {
    if (!this.playing) return;
    const next = clamp(step, this.steps);
    if (next !== this.state.step || this.state.reveal !== 0) {
      this.set({ ...this.state, step: next, reveal: 0 });
    }
  }

  /** Ends the tour, leaving full screen. */
  end(): void {
    if (this.state.tour !== undefined) this.set(STOPPED);
  }

  /** How many reveals a step brings in. */
  revealsOf(step: number): number {
    return this.reveals[step] ?? 0;
  }

  private take(tour: TourFile): void {
    this.steps = tour.steps.length;
    this.reveals = tour.steps.map((each) => each.reveal?.length ?? 0);
  }

  private set(state: TourPlayback): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

function clamp(step: number, steps: number): number {
  return Math.min(Math.max(0, Math.round(step)), Math.max(0, steps - 1));
}

/**
 * What the keys and the controls of full-screen playback do (ADR 0077): move through the steps and
 * their reveals, end the tour, open the steps' index, pause or resume the step's scenario, or else
 * its advancing (`pause`, P), pause or resume advancing by itself (`hold`, the stage's pause
 * control), play the scenario's range again, and go back to the step's camera.
 */
export type TourKeyAction =
  'next' | 'previous' | 'first' | 'last' | 'end' | 'index' | 'pause' | 'hold' | 'replay' | 'back';

/**
 * What a key does during full-screen playback (ADR 0077): the right and down arrows, Space, Page Down
 * and Enter go forward one press, which a wireless presenter sends as Page Down; the left and up
 * arrows, Shift+Space, Page Up and Shift+Enter go back one; Home and End go to the first and the last
 * step; I opens the steps' index, P pauses and resumes, R plays the scenario's range again and B goes
 * back to the step; Escape ends the tour. Keys with Control, Alt or Meta are the browser's.
 */
export function tourKeyAction(event: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): TourKeyAction | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      return 'next';
    case ' ':
    case 'Spacebar':
    case 'Enter':
      return event.shiftKey ? 'previous' : 'next';
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'previous';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Escape':
    case 'Esc':
      return 'end';
    default:
      return LETTERS[event.key.toLowerCase()];
  }
}

const LETTERS: Partial<Record<string, TourKeyAction>> = {
  i: 'index',
  p: 'pause',
  r: 'replay',
  b: 'back',
};

/**
 * Does what a key or a control asks of the player: moving through the tour, or ending it. What the
 * player does not do, as the index or a pause, its host does (`useTourPlayback`).
 */
export function applyTourKey(player: TourPlayer, action: TourKeyAction): void {
  switch (action) {
    case 'next':
      player.next();
      break;
    case 'previous':
      player.previous();
      break;
    case 'first':
      player.first();
      break;
    case 'last':
      player.last();
      break;
    case 'end':
      player.end();
      break;
    default:
      break;
  }
}

/**
 * The tour a tab plays full screen (ADR 0058), and the step it is on. It lives outside React's state,
 * like the scenario session, and is kept by the tab only: playing a tour changes nothing in the
 * project, as playing a scenario changes nothing (ADR 0031).
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, TourFile } from '@visual-anything/schema';

/** Where the tab is in a tour. */
export interface TourPlayback {
  /** The tour played full screen; none while no tour plays. */
  tour: Id | undefined;
  /** The index of the step shown, among the tour's steps. */
  step: number;
}

const STOPPED: TourPlayback = { tour: undefined, step: 0 };

export class TourPlayer {
  private state: TourPlayback = STOPPED;
  private steps = 0;
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
   * stays on a step it still has.
   */
  sync(project: ProjectSnapshot): void {
    const { tour } = this.state;
    if (tour === undefined) return;
    const found = project.tours.find((each) => each.id === tour);
    if (!found || found.steps.length === 0) {
      this.end();
      return;
    }
    this.steps = found.steps.length;
    if (this.state.step >= this.steps) this.set({ ...this.state, step: this.steps - 1 });
  }

  /** Starts a tour full screen, at a step: the first unless another is given. */
  start(tour: TourFile, step = 0): void {
    if (tour.steps.length === 0) return;
    this.steps = tour.steps.length;
    this.set({ tour: tour.id, step: clamp(step, this.steps) });
  }

  next(): void {
    if (this.playing) this.goTo(this.state.step + 1);
  }

  previous(): void {
    if (this.playing) this.goTo(this.state.step - 1);
  }

  first(): void {
    if (this.playing) this.goTo(0);
  }

  last(): void {
    if (this.playing) this.goTo(this.steps - 1);
  }

  /** Goes to a step, by its index; one past either end stays at that end. */
  goTo(step: number): void {
    if (!this.playing) return;
    const next = clamp(step, this.steps);
    if (next !== this.state.step) this.set({ ...this.state, step: next });
  }

  /** Ends the tour, leaving full screen. */
  end(): void {
    if (this.state.tour !== undefined) this.set(STOPPED);
  }

  private set(state: TourPlayback): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

function clamp(step: number, steps: number): number {
  return Math.min(Math.max(0, Math.round(step)), Math.max(0, steps - 1));
}

/** What the keys of full-screen playback do. */
export type TourKeyAction = 'next' | 'previous' | 'first' | 'last' | 'end';

/**
 * What a key does during full-screen playback: the right and down arrows, Space and Page Down go
 * forward; the left and up arrows, Shift+Space and Page Up go back; Home and End go to the first and
 * the last step; Escape ends the tour. Keys with Control, Alt or Meta are the browser's.
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
      return undefined;
  }
}

/** Does what a key or a control asks of the player. */
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
  }
}

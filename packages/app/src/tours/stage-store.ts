/**
 * What full-screen playback's stage keeps besides the player and the transitions (ADR 0077): whether
 * the steps' index is open, whether the person paused advancing by itself, where the caption card
 * sits, and what screen readers were told last. It lives outside React's state, like the player.
 */
import type { Id } from '@visual-anything/schema';
import type { CaptionPlace } from './placement';

/** What screen readers are told: a step come to, a reveal come in, or the scenario paused on a step. */
export type StageCue =
  | { kind: 'step'; step: number; reveal: number }
  | { kind: 'reveal'; step: number; reveal: number }
  | { kind: 'paused'; scenario: Id; step: number };

export interface StageState {
  /** Whether the steps' index is open. */
  index: boolean;
  /** Whether the person paused advancing by itself; it holds from step to step until resumed. */
  paused: boolean;
  /** Where the caption card sits. */
  place: CaptionPlace;
  /** What screen readers were told last, with how many times something was told. */
  said: (StageCue & { count: number }) | undefined;
  /** How many reveals the step left showed, for its caption while it fades out. */
  left: number;
}

const START: StageState = {
  index: false,
  paused: false,
  place: 'bottom',
  said: undefined,
  left: 0,
};

export class StageStore {
  #state: StageState = START;
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getState = (): StageState => this.#state;

  setIndex(index: boolean): void {
    this.#set({ ...this.#state, index });
  }

  setPaused(paused: boolean): void {
    this.#set({ ...this.#state, paused });
  }

  setPlace(place: CaptionPlace): void {
    this.#set({ ...this.#state, place });
  }

  setLeft(left: number): void {
    this.#set({ ...this.#state, left });
  }

  /** Tells screen readers something new. */
  say(cue: StageCue): void {
    this.#set({ ...this.#state, said: { ...cue, count: (this.#state.said?.count ?? 0) + 1 } });
  }

  /** The tour ended, or another starts: everything as at first. */
  reset(): void {
    this.#set(START);
  }

  #set(state: StageState): void {
    const now = this.#state;
    if (
      state.index === now.index &&
      state.paused === now.paused &&
      state.place === now.place &&
      state.said === now.said &&
      state.left === now.left
    ) {
      return;
    }
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }
}

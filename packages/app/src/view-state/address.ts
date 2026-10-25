/**
 * The view address in the tab's address bar: its fragment holds the view state (core's
 * `writeViewState`), so that a reload opens the project where it was, and the address can be copied.
 * The fragment follows the view state a moment after it last changed, replacing the tab's history
 * entry rather than adding one, so that Back still leaves the app; it never holds the session token.
 */
import {
  readViewState,
  writeViewState,
  type ViewState,
  type ViewStateRead,
} from '@visual-anything/core';

/** What the address is read from and written to: the tab's own, by default. */
export type AddressWindow = Pick<Window, 'location' | 'history'>;

/** How long the fragment waits after the last change before it follows, in milliseconds. */
export const FOLLOW_DELAY = 300;

/** The fragment of the tab's address, without its `#`. */
export function fragmentOf(target: AddressWindow): string {
  return target.location.hash.replace(/^#/, '');
}

/** The view state the tab's address holds now, if any, or why it could not be read. */
export function readAddress(target: AddressWindow): ViewStateRead {
  return readViewState(fragmentOf(target));
}

/** The address that opens a view state in this tab's app: its own address with the state's fragment. */
export function addressOf(target: AddressWindow, state: ViewState): string {
  const { origin, pathname, search } = target.location;
  return `${origin}${pathname}${search}#${writeViewState(state)}`;
}

/** Timers the follower waits with; the browser's by default. */
export interface Timers {
  set(callback: () => void, delay: number): unknown;
  clear(handle: unknown): void;
}

const BROWSER_TIMERS: Timers = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Keeps the tab's address in step with the view state: told that it changed, it writes the fragment a
 * moment later, unless it is paused, and only when the fragment would change.
 */
export class AddressFollower {
  #state: () => ViewState | undefined = () => undefined;
  #timer: unknown;
  #paused = false;
  #written: string | undefined;

  constructor(
    private readonly target: AddressWindow,
    private readonly timers: Timers = BROWSER_TIMERS,
    private readonly delay: number = FOLLOW_DELAY,
  ) {}

  /** Where the view state comes from when the fragment is written. */
  follow(state: () => ViewState | undefined): void {
    this.#state = state;
  }

  /** The view state changed: the fragment follows a moment later. */
  changed(): void {
    if (this.#timer !== undefined) this.timers.clear(this.#timer);
    this.#timer = this.timers.set(() => {
      this.#timer = undefined;
      this.write();
    }, this.delay);
  }

  /** While paused, as while an address's state is applied, the fragment is left as it is. */
  pause(paused: boolean): void {
    this.#paused = paused;
    if (!paused) this.changed();
  }

  /** Writes the fragment now, unless paused. */
  write(): void {
    if (this.#paused) return;
    const state = this.#state();
    if (state === undefined) return;
    const fragment = writeViewState(state);
    this.#written = fragment;
    if (fragment === fragmentOf(this.target)) return;
    const { location, history } = this.target;
    try {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#${fragment}`);
    } catch {
      // A browser that limits how often a page may replace its address leaves the last one there.
    }
  }

  /** Whether a fragment is the one this follower wrote last, rather than one the person brought. */
  wrote(fragment: string): boolean {
    return this.#written === fragment;
  }

  stop(): void {
    if (this.#timer !== undefined) this.timers.clear(this.#timer);
    this.#timer = undefined;
  }
}

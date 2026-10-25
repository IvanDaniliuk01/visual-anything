/**
 * Whether the element list is open (R42): kept by the shell, which shows its toggle in the header
 * and the list below the canvas, both of which read and change it.
 */
export class ElementListStore {
  #open = false;
  /** How many times the list was closed from itself, so that its toggle takes the focus back. */
  #closed = 0;
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly isOpen = (): boolean => this.#open;

  readonly closedTimes = (): number => this.#closed;

  toggle(): void {
    this.#open = !this.#open;
    this.#changed();
  }

  /** Closes the list from itself: its toggle takes the focus. */
  close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#closed += 1;
    this.#changed();
  }

  #changed(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

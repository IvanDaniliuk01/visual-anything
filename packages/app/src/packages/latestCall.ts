/**
 * How the inspector calls a package's panel (ADR 0089's M14.4 clarification): a call is asked for
 * as the selection or the project changes, and starts once they have stayed the same for a moment;
 * one runs at a time, a call asked for meanwhile starting once it ends; and only the answer of the
 * call asked for last is shown, every other one dropped.
 */

/** How long the selection and the project stay the same before a panel's code is called, in ms. */
export const PANEL_WAIT_MS = 150;

/** The clock the waits are timed by; the page's, but in tests. */
export interface WaitClock {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

const PAGE_CLOCK: WaitClock = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** Calls one at a time, after a wait, showing only the answer of the one asked for last. */
export class LatestCall<T> {
  /** Which call was asked for last; an answer of an earlier one is dropped. */
  private asked = 0;
  private running = false;
  private wanted: { call: () => Promise<T>; asked: number } | undefined;
  private timer: unknown;

  constructor(
    private readonly show: (answer: T) => void,
    private readonly waitMs: number = PANEL_WAIT_MS,
    private readonly clock: WaitClock = PAGE_CLOCK,
  ) {}

  /**
   * Asks for a call: it starts after the wait, or `now`, once no other runs. The answer of any call
   * asked for before it is dropped from then on.
   */
  ask(call: () => Promise<T>, { now = false }: { now?: boolean } = {}): void {
    this.asked += 1;
    this.wanted = { call, asked: this.asked };
    this.stopWaiting();
    if (now) this.start();
    else this.timer = this.clock.setTimeout(() => this.waited(), this.waitMs);
  }

  /** Forgets what was asked for: nothing waiting starts, and no answer under way is shown. */
  cancel(): void {
    this.asked += 1;
    this.wanted = undefined;
    this.stopWaiting();
  }

  private waited(): void {
    this.timer = undefined;
    this.start();
  }

  private stopWaiting(): void {
    if (this.timer === undefined) return;
    this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Starts what was asked for, unless a call runs: then it starts once that one ends. */
  private start(): void {
    const wanted = this.wanted;
    if (this.running || wanted === undefined) return;
    this.wanted = undefined;
    this.running = true;
    const ended = (answer: { value: T } | undefined) => {
      this.running = false;
      if (answer !== undefined && wanted.asked === this.asked) this.show(answer.value);
      // What was asked for meanwhile starts now, unless it still waits for its moment.
      if (this.timer === undefined) this.start();
    };
    wanted.call().then(
      (value) => ended({ value }),
      () => ended(undefined),
    );
  }
}

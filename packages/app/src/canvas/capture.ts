/**
 * A capture of the last frame the canvas drew, laid over it while a tour's transition changes what is
 * under it, and faded out to show the change (ADR 0077): where the camera cuts, the frame before
 * cross-fades into the frame after once the canvas has drawn it; in a step's out stage, what the step
 * hides or dims fades out under it. Fading it changes one opacity a frame, so that its cost never
 * grows with the number of shapes; it is let go when the fade ends.
 */

/** The longest a capture waits after a cut for the canvas to draw, as for a layout or another view. */
export const MAX_CAPTURE_WAIT = 1500;

/** The clock a capture fades by: the browser's frames and timers by default. */
export interface CaptureClock {
  now(): number;
  request(run: (time: number) => void): number;
  cancel(handle: number): void;
  /** Runs `run` in `ms` milliseconds; the function it returns cancels it. */
  after(ms: number, run: () => void): () => void;
}

const BROWSER_CLOCK: CaptureClock = {
  now: () => performance.now(),
  request: (run) => requestAnimationFrame(run),
  cancel: (handle) => cancelAnimationFrame(handle),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/** How a capture fades out. */
export interface FadeOptions {
  /** Not before this time on the capture's clock, as when a transition's stage starts. */
  notBefore?: number;
  /**
   * Only once the canvas has drawn a frame from now on, as after a cut, waiting for it at most
   * {@link MAX_CAPTURE_WAIT} milliseconds.
   */
  afterFrame?: boolean;
  /** Told when the fade starts. */
  started?: () => void;
}

export class FrameCapture {
  #opacity = 1;
  #frame: number | undefined;
  #waits: (() => void)[] = [];
  #gone = false;

  /**
   * `element` is the frame copied over the canvas; `drawn` calls its listener once the canvas has
   * drawn its next frame, and returns what lets the listener go.
   */
  constructor(
    private readonly element: HTMLElement,
    private readonly clock: CaptureClock = BROWSER_CLOCK,
    private readonly drawn: (listener: () => void) => () => void = (listener) =>
      clock.after(0, listener),
  ) {}

  /** Whether it is gone from over the canvas. */
  get gone(): boolean {
    return this.#gone;
  }

  /** Stays as it is, whole or partly faded, until it is asked to fade or dropped. */
  hold(): void {
    if (this.#frame !== undefined) this.clock.cancel(this.#frame);
    this.#frame = undefined;
    this.#stopWaiting();
  }

  /** Fades out from where it is over `duration` milliseconds, as `options` say when, then goes. */
  fadeOut(duration: number, options: FadeOptions = {}): void {
    if (this.#gone) return;
    this.hold();
    const { notBefore, afterFrame = false, started } = options;
    let framed = !afterFrame;
    const begin = () => {
      if (this.#gone || !framed) return;
      const wait = notBefore === undefined ? 0 : notBefore - this.clock.now();
      if (wait > 0) {
        this.#waits.push(this.clock.after(wait, begin));
        return;
      }
      this.#stopWaiting();
      started?.();
      this.#fade(duration);
    };
    if (afterFrame) {
      const frameCame = () => {
        if (framed) return;
        framed = true;
        begin();
      };
      this.#waits.push(this.drawn(frameCame), this.clock.after(MAX_CAPTURE_WAIT, frameCame));
    }
    begin();
  }

  /** Goes at once, as when a transition is finished, letting its copy of the frame go with it. */
  drop(): void {
    if (this.#gone) return;
    this.hold();
    this.#gone = true;
    this.element.remove();
    if (this.element instanceof HTMLCanvasElement) {
      this.element.width = 0;
      this.element.height = 0;
    }
  }

  #fade(duration: number): void {
    const from = this.#opacity;
    if (!(duration > 0) || !(from > 0)) {
      this.drop();
      return;
    }
    const start = this.clock.now();
    const step = (time: number) => {
      this.#frame = undefined;
      const part = (time - start) / duration;
      if (!(part < 1)) {
        this.drop();
        return;
      }
      this.#set(from * (1 - Math.max(0, part)));
      this.#frame = this.clock.request(step);
    };
    this.#frame = this.clock.request(step);
  }

  #set(opacity: number): void {
    this.#opacity = opacity;
    this.element.style.opacity = String(opacity);
  }

  #stopWaiting(): void {
    for (const stop of this.#waits.splice(0)) stop();
  }
}

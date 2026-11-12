/**
 * The app's side of one explorable's frame (ADR 0107). On each `load` of the frame it posts
 * `{ kind: 'va/hello', api: 1, data }` with one port of a fresh `MessageChannel`, and from then on
 * hears only that port. Every message it hears is checked by the core's `readFrameMessage`, and one
 * that fails is dropped whole. It sends the data again when it changes, at most once a frame.
 *
 * The watchdog pings the frame every second; a frame silent for 3 s is stopped, and so is one that
 * has not loaded within 10 s, whose page looped before it could answer: the host says so, and its
 * owner removes the frame and shows the explorable's card.
 */
import {
  MAX_CONSOLE_ERRORS,
  VA_API,
  WATCHDOG_PING_MS,
  WATCHDOG_SILENT_MS,
  readFrameMessage,
  type HostMessage,
  type VaData,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** How long a frame has to load before it is stopped. */
export const FRAME_LOAD_MS = 10_000;
/** How many times a frame may load before it is stopped, as a page that reloads itself over and over. */
export const MAX_FRAME_LOADS = 20;

/** Why a frame was stopped: it stopped answering, or it never started to. */
export type FrameEnd = 'silent' | 'never-answered';

/** What the host tells its owner. */
export interface FrameHostEvents {
  ready?: () => void;
  select?: (id: Id) => void;
  error?: (message: string) => void;
  still?: (width: number, png: Uint8Array) => void;
  /** The frame stopped answering: its owner removes it. */
  stopped: (end: FrameEnd) => void;
}

/** The time and timers the host uses: the page's, or a test's. */
export interface FrameHostClock {
  now(): number;
  /** Calls `callback` every `ms`; returns what stops it. */
  every(ms: number, callback: () => void): () => void;
  /** Calls `callback` at the next frame drawn; returns what cancels it. */
  nextFrame(callback: () => void): () => void;
}

export const PAGE_CLOCK: FrameHostClock = {
  now: () => performance.now(),
  every: (ms, callback) => {
    const timer = setInterval(callback, ms);
    return () => clearInterval(timer);
  },
  nextFrame: (callback) => {
    // A hidden page draws no frames: the data goes anyway, a little later.
    const frame = requestAnimationFrame(callback);
    const timer = setTimeout(callback, 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  },
};

/** What the host needs of the frame: the element, whose window it posts the hello to. */
export interface HostedFrame {
  readonly contentWindow: Pick<Window, 'postMessage'> | null;
  addEventListener(type: 'load', listener: () => void): void;
  removeEventListener(type: 'load', listener: () => void): void;
}

export class FrameHost {
  readonly #frame: HostedFrame;
  readonly #events: FrameHostEvents;
  readonly #clock: FrameHostClock;
  readonly #started: number;
  readonly #stopWatching: () => void;
  #data: VaData;
  #port: MessagePort | undefined;
  #loads = 0;
  #heardAt: number | undefined;
  #answered = false;
  #ended = false;
  #sending: (() => void) | undefined;
  /** The frame's errors, at most 50, oldest first. */
  readonly errors: string[] = [];

  constructor(
    frame: HostedFrame,
    data: VaData,
    events: FrameHostEvents,
    clock: FrameHostClock = PAGE_CLOCK,
  ) {
    this.#frame = frame;
    this.#data = data;
    this.#events = events;
    this.#clock = clock;
    this.#started = clock.now();
    frame.addEventListener('load', this.#loaded);
    this.#stopWatching = clock.every(WATCHDOG_PING_MS, this.#watch);
  }

  /** Whether the frame has answered at least once. */
  get answered(): boolean {
    return this.#answered;
  }

  /** Gives the frame new data, at the next frame drawn; changes before then go together. */
  setData(data: VaData): void {
    this.#data = data;
    if (this.#ended || this.#port === undefined || this.#sending) return;
    this.#sending = this.#clock.nextFrame(() => {
      this.#sending?.();
      this.#sending = undefined;
      this.#post({ kind: 'va/data', data: this.#data });
    });
  }

  /** Asks the frame for its still picture at one of the widths stills are taken at. */
  askStill(width: number): void {
    this.#post({ kind: 'va/still', width });
  }

  /** Stops hearing the frame and pinging it; its owner removes it. */
  dispose(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#stopWatching();
    this.#sending?.();
    this.#sending = undefined;
    this.#frame.removeEventListener('load', this.#loaded);
    this.#closePort();
  }

  readonly #loaded = (): void => {
    if (this.#ended) return;
    this.#loads += 1;
    if (this.#loads > MAX_FRAME_LOADS) {
      this.#stop(this.#answered ? 'silent' : 'never-answered');
      return;
    }
    const target = this.#frame.contentWindow;
    if (!target) return;
    this.#closePort();
    const channel = new MessageChannel();
    this.#port = channel.port1;
    this.#port.onmessage = this.#hear;
    this.#heardAt = this.#clock.now();
    const hello: HostMessage = { kind: 'va/hello', api: VA_API, data: this.#data };
    // The frame's origin is opaque, so `*` is the only target that reaches it; the port is the line.
    target.postMessage(hello, '*', [channel.port2]);
  };

  readonly #hear = (event: MessageEvent): void => {
    if (this.#ended) return;
    const message = readFrameMessage(event.data);
    if (!message) return;
    this.#heardAt = this.#clock.now();
    this.#answered = true;
    switch (message.kind) {
      case 'va/pong':
        return;
      case 'va/ready':
        this.#events.ready?.();
        return;
      case 'va/select':
        this.#events.select?.(message.id);
        return;
      case 'va/error':
        if (this.errors.length < MAX_CONSOLE_ERRORS) {
          this.errors.push(message.message);
          this.#events.error?.(message.message);
        }
        return;
      case 'va/still':
        this.#events.still?.(message.width, message.png);
        return;
    }
  };

  readonly #watch = (): void => {
    if (this.#ended) return;
    const now = this.#clock.now();
    if (this.#heardAt === undefined) {
      if (now - this.#started >= FRAME_LOAD_MS) this.#stop('never-answered');
      return;
    }
    if (now - this.#heardAt >= WATCHDOG_SILENT_MS) {
      this.#stop(this.#answered ? 'silent' : 'never-answered');
      return;
    }
    this.#post({ kind: 'va/ping', at: Math.max(0, Math.round(now)) });
  };

  #stop(end: FrameEnd): void {
    this.dispose();
    this.#events.stopped(end);
  }

  #post(message: HostMessage): void {
    try {
      this.#port?.postMessage(message);
    } catch {
      // A port that cannot carry it is the frame's own end: the watchdog hears the silence.
    }
  }

  #closePort(): void {
    if (!this.#port) return;
    this.#port.onmessage = null;
    this.#port.close();
    this.#port = undefined;
  }
}

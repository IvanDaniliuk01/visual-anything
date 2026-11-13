/**
 * The app's side of one explorable's frame (ADR 0107). On the frame's first `load` it posts
 * `{ kind: 'va/hello', api: 1, data }` with one port of a fresh `MessageChannel`, and from then on
 * hears only that port. It says hello once in a frame's life: the frame's origin is opaque, so the
 * hello goes to `*`, and a page the frame navigated to, or reloaded, must never get the element's
 * data or a port. Any later `load` stops the frame, as having left its page. Every message it hears is checked by the core's `readFrameMessage`, and one
 * that fails is dropped whole. It sends the data again when it changes, at most once a frame. A
 * `va/select` is passed on only for an element the data last sent to that frame holds (the element,
 * its contents, the other ends of its relations): a page's own script can take the port and post
 * any id, and the host, not the runtime, is the line.
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

/** The ids of the elements `data` gives a frame: the element, its contents, its relations' other ends. */
export function selectableIds(data: VaData): ReadonlySet<Id> {
  const ids = new Set<Id>();
  if (data.element) ids.add(data.element.id);
  for (const each of data.contents ?? []) ids.add(each.id);
  for (const each of data.relations ?? []) ids.add(each.other.id);
  return ids;
}

/** How long a frame has to load before it is stopped. */
export const FRAME_LOAD_MS = 10_000;
/**
 * Why a frame was stopped: it stopped answering, it never started to, or it loaded another page (a
 * reload, or a navigation the frame made), which never gets a hello.
 */
export type FrameEnd = 'silent' | 'never-answered' | 'left';

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
  /** The elements of the data last posted to the frame, the only ones it may select. */
  #sent: ReadonlySet<Id> = new Set();
  #port: MessagePort | undefined;
  #helloSent = false;
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
      this.#sent = selectableIds(this.#data);
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
    // A second load is another document in the frame: it gets no hello, and the frame goes.
    if (this.#helloSent) {
      this.#stop('left');
      return;
    }
    this.#helloSent = true;
    const target = this.#frame.contentWindow;
    if (!target) {
      this.#stop('never-answered');
      return;
    }
    const channel = new MessageChannel();
    this.#port = channel.port1;
    this.#port.onmessage = this.#hear;
    this.#heardAt = this.#clock.now();
    const hello: HostMessage = { kind: 'va/hello', api: VA_API, data: this.#data };
    this.#sent = selectableIds(this.#data);
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
        if (this.#sent.has(message.id)) this.#events.select?.(message.id);
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

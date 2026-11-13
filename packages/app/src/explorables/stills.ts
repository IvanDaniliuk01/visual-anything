/**
 * The tab's stills of explorables (ADR 0107, A10.3): taken one at a time in one hidden frame
 * (`still-taker.ts`), only for an approved explorable, and kept for the session by their key
 * (`stillKey`): the frame's inputs, the data given, its theme and parameters, and the bucket. Every
 * canvas of the tab draws from them, and Claude's `capture_explorable` takes its still here too.
 * Nothing is written into the project.
 *
 * A frame that takes a still is marked running as a live one is, so that one that hangs the tab does
 * not start by itself after a reload; one the watchdog stops is stopped for the tab's session, as the
 * explorable panel's would be, and its shapes show their card.
 */
import { encodeBase64, type VaData } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { newFrameAddress, type FrameListener } from './frame-address';
import { useExplorableSession, type ExplorableSession } from './session';
import { StillQueue, type StillJob } from './still-queue';
import { takeStill, type StillOutcome, type StillTake } from './still-taker';

/** A still kept: its PNG, decoded once for the canvas, or why there is none. */
export type KeptStill =
  | {
      ok: true;
      key: string;
      png: Uint8Array;
      /** The picture the canvas's image store makes its texture of; none where nothing decodes. */
      picture: unknown;
      width: number;
      height: number;
      errors: string[];
      ready: boolean;
    }
  | { ok: false; key: string; why: 'stopped' | 'failed'; message: string; errors: string[] };

/** What a still is taken of. */
export interface StillAsk {
  key: string;
  explorable: Id;
  /** The approval hash of what runs, which its frame's address names. */
  hash: string;
  data: VaData;
  width: number;
  distance: number;
}

/** What the stills need of the browser; tests give fakes. */
export interface StillsPlatform {
  take: (take: StillTake) => Promise<StillOutcome>;
  decode: (png: Uint8Array) => Promise<unknown>;
}

const PAGE_PLATFORM: StillsPlatform = {
  take: (take) => takeStill(take),
  decode: (png) =>
    typeof createImageBitmap === 'function'
      ? createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
      : Promise.resolve(undefined),
};

export class ExplorableStills {
  readonly queue: StillQueue<KeptStill>;
  readonly #session: ExplorableSession;
  readonly #platform: StillsPlatform;
  readonly #listeners = new Set<() => void>();
  #listener: FrameListener | undefined;

  constructor(session: ExplorableSession, platform: StillsPlatform = PAGE_PLATFORM) {
    this.#session = session;
    this.#platform = platform;
    this.queue = new StillQueue<KeptStill>({ onArrive: () => this.#arrived() });
  }

  /** The program's listener, which every frame's address names; none while it is not known. */
  setListener(listener: FrameListener | undefined): void {
    this.#listener = listener;
  }

  get listener(): FrameListener | undefined {
    return this.#listener;
  }

  /** Tells `listener` whenever a still arrives. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** The job that takes a still; undefined while the listener is not known. */
  job(ask: StillAsk): StillJob<KeptStill> | undefined {
    const listener = this.#listener;
    if (listener === undefined) return undefined;
    return {
      key: ask.key,
      distance: ask.distance,
      take: () => this.#take(ask, listener),
    };
  }

  /** Decodes a still a live frame took of itself, for the canvas; undefined where none decodes. */
  async picture(png: Uint8Array): Promise<unknown> {
    try {
      return await this.#platform.decode(png);
    } catch {
      return undefined;
    }
  }

  /** Lets every still go, as when another project opens. */
  clear(): void {
    this.queue.clear();
  }

  async #take(ask: StillAsk, listener: FrameListener): Promise<KeptStill> {
    const ended = this.#session.marks.start(ask.hash);
    let outcome: StillOutcome;
    try {
      outcome = await this.#platform.take({
        address: newFrameAddress(listener, ask.explorable, ask.hash),
        data: ask.data,
        width: ask.width,
      });
    } finally {
      ended();
    }
    if (!outcome.ok) {
      if (outcome.why === 'stopped') {
        this.#session.stop(ask.hash, outcome.end);
        return {
          ok: false,
          key: ask.key,
          why: 'stopped',
          message: 'It stopped answering.',
          errors: outcome.errors,
        };
      }
      return {
        ok: false,
        key: ask.key,
        why: 'failed',
        message: outcome.message,
        errors: outcome.errors,
      };
    }
    let picture: unknown;
    try {
      picture = await this.#platform.decode(outcome.png);
    } catch {
      picture = undefined;
    }
    return {
      ok: true,
      key: ask.key,
      png: outcome.png,
      picture,
      width: outcome.width,
      height: outcome.height,
      errors: outcome.errors,
      ready: outcome.ready,
    };
  }

  #arrived(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

/** A kept still's PNG in base64, as Claude's answer carries it. */
export function stillBase64(still: Extract<KeptStill, { ok: true }>): string {
  return encodeBase64(still.png);
}

const stills = new WeakMap<ExplorableSession, ExplorableStills>();

/** The tab's stills, one for the tab's explorables' session, made the first time they are asked for. */
export function stillsOf(session: ExplorableSession): ExplorableStills {
  let kept = stills.get(session);
  if (!kept) {
    kept = new ExplorableStills(session);
    stills.set(session, kept);
  }
  return kept;
}

/** The tab's stills; none outside the shell, where no explorable runs. */
export function useExplorableStills(): ExplorableStills | null {
  const session = useExplorableSession();
  return session ? stillsOf(session) : null;
}

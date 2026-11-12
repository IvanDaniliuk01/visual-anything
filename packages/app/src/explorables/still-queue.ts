/**
 * The stills of explorables a tab takes (ADR 0107, A10.3), one at a time, in its one hidden frame:
 * each frame is a browser process of its own, so the tab never runs two to take stills. The canvas
 * says which stills it needs while it rests, nearest the middle of the screen first, and what it no
 * longer needs is forgotten before it starts; a still asked for now, as Claude's capture asks, goes
 * before those. What a take gives is kept for the session by its key (`stillKey`), at most `most`,
 * the one used longest ago let go first, and never taken again while kept.
 */

/** A still to take: its key, how far its shape is from the middle of the screen, and how to take it. */
export interface StillJob<R> {
  key: string;
  distance: number;
  take: () => Promise<R>;
}

interface Asked<R> {
  job: StillJob<R>;
  resolve: (value: R) => void;
  reject: (error: Error) => void;
}

/** How many stills a tab keeps by default. */
export const KEPT_STILLS = 96;

export class StillQueue<R> {
  readonly #most: number;
  readonly #release: (value: R) => void;
  readonly #onArrive: (key: string) => void;
  /** What a take gave, by key, the one used last last. */
  readonly #kept = new Map<string, R>();
  #wanted: StillJob<R>[] = [];
  readonly #asked: Asked<R>[] = [];
  #running: string | undefined;

  constructor(
    options: { most?: number; release?: (value: R) => void; onArrive?: (key: string) => void } = {},
  ) {
    this.#most = options.most ?? KEPT_STILLS;
    this.#release = options.release ?? (() => {});
    this.#onArrive = options.onArrive ?? (() => {});
  }

  /** Whether a still is being taken. */
  get busy(): boolean {
    return this.#running !== undefined;
  }

  /** The key of the still being taken, if any. */
  get running(): string | undefined {
    return this.#running;
  }

  /** What was kept for a key, marked as used now; undefined when none is. */
  result(key: string): R | undefined {
    const value = this.#kept.get(key);
    if (value === undefined) return undefined;
    this.#kept.delete(key);
    this.#kept.set(key, value);
    return value;
  }

  /** Whether a still is kept, without marking it used. */
  has(key: string): boolean {
    return this.#kept.has(key);
  }

  /**
   * The stills the canvas needs now, as it rests: they replace those it needed before that have not
   * started. Those kept or being taken are left out.
   */
  want(jobs: readonly StillJob<R>[]): void {
    this.#wanted = jobs
      .filter((job) => !this.#kept.has(job.key) && job.key !== this.#running)
      .sort((a, b) => a.distance - b.distance);
    this.#next();
  }

  /** Takes a still now, before those the canvas waits for; answered from what is kept when it is. */
  ask(job: StillJob<R>): Promise<R> {
    const kept = this.result(job.key);
    if (kept !== undefined) return Promise.resolve(kept);
    return new Promise<R>((resolve, reject) => {
      this.#asked.push({ job, resolve, reject });
      this.#next();
    });
  }

  /** Lets every kept still go, as when another project opens. */
  clear(): void {
    for (const value of this.#kept.values()) this.#release(value);
    this.#kept.clear();
    this.#wanted = [];
  }

  #next(): void {
    if (this.#running !== undefined) return;
    const asked = this.#asked.shift();
    if (asked) {
      this.#run(asked.job, asked);
      return;
    }
    const job = this.#wanted.shift();
    if (job) this.#run(job, undefined);
  }

  #run(job: StillJob<R>, asked: Asked<R> | undefined): void {
    this.#running = job.key;
    let taking: Promise<R>;
    try {
      taking = job.take();
    } catch (error) {
      taking = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    void taking.then(
      (value) => {
        this.#running = undefined;
        this.#keep(job.key, value);
        asked?.resolve(value);
        this.#onArrive(job.key);
        this.#next();
      },
      (error: unknown) => {
        this.#running = undefined;
        asked?.reject(error instanceof Error ? error : new Error(String(error)));
        this.#next();
      },
    );
  }

  #keep(key: string, value: R): void {
    const before = this.#kept.get(key);
    if (before !== undefined && before !== value) this.#release(before);
    this.#kept.delete(key);
    this.#kept.set(key, value);
    while (this.#kept.size > this.#most) {
      const oldest = this.#kept.keys().next().value as string;
      const gone = this.#kept.get(oldest);
      this.#kept.delete(oldest);
      if (gone !== undefined) this.#release(gone);
    }
  }
}

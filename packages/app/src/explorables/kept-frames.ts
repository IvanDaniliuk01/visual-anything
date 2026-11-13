/**
 * The explorables' frames a tab keeps (ADR 0107, as the user asked on 2026-11-12): every frame that
 * runs an explorable, on a canvas, in the explorable panel or on a tour's stage, live or kept hidden
 * so that it shows again as it was left. Each is a process of its own, of about 30 to 80 MB, so a
 * tab keeps at most eight; past that, the hidden one used longest ago is asked to go, and its owner
 * takes a still of it as it was left before removing it. A frame that shows is never asked to go.
 */

/** How many frames a tab keeps. */
export const KEPT_FRAMES = 8;

/** A frame the keeper holds, as its owner describes it. */
export interface KeptFrame {
  /** Whether it may be let go now: hidden, not showing. */
  evictable(): boolean;
  /** Asks its owner to let it go; it counts until its owner releases it. */
  evict(): void;
}

/** What its owner does with a frame held. */
export interface KeptHandle {
  /** The person used it: it becomes the one used last. */
  use(): void;
  /** It may have hidden or shown: the keeper looks again. */
  changed(): void;
  /** It is removed. */
  release(): void;
}

interface Held {
  frame: KeptFrame;
  used: number;
  leaving: boolean;
}

export class KeptFrames {
  readonly #most: number;
  readonly #held = new Set<Held>();
  #clock = 0;

  constructor(most = KEPT_FRAMES) {
    this.#most = most;
  }

  /** How many frames it holds, those asked to go included. */
  get size(): number {
    return this.#held.size;
  }

  hold(frame: KeptFrame): KeptHandle {
    const held: Held = { frame, used: ++this.#clock, leaving: false };
    this.#held.add(held);
    this.#trim();
    return {
      use: () => {
        if (this.#held.has(held)) held.used = ++this.#clock;
      },
      changed: () => this.#trim(),
      release: () => {
        this.#held.delete(held);
      },
    };
  }

  #trim(): void {
    let over = this.#held.size - this.#most;
    for (const held of this.#held) if (held.leaving) over -= 1;
    if (over <= 0) return;
    const byUse = [...this.#held].sort((a, b) => a.used - b.used);
    for (const held of byUse) {
      if (over <= 0) return;
      if (held.leaving || !held.frame.evictable()) continue;
      held.leaving = true;
      over -= 1;
      held.frame.evict();
    }
  }
}

let tabs: KeptFrames | undefined;

/** The tab's keeper. */
export function keptFrames(): KeptFrames {
  tabs ??= new KeptFrames();
  return tabs;
}

/**
 * Which explorables are live on a canvas (ADR 0107, A10.3, as the user changed Q11 on 2026-11-12).
 * Double-click or Explore makes one live in place, as a frame laid over its shape that follows pan
 * and zoom. Up to four are live at once; exploring a fifth pauses the one used longest ago. A frame
 * that leaves the screen, is paused, or is turned still with Escape or its × is kept, hidden, so that
 * it shows as it was left when it comes back or is explored again. The tab keeps at most eight frames
 * in all (`kept-frames.ts`): past that, the hidden one used longest ago takes a still of itself as it
 * was left and goes (`drop`).
 */
import type { Id } from '@visual-anything/schema';
import type { Rect } from '../geometry';

/** What is live: the spot it shows in (a shape's key, or a free shape's id), and what it shows. */
export interface LiveTarget {
  spot: string;
  explorable: Id;
  /** The element whose data it reads. */
  element?: Id;
}

/** A frame a canvas keeps: what it shows, whether it is live, and when it was used last. */
export interface KeptLive {
  target: LiveTarget;
  live: boolean;
  used: number;
}

/** The frames a canvas keeps, and a counter that orders their uses. */
export interface LiveState {
  kept: readonly KeptLive[];
  clock: number;
}

/** How many explorables are live on a canvas at once: each frame is a process of its own. */
export const LIVE_ON_CANVAS = 4;

export const NO_LIVE: LiveState = Object.freeze({ kept: Object.freeze([]), clock: 0 });

/** What happens to a canvas's live explorables. */
export type LiveEvent =
  /** Double-click or Explore: live, from its kept frame when there is one. */
  | { kind: 'explore'; target: LiveTarget }
  /** The person used it: it becomes the one used last. */
  | { kind: 'use'; spot: string }
  /** Its × button, or Escape in it: still, its frame kept. */
  | { kind: 'still'; spot: string }
  /** Escape on the canvas: the one used last turns still. */
  | { kind: 'escape' }
  /** The spots the scene shows now: the frames of those that went are removed. */
  | { kind: 'spots'; present: ReadonlySet<string> }
  /** The tab let its frame go (past its eight kept frames). */
  | { kind: 'drop'; spot: string };

/** The live explorables after an event; the same object while nothing changes. */
export function liveAfter(state: LiveState, event: LiveEvent): LiveState {
  switch (event.kind) {
    case 'explore': {
      const { target } = event;
      const before = state.kept.find((each) => each.target.spot === target.spot);
      const same =
        before !== undefined &&
        before.target.explorable === target.explorable &&
        before.target.element === target.element;
      if (same && before.live && before.used === state.clock) return state;
      const clock = state.clock + 1;
      const next: KeptLive = { target: same ? before.target : target, live: true, used: clock };
      // In its place: a frame moved in the page loads again, and would lose how it was left.
      const kept =
        before === undefined
          ? [...state.kept, next]
          : state.kept.map((each) => (each === before ? next : each));
      return { kept: within(kept), clock };
    }
    case 'use': {
      const at = state.kept.findIndex((each) => each.target.spot === event.spot);
      const before = state.kept[at];
      if (!before || before.used === state.clock) return state;
      const clock = state.clock + 1;
      const kept = [...state.kept];
      kept[at] = { ...before, used: clock };
      return { kept, clock };
    }
    case 'still': {
      const at = state.kept.findIndex((each) => each.target.spot === event.spot);
      const before = state.kept[at];
      if (!before?.live) return state;
      const kept = [...state.kept];
      kept[at] = { ...before, live: false };
      return { kept, clock: state.clock };
    }
    case 'escape': {
      let last: KeptLive | undefined;
      for (const each of state.kept) if (each.live && (!last || each.used > last.used)) last = each;
      return last ? liveAfter(state, { kind: 'still', spot: last.target.spot }) : state;
    }
    case 'spots': {
      const kept = state.kept.filter((each) => event.present.has(each.target.spot));
      return kept.length === state.kept.length ? state : { kept, clock: state.clock };
    }
    case 'drop': {
      const kept = state.kept.filter((each) => each.target.spot !== event.spot);
      return kept.length === state.kept.length ? state : { kept, clock: state.clock };
    }
  }
}

/** Pauses the live ones used longest ago past four; the tab lets kept frames go (`drop`). */
function within(kept: readonly KeptLive[]): KeptLive[] {
  const byUse = [...kept].sort((a, b) => a.used - b.used);
  let live = kept.filter((each) => each.live).length;
  const paused = new Set<KeptLive>();
  for (const each of byUse) {
    if (live <= LIVE_ON_CANVAS) break;
    if (!each.live) continue;
    paused.add(each);
    live -= 1;
  }
  return paused.size === 0
    ? [...kept]
    : kept.map((each) => (paused.has(each) ? { ...each, live: false } : each));
}

/** Whether a kept frame shows: live, and its spot on screen. Hidden otherwise, and kept. */
export function liveShown(
  kept: KeptLive | undefined,
  rect: Rect | undefined,
  visible: Rect,
): boolean {
  return kept?.live === true && rect !== undefined && overlaps(rect, visible);
}

/** Where a live frame is laid, in the canvas's pixels, and at which scale. */
export interface LivePlace {
  x: number;
  y: number;
  scale: number;
}

/**
 * Where a live frame goes for a camera: its corner on its spot's at once, as a pan moves it, but at
 * the scale it was drawn at, `drawn`, which takes the camera's only once the camera rests, so that a
 * zoom never makes the frame's process paint it again at each step (A10.5's benchmark).
 */
export function livePlacement(
  camera: { x: number; y: number; scale: number },
  rect: Rect,
  drawn: number,
): LivePlace {
  return { x: camera.x + rect.x * camera.scale, y: camera.y + rect.y * camera.scale, scale: drawn };
}

/** How long the camera keeps its scale before a live frame takes it, as the canvas settles. */
export const LIVE_REST_MS = 180;

/** What a follower writes to: the live frame's box. */
export interface LiveBox {
  style: { transform: string };
}

/**
 * Moves a live frame's box with the camera, outside React: its corner follows every step, its scale
 * only once the camera has kept the same one for `LIVE_REST_MS` (`livePlacement`).
 */
export class LiveFollower {
  readonly #box: LiveBox;
  readonly #later: (ms: number, callback: () => void) => () => void;
  #rect: Rect;
  #drawn: number | undefined;
  #camera: { x: number; y: number; scale: number } | undefined;
  #waiting: (() => void) | undefined;

  constructor(
    box: LiveBox,
    rect: Rect,
    later: (ms: number, callback: () => void) => () => void = (ms, callback) => {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  ) {
    this.#box = box;
    this.#rect = rect;
    this.#later = later;
  }

  /** Its spot moved or was resized. */
  setRect(rect: Rect): void {
    this.#rect = rect;
    if (this.#camera) this.place(this.#camera);
  }

  place(camera: { x: number; y: number; scale: number }): void {
    this.#camera = camera;
    this.#drawn ??= camera.scale;
    if (camera.scale !== this.#drawn) {
      this.#waiting?.();
      this.#waiting = this.#later(LIVE_REST_MS, () => {
        this.#waiting = undefined;
        const now = this.#camera;
        if (!now) return;
        this.#drawn = now.scale;
        this.#write(now);
      });
    }
    this.#write(camera);
  }

  dispose(): void {
    this.#waiting?.();
    this.#waiting = undefined;
  }

  #write(camera: { x: number; y: number; scale: number }): void {
    const at = livePlacement(camera, this.#rect, this.#drawn ?? camera.scale);
    this.#box.style.transform = `translate(${at.x}px, ${at.y}px) scale(${at.scale})`;
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

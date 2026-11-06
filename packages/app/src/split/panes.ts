/**
 * The split view's panes (ADR 0102): the views the canvas area shows side by side, three at most,
 * each with its share of the width and the camera it was left at, and which one is active. The shell
 * reads them as a snapshot and changes them through this store, outside React's state.
 *
 * They are the tab's: kept in its session storage while two or more are open, so that a reload brings
 * them back, and never in the view address, which holds the active pane's view state only. One pane
 * alone keeps nothing, and the canvas area is then the single canvas it always was.
 */
import type { Id } from '@visual-anything/schema';
import type { Camera } from '../canvas/camera';

/** The most panes the canvas area splits into. */
export const MAX_PANES = 3;
/** The narrowest a pane gets, in CSS pixels, while the canvas area is wide enough for it. */
export const MIN_PANE_PIXELS = 240;
/** The narrowest a pane gets as a share of the canvas area, whatever its width. */
export const MIN_PANE_SHARE = 0.1;
/** How much of the canvas area's width an arrow key moves a border by. */
export const RESIZE_STEP = 0.02;
/** Where the tab keeps its panes. */
export const PANES_STORAGE_KEY = 'visual-anything.panes';
/** How long the camera's moves wait before they are written, so that a pan writes once. */
const CAMERA_WRITE_DELAY = 250;

/** One pane: its view, undefined for the project's first, and its share of the canvas area. */
export interface Pane {
  id: string;
  view: Id | undefined;
  width: number;
}

/** The panes, left to right, and which one is active. */
export interface PaneLayout {
  panes: readonly Pane[];
  active: string;
}

/** What the store needs of the tab's session storage. */
export type PaneStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The tab's session storage, where there is one. */
export function tabStorage(): PaneStorage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

const ONE_PANE: PaneLayout = {
  panes: [{ id: 'pane-1', view: undefined, width: 1 }],
  active: 'pane-1',
};

export class SplitPanes {
  #layout: PaneLayout;
  readonly #cameras = new Map<string, Camera>();
  /** The cameras of the panes brought back inactive, which each takes once its canvas is made. */
  readonly #restored = new Map<string, Camera>();
  readonly #listeners = new Set<() => void>();
  readonly #storage: PaneStorage | undefined;
  #next: number;
  #writing: ReturnType<typeof setTimeout> | undefined;

  constructor(storage: PaneStorage | undefined = tabStorage()) {
    this.#storage = storage;
    const kept = readPanes(storage);
    this.#layout = kept?.layout ?? ONE_PANE;
    for (const [id, camera] of kept?.cameras ?? []) {
      this.#cameras.set(id, camera);
      if (id !== this.#layout.active) this.#restored.set(id, camera);
    }
    this.#next = Math.max(...this.#layout.panes.map((pane) => numberOf(pane.id))) + 1;
  }

  readonly snapshot = (): PaneLayout => this.#layout;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** The active pane. */
  get active(): Pane {
    return activeOf(this.#layout);
  }

  /**
   * Opens a view where the open view shows: the pane that shows it already becomes active, and
   * otherwise the active pane shows it instead of its own.
   */
  open(view: Id): void {
    const active = this.active;
    if (active.view === view) return;
    const showing = this.#layout.panes.find((pane) => pane.id !== active.id && pane.view === view);
    if (showing) this.activate(showing.id);
    else this.setView(active.id, view);
  }

  /**
   * Opens a view in a new pane right of the active one, the panes then sharing the width alike; with
   * three open, the rightmost pane but the active one shows it instead. `shown` is the view the active
   * pane draws now, kept by its id from then on. The active pane stays active.
   */
  openBeside(view: Id, shown?: Id): void {
    const { panes, active } = this.#layout;
    const named = panes.map((pane) =>
      pane.id === active && pane.view === undefined && shown !== undefined
        ? { ...pane, view: shown }
        : pane,
    );
    if (named.length >= MAX_PANES) {
      const replaced = named.findLast((pane) => pane.id !== active);
      if (!replaced) return;
      this.#cameras.delete(replaced.id);
      this.#restored.delete(replaced.id);
      this.#set({
        active,
        panes: named.map((pane) => (pane.id === replaced.id ? { ...pane, view } : pane)),
      });
      return;
    }
    const at = named.findIndex((pane) => pane.id === active) + 1;
    const added: Pane = { id: `pane-${this.#next++}`, view, width: 1 };
    const next = [...named.slice(0, at), added, ...named.slice(at)];
    this.#set({ active, panes: next.map((pane) => ({ ...pane, width: 1 / next.length })) });
  }

  /** Shows another view in a pane, which starts from that view's camera. */
  setView(id: string, view: Id): void {
    const pane = this.#layout.panes.find((each) => each.id === id);
    if (!pane || pane.view === view) return;
    this.#restored.delete(id);
    this.#set({
      ...this.#layout,
      panes: this.#layout.panes.map((each) => (each.id === id ? { ...each, view } : each)),
    });
  }

  /**
   * Closes a pane; the others share its width as they shared the rest. Closing the active one makes
   * its left neighbor active, or its right one. The last pane does not close.
   */
  close(id: string): void {
    const { panes, active } = this.#layout;
    const at = panes.findIndex((pane) => pane.id === id);
    if (at === -1 || panes.length === 1) return;
    const rest = panes.filter((pane) => pane.id !== id);
    const total = rest.reduce((sum, pane) => sum + pane.width, 0);
    this.#cameras.delete(id);
    this.#restored.delete(id);
    const next = id === active ? (rest[Math.max(0, at - 1)]?.id ?? rest[0]!.id) : active;
    this.#set({
      active: next,
      panes: rest.map((pane) => ({
        ...pane,
        width: rest.length === 1 || total <= 0 ? 1 / rest.length : pane.width / total,
      })),
    });
  }

  /** Makes a pane the active one. */
  activate(id: string): void {
    if (id === this.#layout.active || !this.#layout.panes.some((pane) => pane.id === id)) return;
    this.#set({ ...this.#layout, active: id });
  }

  /**
   * Moves the border right of the pane at `border` by `by`, a share of the canvas area's width: right
   * when positive. Neither pane beside it gets narrower than `minimum`.
   */
  resize(border: number, by: number, minimum = MIN_PANE_SHARE): void {
    const { panes } = this.#layout;
    const left = panes[border];
    const right = panes[border + 1];
    if (!left || !right) return;
    const pair = left.width + right.width;
    const least = Math.min(minimum, pair / 2);
    const width = Math.min(pair - least, Math.max(least, left.width + by));
    if (width === left.width) return;
    this.#set({
      ...this.#layout,
      panes: panes.map((pane, index) =>
        index === border
          ? { ...pane, width }
          : index === border + 1
            ? { ...pane, width: pair - width }
            : pane,
      ),
    });
  }

  /** Keeps where a pane's camera is, for the tab to bring back. */
  keepCamera(id: string, camera: Camera): void {
    const last = this.#cameras.get(id);
    if (last && last.x === camera.x && last.y === camera.y && last.scale === camera.scale) return;
    this.#cameras.set(id, { x: camera.x, y: camera.y, scale: camera.scale });
    if (this.#layout.panes.length < 2 || this.#writing !== undefined) return;
    this.#writing = setTimeout(() => {
      this.#writing = undefined;
      this.#write();
    }, CAMERA_WRITE_DELAY);
  }

  /** The camera a pane brought back inactive had, once: its canvas takes it as it is made. */
  takeCamera(id: string): Camera | undefined {
    const camera = this.#restored.get(id);
    this.#restored.delete(id);
    return camera;
  }

  /** Writes what is waiting at once, as before the shell goes. */
  flush(): void {
    if (this.#writing === undefined) return;
    clearTimeout(this.#writing);
    this.#writing = undefined;
    this.#write();
  }

  #set(layout: PaneLayout): void {
    this.#layout = layout;
    this.#write();
    for (const listener of [...this.#listeners]) listener();
  }

  #write(): void {
    const storage = this.#storage;
    if (!storage) return;
    try {
      if (this.#layout.panes.length < 2) {
        storage.removeItem(PANES_STORAGE_KEY);
        return;
      }
      storage.setItem(
        PANES_STORAGE_KEY,
        JSON.stringify({
          active: this.#layout.active,
          panes: this.#layout.panes.map((pane) => {
            const camera = this.#cameras.get(pane.id);
            return {
              id: pane.id,
              ...(pane.view === undefined ? {} : { view: pane.view }),
              width: pane.width,
              ...(camera ? { camera } : {}),
            };
          }),
        }),
      );
    } catch {
      // Without storage the panes last until the tab reloads.
    }
  }
}

/** The active pane of a layout. */
export function activeOf(layout: PaneLayout): Pane {
  return layout.panes.find((pane) => pane.id === layout.active) ?? layout.panes[0]!;
}

/**
 * The narrowest share a pane may take of a canvas area this wide: `MIN_PANE_PIXELS`, or
 * `MIN_PANE_SHARE` where the width is not known or that is wider.
 */
export function minimumShare(width: number): number {
  return width > 0 ? Math.max(MIN_PANE_SHARE, MIN_PANE_PIXELS / width) : MIN_PANE_SHARE;
}

function numberOf(id: string): number {
  return Number(/^pane-(\d+)$/.exec(id)?.[1] ?? 0);
}

/** The panes the tab kept, read strictly: anything else is passed over and one pane shows. */
export function readPanes(
  storage: PaneStorage | undefined,
): { layout: PaneLayout; cameras: Map<string, Camera> } | undefined {
  let stored: unknown;
  try {
    const text = storage?.getItem(PANES_STORAGE_KEY);
    if (!text) return undefined;
    stored = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof stored !== 'object' || stored === null) return undefined;
  const { active, panes } = stored as Record<string, unknown>;
  if (typeof active !== 'string' || !Array.isArray(panes)) return undefined;
  if (panes.length < 2 || panes.length > MAX_PANES) return undefined;
  const read: Pane[] = [];
  const cameras = new Map<string, Camera>();
  for (const each of panes as unknown[]) {
    if (typeof each !== 'object' || each === null) return undefined;
    const { id, view, width, camera } = each as Record<string, unknown>;
    if (typeof id !== 'string' || !/^pane-\d{1,6}$/.test(id)) return undefined;
    if (read.some((pane) => pane.id === id)) return undefined;
    if (view !== undefined && (typeof view !== 'string' || view === '' || view.length > 200)) {
      return undefined;
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return undefined;
    read.push({ id, view: view, width });
    if (isCamera(camera)) cameras.set(id, { x: camera.x, y: camera.y, scale: camera.scale });
  }
  if (!read.some((pane) => pane.id === active)) return undefined;
  const total = read.reduce((sum, pane) => sum + pane.width, 0);
  return {
    layout: { active, panes: read.map((pane) => ({ ...pane, width: pane.width / total })) },
    cameras,
  };
}

function isCamera(value: unknown): value is Camera {
  if (typeof value !== 'object' || value === null) return false;
  const { x, y, scale } = value as Record<string, unknown>;
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof scale === 'number' &&
    Number.isFinite(scale) &&
    scale > 0
  );
}

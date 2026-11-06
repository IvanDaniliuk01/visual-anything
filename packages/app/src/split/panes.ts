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
/** Where the tab keeps its panes; each project's under its own key (`panesKey`). */
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

/**
 * The project the panes show views of: its name, which is what the app knows of a project that stays
 * (as the view list's folders key by it), and the ids of its views.
 */
export interface PaneProject {
  name: string;
  views: readonly Id[];
}

/** Where the tab keeps a project's panes. */
export function panesKey(project: string | undefined): string {
  return project === undefined ? PANES_STORAGE_KEY : `${PANES_STORAGE_KEY}.${project}`;
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
  #key = PANES_STORAGE_KEY;
  /** The views of the project the panes are of, once it is known. */
  #views: readonly Id[] | undefined;
  #next = 1;
  #writing: ReturnType<typeof setTimeout> | undefined;
  /**
   * The panes as a tour found them, under the key of the project it played in, which the tab keeps
   * while the tour plays, so that a reload or another project mid-tour never keeps the panes the tour
   * changed (ADR 0102).
   */
  #held: { key: string; layout: PaneLayout; cameras: Map<string, Camera> } | undefined;

  /**
   * The panes the tab kept for the project, or one pane: what is malformed is passed over and dropped
   * from the tab's storage; what names a view the project lacks is passed over and left there, as it
   * may be another project's of the same name.
   */
  constructor(storage: PaneStorage | undefined = tabStorage(), project?: PaneProject) {
    this.#storage = storage;
    this.#layout = this.#load(project);
  }

  #load(project: PaneProject | undefined): PaneLayout {
    this.#key = panesKey(project?.name);
    this.#views = project?.views;
    this.#cameras.clear();
    this.#restored.clear();
    const kept = readPanes(this.#storage, this.#key, project?.views);
    if (!kept && !readPanes(this.#storage, this.#key)) {
      try {
        this.#storage?.removeItem(this.#key);
      } catch {
        // Nothing kept, or nothing to keep it in.
      }
    }
    const layout = kept?.layout ?? ONE_PANE;
    for (const [id, camera] of kept?.cameras ?? []) {
      this.#cameras.set(id, camera);
      if (id !== layout.active) this.#restored.set(id, camera);
    }
    this.#next = Math.max(...layout.panes.map((pane) => numberOf(pane.id))) + 1;
    return layout;
  }

  /**
   * Follows the project the shell shows: another project brings back its own panes, and a view gone
   * from this one takes the panes that show it with it, down to the single canvas under two; the pane
   * left showing a view gone shows the project's first. The same project under another name, with
   * the same views, keeps its panes, under its new name.
   */
  setProject(project: PaneProject): void {
    if (panesKey(project.name) !== this.#key) {
      this.flush();
      const renamed =
        this.#views !== undefined &&
        sameViews(this.#views, project.views) &&
        !readPanes(this.#storage, panesKey(project.name), project.views);
      if (renamed) {
        this.#key = panesKey(project.name);
        this.#views = project.views;
        this.#write();
        return;
      }
      this.#layout = this.#load(project);
      for (const listener of [...this.#listeners]) listener();
      return;
    }
    this.#views = project.views;
    // What the tab keeps while a tour plays loses the views gone too.
    if (this.#held?.key === this.#key) {
      this.#held = { ...this.#held, layout: withoutGone(this.#held.layout, project.views) };
    }
    const next = withoutGone(this.#layout, project.views);
    if (next === this.#layout) return;
    const left = new Set(next.panes.map((pane) => pane.id));
    for (const pane of this.#layout.panes) {
      if (left.has(pane.id)) continue;
      this.#cameras.delete(pane.id);
      this.#restored.delete(pane.id);
    }
    this.#set(next);
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
   * pane draws now, kept by its id from then on, also in place of one it names that is gone. The
   * active pane stays active.
   */
  openBeside(view: Id, shown?: Id): void {
    const { panes, active } = this.#layout;
    const named = panes.map((pane) =>
      pane.id === active && shown !== undefined && pane.view !== shown
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

  /** The pane right of a pane, if there is one. */
  rightOf(id: string): Pane | undefined {
    const { panes } = this.#layout;
    const at = panes.findIndex((pane) => pane.id === id);
    return at === -1 ? undefined : panes[at + 1];
  }

  /**
   * The pane a view beside the active one shows in (`showBeside`), when there is one already: the
   * pane right of it, or with three open the rightmost but the active one.
   */
  besidePane(): Pane | undefined {
    const { panes, active } = this.#layout;
    const right = this.rightOf(active);
    if (right) return right;
    return panes.length >= MAX_PANES ? panes.findLast((pane) => pane.id !== active) : undefined;
  }

  /**
   * Holds the panes as they are now, with these cameras, as a tour starts (ADR 0102): while the hold
   * lasts, the tab keeps them rather than the panes shown, so that a reload mid-tour brings back the
   * panes as the tour found them.
   */
  hold(cameras: ReadonlyMap<string, Camera>): void {
    if (this.#held) return;
    this.flush();
    this.#held = {
      key: this.#key,
      layout: this.#layout,
      cameras: new Map([...this.#cameras, ...cameras]),
    };
  }

  /** Whether the panes are held, as while a tour plays. */
  get held(): boolean {
    return this.#held !== undefined;
  }

  /**
   * The layout held, without the panes of views gone since, while the panes are held for the project
   * shown; none otherwise, as when another project opened since.
   */
  heldLayout(): PaneLayout | undefined {
    const held = this.#held;
    if (!held || held.key !== this.#key) return undefined;
    return this.#views === undefined ? held.layout : withoutGone(held.layout, this.#views);
  }

  /**
   * Lets the hold go: with `restore`, the panes come back as they were held, but for those of views
   * gone since; never another project's, when another opened since. The tab then keeps the panes
   * shown.
   */
  release(restore: boolean): void {
    const layout = restore ? this.heldLayout() : undefined;
    this.#held = undefined;
    if (layout) this.restore(layout);
    else this.#write();
  }

  /**
   * Shows a view beside the active pane, as a tour's step asks (ADR 0102): in the pane right of it;
   * in a new pane there, the panes then sharing the width alike, while fewer than three are open;
   * and otherwise in the rightmost pane but the active one. The pane's id; the active pane stays
   * active.
   */
  showBeside(view: Id): string | undefined {
    const { panes, active } = this.#layout;
    const beside = this.besidePane();
    if (beside) {
      this.setView(beside.id, view);
      return beside.id;
    }
    if (panes.length >= MAX_PANES) return undefined;
    const added: Pane = { id: `pane-${this.#next++}`, view, width: 1 };
    const next = [...panes, added];
    this.#set({ active, panes: next.map((pane) => ({ ...pane, width: 1 / next.length })) });
    return added.id;
  }

  /**
   * Gives the panes back as a layout had them, as when a tour that showed views beside it ends: the
   * panes it opened close, and those it showed another view in show theirs again.
   */
  restore(layout: PaneLayout): void {
    if (layout === this.#layout) return;
    const kept = new Set(layout.panes.map((pane) => pane.id));
    for (const id of [...this.#cameras.keys()]) {
      if (kept.has(id)) continue;
      this.#cameras.delete(id);
      this.#restored.delete(id);
    }
    this.#next = Math.max(this.#next, ...layout.panes.map((pane) => numberOf(pane.id) + 1));
    this.#set(layout);
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
    // While a tour holds them, the tab keeps the panes as the tour found them.
    const held = this.#held?.key === this.#key ? this.#held : undefined;
    const layout = held?.layout ?? this.#layout;
    const cameras = held?.cameras ?? this.#cameras;
    try {
      if (layout.panes.length < 2) {
        storage.removeItem(this.#key);
        return;
      }
      storage.setItem(
        this.#key,
        JSON.stringify({
          active: layout.active,
          panes: layout.panes.map((pane) => {
            const camera = cameras.get(pane.id);
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

/**
 * A layout without the panes of views the project lacks, down to the single canvas under two; the
 * pane left showing a view gone shows the project's first, and with every view gone the active pane
 * stays, showing it. The same layout when no view it shows is gone.
 */
export function withoutGone(layout: PaneLayout, projectViews: readonly Id[]): PaneLayout {
  const { panes, active } = layout;
  const views = new Set(projectViews);
  const gone = (pane: Pane) => pane.view !== undefined && !views.has(pane.view);
  if (panes.length < 2) {
    // The single canvas shows the project's first view in place of one gone.
    return gone(panes[0]!) ? { active, panes: [{ ...panes[0]!, view: undefined }] } : layout;
  }
  const kept = panes.filter((pane) => !gone(pane));
  if (kept.length === panes.length) return layout;
  const rest = kept.length > 0 ? kept : [{ ...activeOf(layout), view: undefined }];
  const left = new Set(rest.map((pane) => pane.id));
  const at = panes.findIndex((pane) => pane.id === active);
  const next = left.has(active)
    ? active
    : (panes
        .slice(0, at)
        .reverse()
        .find((pane) => left.has(pane.id))?.id ?? rest[0]!.id);
  const total = rest.reduce((sum, pane) => sum + pane.width, 0);
  return {
    active: next,
    panes: rest.map((pane) => ({
      ...pane,
      width: rest.length === 1 || total <= 0 ? 1 / rest.length : pane.width / total,
    })),
  };
}

/** Whether two lists name the same views, in any order. */
function sameViews(one: readonly Id[], other: readonly Id[]): boolean {
  const set = new Set(one);
  return set.size === new Set(other).size && other.every((view) => set.has(view));
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

/**
 * The panes the tab kept under `key`, read strictly: anything else is passed over and one pane shows,
 * as are panes of which one names a view that `views`, the project's, lacks. Each pane gets at least
 * its least share of the width.
 */
export function readPanes(
  storage: PaneStorage | undefined,
  key: string = PANES_STORAGE_KEY,
  views?: readonly Id[],
): { layout: PaneLayout; cameras: Map<string, Camera> } | undefined {
  let stored: unknown;
  try {
    const text = storage?.getItem(key);
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
    if (view !== undefined && views !== undefined && !views.includes(view)) return undefined;
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return undefined;
    read.push({ id, view: view, width });
    if (isCamera(camera)) cameras.set(id, { x: camera.x, y: camera.y, scale: camera.scale });
  }
  if (!read.some((pane) => pane.id === active)) return undefined;
  const shares = atLeast(
    read.map((pane) => pane.width),
    MIN_PANE_SHARE,
  );
  return {
    layout: { active, panes: read.map((pane, index) => ({ ...pane, width: shares[index]! })) },
    cameras,
  };
}

/**
 * Widths as shares of the whole, each at least `least`: those narrower take `least`, and the others
 * share what is left as they shared the rest.
 */
function atLeast(widths: readonly number[], least: number): number[] {
  const pinned = new Set<number>();
  for (;;) {
    const total = widths.reduce((sum, width, index) => (pinned.has(index) ? sum : sum + width), 0);
    const free = 1 - pinned.size * least;
    const shares = widths.map((width, index) =>
      pinned.has(index) ? least : (width / total) * free,
    );
    const narrow = shares
      .map((share, index) => (!pinned.has(index) && share < least ? index : -1))
      .filter((index) => index !== -1);
    if (narrow.length === 0 || pinned.size + narrow.length >= widths.length) return shares;
    for (const index of narrow) pinned.add(index);
  }
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

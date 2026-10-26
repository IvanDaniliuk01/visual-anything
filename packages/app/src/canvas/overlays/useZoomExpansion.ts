/**
 * The open app's expanding by zoom (ADR 0055): a store the shell keeps, which follows the canvas's
 * camera and says which collapsed containers of each view show expanded; the shell builds the scene
 * with them. The canvas and the inspector collapse one again through it when the person collapses a
 * container the zoom expanded, which the view keeps collapsed already.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { createContext, useEffect, useSyncExternalStore } from 'react';
import type { CanvasCamera } from '../../view-state/canvas';
import type { Scene } from '../scene';
import { NOT_EXPANDED } from './collapsed';
import { expandedByZoom, sameIds, type ZoomLook } from './expansion';

/** Which collapsed containers each view shows expanded as the canvas zooms into them. */
export class ZoomExpansion {
  readonly #expanded = new Map<Id, ReadonlySet<Id>>();
  /** The containers of each view the zoom expanded and the person collapsed again. */
  readonly #held = new Map<Id, Set<Id>>();
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** The containers of a view shown expanded by zoom: the same set while they are the same ones. */
  expandedIn(viewId: Id | undefined): ReadonlySet<Id> {
    return (viewId === undefined ? undefined : this.#expanded.get(viewId)) ?? NOT_EXPANDED;
  }

  /** Works out, for where the canvas looks, which containers of the view show expanded. */
  follow(project: ProjectSnapshot, view: ViewFile, scene: Scene, look: ZoomLook): void {
    const current = this.expandedIn(view.id);
    const held = this.#held.get(view.id) ?? new Set<Id>();
    const { expanded, released } = expandedByZoom(project, view, scene, look, current, held);
    for (const id of released) held.delete(id);
    if (sameIds(current, expanded)) return;
    this.#expanded.set(view.id, expanded.size === 0 ? NOT_EXPANDED : expanded);
    for (const listener of this.#listeners) listener();
  }

  /**
   * Collapses again those of `ids` the zoom shows expanded, until the zoom falls below where they
   * expanded; says which ones it did, which no command needs to collapse.
   */
  collapseAgain(viewId: Id, ids: readonly Id[]): Id[] {
    const current = this.expandedIn(viewId);
    const taken = ids.filter((id) => current.has(id));
    if (taken.length === 0) return [];
    let held = this.#held.get(viewId);
    if (!held) {
      held = new Set();
      this.#held.set(viewId, held);
    }
    for (const id of taken) held.add(id);
    const left = new Set([...current].filter((id) => !held.has(id)));
    this.#expanded.set(viewId, left.size === 0 ? NOT_EXPANDED : left);
    for (const listener of this.#listeners) listener();
    return taken;
  }
}

/** The shell's expanding by zoom; none where nothing expands, as in tests of the canvas alone. */
export const ZoomExpansionContext = createContext<ZoomExpansion | null>(null);

/**
 * The containers of `ids` a collapse still has to collapse with a command: those the zoom shows
 * expanded are collapsed again by the zoom alone, since the view keeps them collapsed already.
 */
export function withoutZoomExpanded(
  store: ZoomExpansion | null,
  viewId: Id,
  ids: readonly Id[],
): Id[] {
  if (!store) return [...ids];
  const taken = new Set(store.collapseAgain(viewId, ids));
  return ids.filter((id) => !taken.has(id));
}

/** The containers of the open view shown expanded by zoom, the same set while they are the same ones. */
export function useExpandedByZoom(store: ZoomExpansion, viewId: Id | undefined): ReadonlySet<Id> {
  return useSyncExternalStore(store.subscribe, () => store.expandedIn(viewId));
}

const NOTHING_TO_FOLLOW = () => () => {};

/**
 * The same, for what may have no store, as a panel tested apart from the shell: none expanded then.
 * Scenario playback reads it, so that it plays over the view as the canvas draws it.
 */
export function useZoomExpanded(
  store: ZoomExpansion | null,
  viewId: Id | undefined,
): ReadonlySet<Id> {
  return useSyncExternalStore(
    store?.subscribe ?? NOTHING_TO_FOLLOW,
    () => store?.expandedIn(viewId) ?? NOT_EXPANDED,
  );
}

/**
 * Follows the canvas's camera for the open view, so that the store says which of its collapsed
 * containers show expanded where it looks.
 */
export function useFollowZoom(
  store: ZoomExpansion,
  project: ProjectSnapshot,
  view: ViewFile | undefined,
  scene: Scene | undefined,
  canvas: CanvasCamera | undefined,
): void {
  useEffect(() => {
    if (!view || !scene || !canvas) return;
    const follow = () => {
      const camera = canvas.camera();
      if (camera) store.follow(project, view, scene, { camera, viewport: canvas.viewport() });
    };
    follow();
    // Nothing to follow in a view that keeps nothing collapsed.
    if ((view.collapsed ?? []).length === 0) return;
    return canvas.subscribe(follow);
  }, [store, project, view, scene, canvas]);
}

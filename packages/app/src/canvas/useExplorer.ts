/**
 * What the open view is explored with: its filters and its focus, kept by the shell for each view while
 * the project is open, and never written to the project (ADR-0025). The explorer sets the emphasis the
 * canvas draws, as the `filter` and `focus` sources, and tells the keys what the canvas hides, from
 * every source together.
 *
 * Focus follows the selection: once it is on, selecting elements or relations moves it to them, and
 * clearing the selection leaves it where it was.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Emphasis, EmphasisStore } from '../editor/emphasis';
import type { Selection } from '../editor/selection';
import type { AttributeLookup } from '../live-values/lookup';
import {
  NO_FILTERS,
  applyFilters,
  filterEmphasis,
  focusEmphasis,
  isComplete,
  type FilterResult,
  type Filters,
  type FocusSettings,
  type FocusTargets,
} from './explore';
import { setHidden } from './navigation';
import type { Scene } from './scene';

/** Focus mode in a view: whether it is on, what it starts from, and how far it reaches. */
export interface FocusState extends FocusSettings {
  on: boolean;
  /** What it starts from: the elements and relations last selected while it was on. */
  targets: FocusTargets;
}

/** How a view is explored. */
export interface ViewExplore {
  filters: Filters;
  focus: FocusState;
}

const NO_TARGETS: FocusTargets = { elements: new Set(), relations: new Set() };

export const UNEXPLORED: ViewExplore = {
  filters: NO_FILTERS,
  focus: { on: false, targets: NO_TARGETS, degrees: 1, direction: 'both', isolate: false },
};

/** The open view's filters and focus, and how to change them. */
export interface Explore {
  filters: Filters;
  focus: FocusState;
  setFilters: (filters: Filters) => void;
  /** Changes how focus reaches, or turns it off. */
  setFocus: (changes: Partial<Omit<FocusState, 'targets'>>) => void;
  /** Turns focus on, starting from what is selected. */
  startFocus: () => void;
  /**
   * Turns focus on, starting from these elements and relations instead of the selection, as Claude's
   * guidance does (ADR-0025), with the settings given; it follows the selection from then on.
   */
  focusOn: (targets: FocusTargets, settings?: Partial<FocusSettings>) => void;
  /** What the filters hide, and how many shapes and relations that is. */
  filtered: FilterResult;
}

/** What the explorer works from: the open view as the shell has it, and the emphasis it sets. */
export interface ExplorerInput {
  project: ProjectSnapshot;
  viewId: Id | undefined;
  scene: Scene | undefined;
  selection: Selection;
  emphasis: EmphasisStore;
  /** How attributes read, live and computed values over stored ones (ADR 0057). */
  lookup?: AttributeLookup;
}

/**
 * Keeps the filters and focus of each view, and sets what they emphasize on the open one. The shell
 * calls it once, and hands what it returns to the editor as `explore`.
 */
export function useExplorer({
  project,
  viewId,
  scene,
  selection,
  emphasis,
  lookup,
}: ExplorerInput): Explore {
  const [byView, setByView] = useState<ReadonlyMap<Id, ViewExplore>>(new Map());
  const current = (viewId === undefined ? undefined : byView.get(viewId)) ?? UNEXPLORED;
  const update = useCallback(
    (change: (explore: ViewExplore) => ViewExplore) => {
      if (viewId === undefined) return;
      setByView((last) => {
        const next = new Map(last);
        next.set(viewId, change(last.get(viewId) ?? UNEXPLORED));
        return next;
      });
    },
    [viewId],
  );

  // Adjusting state while rendering: a new selection moves the focus, while it is on.
  const [seen, setSeen] = useState(selection);
  if (seen !== selection) {
    setSeen(selection);
    if (current.focus.on && holdsTargets(selection)) {
      update((explore) => ({
        ...explore,
        focus: { ...explore.focus, targets: targetsOf(selection) },
      }));
    }
  }

  const { filters, focus } = current;
  // Only conditions on attributes read the lookup: without them, live values change nothing here.
  const reading = filters.conditions.some(isComplete) ? lookup : undefined;
  const filtered = useMemo(
    () => applyFilters(scene ?? EMPTY, project, filters, reading),
    [scene, project, filters, reading],
  );
  const filterShown = useMemo(() => filterEmphasis(filtered), [filtered]);
  const focusShown = useMemo(
    () =>
      scene && focus.on
        ? focusEmphasis(scene, project, focus.targets, focus, filtered.hidden)
        : undefined,
    [scene, project, focus, filtered],
  );
  useSource(emphasis, 'filter', filterShown);
  useSource(emphasis, 'focus', focusShown);

  // The keys skip what every source hides, as the canvas draws it; told without rendering again, as
  // the emphasis changes on every frame of playback.
  useEffect(() => {
    if (!scene) return;
    const tell = () => setHidden(scene, emphasis.get().hidden);
    tell();
    const stop = emphasis.subscribe(tell);
    return () => {
      stop();
      setHidden(scene, undefined);
    };
  }, [scene, emphasis]);

  return useMemo<Explore>(
    () => ({
      filters,
      focus,
      filtered,
      setFilters: (next) => update((explore) => ({ ...explore, filters: next })),
      setFocus: (changes) =>
        update((explore) => ({ ...explore, focus: { ...explore.focus, ...changes } })),
      startFocus: () =>
        update((explore) => ({
          ...explore,
          focus: { ...explore.focus, on: true, targets: targetsOf(selection) },
        })),
      focusOn: (targets, settings = {}) =>
        update((explore) => ({
          ...explore,
          focus: { ...explore.focus, ...settings, on: true, targets },
        })),
    }),
    [filters, focus, filtered, selection, update],
  );
}

/** Sets what one source emphasizes on the store while the caller is mounted. */
function useSource(store: EmphasisStore, source: string, shown: Emphasis | undefined): void {
  useEffect(() => {
    store.set(source, shown);
  }, [store, source, shown]);
  useEffect(
    () => () => {
      store.set(source, undefined);
    },
    [store, source],
  );
}

/** Whether a selection holds something focus can start from. */
export function holdsTargets(selection: Selection): boolean {
  return selection.elements.size > 0 || selection.relations.size > 0;
}

function targetsOf(selection: Selection): FocusTargets {
  return { elements: selection.elements, relations: selection.relations };
}

/** A scene with nothing in it, for the filters of a project that has no view open. */
const EMPTY: Scene = { shapes: [], relations: [], notes: [], arrows: [], bounds: undefined };

/**
 * What the shell draws while a comparison shows (ADR 0070): the version the drawing comes from, its
 * view, the comparison's scene and marks, and a selection of the comparison's own, kept apart from
 * the one the person edits with, which comes back as it was once the comparison ends.
 *
 * It follows the project now, before the browser paints, so that every action, whoever makes it,
 * shows in the comparison at once; and it gives the emphasis what is drawn faintly and dashed.
 */
import {
  compareView,
  type ProjectSnapshot,
  type ViewComparison,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { EmphasisStore } from '../../editor/emphasis';
import { EMPTY_SELECTION, type Selection } from '../../editor/selection';
import type { Scene } from '../scene';
import type { ComparisonStore, ShownComparison } from './mode';
import { comparisonScene, type ComparisonScene } from './scene';

/** The emphasis's source for the comparison's faint and dashed drawing. */
export const COMPARISON_EMPHASIS = 'comparison';

/** What the canvas draws while a comparison shows. */
export interface ComparisonCanvas {
  shown: ShownComparison;
  /** The version the drawing comes from: the older before, the newer otherwise. */
  project: ProjectSnapshot;
  view: ViewFile;
  viewComparison: ViewComparison;
  drawn: ComparisonScene;
  selection: Selection;
  select: (selection: Selection) => void;
}

interface ComparisonCanvasOptions {
  store: ComparisonStore;
  /** The project now, which a comparison that follows takes in. */
  project: ProjectSnapshot;
  /** The open view, as the project now has it. */
  view: ViewFile | undefined;
  /** The project now's scene of that view, which the newer version draws when it is the same. */
  scene: Scene | undefined;
  expanded: ReadonlySet<Id>;
  emphasis: EmphasisStore;
}

export function useComparisonCanvas({
  store,
  project,
  view,
  scene,
  expanded,
  emphasis,
}: ComparisonCanvasOptions): ComparisonCanvas | undefined {
  useLayoutEffect(() => store.follow(project), [store, project]);
  const shown = useSyncExternalStore(store.subscribe, store.get, store.get);
  const viewId = view?.id;
  const viewComparison = useMemo(
    () =>
      shown && viewId !== undefined
        ? compareView(shown.comparison, shown.older, shown.newer, viewId)
        : undefined,
    [shown?.comparison, shown?.older, shown?.newer, viewId],
  );
  const drawing = shown?.drawing;
  const drawn = useMemo(() => {
    if (!shown || !viewComparison || viewId === undefined || drawing === undefined) return undefined;
    const newerScene = shown.newer === project ? scene : undefined;
    return comparisonScene(shown.older, shown.newer, viewId, viewComparison, drawing, {
      expanded,
      ...(newerScene ? { newer: newerScene } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scene and the project matter only while they are the newer version
  }, [shown?.older, shown?.newer, viewComparison, viewId, drawing, expanded]);

  // The comparison's own selection, from nothing for each comparison shown.
  const [chosen, setChosen] = useState<{ serial: number; selection: Selection }>();
  const serial = shown?.serial;
  const selection =
    chosen !== undefined && chosen.serial === serial ? chosen.selection : EMPTY_SELECTION;
  const select = useMemo(
    () => (next: Selection) => {
      if (serial !== undefined) setChosen({ serial, selection: next });
    },
    [serial],
  );

  // Unchanged shapes faint unless turned off, what was removed always, its lines dashed.
  const faint = shown?.faint;
  useEffect(() => {
    if (!drawn) {
      emphasis.set(COMPARISON_EMPHASIS, undefined);
      return;
    }
    const dimmed = faint ? new Set([...drawn.unchanged, ...drawn.removed]) : drawn.removed;
    emphasis.set(COMPARISON_EMPHASIS, { dimmed, dashed: drawn.dashed });
  }, [emphasis, drawn, faint]);
  useEffect(() => () => emphasis.set(COMPARISON_EMPHASIS, undefined), [emphasis]);

  return useMemo(() => {
    if (!shown || !drawn || !viewComparison || viewId === undefined) return undefined;
    const from = shown.drawing === 'before' ? shown.older : shown.newer;
    const drawnView =
      from.views.find((each) => each.id === viewId) ??
      shown.newer.views.find((each) => each.id === viewId) ??
      shown.older.views.find((each) => each.id === viewId) ??
      view;
    if (!drawnView) return undefined;
    return {
      shown,
      project: from,
      view: drawnView,
      viewComparison,
      drawn,
      selection,
      select,
    };
  }, [shown, drawn, viewComparison, viewId, view, selection, select]);
}

/**
 * Sets what playback emphasizes on the canvas, as the `playback` source of the emphasis store: the
 * step it is on, highlighted, and its markers where they are. Only this renders on every frame while
 * a marker travels; it draws nothing itself.
 */
import {
  entryOfStep,
  markerProgress,
  type ProjectSnapshot,
  type Timeline,
} from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useMemo, useSyncExternalStore } from 'react';
import type { Scene } from '../canvas/scene';
import { useEmphasisSource, type Emphasis } from '../editor/emphasis';
import { highlightOf, markersOf } from './emphasis';
import { useReducedMotion } from './motion';
import type { ScenarioSession } from './session';

interface PlaybackEmphasisProps {
  session: ScenarioSession;
  project: ProjectSnapshot;
  /** The scenario's view, when it is the one open and drawn. */
  view: ViewFile | undefined;
  scene: Scene | undefined;
  timeline: Timeline | undefined;
}

export function PlaybackEmphasis({
  session,
  project,
  view,
  scene,
  timeline,
}: PlaybackEmphasisProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const elapsed = useSyncExternalStore(session.subscribeFrame, session.getElapsed);
  const reduced = useReducedMotion();
  const at = timeline ? entryOfStep(timeline, state.step) : undefined;
  const entry = at === undefined ? undefined : timeline?.entries[at];
  const highlighted = useMemo(
    () => (view && scene && entry ? highlightOf(project, view, scene, entry) : undefined),
    [project, view, scene, entry],
  );
  const progress = markerProgress({ ...state, elapsed }, reduced);
  const emphasis = useMemo((): Emphasis | undefined => {
    if (!view || !entry || !highlighted) return undefined;
    const markers = markersOf(project, view, entry, progress);
    return { highlighted, ...(markers.length > 0 ? { markers } : {}) };
  }, [project, view, entry, highlighted, progress]);
  useEmphasisSource('playback', emphasis);
  return null;
}

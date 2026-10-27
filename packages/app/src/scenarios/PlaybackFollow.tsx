/**
 * Brings the step playback is on into view on the canvas, as `follow.ts` says, beside
 * `PlaybackEmphasis`, which highlights it. It draws nothing.
 */
import { entryOfStep, type ProjectSnapshot, type Timeline } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Scene } from '../canvas/scene';
import type { CanvasCamera } from '../view-state/canvas';
import { highlightOf } from './emphasis';
import { PlaybackFollower, stepBounds } from './follow';
import { useReducedMotion } from './motion';
import type { ScenarioSession } from './session';

interface PlaybackFollowProps {
  session: Pick<ScenarioSession, 'subscribe' | 'getState'>;
  project: ProjectSnapshot;
  /** The scenario's view, when it is the one open and drawn. */
  view: ViewFile | undefined;
  scene: Scene | undefined;
  timeline: Timeline | undefined;
  /** The canvas's camera, once the canvas has started. */
  canvas: CanvasCamera | undefined;
  /** While something else moves the camera from step to step, as a tour does, playback leaves it. */
  held?: boolean;
  /** Whether a cut cross-fades (ADR 0077): it does by default. */
  fades?: boolean;
}

export function PlaybackFollow({
  session,
  project,
  view,
  scene,
  timeline,
  canvas,
  held = false,
  fades = true,
}: PlaybackFollowProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const reduced = useReducedMotion();
  const motion = useRef({ reduced, fades });
  useEffect(() => {
    motion.current = { reduced, fades };
  });
  const [follower, setFollower] = useState<PlaybackFollower>();
  useEffect(() => {
    if (!canvas) return;
    const made = new PlaybackFollower(canvas, {
      reducedMotion: () => motion.current.reduced,
      fades: () => motion.current.fades,
    });
    setFollower(made);
    return () => {
      made.dispose();
      setFollower(undefined);
    };
  }, [canvas]);

  const at = timeline ? entryOfStep(timeline, state.step) : undefined;
  const entry = at === undefined ? undefined : timeline?.entries[at];
  const bounds = useMemo(
    () =>
      view && scene && entry
        ? stepBounds(scene, highlightOf(project, view, scene, entry))
        : undefined,
    [project, view, scene, entry],
  );
  const key =
    state.scenario === undefined || entry === undefined || view === undefined
      ? undefined
      : `${state.scenario} ${view.id} ${at}`;
  const playing = state.mode === 'playing';
  const latest = useRef(bounds);
  useEffect(() => {
    latest.current = bounds;
  });
  useEffect(() => {
    if (!follower) return;
    // The step's place as the scene draws it when the step changes, or is asked for.
    const step = key === undefined || held ? undefined : { key, bounds: latest.current, playing };
    follower.show(step, state.asks);
  }, [follower, key, playing, held, state.asks]);
  return null;
}

/**
 * Brings the step scenario playback is on into view in the physical-space panel, as
 * `playback-follow.ts` says, beside the canvas's `PlaybackFollow`. Its relations are drawn in space by
 * the panel itself, from the markers playback puts on the canvas (`lines.ts`). It draws nothing.
 */
import { entryOfStep, spaceOf, type ProjectSnapshot, type Timeline } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ScenarioSession } from '../scenarios/session';
import { useSpacePanel, useSpacePanelState } from './context';
import { stepElementsInSpace } from './lines';
import { SpacePlaybackFollower, type SpacePlayedStep } from './playback-follow';

interface SpacePlaybackFollowProps {
  session: Pick<ScenarioSession, 'subscribe' | 'getState'>;
  project: ProjectSnapshot;
  /** The scenario's view, when it is the one open and drawn. */
  view: ViewFile | undefined;
  timeline: Timeline | undefined;
}

export function SpacePlaybackFollow({
  session,
  project,
  view,
  timeline,
}: SpacePlaybackFollowProps) {
  const store = useSpacePanel();
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const shown = useSpacePanelState(store, view?.id);
  const [follower] = useState(() => (store ? new SpacePlaybackFollower(store) : undefined));
  useEffect(() => follower?.attach(), [follower]);

  const at = timeline ? entryOfStep(timeline, state.step) : undefined;
  const entry = at === undefined ? undefined : timeline?.entries[at];
  const root = shown?.root;
  const open = shown !== undefined;
  const space = useMemo(
    () => (open && view ? spaceOf(project, view, root) : undefined),
    [open, project, view, root],
  );
  const step = useMemo((): Omit<SpacePlayedStep, 'key' | 'playing'> | undefined => {
    if (!space || !entry || !view) return undefined;
    const elements = stepElementsInSpace(
      project,
      space,
      entry.kind === 'aggregated' ? { container: entry.container } : { relations: entry.relations },
    );
    return { viewId: view.id, space, elements };
  }, [project, space, entry, view]);
  const key =
    state.scenario === undefined || at === undefined || view === undefined || !open
      ? undefined
      : `${state.scenario} ${view.id} ${at}`;
  const playing = state.mode === 'playing';
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  useEffect(() => {
    if (!follower) return;
    const now = latest.current;
    follower.show(key === undefined || !now ? undefined : { ...now, key, playing }, state.asks);
  }, [follower, key, playing, state.asks]);
  return null;
}

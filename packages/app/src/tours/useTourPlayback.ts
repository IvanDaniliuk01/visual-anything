/**
 * Full-screen playback in the shell (ADR 0058): each step the player is on goes to its view state
 * through the tab's view state applier, with the camera's capped, eased move or a cut; its marks show
 * as a highlight; its scenario plays from one step to another. When the tour ends, the tab goes back
 * to where it was before it started. Playing changes nothing in the project.
 */
import {
  playableStep,
  tourMove,
  type PlayableStep,
  type ProjectSnapshot,
  type ViewState,
} from '@visual-anything/core';
import type { TourStep } from '@visual-anything/schema';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Scene } from '../canvas/scene';
import type { EmphasisStore } from '../editor/emphasis';
import { guidanceEmphasis } from '../guidance/targets';
import { useReducedMotion } from '../scenarios/motion';
import type { ScenarioSession } from '../scenarios/session';
import { cameraOf } from '../view-state/state';
import type { Travel } from '../view-state/applier';
import type { ViewStateLink } from '../view-state/useViewState';
import type { ToursHost } from './context';
import { TourPlayer, type TourPlayback } from './player';
import { ScenarioRange } from './range';

/** The emphasis source a tour's marks show through. */
export const TOUR_EMPHASIS = 'tour';

/**
 * Calls back once the layout that a render asked for has been laid out and the canvas has followed
 * its size, two frames on; the function it returns cancels it.
 */
function afterLayout(callback: () => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    const timer = setTimeout(callback, 32);
    return () => clearTimeout(timer);
  }
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(callback);
  });
  return () => cancelAnimationFrame(frame);
}

interface TourPlaybackInput {
  project: ProjectSnapshot;
  scene: Scene | undefined;
  viewState: ViewStateLink;
  scenarios: ScenarioSession;
  emphasis: EmphasisStore;
}

/** What the shell gets: the player, its state, and the host the tours panel reads. */
export interface TourPlaybackOutput {
  player: TourPlayer;
  playback: TourPlayback;
  host: ToursHost;
}

export function useTourPlayback(input: TourPlaybackInput): TourPlaybackOutput {
  const { project, scene, viewState, scenarios, emphasis } = input;
  const [player] = useState(() => new TourPlayer());
  const [range] = useState(() => new ScenarioRange(scenarios));
  const playback = useSyncExternalStore(player.subscribe, player.getState);
  const reduced = useReducedMotion();
  const motion = useRef(reduced);
  useEffect(() => {
    motion.current = reduced;
  });

  useEffect(() => player.sync(project), [player, project]);

  // How a tour's steps move the camera: capped and eased, or a cut (ADR 0058).
  const travel = useMemo<Travel>(
    () => ({
      move: (from, to, viewport, sameView) => {
        const target = cameraOf(to, viewport);
        if (target === undefined) return 0;
        const move = tourMove(from && cameraOf(from, viewport), target, viewport, {
          reducedMotion: motion.current,
          sameView,
        });
        return move.kind === 'ease' ? move.duration : 0;
      },
    }),
    [],
  );

  const go = useCallback(
    (playable: PlayableStep) => {
      const { play } = playable;
      const state: ViewState = { ...playable.viewState };
      const scenario = play && project.scenarios.find((each) => each.id === play.scenario);
      if (play && scenario) {
        // The scenario opens at the step it plays from, and plays from there.
        state.scenario = scenario.id;
        const from = scenario.steps[play.from]?.id;
        if (from !== undefined && play.from > 0) state.step = from;
        else delete state.step;
      }
      viewState.goTo({ kind: 'address', state, travel });
      range.start(play);
    },
    [project.scenarios, viewState, travel, range],
  );

  const tour = project.tours.find((each) => each.id === playback.tour);
  const step = tour?.steps[playback.step];
  const playable = useMemo(() => (step ? playableStep(project, step) : undefined), [project, step]);

  // Each step goes to its view state once, when playback comes to it; a step whose view is gone
  // leaves the canvas where it is.
  const latest = useRef({ playable, go });
  useEffect(() => {
    latest.current = { playable, go };
  });
  const before = useRef<{ state: ViewState | undefined; focus: Element | null }>(undefined);
  /** Whether the first step still waits for the canvas to fill the window. */
  const first = useRef(false);
  // Where the tab is, taken before the panels hide, since the canvas's size changes then.
  const remember = useCallback(() => {
    before.current ??= {
      state: viewState.current(),
      focus: typeof document === 'undefined' ? null : document.activeElement,
    };
    first.current = true;
  }, [viewState]);
  const shownKey = tour && step ? `${tour.id} ${playback.step} ${step.id}` : undefined;
  useEffect(() => {
    if (shownKey === undefined) return;
    const show = () => {
      first.current = false;
      const { playable: shown, go: goThere } = latest.current;
      if (shown) goThere(shown);
    };
    if (before.current === undefined) remember();
    // The first step waits for the canvas to fill the window, so that its camera fits it.
    if (first.current) return afterLayout(show);
    show();
  }, [shownKey, remember]);

  // When the tour ends, the tab goes back to where it was, once the panels are back.
  useEffect(() => {
    if (playback.tour !== undefined || before.current === undefined) return;
    const { state, focus } = before.current;
    before.current = undefined;
    range.start(undefined);
    if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
    if (!state) return;
    return afterLayout(() => viewState.goTo({ kind: 'address', state }));
  }, [playback.tour, viewState, range]);

  // The scenario plays its range as the session moves on.
  const scenarioState = useSyncExternalStore(scenarios.subscribe, scenarios.getState);
  useEffect(() => range.check(), [range, scenarioState]);

  // The step's marks, as a highlight, while the tour plays.
  const marks = useMemo(
    () =>
      playable && scene && playable.marks.length > 0
        ? guidanceEmphasis(
            { kind: 'highlight', targets: playable.marks, request: 0 },
            scene,
            project,
          )
        : undefined,
    [playable, scene, project],
  );
  useEffect(() => {
    emphasis.set(TOUR_EMPHASIS, playback.tour === undefined ? undefined : marks);
  }, [emphasis, marks, playback.tour]);
  useEffect(() => () => emphasis.set(TOUR_EMPHASIS, undefined), [emphasis]);

  const host = useMemo<ToursHost>(
    () => ({
      player,
      play: (played, at) => {
        if (!player.playing) remember();
        player.start(played, at);
      },
      current: () => viewState.current(),
      show: (shown: TourStep) => {
        const made = playableStep(project, shown);
        if (made) go(made);
      },
    }),
    [player, viewState, project, go, remember],
  );

  return { player, playback, host };
}

/**
 * Full-screen playback in the shell (ADR 0058, ADR 0077): each step the player is on goes to its view
 * state through the tab's view state applier, in the three stages of its transition (`transition.ts`):
 * what it hides or dims fades out with the old caption, the camera moves along its bounded path or
 * cuts with a cross-fade, and its marks fade in with the new caption. Its reveals come in one press at
 * a time, and `dimRest` dims what it does not mark. Its scenario plays from one step to another. When
 * the tour ends, the tab goes back to where it was before it started. Playing changes nothing in the
 * project.
 */
import {
  playableStep,
  type PlayableStep,
  type ProjectSnapshot,
  type ViewState,
} from '@visual-anything/core';
import type { Id, TourStep } from '@visual-anything/schema';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Scene } from '../canvas/scene';
import type { Emphasis, EmphasisStore } from '../editor/emphasis';
import { useReducedMotion } from '../scenarios/motion';
import type { ScenarioSession } from '../scenarios/session';
import type { Travel } from '../view-state/applier';
import { tourGlide, type CanvasCamera } from '../view-state/canvas';
import type { ViewStateLink } from '../view-state/useViewState';
import type { ToursHost } from './context';
import { dimRestOf, keysOfMarks, shownMarks } from './marks';
import { TourPlayer, type TourPlayback } from './player';
import { ScenarioRange } from './range';
import { TourTransitions, type TransitionState } from './transition';

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
  /** The tab's scenario playback: the app's scenario session, or the read-only page's playback. */
  scenarios: Pick<
    ScenarioSession,
    'subscribe' | 'getState' | 'play' | 'pause' | 'goToStep' | 'entryOf'
  >;
  emphasis: EmphasisStore;
  /** The canvas's camera, once the canvas is made: transitions capture its frames (ADR 0077). */
  canvas?: CanvasCamera | undefined;
  /** Whether motion is reduced, so that every camera change cuts: as the system says unless given. */
  reducedMotion?: boolean | undefined;
  /** Whether the stages fade and cuts cross-fade: they do unless told otherwise. */
  fades?: boolean | undefined;
}

/** What the shell gets: the player, its state, the host the tours panel reads, and the transition. */
export interface TourPlaybackOutput {
  player: TourPlayer;
  playback: TourPlayback;
  host: ToursHost;
  /** Where the step's transition is, for the stage's caption (ADR 0077). */
  transition: TransitionState;
}

/** What was shown last: which step, how many of its reveals, and what it marked. */
interface Shown {
  key: string;
  step: number;
  reveal: number;
  marks: readonly Id[];
}

const NO_KEYS: ReadonlySet<string> = new Set();

export function useTourPlayback(input: TourPlaybackInput): TourPlaybackOutput {
  const { project, scene, viewState, scenarios, emphasis, canvas } = input;
  const [player] = useState(() => new TourPlayer());
  const [range] = useState(() => new ScenarioRange(scenarios));
  const [transitions] = useState(() => new TourTransitions());
  const playback = useSyncExternalStore(player.subscribe, player.getState);
  const transition = useSyncExternalStore(transitions.subscribe, transitions.getState);
  const systemReduced = useReducedMotion();
  const settings = useRef({
    reduced: input.reducedMotion ?? systemReduced,
    fades: input.fades ?? true,
    canvas,
  });
  useEffect(() => {
    settings.current = {
      reduced: input.reducedMotion ?? systemReduced,
      fades: input.fades ?? true,
      canvas,
    };
  });

  useEffect(() => player.sync(project), [player, project]);

  // How a tour's steps move the camera: along the bounded path, or a cut, timed by the transition.
  const travel = useMemo<Travel>(
    () => ({
      move: (from, to, viewport, sameView) => {
        const now = settings.current;
        const { move, along } = tourGlide(from, to, viewport, {
          reducedMotion: now.reduced,
          sameView,
        });
        return transitions.move(move, to, {
          ...(along ? { along } : {}),
          canvas: now.canvas,
          fades: now.fades,
        });
      },
    }),
    [transitions],
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
  const { reveal } = playback;
  // What the step marks with the reveals shown so far.
  const marks = useMemo(() => (playable ? shownMarks(playable, reveal) : []), [playable, reveal]);

  // Each step goes to its view state once, when playback comes to it, and each reveal comes in or
  // goes once; a step whose view is gone leaves the canvas where it is.
  const latest = useRef({ playable, go, marks, step: playback.step, reveal });
  useEffect(() => {
    latest.current = { playable, go, marks, step: playback.step, reveal };
  });
  const before = useRef<{ state: ViewState | undefined; focus: Element | null }>(undefined);
  const shown = useRef<Shown>(undefined);
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
  const target = shownKey === undefined ? undefined : `${shownKey} ${reveal}`;
  useEffect(() => {
    if (shownKey === undefined || target === undefined) return;
    const show = () => {
      first.current = false;
      const now = latest.current;
      const last = shown.current;
      const { canvas: canvasNow, fades, reduced } = settings.current;
      const wasMarked = new Set(last?.marks ?? []);
      const kept = now.marks.filter((id) => wasMarked.has(id));
      if (last?.key === shownKey) {
        // The same step: a reveal came in or went (ADR 0077).
        if (last.reveal !== now.reveal) {
          transitions.reveal({
            target,
            step: now.step,
            kept,
            canvas: canvasNow,
            fades,
            forward: now.reveal > last.reveal,
            dims: now.playable?.dimRest === true,
          });
        }
      } else {
        const open = viewState.current()?.view;
        transitions.begin({
          target,
          step: now.step,
          ...(last ? { from: last.step } : {}),
          kept,
          canvas: canvasNow,
          fades,
          // Into another view, or under reduced motion, the camera cuts whatever its move.
          cuts: reduced || open === undefined || open !== now.playable?.viewState.view,
          moves: now.playable !== undefined && canvasNow !== undefined,
        });
        if (now.playable) now.go(now.playable);
      }
      shown.current = { key: shownKey, step: now.step, reveal: now.reveal, marks: now.marks };
    };
    if (before.current === undefined) remember();
    // The first step waits for the canvas to fill the window, so that its camera fits it.
    if (first.current) return afterLayout(show);
    show();
  }, [shownKey, target, remember, transitions, viewState]);

  // When the tour ends, the tab goes back to where it was, once the panels are back.
  useEffect(() => {
    if (playback.tour !== undefined || before.current === undefined) return;
    const { state, focus } = before.current;
    before.current = undefined;
    shown.current = undefined;
    transitions.end();
    range.start(undefined);
    if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
    if (!state) return;
    return afterLayout(() => viewState.goTo({ kind: 'address', state }));
  }, [playback.tour, viewState, range, transitions]);
  useEffect(() => () => transitions.end(), [transitions]);

  // The scenario plays its range as the session moves on.
  const scenarioState = useSyncExternalStore(scenarios.subscribe, scenarios.getState);
  useEffect(() => range.check(), [range, scenarioState]);

  // The step's marks, as a highlight, and what `dimRest` dims, while the tour plays: the marks it
  // keeps from the step before stay, and the others wait for the in stage to fade in.
  const shownKeys = useMemo(
    () => (scene ? keysOfMarks(marks, scene, project) : NO_KEYS),
    [marks, scene, project],
  );
  const keptKeys = useMemo(
    () => (scene ? keysOfMarks(transition.kept, scene, project) : NO_KEYS),
    [transition.kept, scene, project],
  );
  const dimRest = playable?.dimRest === true;
  const dimmed = useMemo(
    () => (dimRest && scene ? dimRestOf(marks, scene, project) : undefined),
    [dimRest, marks, scene, project],
  );
  const tourEmphasis = useMemo((): Emphasis | undefined => {
    const highlighted = transition.marks === 'waiting' ? keptKeys : shownKeys;
    const arriving =
      transition.marks === 'arriving'
        ? new Set([...shownKeys].filter((key) => !keptKeys.has(key)))
        : NO_KEYS;
    if (highlighted.size === 0 && dimmed === undefined) return undefined;
    return {
      ...(highlighted.size > 0 ? { highlighted } : {}),
      ...(arriving.size > 0 ? { arriving: { keys: arriving, duration: transition.arriving } } : {}),
      ...(dimmed ? { dimmed } : {}),
    };
  }, [transition.marks, transition.arriving, shownKeys, keptKeys, dimmed]);
  const playing = playback.tour !== undefined;
  // Until the transition to the step shown has begun, what shows stays as it was.
  const begun = target !== undefined && transition.target === target;
  useEffect(() => {
    if (!playing) emphasis.set(TOUR_EMPHASIS, undefined);
    else if (begun) emphasis.set(TOUR_EMPHASIS, tourEmphasis);
  }, [emphasis, playing, begun, tourEmphasis]);
  useEffect(() => () => emphasis.set(TOUR_EMPHASIS, undefined), [emphasis]);

  const host = useMemo<ToursHost>(
    () => ({
      player,
      play: (played, at) => {
        if (!player.playing) remember();
        player.start(played, at);
      },
      current: () => viewState.current(),
      show: (shownStep: TourStep) => {
        const made = playableStep(project, shownStep);
        if (made) go(made);
      },
    }),
    [player, viewState, project, go, remember],
  );

  return { player, playback, host, transition };
}

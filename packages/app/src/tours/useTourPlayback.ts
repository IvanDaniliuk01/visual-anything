/**
 * Full-screen playback in the shell (ADR 0058, ADR 0077): each step the player is on goes to its view
 * state through the tab's view state applier, in the three stages of its transition (`transition.ts`):
 * what it hides or dims fades out with the old caption, the camera moves along its bounded path or
 * cuts with a cross-fade, and its marks fade in with the new caption. Its reveals come in one press at
 * a time, and `dimRest` dims what it does not mark. When the tour ends, the tab goes back to where it
 * was before it started. Playing changes nothing in the project.
 *
 * The stage around it (ADR 0077):
 *
 * - **A scenario the step plays** plays its range, from one step to another; a pause from the card,
 *   or P, keeps the range, and R plays it again. A step without a camera frames, once, everything its
 *   range plays; in a step with a camera, playback brings into view the scenario's steps outside it
 *   (`step-camera.ts`).
 * - **Looking around.** Once the person pans or zooms, Back to the step (B) gives its camera back.
 * - **The caption** takes the side of the screen farthest from the step's marks when the camera stops.
 * - **Advancing by itself** follows the core's `advanceAfter`, never during a transition, and waits
 *   while the person paused it, while the scenario is paused, and while the steps' index is open.
 * - **What screen readers hear**: each step and reveal the person brings in, and the scenario's step
 *   when it is paused; nothing that comes on a timer.
 * - **Explaining (ADR 0084):** a step into another view glides the shapes it shares with the step
 *   before (`glide-layer.ts`); the lines its marks and reveals bring in draw from their start; its
 *   caption's leader line follows the camera to the mark it points at; and its pulse runs along its
 *   chain once its transition is over, R playing it again. Under reduced motion each cuts or is
 *   marked at once.
 * - **The physical-space panel (ADR 0076):** a step whose view state opens it shows the canvas and
 *   the panel side by side, half each (`tours.css`); its camera moves as a tour's does, eased or cut
 *   (`space/travel.ts`), through the view state applier.
 * - **A view beside it (ADR 0102):** a step with `beside` shows that view state in the pane right of
 *   the tour's (`beside.ts`), gliding as steps do; the panes come back as they were when the tour ends.
 */
import {
  playableStep,
  type PlayableStep,
  type ProjectSnapshot,
  type ViewState,
} from '@visual-anything/core';
import type { Id, TourStep } from '@visual-anything/schema';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { Rect } from '../canvas/geometry';
import { LINE_DRAW_TIME } from '../canvas/lineDraw';
import type { Scene } from '../canvas/scene';
import type { Emphasis, EmphasisStore } from '../editor/emphasis';
import { useMotion } from '../scenarios/motion';
import type { ScenarioSession } from '../scenarios/session';
import type { Travel } from '../view-state/applier';
import { tourGlide, type CanvasCamera } from '../view-state/canvas';
import type { ViewStateLink } from '../view-state/useViewState';
import { AdvanceTimer, advanceEvery } from './advance';
import type { TourBeside } from './beside';
import type { ToursHost } from './context';
import { glideSideOf } from './glide-layer';
import { leaderLine, leaderTargetOf, type Leader } from './leader';
import { dimRestOf, keysOfMarks, shownMarks } from './marks';
import { PULSE_EMPHASIS, pulseFrame } from './pulse';
import { marksOnScreen, placeCaption, type CaptionPlace, type CardRoom } from './placement';
import { TourPlayer, applyTourKey, type TourKeyAction, type TourPlayback } from './player';
import { ScenarioRange, type RangeSession } from './range';
import { playedBounds, scenarioStepBounds } from './scenario-frame';
import { StageStore, type StageCue } from './stage-store';
import { StepCamera } from './step-camera';
import { TourTransitions, type TransitionState } from './transition';

/** The emphasis source a tour's marks show through. */
export const TOUR_EMPHASIS = 'tour';

/** The room the caption card takes when it cannot be measured, as in tests, in pixels. */
const CARD_ROOM: CardRoom = { height: 200, width: 400 };

/** How wide the card is at a side of the screen, in pixels, as `tours.css` draws it. */
const SIDE_CARD_WIDTH = 400;

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
  scenarios: Pick<ScenarioSession, 'subscribe' | 'getState'> & RangeSession;
  emphasis: EmphasisStore;
  /** The canvas's camera, once the canvas is made: transitions capture its frames (ADR 0077). */
  canvas?: CanvasCamera | undefined;
  /**
   * Whether motion is reduced, so that every camera change cuts, and whether the stages fade and
   * cuts cross-fade: as the person's Motion and Fades preferences say where the shell gives them,
   * and otherwise as the system says, with fades on.
   */
  reducedMotion?: boolean | undefined;
  fades?: boolean | undefined;
  /**
   * The panes beside the tour's, which a step's `beside` shows a view in (ADR 0102); none where there
   * are no panes, as on the read-only page.
   */
  beside?: TourBeside | undefined;
}

/** The scenario a step plays, as the stage's card shows it. */
export interface StageScenario {
  scenario: Id;
  /** The step playback is on, by its index among the scenario's steps. */
  step: number;
  /** Whether it plays, is paused from the card keeping its range, or is done with its range. */
  state: 'playing' | 'paused' | 'done';
}

/** What the stage shows around the caption (ADR 0077). */
export interface TourStageView {
  scenario: StageScenario | undefined;
  /** Present while the step advances by itself, with whether the person paused it. */
  advancing: { paused: boolean } | undefined;
  /** Whether the person looked around, so that Back to the step is offered. */
  looked: boolean;
  /** Whether the steps' index is open. */
  index: boolean;
  /** Where the caption card sits when the step's caption leaves it to the stage. */
  place: CaptionPlace;
  /** What screen readers were told last. */
  said: (StageCue & { count: number }) | undefined;
  /** How many reveals the step whose caption shows had: the step left's while it fades out. */
  captionReveal: number;
  fades: boolean;
  /**
   * The caption's leader line to the mark it points at (ADR 0084), on screen, or `off` when that mark
   * is off the canvas; none when the step points at nothing shown.
   */
  leader: Leader | undefined;
}

/** What the shell gets: the player, its state, the host the tours panel reads, and the stage. */
export interface TourPlaybackOutput {
  player: TourPlayer;
  playback: TourPlayback;
  host: ToursHost;
  /** Where the step's transition is, for the stage's caption (ADR 0077). */
  transition: TransitionState;
  stage: TourStageView;
  /** Does what a key or a control of the stage asks. */
  act: (action: TourKeyAction) => void;
  /** Goes to a step from the steps' index, at its start. */
  goTo: (step: number) => void;
  /** The stage's caption card, which the caption's place is worked out from. */
  card: RefObject<HTMLElement | null>;
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
  const [stepCamera] = useState(() => new StepCamera());
  const [stage] = useState(() => new StageStore());
  const [timer] = useState(() => new AdvanceTimer());
  const playback = useSyncExternalStore(player.subscribe, player.getState);
  const transition = useSyncExternalStore(transitions.subscribe, transitions.getState);
  const rangePhase = useSyncExternalStore(range.subscribe, range.getState);
  const cameraState = useSyncExternalStore(stepCamera.subscribe, stepCamera.getState);
  const stageState = useSyncExternalStore(stage.subscribe, stage.getState);
  const motion = useMotion();
  const reduced = input.reducedMotion ?? motion.reduced;
  const fades = input.fades ?? motion.fades;
  const settings = useRef({ reduced, fades, canvas });
  useEffect(() => {
    settings.current = { reduced, fades, canvas };
  });
  const besideRef = useRef(input.beside);
  useEffect(() => {
    besideRef.current = input.beside;
  });
  const card = useRef<HTMLElement>(null);

  useEffect(() => player.sync(project), [player, project]);
  useEffect(() => {
    stepCamera.attach(canvas);
    return () => stepCamera.attach(undefined);
  }, [stepCamera, canvas]);

  // How a tour's steps move the camera: along the bounded path, or a cut, timed by the transition.
  const travel = useMemo<Travel>(
    () => ({
      move: (from, to, viewport, sameView, scene) => {
        const now = settings.current;
        // A step that always cuts cuts its camera too (ADR 0084).
        const cutting = player.playing && cutsAlways.current;
        const { move, along } = tourGlide(from, to, viewport, {
          reducedMotion: now.reduced || cutting,
          sameView,
        });
        // Into another view, the shapes on screen there, for the shapes shared to glide to.
        const glideTo =
          !sameView && scene && !now.reduced && !cutting
            ? {
                side: glideSideOf(scene, to, viewport, { hidden: emphasis.get().hidden }),
                screen: viewport,
              }
            : undefined;
        const glide = transitions.move(move, to, {
          ...(along ? { along } : {}),
          canvas: now.canvas,
          fades: now.fades,
          ...(glideTo ? { glideTo } : {}),
        });
        // Where the step puts the camera, for Back to the step once the person looks around.
        if (player.playing) stepCamera.arrive(to, (glide.delay ?? 0) + glide.duration);
        return glide;
      },
      // The physical-space panel's camera cuts, too, for a step that always cuts (ADR 0076).
      cutsSpace: () => player.playing && cutsAlways.current,
    }),
    [transitions, player, stepCamera, emphasis],
  );

  const go = useCallback(
    (playable: PlayableStep) => {
      const { play } = playable;
      const state: ViewState = { ...playable.viewState };
      const scenario = play && project.scenarios.find((each) => each.id === play.scenario);
      let frame: Travel['frame'];
      if (play && scenario) {
        // The scenario opens at the step it plays from, in the alternatives it plays (ADR 0078),
        // and plays from there.
        state.scenario = scenario.id;
        const from = scenario.steps[play.from]?.id;
        if (from !== undefined && play.from > 0) state.step = from;
        else delete state.step;
        if (play.choices) state.choices = play.choices;
        else delete state.choices;
        // Without a camera, the step frames everything its range plays (ADR 0077).
        if (!state.camera) {
          frame = (drawn) =>
            playedBounds(project, drawn, scenario, play.from, play.to, play.choices);
        }
      }
      viewState.goTo({ kind: 'address', state, travel: frame ? { ...travel, frame } : travel });
      range.start(play);
    },
    [project, viewState, travel, range],
  );

  const tour = project.tours.find((each) => each.id === playback.tour);
  const step = tour?.steps[playback.step];
  const playable = useMemo(
    () => (step ? playableStep(project, step, tour?.emphasis) : undefined),
    [project, step, tour?.emphasis],
  );
  const { reveal } = playback;
  const cutsAlways = useRef(false);
  useEffect(() => {
    cutsAlways.current = playable?.transition === 'cut';
  });
  // What the step marks with the reveals shown so far.
  const marks = useMemo(() => (playable ? shownMarks(playable, reveal) : []), [playable, reveal]);

  // Each step goes to its view state once, when playback comes to it, and each reveal comes in or
  // goes once; a step whose view is gone leaves the canvas where it is.
  const latest = useRef({ playable, go, marks, step: playback.step, reveal, project, scene });
  useEffect(() => {
    latest.current = { playable, go, marks, step: playback.step, reveal, project, scene };
  });
  const before = useRef<{ state: ViewState | undefined; focus: Element | null }>(undefined);
  const shown = useRef<Shown>(undefined);
  /** Whether the first step still waits for the canvas to fill the window. */
  const first = useRef(false);
  /** Whether what changes next is the person's press, which screen readers are told of. */
  const pressed = useRef(false);
  // Where the tab is, taken before the panels hide, since the canvas's size changes then.
  const remember = useCallback(() => {
    if (before.current === undefined) {
      stage.reset();
      // The panes as they are, to come back to when the tour ends (ADR 0102).
      besideRef.current?.begin();
    }
    before.current ??= {
      state: viewState.current(),
      focus: typeof document === 'undefined' ? null : document.activeElement,
    };
    first.current = true;
  }, [viewState, stage]);
  const shownKey = tour && step ? `${tour.id} ${playback.step} ${step.id}` : undefined;
  const target = shownKey === undefined ? undefined : `${shownKey} ${reveal}`;
  useEffect(() => {
    if (shownKey === undefined || target === undefined) return;
    const show = () => {
      first.current = false;
      const now = latest.current;
      const last = shown.current;
      const told = pressed.current;
      pressed.current = false;
      const { canvas: canvasNow, fades: fadesNow, reduced: reducedNow } = settings.current;
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
            fades: fadesNow,
            forward: now.reveal > last.reveal,
            dims: now.playable?.dimRest === true,
          });
          if (told && now.reveal > last.reveal) {
            stage.say({ kind: 'reveal', step: now.step, reveal: now.reveal });
          }
        }
      } else {
        const open = viewState.current()?.view;
        stage.setLeft(last?.reveal ?? 0);
        stepCamera.leave();
        cutsAlways.current = now.playable?.transition === 'cut';
        const intoAnother = open !== undefined && open !== now.playable?.viewState.view;
        // Into another view, the shapes on screen now, which may glide there (ADR 0084).
        const camera = canvasNow?.camera();
        const glide =
          last &&
          intoAnother &&
          !reducedNow &&
          !cutsAlways.current &&
          now.scene &&
          camera &&
          canvasNow
            ? glideSideOf(now.scene, camera, canvasNow.viewport(), {
                hidden: emphasis.get().hidden,
              })
            : undefined;
        transitions.begin({
          target,
          step: now.step,
          ...(last ? { from: last.step } : {}),
          kept,
          canvas: canvasNow,
          fades: fadesNow,
          // Into another view, under reduced motion, or for a step that always cuts, the camera
          // cuts whatever its move.
          cuts: reducedNow || open === undefined || intoAnother || cutsAlways.current,
          moves: now.playable !== undefined && canvasNow !== undefined,
          ...(glide ? { glide } : {}),
        });
        if (now.playable) now.go(now.playable);
        // The view beside it, in the pane right of the tour's (ADR 0102); without, as it was left.
        if (now.playable?.beside) besideRef.current?.show(now.playable.beside);
        if (told) stage.say({ kind: 'step', step: now.step, reveal: now.reveal });
      }
      shown.current = { key: shownKey, step: now.step, reveal: now.reveal, marks: now.marks };
    };
    if (before.current === undefined) remember();
    // The first step waits for the canvas to fill the window, so that its camera fits it.
    if (first.current) return afterLayout(show);
    show();
  }, [shownKey, target, remember, transitions, viewState, stage, stepCamera, emphasis]);

  // When the tour ends, the tab goes back to where it was, once the panels are back.
  useEffect(() => {
    if (playback.tour !== undefined || before.current === undefined) return;
    const { state, focus } = before.current;
    before.current = undefined;
    shown.current = undefined;
    transitions.end();
    stepCamera.end();
    stage.reset();
    range.start(undefined);
    besideRef.current?.end();
    if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
    if (!state) return;
    return afterLayout(() => viewState.goTo({ kind: 'address', state }));
  }, [playback.tour, viewState, range, transitions, stepCamera, stage]);
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
  // A step in its own style draws what it marks restyled, with nothing over it (ADR 0100).
  const ownStyle = playable?.emphasis === 'style';
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
    const styled = ownStyle && highlighted.size > 0;
    return {
      ...(highlighted.size > 0 ? { highlighted } : {}),
      ...(styled ? { styled: highlighted } : {}),
      // Its lines flow and its shapes breathe as they come in, but under reduced motion.
      ...(styled && !reduced ? { styleMoves: true as const } : {}),
      ...(arriving.size > 0
        ? {
            arriving: {
              keys: arriving,
              duration: transition.arriving,
              // The lines that come in draw from their start (ADR 0084), but under reduced motion.
              ...(reduced ? {} : { draw: LINE_DRAW_TIME }),
            },
          }
        : {}),
      ...(dimmed ? { dimmed } : {}),
    };
  }, [transition.marks, transition.arriving, shownKeys, keptKeys, dimmed, reduced, ownStyle]);
  const playing = playback.tour !== undefined;
  // Until the transition to the step shown has begun, what shows stays as it was.
  const begun = target !== undefined && transition.target === target;
  useEffect(() => {
    if (!playing) emphasis.set(TOUR_EMPHASIS, undefined);
    else if (begun) emphasis.set(TOUR_EMPHASIS, tourEmphasis);
  }, [emphasis, playing, begun, tourEmphasis]);
  useEffect(() => () => emphasis.set(TOUR_EMPHASIS, undefined), [emphasis]);

  // Whether the step's transition is over: its camera stopped and its marks and caption are in.
  const settled = playing && begun && transition.phase === 'shown' && transition.marks === 'in';
  const play = playable?.play;

  // In a step with a camera, playback brings the scenario's steps outside it into view (ADR 0077).
  const followed =
    settled &&
    play !== undefined &&
    playable?.viewState.camera !== undefined &&
    scenarioState.scenario === play.scenario
      ? `${play.scenario} ${scenarioState.step}`
      : undefined;
  useEffect(() => {
    if (followed === undefined) return;
    const now = latest.current;
    const played = now.playable?.play;
    const scenario = played && now.project.scenarios.find((each) => each.id === played.scenario);
    if (!scenario || !now.scene) return;
    const { step: at, choices } = scenarios.getState();
    stepCamera.follow(
      scenarioStepBounds(now.project, now.scene, scenario, at, choices),
      settings.current,
    );
  }, [followed, scenarios, stepCamera]);

  // The caption takes the side farthest from the marks once the camera stops (ADR 0077): afresh
  // when a step comes and when its camera does, and otherwise, after a reveal or a move following a
  // scenario, only when it would cover a mark.
  const placed = useRef<{ key: string | undefined; arrived: number }>({
    key: undefined,
    arrived: 0,
  });
  const arrived =
    begun &&
    transition.caption === playback.step &&
    (transition.phase === 'in' || transition.phase === 'shown');
  const placeAt = arrived ? `${target} ${cameraState.arrived} ${cameraState.stopped}` : undefined;
  const keysRef = useRef(shownKeys);
  const cameraRef = useRef(cameraState);
  useEffect(() => {
    keysRef.current = shownKeys;
    cameraRef.current = cameraState;
  });
  useEffect(() => {
    if (placeAt === undefined) return;
    const now = latest.current;
    const camera = settings.current.canvas?.camera();
    const viewport = settings.current.canvas?.viewport();
    if (!camera || !viewport || !now.scene) return;
    const came = cameraRef.current.arrived;
    const fresh = placed.current.key !== shownKey || placed.current.arrived !== came;
    placed.current = { key: shownKey, arrived: came };
    const measured = cardRect(card.current);
    stage.setPlace(
      placeCaption({
        current: stage.getState().place,
        marks: marksOnScreen(now.scene, keysRef.current, camera),
        screen: viewport,
        card: measured ? { height: measured.height, width: SIDE_CARD_WIDTH } : CARD_ROOM,
        shown: measured,
        fresh,
      }),
    );
  }, [placeAt, shownKey, stage]);

  // The caption's leader line to the mark it points at (ADR 0084), once that mark is shown: it
  // follows the camera and the card's place.
  const pointTo = playable?.pointTo;
  const pointing =
    playing && arrived && pointTo !== undefined && reveal >= pointTo.reveal
      ? pointTo.id
      : undefined;
  const [leader, setLeader] = useState<Leader>();
  const place = stageState.place;
  // A card dragged to a place of its own (ADR 0095) moves the line's start with it.
  const fixedPlace = JSON.stringify(step?.caption.place ?? null);
  // The card's side the step's line leaves from, if it names one (ADR 0097).
  const leaderSide = step?.caption.leader?.from;
  useEffect(() => {
    const canvasNow = settings.current.canvas;
    if (pointing === undefined || !canvasNow) {
      setLeader(undefined);
      return;
    }
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const camera = canvasNow.camera();
      const shownScene = latest.current.scene;
      const measured = cardRect(card.current);
      const target =
        camera && shownScene ? leaderTargetOf(shownScene, pointing, camera) : undefined;
      const next =
        target && measured
          ? leaderLine(measured, target, canvasNow.viewport(), leaderSide)
          : undefined;
      setLeader((was) => (sameLeader(was, next) ? was : next));
    };
    const schedule = () => {
      if (frame === undefined) frame = nextFrame(update);
    };
    schedule();
    const unsubscribe = canvasNow.subscribe(schedule);
    return () => {
      unsubscribe();
      if (frame !== undefined) cancelFrame(frame);
    };
  }, [pointing, place, fixedPlace, leaderSide, scene]);

  // A step's pulse along its chain, once its transition is over (ADR 0084): R plays it again, and a
  // press forward or back ends it.
  const [pulseRun, setPulseRun] = useState(0);
  const pulseAt =
    playing && settled && playable?.pulse !== undefined ? `${shownKey} ${pulseRun}` : undefined;
  const pulsed = useRef<string>(undefined);
  const pulseStop = useRef<() => void>(undefined);
  const stopPulse = useCallback(() => {
    pulseStop.current?.();
    pulseStop.current = undefined;
    emphasis.set(PULSE_EMPHASIS, undefined);
  }, [emphasis]);
  useEffect(() => stopPulse, [shownKey, reveal, playing, stopPulse]);
  useEffect(() => {
    if (pulseAt === undefined || pulsed.current === pulseAt) return;
    const run = latest.current.playable?.pulse;
    if (!run) return;
    pulsed.current = pulseAt;
    stopPulse();
    const reducedNow = settings.current.reduced;
    const start = performance.now();
    let frame: number | undefined;
    let live = true;
    const tick = () => {
      frame = undefined;
      if (!live) return;
      const at = pulseFrame(run.legs, run.repeat, performance.now() - start, reducedNow);
      const now = latest.current;
      const keys =
        at.marked.length > 0 && now.scene
          ? keysOfMarks(at.marked, now.scene, now.project)
          : NO_KEYS;
      // On a step in its own style, the marker rides on the restyled line (ADR 0100).
      const styled = keys.size > 0 && now.playable?.emphasis === 'style';
      emphasis.set(
        PULSE_EMPHASIS,
        at.markers.length > 0 || keys.size > 0
          ? {
              ...(at.markers.length > 0 ? { markers: at.markers } : {}),
              ...(keys.size > 0 ? { highlighted: keys } : {}),
              ...(styled ? { styled: keys } : {}),
              ...(styled && !reducedNow ? { styleMoves: true as const } : {}),
            }
          : undefined,
      );
      if (!at.done) frame = nextFrame(tick);
    };
    frame = nextFrame(tick);
    pulseStop.current = () => {
      live = false;
      if (frame !== undefined) cancelFrame(frame);
    };
  }, [pulseAt, emphasis, stopPulse]);

  // Advancing by itself (ADR 0077), never during a transition.
  const every = playable ? advanceEvery(playable) : undefined;
  const steps = tour?.steps.length ?? 0;
  const atEnd = playback.step >= steps - 1 && playback.reveal >= player.revealsOf(playback.step);
  const advances = playing && every !== undefined && !atEnd;
  // Nor while the person looks around: the step waits for them to come back or to press on.
  const held =
    stageState.paused || rangePhase === 'paused' || stageState.index || cameraState.looked;
  const timed = advances && settled && !held && typeof every === 'number' ? every : undefined;
  useEffect(() => {
    if (timed === undefined || target === undefined) return;
    // What comes on a timer is not announced: `pressed` stays as it is.
    return timer.run(target, timed, () => player.next());
  }, [timed, target, timer, player]);
  const afterScenario =
    advances &&
    settled &&
    every === 'after-scenario' &&
    rangePhase === 'ended' &&
    !held &&
    playback.step < steps - 1;
  useEffect(() => {
    if (afterScenario) player.goTo(latest.current.step + 1);
  }, [afterScenario, player]);

  const act = useCallback(
    (action: TourKeyAction) => {
      const now = latest.current;
      const played = now.playable?.play;
      switch (action) {
        case 'next':
        case 'previous':
        case 'first':
        case 'last': {
          const was = player.getState();
          pressed.current = true;
          applyTourKey(player, action);
          if (player.getState() === was) pressed.current = false;
          return;
        }
        case 'end':
          player.end();
          return;
        case 'index':
          stage.setIndex(!stage.getState().index);
          return;
        case 'pause': {
          if (played) {
            const phase = range.getState();
            if (phase === 'opening' || phase === 'playing') {
              range.pause();
              stage.say({
                kind: 'paused',
                scenario: played.scenario,
                step: scenarios.getState().step,
              });
            } else if (phase === 'paused') range.resume();
            else range.replay();
          } else if (now.playable?.advance !== undefined) {
            stage.setPaused(!stage.getState().paused);
          }
          return;
        }
        case 'hold':
          stage.setPaused(!stage.getState().paused);
          return;
        case 'replay':
          if (played) range.replay();
          if (now.playable?.pulse) {
            pulsed.current = undefined;
            setPulseRun((run) => run + 1);
          }
          return;
        case 'back':
          if (stepCamera.getState().looked) stepCamera.back(settings.current);
          return;
      }
    },
    [player, stage, range, scenarios, stepCamera],
  );

  const goTo = useCallback(
    (to: number) => {
      const was = player.getState();
      pressed.current = true;
      stage.setIndex(false);
      player.goTo(to);
      if (player.getState() === was) pressed.current = false;
    },
    [player, stage],
  );

  const host = useMemo<ToursHost>(
    () => ({
      player,
      play: (played, at) => {
        if (!player.playing) remember();
        pressed.current = true;
        player.start(played, at);
      },
      current: () => viewState.current(),
      show: (shownStep: TourStep) => {
        const made = playableStep(project, shownStep);
        if (made) go(made);
        if (made?.beside) besideRef.current?.show(made.beside);
      },
      beside: () => besideRef.current?.current(),
    }),
    [player, viewState, project, go, remember],
  );

  const scenarioView = useMemo((): StageScenario | undefined => {
    if (!playing || !play) return undefined;
    const open = scenarioState.scenario === play.scenario;
    return {
      scenario: play.scenario,
      step: open ? scenarioState.step : play.from,
      state:
        rangePhase === 'opening' || rangePhase === 'playing'
          ? 'playing'
          : rangePhase === 'paused'
            ? 'paused'
            : 'done',
    };
  }, [playing, play, scenarioState.scenario, scenarioState.step, rangePhase]);

  const stageView: TourStageView = {
    scenario: scenarioView,
    advancing: advances ? { paused: stageState.paused } : undefined,
    looked: playing && cameraState.looked,
    index: stageState.index,
    place: stageState.place,
    said: stageState.said,
    captionReveal: transition.caption === playback.step ? playback.reveal : stageState.left,
    fades,
    leader: pointing === undefined ? undefined : leader,
  };

  return { player, playback, host, transition, stage: stageView, act, goTo, card };
}

/** Whether two leader lines run the same way. */
function sameLeader(a: Leader | undefined, b: Leader | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === 'off' || b === 'off') return false;
  return (
    a.from.x === b.from.x &&
    a.from.y === b.from.y &&
    a.to.x === b.to.x &&
    a.to.y === b.to.y &&
    a.side === b.side
  );
}

/** The browser's next frame, or a timer where there are no frames, as in tests. */
function nextFrame(run: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(run);
  return setTimeout(run, 16) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  clearTimeout(handle);
}

/** Where the caption card is in the stage, once it has been laid out; none before, as in tests. */
function cardRect(card: HTMLElement | null): Rect | undefined {
  const parent = card?.offsetParent;
  if (!card || !(parent instanceof HTMLElement)) return undefined;
  const shown = card.getBoundingClientRect();
  const stage = parent.getBoundingClientRect();
  if (!(shown.width > 0 && shown.height > 0)) return undefined;
  return {
    x: shown.left - stage.left,
    y: shown.top - stage.top,
    width: shown.width,
    height: shown.height,
  };
}

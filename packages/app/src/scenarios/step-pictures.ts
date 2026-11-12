/**
 * The pictures, videos and link cards a step shows (ADR 0098, stage 4), in the app and on the
 * read-only page: while a scenario or a tour that chooses its pictures plays, those of the view drawn
 * that its current step does not list are hidden, through an emphasis of their own, and the videos it
 * plays play, muted and in a loop, through every canvas that draws them. Under reduced motion no
 * video starts by itself. A tour that chooses its pictures decides while it plays; otherwise the
 * scenario open on a step decides, the one a tour's step plays included. Nothing of the project
 * changes.
 */
import {
  choosesPictures,
  entryOfStep,
  scenarioTimeline,
  shownPictures,
  type ProjectSnapshot,
  type ShownPictures,
} from '@visual-anything/core';
import type { DecisionChoices, Id, Step } from '@visual-anything/schema';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { playStepVideos } from '../canvas/pictures/playing';
import type { Emphasis, EmphasisStore } from '../editor/emphasis';
import { useMotion } from './motion';
import type { ScenarioState } from './session';

/** The emphasis source the pictures a step does not show are hidden through. */
export const STEP_PICTURES_EMPHASIS = 'step-pictures';

/** What plays now: the tour played, at a step, and the scenario open, at a step. */
export interface PlayingNow {
  tour?: { id: Id; step: number } | undefined;
  scenario?: { id: Id; step: number; choices?: DecisionChoices | undefined } | undefined;
}

/**
 * What the step shown now hides of the view drawn, and the videos it plays; undefined when nothing
 * that plays chooses its pictures over that view, so that every picture shows.
 */
export function stepPicturesNow(
  project: ProjectSnapshot,
  viewId: Id | undefined,
  now: PlayingNow,
): ShownPictures | undefined {
  const view = project.views.find((each) => each.id === viewId);
  if (view === undefined) return undefined;
  const tour = now.tour && project.tours.find((each) => each.id === now.tour?.id);
  if (now.tour && tour && choosesPictures(tour.steps)) {
    const step = tour.steps[now.tour.step];
    return step?.viewState.view === view.id ? shownPictures(view, [step], true) : undefined;
  }
  const scenario = now.scenario && project.scenarios.find((each) => each.id === now.scenario?.id);
  if (!now.scenario || !scenario || scenario.view !== view.id) return undefined;
  if (!choosesPictures(scenario.steps)) return undefined;
  const timeline = scenarioTimeline(project, scenario, view, now.scenario.choices);
  const at = entryOfStep(timeline, now.scenario.step);
  const entry = at === undefined ? undefined : timeline.entries[at];
  if (entry === undefined) return undefined;
  // An aggregated step shows what any of the steps it stands for shows.
  const steps = entry.steps
    .map((id) => scenario.steps.find((each) => each.id === id))
    .filter((each): each is Step => each !== undefined);
  return shownPictures(view, steps, true);
}

interface StepPicturesInput {
  project: ProjectSnapshot;
  /** The view the canvas draws. */
  viewId: Id | undefined;
  /** The tour played: none while none plays. */
  tour: { tour: Id | undefined; step: number };
  /** The tab's scenario playback: the app's scenario session, or the read-only page's. */
  scenarios: {
    subscribe: (listener: () => void) => () => void;
    getState: () => Pick<ScenarioState, 'scenario' | 'step' | 'choices'>;
  };
  emphasis: EmphasisStore;
  /** Whether motion is reduced, as the person chose where the shell says; else as the system says. */
  reducedMotion?: boolean | undefined;
}

/** Hides what the step shown does not show, and plays its videos, while it shows. */
export function useStepPictures(input: StepPicturesInput): void {
  const { project, viewId, tour, scenarios, emphasis } = input;
  const motion = useMotion();
  const reduced = input.reducedMotion ?? motion.reduced;
  const state = useSyncExternalStore(scenarios.subscribe, scenarios.getState);
  const shown = useMemo(
    () =>
      stepPicturesNow(project, viewId, {
        tour: tour.tour === undefined ? undefined : { id: tour.tour, step: tour.step },
        scenario:
          state.scenario === undefined
            ? undefined
            : { id: state.scenario, step: state.step, choices: state.choices },
      }),
    [project, viewId, tour.tour, tour.step, state.scenario, state.step, state.choices],
  );
  // Keyed by what they name, so that the canvas draws again only when that changes.
  const hiddenKey = shown ? [...shown.hidden].sort().join('\n') : '';
  const hidden = useMemo(
    (): Emphasis | undefined =>
      hiddenKey === '' ? undefined : { hidden: new Set(hiddenKey.split('\n')) },
    [hiddenKey],
  );
  useEffect(() => emphasis.set(STEP_PICTURES_EMPHASIS, hidden), [emphasis, hidden]);
  useEffect(() => () => emphasis.set(STEP_PICTURES_EMPHASIS, undefined), [emphasis]);
  // Under reduced motion a step starts no video: the person clicks one to play it.
  const playingKey = shown && !reduced ? shown.playing.join('\n') : '';
  useEffect(() => {
    playStepVideos(new Set(playingKey === '' ? [] : playingKey.split('\n')));
  }, [playingKey]);
  useEffect(() => () => playStepVideos(new Set()), []);
}

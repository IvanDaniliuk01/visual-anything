/**
 * What `check_tour` and the Tours panel say of a tour (ADR 0077), read against a reference screen,
 * step by step: whether its camera glides there, cuts or stays; what it marks outside its camera or
 * hides by its filters; a caption longer than its advance lets one read; steps in a row that show the
 * same view state and could be reveals of one step; long scenario ranges; and broken steps. Pure: the
 * caller says where shapes are drawn, since the scene is the app's.
 */
import type { Id, TourFile, TourStep } from '@visual-anything/schema';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';
import { tourMove, type ScreenSize } from './camera';
import { playedSteps } from '../scenarios/blocks';
import { playedRangeOf, tourStepProblems } from './steps';
import { stepReadingTime } from './timing';

/** The screen a tour is read against when none is given: the reference laptop's canvas. */
export const TOUR_CHECK_SCREEN: ScreenSize = { width: 1366, height: 768 };

/** A scenario range longer than this many steps is hard to follow in one tour step. */
export const LONG_TOUR_RANGE = 10;

/** A rectangle on the canvas, in canvas units. */
export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What may be wrong with a step, by kind. */
export type TourWarningKind =
  | 'broken'
  | 'cuts'
  | 'marks-outside'
  | 'marks-hidden'
  | 'caption-too-long'
  | 'could-be-reveal'
  | 'long-range';

/** One thing to look at in a step. */
export interface TourWarning {
  kind: TourWarningKind;
  message: string;
  /** What it is about, when it is about elements or relations. */
  subjects?: Id[];
}

/** What a step's check says. */
export interface TourStepCheck {
  step: Id;
  /** Its place in the tour, from 1. */
  n: number;
  /**
   * How the camera gets there from the step before: it glides; cuts; stays, for a step that shows
   * the same view state, or whose camera is where the step before left it; fits, when a step keeps no
   * camera and the canvas frames it; or follows, when the step before kept none, so that the move
   * starts wherever the canvas framed it, gliding when that is near enough. The first step always
   * fits or cuts.
   */
  camera: 'glide' | 'cut' | 'stay' | 'fit' | 'follows';
  warnings: TourWarning[];
}

/**
 * Reads a tour step by step against a screen. `boundsOf` says where an element or a relation is drawn
 * in a view; without it nothing is said about marks outside a camera. Filters are read by the
 * components and relation types they hide; their conditions and ranges are the canvas's to judge.
 */
export function checkTour(
  project: ProjectSnapshot,
  tour: TourFile,
  options: {
    screen?: ScreenSize;
    boundsOf?: (view: Id, id: Id) => TourRect | undefined;
  } = {},
): TourStepCheck[] {
  const screen = options.screen ?? TOUR_CHECK_SCREEN;
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? index.relation(id)?.name ?? id;
  const names = (ids: readonly Id[]) => ids.map((id) => `"${nameOf(id)}"`).join(', ');

  return tour.steps.map((step, at): TourStepCheck => {
    const n = at + 1;
    const before = at > 0 ? tour.steps[at - 1] : undefined;
    const warnings: TourWarning[] = [];
    const { viewState } = step;

    const problems = tourStepProblems(project, step);
    if (problems.length > 0) {
      warnings.push({
        kind: 'broken',
        message: `Step ${n} names what the project no longer holds, and plays without it: ${problems[0]?.message ?? ''}`,
        subjects: problems.map((each) => each.subject),
      });
    }

    const same = before !== undefined && sameViewState(before, step);
    const camera = cameraOf(before, step, screen, same);
    if (camera === 'cut' && before?.viewState.view === viewState.view) {
      warnings.push({
        kind: 'cuts',
        message: `Step ${n} cuts from step ${n - 1}: its camera is too far, or too much zoomed, to glide to.`,
      });
    }
    if (same) {
      warnings.push({
        kind: 'could-be-reveal',
        message: `Step ${n} shows the same view state as step ${n - 1}: it could be a reveal of that step.`,
      });
    }

    const marked = [...(step.marks ?? []), ...(step.reveal ?? []).flatMap((each) => each.marks)];
    const there = marked.filter((id) => index.element(id) ?? index.relation(id));
    const saved = viewState.camera;
    if (saved && options.boundsOf) {
      const half = { width: screen.width / 2 / saved.zoom, height: screen.height / 2 / saved.zoom };
      const shown = {
        x: saved.x - half.width,
        y: saved.y - half.height,
        width: 2 * half.width,
        height: 2 * half.height,
      };
      const outside = there.filter((id) => {
        const bounds = options.boundsOf?.(viewState.view, id);
        return bounds !== undefined && !meets(bounds, shown);
      });
      if (outside.length > 0) {
        warnings.push({
          kind: 'marks-outside',
          message: `Step ${n} marks what its camera does not show: ${names(outside)}.`,
          subjects: outside,
        });
      }
    }

    const hiding = viewState.filters;
    if (hiding) {
      const components = new Set(hiding.components ?? []);
      const relationTypes = new Set(hiding.relationTypes ?? []);
      const hidden = there.filter((id) => {
        const element = index.element(id);
        if (element) return components.has(element.component);
        const relation = index.relation(id);
        if (!relation) return false;
        const end = (end: Id) => {
          const found = index.element(end);
          return found !== undefined && components.has(found.component);
        };
        return relationTypes.has(relation.relationType) || end(relation.from) || end(relation.to);
      });
      if (hidden.length > 0) {
        warnings.push({
          kind: 'marks-hidden',
          message: `Step ${n} marks what its filters hide: ${names(hidden)}.`,
          subjects: hidden,
        });
      }
    }

    if (typeof step.advance === 'number') {
      const reading = stepReadingTime(step);
      if (reading > step.advance) {
        warnings.push({
          kind: 'caption-too-long',
          message: `Step ${n} moves on after ${seconds(step.advance)}, but its text takes ${seconds(reading)} to read: it waits until then.`,
        });
      }
    }

    if (step.play) {
      const scenario = project.scenarios.find((each) => each.id === step.play?.scenario);
      if (scenario) {
        // Only the steps its choices play count (ADR 0078).
        const range = playedRangeOf(scenario, step.play);
        const length = playedSteps(scenario, range.choices).filter(
          (at) => at >= range.from && at <= range.to,
        ).length;
        if (length > LONG_TOUR_RANGE) {
          warnings.push({
            kind: 'long-range',
            message: `Step ${n} plays ${length} steps of the scenario "${scenario.name}": a range of more than ${LONG_TOUR_RANGE} is hard to follow in one step.`,
          });
        }
      }
    }

    return { step: step.id, n, camera, warnings };
  });
}

/** How the camera gets to a step from the one before, as the stage plays it on this screen. */
function cameraOf(
  before: TourStep | undefined,
  step: TourStep,
  screen: ScreenSize,
  same: boolean,
): TourStepCheck['camera'] {
  if (same) return 'stay';
  const to = step.viewState.camera;
  if (to === undefined) return 'fit';
  if (before === undefined) return 'cut';
  const sameView = before.viewState.view === step.viewState.view;
  if (!sameView) return 'cut';
  const from = before.viewState.camera;
  if (from === undefined) return 'follows';
  // Where the canvas already looks, within half a pixel and a thousandth of the zoom, as the stage
  // reads it: the camera stays.
  if (
    Math.abs(from.x - to.x) * to.zoom < 0.5 &&
    Math.abs(from.y - to.y) * to.zoom < 0.5 &&
    Math.abs(from.zoom / to.zoom - 1) < 1e-3
  ) {
    return 'stay';
  }
  const move = tourMove(from, to, screen, { reducedMotion: false, sameView });
  return move.kind === 'ease' ? 'glide' : 'cut';
}

/** Whether two steps show the same view state, so that they play as one scene. */
function sameViewState(a: TourStep, b: TourStep): boolean {
  return JSON.stringify(a.viewState) === JSON.stringify(b.viewState);
}

function meets(a: TourRect, b: TourRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} s`;
}

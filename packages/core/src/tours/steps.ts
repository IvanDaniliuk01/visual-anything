/**
 * Tour steps (ADR 0058): the view state a step keeps, read and written as a tour file keeps it; what a
 * step names that the project no longer holds; and how a step plays now. A step that names something
 * deleted is kept, flagged here, and played without it, as a broken scenario step is. Everything here
 * is pure: playing a tour never changes the project.
 */
import type {
  Id,
  SavedCondition,
  SavedFilters,
  SavedFocus,
  SavedViewState,
  TourFile,
  TourStep,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import type { ProblemCode } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { checkViewState, type ViewState } from '../view-state';

/** The most steps a tour holds. */
export const MAX_TOUR_STEPS = 1000;
/** The most elements and relations a step marks. */
export const MAX_TOUR_MARKS = 500;
/** The longest name of a tour, and title of a step's caption. */
export const MAX_TOUR_NAME = 200;
export const MAX_CAPTION_TITLE = 200;
/** The longest description of a tour, and text of a step's caption. */
export const MAX_TOUR_DESCRIPTION = 4000;
export const MAX_CAPTION_TEXT = 4000;
/** The longest speaker notes of a step. */
export const MAX_SPEAKER_NOTES = 20000;
/**
 * The most characters a tour's text holds together, its name, description, captions and speaker
 * notes, so that a tour stays well within the 8 MiB a `.vatour` is read within and the 4 MiB one change
 * from the app carries, whatever characters it is written in.
 */
export const MAX_TOUR_TEXT = 1_000_000;

/** How many characters a tour's text holds: its name, description, captions and speaker notes. */
export function tourTextLength(tour: TourFile): number {
  let length = tour.name.length + (tour.description?.length ?? 0);
  for (const step of tour.steps) {
    length += step.caption.title.length + (step.caption.text?.length ?? 0);
    length += step.notes?.length ?? 0;
  }
  return length;
}

// ——— The view state a step keeps ———

/** The view state a step keeps, as the app and view addresses hold one. */
export function viewStateOfStep(saved: SavedViewState): ViewState {
  const state: ViewState = { view: saved.view };
  if (saved.camera)
    state.camera = { x: saved.camera.x, y: saved.camera.y, zoom: saved.camera.zoom };
  if (saved.select) state.select = [...saved.select];
  if (saved.filters) {
    state.filters = {
      components: [...(saved.filters.components ?? [])],
      relationTypes: [...(saved.filters.relationTypes ?? [])],
      conditions: (saved.filters.conditions ?? []).map(({ of, attribute, test, value }) => ({
        of,
        attribute,
        test,
        value: value ?? '',
      })),
      ...(saved.filters.range ? { range: { ...saved.filters.range } } : {}),
    };
  }
  if (saved.focus) {
    const { degrees, direction, isolate, from } = saved.focus;
    state.focus = {
      degrees,
      direction,
      isolate: isolate ?? false,
      ...(from ? { from: [...from] } : {}),
    };
  }
  if (saved.scenario !== undefined) state.scenario = saved.scenario;
  if (saved.step !== undefined) state.step = saved.step;
  return state;
}

/**
 * A view state as a tour step keeps it: lists that hold nothing, a condition's empty value and focus
 * that does not isolate are left out, so that the file says only what the step shows.
 */
export function savedViewStateOf(state: ViewState): SavedViewState {
  const saved: SavedViewState = { view: state.view };
  if (state.camera) saved.camera = { ...state.camera };
  if (state.select && state.select.length > 0) saved.select = [...state.select];
  if (state.filters) {
    const filters: SavedFilters = {};
    if (state.filters.components.length > 0) filters.components = [...state.filters.components];
    if (state.filters.relationTypes.length > 0) {
      filters.relationTypes = [...state.filters.relationTypes];
    }
    if (state.filters.conditions.length > 0) {
      filters.conditions = state.filters.conditions.map(
        ({ of, attribute, test, value }): SavedCondition =>
          test === 'set' || test === 'unset' || value === ''
            ? { of, attribute, test }
            : { of, attribute, test, value },
      );
    }
    if (state.filters.range) filters.range = { ...state.filters.range };
    if (Object.keys(filters).length > 0) saved.filters = filters;
  }
  if (state.focus) {
    const { degrees, direction, isolate, from } = state.focus;
    const focus: SavedFocus = { degrees, direction };
    if (isolate) focus.isolate = true;
    if (from && from.length > 0) focus.from = [...from];
    saved.focus = focus;
  }
  if (state.scenario !== undefined) saved.scenario = state.scenario;
  if (state.step !== undefined) saved.step = state.step;
  return saved;
}

/** A saved view state checked: as a step keeps it, or why it is not one. */
export type SavedViewStateCheck =
  { ok: true; state: SavedViewState } | { ok: false; message: string };

/**
 * Checks a view state given in the form a tour step keeps, as a command gives one, the way an
 * address's is checked; and returns it as the step keeps it.
 */
export function checkSavedViewState(value: unknown): SavedViewStateCheck {
  if (!isRecord(value)) return { ok: false, message: 'A view state is an object.' };
  const filters = value.filters;
  const focus = value.focus;
  // The saved form leaves out what the address form always writes; it is filled in to be checked.
  const asAddress: Record<string, unknown> = { ...value };
  if (isRecord(filters)) {
    asAddress.filters = {
      ...filters,
      ...(Array.isArray(filters.conditions)
        ? {
            conditions: filters.conditions.map((each: unknown) =>
              isRecord(each) && each.value === undefined ? { ...each, value: '' } : each,
            ),
          }
        : {}),
    };
  }
  if (isRecord(focus) && focus.isolate === undefined) {
    asAddress.focus = { ...focus, isolate: false };
  }
  const checked = checkViewState(asAddress);
  return checked.ok ? { ok: true, state: savedViewStateOf(checked.state) } : checked;
}

// ——— What a step names that the project does not hold ———

/** Something a step names that the project does not hold now. */
export interface TourStepProblem {
  code: ProblemCode;
  message: string;
  /** What it names. */
  subject: Id;
}

/**
 * What a step names that the project does not hold now: its view; what it selects, marks or focuses
 * from; the components and relation types its filters name; the scenario open, or played, and their
 * steps. Empty when the step plays as it was written. A step with problems is kept, and plays
 * without what they name.
 */
export function tourStepProblems(project: ProjectSnapshot, step: TourStep): TourStepProblem[] {
  const { viewState } = step;
  const problems: TourStepProblem[] = [];
  const view = project.views.find((each) => each.id === viewState.view);
  if (view === undefined) {
    problems.push({
      code: 'unknown-view',
      message: `The project has no view "${viewState.view}".`,
      subject: viewState.view,
    });
  }
  const index = modelIndexOf(project);
  const world = project.model.world.id;
  const inModel = (id: Id) =>
    id !== world && (index.element(id) !== undefined || index.relation(id) !== undefined);
  const freeShapes = new Set(view?.freeShapes.map((shape) => shape.id));
  for (const id of viewState.select ?? []) {
    if (!inModel(id) && !freeShapes.has(id)) {
      problems.push({
        code: 'unknown-element',
        message: `Nothing in the view "${view?.name ?? viewState.view}" has the id "${id}".`,
        subject: id,
      });
    }
  }
  for (const id of step.marks ?? []) {
    if (!inModel(id)) {
      problems.push({
        code: 'unknown-element',
        message: `A step marks elements and relations, and "${id}" is neither.`,
        subject: id,
      });
    }
  }
  for (const id of viewState.focus?.from ?? []) {
    if (!inModel(id)) {
      problems.push({
        code: 'unknown-element',
        message: `Focus starts from elements and relations, and "${id}" is neither.`,
        subject: id,
      });
    }
  }
  if (viewState.filters) {
    const definitions = definitionsIn(project);
    for (const id of viewState.filters.components ?? []) {
      if (id !== ESSENCE_ID && !definitions.components.has(id)) {
        problems.push({
          code: 'unknown-component',
          message: `No package in use defines the component "${id}".`,
          subject: id,
        });
      }
    }
    for (const id of viewState.filters.relationTypes ?? []) {
      if (id !== RELATES_TO_ID && !definitions.relationTypes.has(id)) {
        problems.push({
          code: 'unknown-relation-type',
          message: `No package in use defines the relation type "${id}".`,
          subject: id,
        });
      }
    }
  }
  if (viewState.step !== undefined && viewState.scenario === undefined) {
    problems.push({
      code: 'unknown-scenario',
      message: 'A step needs its scenario: scenario=<id>.',
      subject: viewState.step,
    });
  }
  if (viewState.scenario !== undefined) {
    problems.push(
      ...scenarioProblems(project, viewState.view, viewState.scenario, [viewState.step]),
    );
  }
  if (step.play) {
    const { scenario, from, to } = step.play;
    const found = scenarioProblems(project, viewState.view, scenario, [from, to]);
    problems.push(...found);
    const played = project.scenarios.find((each) => each.id === scenario);
    if (found.length === 0 && played && from !== undefined && to !== undefined) {
      const start = played.steps.findIndex((each) => each.id === from);
      const end = played.steps.findIndex((each) => each.id === to);
      if (start > end) {
        problems.push({
          code: 'invalid-command',
          message: `The step "${from}" comes after "${to}" in the scenario "${played.name}".`,
          subject: scenario,
        });
      }
    }
  }
  return problems;
}

/** What is wrong with a scenario a step opens or plays over its view, and with its steps named. */
function scenarioProblems(
  project: ProjectSnapshot,
  viewId: Id,
  scenarioId: Id,
  steps: readonly (Id | undefined)[],
): TourStepProblem[] {
  const scenario = project.scenarios.find((each) => each.id === scenarioId);
  if (scenario === undefined) {
    return [
      {
        code: 'unknown-scenario',
        message: `The project has no scenario "${scenarioId}".`,
        subject: scenarioId,
      },
    ];
  }
  const problems: TourStepProblem[] = [];
  if (scenario.view !== viewId && project.views.some((each) => each.id === viewId)) {
    const over = project.views.find((each) => each.id === scenario.view);
    const view = project.views.find((each) => each.id === viewId);
    problems.push({
      code: 'unknown-scenario',
      message: `The scenario "${scenario.name}" plays over the view "${over?.name ?? scenario.view}", not "${view?.name ?? viewId}".`,
      subject: scenarioId,
    });
  }
  for (const id of steps) {
    if (id !== undefined && !scenario.steps.some((each) => each.id === id)) {
      problems.push({
        code: 'unknown-scenario',
        message: `The scenario "${scenario.name}" has no step "${id}".`,
        subject: id,
      });
    }
  }
  return problems;
}

/** Whether a step names something the project no longer holds: it is kept and flagged. */
export function isBrokenTourStep(project: ProjectSnapshot, step: TourStep): boolean {
  return tourStepProblems(project, step).length > 0;
}

// ——— How a step plays ———

/** A step as it plays now: without what the project no longer holds. */
export interface PlayableStep {
  /** The view state to go to. */
  viewState: ViewState;
  /** What it highlights. */
  marks: Id[];
  /** The scenario it plays, by the indices of the steps it plays from and to, both included. */
  play?: { scenario: Id; from: number; to: number };
}

/**
 * How a step plays now: its view state and marks without what the project no longer holds, and its
 * scenario only while it still plays over the step's view. `undefined` when its view is gone, since
 * there is then nothing to show it over.
 */
export function playableStep(project: ProjectSnapshot, step: TourStep): PlayableStep | undefined {
  const saved = step.viewState;
  const view = project.views.find((each) => each.id === saved.view);
  if (view === undefined) return undefined;
  const missing = new Set(
    tourStepProblems(project, step)
      .filter((each) => each.code !== 'unknown-scenario' && each.code !== 'invalid-command')
      .map((each) => each.subject),
  );
  const kept = (ids: readonly Id[] | undefined) => (ids ?? []).filter((id) => !missing.has(id));
  const state = viewStateOfStep(saved);
  const select = kept(state.select);
  if (select.length > 0) state.select = select;
  else delete state.select;
  if (state.focus?.from !== undefined) {
    const from = kept(state.focus.from);
    // Focus from nothing left would follow the selection instead: it is left off.
    if (from.length > 0) state.focus = { ...state.focus, from };
    else delete state.focus;
  }
  if (state.filters) {
    const { range } = state.filters;
    const filters = {
      components: kept(state.filters.components),
      relationTypes: kept(state.filters.relationTypes),
      conditions: state.filters.conditions,
      ...(range === undefined ? {} : { range }),
    };
    const hides =
      filters.components.length + filters.relationTypes.length + filters.conditions.length > 0;
    if (hides || range !== undefined) state.filters = filters;
    else delete state.filters;
  }
  const opened =
    state.scenario === undefined ? undefined : playedOver(project, view.id, state.scenario);
  if (opened === undefined) {
    delete state.scenario;
    delete state.step;
  } else if (state.step !== undefined && !opened.steps.some((each) => each.id === state.step)) {
    delete state.step;
  }
  const playable: PlayableStep = { viewState: state, marks: kept(step.marks) };
  const played = step.play && playedOver(project, view.id, step.play.scenario);
  if (step.play && played && played.steps.length > 0) {
    const at = (id: Id | undefined, fallback: number) => {
      const found = id === undefined ? -1 : played.steps.findIndex((each) => each.id === id);
      return found < 0 ? fallback : found;
    };
    const from = at(step.play.from, 0);
    const to = at(step.play.to, played.steps.length - 1);
    playable.play = { scenario: played.id, from: Math.min(from, to), to: Math.max(from, to) };
  }
  return playable;
}

/** The scenario with this id when it plays over the view. */
function playedOver(project: ProjectSnapshot, view: Id, scenario: Id) {
  const found = project.scenarios.find((each) => each.id === scenario);
  return found?.view === view ? found : undefined;
}

// ——— Ids the tours name ———

const named = new WeakMap<readonly TourFile[], ReadonlySet<Id>>();

/**
 * The ids the steps of the tours name as what they select, mark or focus from, and the tours' own ids.
 * No new element or relation takes one of them, so that a step whose element was deleted never comes
 * to mean another.
 */
export function idsNamedByTours(tours: readonly TourFile[]): ReadonlySet<Id> {
  let ids = named.get(tours);
  if (ids === undefined) {
    const set = new Set<Id>();
    for (const tour of tours) {
      set.add(tour.id);
      for (const step of tour.steps) {
        for (const id of step.viewState.select ?? []) set.add(id);
        for (const id of step.marks ?? []) set.add(id);
        for (const id of step.viewState.focus?.from ?? []) set.add(id);
      }
    }
    ids = set;
    named.set(tours, ids);
  }
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

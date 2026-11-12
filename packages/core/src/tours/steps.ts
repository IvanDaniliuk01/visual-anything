/**
 * Tour steps (ADR 0058): the view state a step keeps, read and written as a tour file keeps it; what a
 * step names that the project no longer holds; and how a step plays now. A step that names something
 * deleted is kept, flagged here, and played without it, as a broken scenario step is. Everything here
 * is pure: playing a tour never changes the project.
 */
import type {
  DecisionChoices,
  Id,
  SavedCondition,
  SavedFilters,
  SavedFocus,
  SavedViewState,
  ScenarioFile,
  TourFile,
  TourEmphasis,
  TourStep,
  ViewFile,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import type { ProblemCode } from '../problems';
import { choicesToReach, knownChoices, playedSteps } from '../scenarios/blocks';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import {
  checkViewState,
  choiceProblems,
  copiedSimulation,
  copiedSpace,
  spaceRootProblem,
  type ViewState,
} from '../view-state';
import { chainBreak, pulseLegs, type ChainLink, type PulseLeg, pulseProblems } from './pulse';
import { advanceAfter } from './timing';
import { explorablesIn } from '../explorables/catalog';
import { explorableParameterProblem, parameterValues } from '../explorables/data';
import type { ExplorableParameterValue } from '@visual-anything/schema';

/** The most steps a tour holds. */
export const MAX_TOUR_STEPS = 1000;
/** The most elements and relations a step marks. */
export const MAX_TOUR_MARKS = 500;
/** The most reveals a step brings in, one press at a time (ADR 0077). */
export const MAX_TOUR_REVEALS = 50;
/** How long a step may wait before it moves on by itself, in milliseconds, at the least and the most. */
export const TOUR_ADVANCE = { least: 500, most: 600_000 } as const;
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

/**
 * How many characters a tour's text holds: its name, description, captions, the texts its reveals
 * add to them, and speaker notes.
 */
export function tourTextLength(tour: TourFile): number {
  let length = tour.name.length + (tour.description?.length ?? 0);
  for (const step of tour.steps) {
    length += step.caption.title.length + (step.caption.text?.length ?? 0);
    for (const reveal of step.reveal ?? []) length += reveal.text?.length ?? 0;
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
  if (saved.choices !== undefined) state.choices = { ...saved.choices };
  if (saved.space !== undefined) state.space = copiedSpace(saved.space);
  if (saved.simulation !== undefined) state.simulation = copiedSimulation(saved.simulation);
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
  // Written only when there are some (ADR 0078): a view state without choices plays every default.
  if (state.choices && Object.keys(state.choices).length > 0) saved.choices = { ...state.choices };
  if (state.space !== undefined) saved.space = copiedSpace(state.space);
  if (state.simulation !== undefined) saved.simulation = copiedSimulation(state.simulation);
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
  /** The reveal that names it, counted from 0, when one does (ADR 0077). */
  reveal?: number;
  /**
   * Present when it is about the step's pulse (ADR 0084), the mark its caption points at, or the
   * view state it shows beside it (ADR 0102).
   */
  part?: 'pulse' | 'point-to' | 'beside' | 'explorable';
}

/** How the problems of the view state a step shows beside it begin (ADR 0102). */
const BESIDE = 'Beside it: ';

/**
 * What a step names that the project does not hold now: its view; what it selects, marks, reveals or
 * focuses from; the components and relation types its filters name; the scenario open, or played, and
 * their steps; and the same of the view state it shows beside it (ADR 0102). Empty when the step plays
 * as it was written. A step with problems is kept, and plays without what they name.
 */
export function tourStepProblems(project: ProjectSnapshot, step: TourStep): TourStepProblem[] {
  const { viewState } = step;
  const index = modelIndexOf(project);
  const { problems, view, inModel } = shownProblems(project, viewState);
  const freeShapes = new Set(view?.freeShapes.map((shape) => shape.id));
  // A step marks what Claude's highlight marks: the model's elements and relations, and the view's
  // notes and arrows, which the app draws and keeps at full strength the same way.
  const markable = (id: Id) => inModel(id) || freeShapes.has(id);
  for (const id of step.marks ?? []) {
    if (!markable(id)) {
      problems.push({
        code: 'unknown-element',
        message: `A step marks elements, relations, notes and arrows of its view, and "${id}" is none of them.`,
        subject: id,
      });
    }
  }
  (step.reveal ?? []).forEach((reveal, at) => {
    for (const id of reveal.marks) {
      if (!markable(id)) {
        problems.push({
          code: 'unknown-element',
          message: `Reveal ${at + 1} of the step marks elements, relations, notes and arrows of its view, and "${id}" is none of them.`,
          subject: id,
          reveal: at,
        });
      }
    }
  });
  // The mark the caption points at, when it is none of the step's marks: a mark that is gone is said
  // once, as a mark (ADR 0084).
  const pointTo = step.caption.pointTo;
  if (pointTo !== undefined && !markable(pointTo) && !marksOf(step).includes(pointTo)) {
    problems.push({
      code: 'unknown-element',
      message: `The caption points at "${pointTo}", which is no element, relation, note or arrow of its view.`,
      subject: pointTo,
      part: 'point-to',
    });
  }
  for (const each of pulseProblems(project, step)) {
    problems.push({
      code: index.relation(each.subject) ? 'invalid-command' : 'unknown-relation',
      message: each.message,
      subject: each.subject,
      part: 'pulse',
    });
  }
  problems.push(...stateProblems(project, viewState));
  if (step.play) {
    const { scenario, from, to, choices } = step.play;
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
    // What it plays from and to lies on the timeline its choices give (ADR 0078).
    problems.push(...choicesProblems(project, scenario, choices, [from, to]));
  }
  problems.push(...tourExplorableProblems(project, step));
  // The view state beside it is checked as its own is, and said to be beside it (ADR 0102).
  for (const each of viewStateProblems(project, step.beside)) {
    problems.push({ ...each, message: `${BESIDE}${each.message}`, part: 'beside' });
  }
  return problems;
}

/**
 * What a view state a step shows names that the project does not hold now, as a step's own view
 * state is checked: none for none.
 */
function viewStateProblems(
  project: ProjectSnapshot,
  viewState: SavedViewState | undefined,
): TourStepProblem[] {
  if (viewState === undefined) return [];
  return [...shownProblems(project, viewState).problems, ...stateProblems(project, viewState)];
}

/** What a view state names first: its view, and what it selects, of the model or of that view. */
function shownProblems(
  project: ProjectSnapshot,
  viewState: SavedViewState,
): { problems: TourStepProblem[]; view: ViewFile | undefined; inModel: (id: Id) => boolean } {
  const problems: TourStepProblem[] = [];
  const view = project.views.find((each) => each.id === viewState.view);
  if (view === undefined) {
    problems.push({
      code: 'unknown-view',
      message: `The project has no view "${viewState.view}".`,
      subject: viewState.view,
    });
  }
  const inModel = modelHolds(project);
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
  return { problems, view, inModel };
}

/** Whether the model holds an element or a relation with this id, the World aside. */
function modelHolds(project: ProjectSnapshot): (id: Id) => boolean {
  const index = modelIndexOf(project);
  const world = project.model.world.id;
  return (id) =>
    id !== world && (index.element(id) !== undefined || index.relation(id) !== undefined);
}

/**
 * What the rest of a view state names that the project does not hold: what focus starts from, the
 * physical-space panel's root, the components and relation types its filters name, and the scenario
 * open, with its step and its choices.
 */
function stateProblems(project: ProjectSnapshot, viewState: SavedViewState): TourStepProblem[] {
  const problems: TourStepProblem[] = [];
  const index = modelIndexOf(project);
  const inModel = modelHolds(project);
  for (const id of viewState.focus?.from ?? []) {
    if (!inModel(id)) {
      problems.push({
        code: 'unknown-element',
        message: `Focus starts from elements and relations, and "${id}" is neither.`,
        subject: id,
      });
    }
  }
  const root = viewState.space?.root;
  if (root !== undefined && index.element(root) === undefined) {
    problems.push({ code: 'unknown-element', message: spaceRootProblem(root), subject: root });
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
    // A view state's step meets its choices only when it has some: without, going to the step
    // chooses what reaches it, as an address does.
    problems.push(
      ...choicesProblems(
        project,
        viewState.scenario,
        viewState.choices,
        viewState.choices ? [viewState.step] : [],
      ),
    );
  }
  return problems;
}

/**
 * What a step's choices name that its scenario does not have, and the steps named that those choices,
 * every other decision playing its default, do not play (ADR 0078).
 */
function choicesProblems(
  project: ProjectSnapshot,
  scenarioId: Id,
  choices: DecisionChoices | undefined,
  steps: readonly (Id | undefined)[],
): TourStepProblem[] {
  const scenario = project.scenarios.find((each) => each.id === scenarioId);
  if (scenario === undefined) return [];
  const problems: TourStepProblem[] = choiceProblems(scenario, choices ?? {}).map(
    ({ message, subject }) => ({ code: 'unknown-scenario', message, subject }),
  );
  const played = steps.some((id) => id !== undefined)
    ? new Set(playedSteps(scenario, knownChoices(scenario, choices)))
    : undefined;
  for (const id of new Set(steps)) {
    const at = id === undefined ? -1 : scenario.steps.findIndex((each) => each.id === id);
    if (id !== undefined && at >= 0 && !played?.has(at)) {
      problems.push({
        code: 'invalid-command',
        message: `With the alternatives it chooses, the scenario "${scenario.name}" does not play the step "${id}".`,
        subject: id,
      });
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

/** Every id a step marks, its own marks and its reveals', in order. */
export function marksOf(step: Pick<TourStep, 'marks' | 'reveal'>): Id[] {
  return [...(step.marks ?? []), ...(step.reveal ?? []).flatMap((reveal) => reveal.marks)];
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
  /**
   * What it brings in one press forward at a time, each without what the project no longer holds; a
   * reveal left with nothing to mark stays, so that the presses and the texts stay as written.
   */
  reveals?: { marks: Id[]; text?: string }[];
  /** Whether it dims everything it does not mark. */
  dimRest?: true;
  /** When it moves on by itself, never before its text is read (`advanceAfter`). */
  advance?: number | 'after-scenario';
  /**
   * The scenario it plays, by the indices of the steps it plays from and to, both included, and the
   * alternatives it plays at the scenario's decisions, when it chooses some (ADR 0078).
   */
  play?: { scenario: Id; from: number; to: number; choices?: DecisionChoices };
  /** Present when the step always cuts (ADR 0084). */
  transition?: 'cut';
  /**
   * The view state shown beside the step, in the pane right of the tour's (ADR 0102), without what
   * the project no longer holds; absent when the step shows none, or when its view is gone.
   */
  beside?: ViewState;
  /**
   * Present when the step and its reveals draw what they mark in its own style rather than with a
   * halo (ADR 0100): the step's emphasis, or else its tour's.
   */
  emphasis?: 'style';
  /**
   * The mark its caption points at, while it is one of the step's marks and the project holds it,
   * and the reveal that brings it in, counted from 1, or 0 for the step's own marks (ADR 0084).
   */
  pointTo?: { id: Id; reveal: number };
  /**
   * The chain its pulse runs along, each relation the way the marker runs it, and how many times;
   * only while the chain still joins and the view draws every relation of it (ADR 0084).
   */
  pulse?: { legs: PulseLeg[]; repeat: number };
  /**
   * The explorable it shows live in the explorable panel, with every parameter's value: those the
   * step sets that its explorable still declares and takes, and the defaults for the rest (ADR 0107).
   * Absent when it shows none, or when no package in use defines it.
   */
  explorable?: { id: Id; parameters: Record<string, ExplorableParameterValue> };
}

/**
 * How a step plays now: its view state and marks without what the project no longer holds, and its
 * scenario only while it still plays over the step's view. `undefined` when its view is gone, since
 * there is then nothing to show it over.
 */
export function playableStep(
  project: ProjectSnapshot,
  step: TourStep,
  tourEmphasis?: TourEmphasis,
): PlayableStep | undefined {
  const problems = tourStepProblems(project, step);
  const missingOf = (beside: boolean) =>
    new Set(
      problems
        .filter(
          (each) =>
            (each.part === 'beside') === beside &&
            each.code !== 'unknown-scenario' &&
            each.code !== 'invalid-command',
        )
        .map((each) => each.subject),
    );
  const missing = missingOf(false);
  const state = playableViewState(project, step.viewState, missing);
  if (state === undefined) return undefined;
  const kept = (ids: readonly Id[] | undefined) => (ids ?? []).filter((id) => !missing.has(id));
  const playable: PlayableStep = { viewState: state, marks: kept(step.marks) };
  if (step.reveal) {
    playable.reveals = step.reveal.map((reveal) => ({
      marks: kept(reveal.marks),
      ...(reveal.text === undefined ? {} : { text: reveal.text }),
    }));
  }
  if (step.dimRest) playable.dimRest = true;
  if (step.transition === 'cut') playable.transition = 'cut';
  // The view beside it, while the project holds that view (ADR 0102).
  const beside = step.beside && playableViewState(project, step.beside, missingOf(true));
  if (beside) playable.beside = beside;
  if ((step.emphasis ?? tourEmphasis) === 'style') playable.emphasis = 'style';
  const pointTo = step.caption.pointTo;
  if (pointTo !== undefined && !missing.has(pointTo)) {
    const reveal = (step.marks ?? []).includes(pointTo)
      ? 0
      : (step.reveal ?? []).findIndex((each) => each.marks.includes(pointTo)) + 1;
    if (reveal > 0 || (step.marks ?? []).includes(pointTo)) {
      playable.pointTo = { id: pointTo, reveal };
    }
  }
  if (step.pulse && pulseProblems(project, step).length === 0) {
    const index = modelIndexOf(project);
    const links = step.pulse.relations.map((id): ChainLink => {
      const relation = index.relation(id);
      return { id, from: relation?.from ?? '', to: relation?.to ?? '' };
    });
    if (chainBreak(links) < 0) {
      playable.pulse = { legs: pulseLegs(links), repeat: step.pulse.repeat ?? 1 };
    }
  }
  const advance = advanceAfter(step);
  if (advance !== undefined) playable.advance = advance;
  const played = step.play && playedOver(project, state.view, step.play.scenario);
  if (step.play && played && played.steps.length > 0) {
    playable.play = playedRangeOf(played, step.play);
  }
  // Its explorable while a package defines it, with the values it sets that still fit (ADR 0107).
  const shown = step.explorable && explorablesIn(project).explorable(step.explorable.id);
  if (step.explorable && shown) {
    const given = Object.fromEntries(
      Object.entries(step.explorable.parameters ?? {}).filter(
        (entry): entry is [string, ExplorableParameterValue] =>
          typeof entry[1] === 'number' ||
          typeof entry[1] === 'boolean' ||
          typeof entry[1] === 'string',
      ),
    );
    playable.explorable = {
      id: step.explorable.id,
      parameters: parameterValues(shown.definition.parameters ?? [], given),
    };
  }
  return playable;
}

/**
 * What a step's explorable names that the project no longer holds, or sets that no longer fits
 * (ADR 0107): an explorable no package in use defines, a parameter it no longer declares, a value
 * its parameter does not take. Such a step is a broken step: kept, and played without them.
 */
export function tourExplorableProblems(
  project: ProjectSnapshot,
  step: Pick<TourStep, 'explorable'>,
): TourStepProblem[] {
  const shown = step.explorable;
  if (shown === undefined) return [];
  const defined = explorablesIn(project).explorable(shown.id);
  if (!defined) {
    return [
      {
        code: 'unknown-explorable',
        message: `The step shows the explorable "${shown.id}", which no package in use defines.`,
        subject: shown.id,
        part: 'explorable',
      },
    ];
  }
  const problems: TourStepProblem[] = [];
  const declared = new Map((defined.definition.parameters ?? []).map((each) => [each.name, each]));
  for (const [name, value] of Object.entries(shown.parameters ?? {})) {
    const parameter = declared.get(name);
    const problem = parameter
      ? explorableParameterProblem(parameter, value)
      : `The explorable "${defined.definition.name}" declares no parameter "${name}".`;
    if (problem === undefined) continue;
    problems.push({
      code: parameter ? 'invalid-parameter' : 'unknown-parameter',
      message: parameter
        ? `The step sets "${name}" to ${JSON.stringify(value)}, but ${problem}`
        : problem,
      subject: shown.id,
      part: 'explorable',
    });
  }
  return problems;
}

/**
 * A view state a step shows, as it plays now: without what the project no longer holds, `missing`,
 * and with its scenario only while it still plays over its view. `undefined` when its view is gone.
 */
function playableViewState(
  project: ProjectSnapshot,
  saved: SavedViewState,
  missing: ReadonlySet<Id>,
): ViewState | undefined {
  const view = project.views.find((each) => each.id === saved.view);
  if (view === undefined) return undefined;
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
    delete state.choices;
  } else {
    if (state.step !== undefined && !opened.steps.some((each) => each.id === state.step)) {
      delete state.step;
    }
    // Choices of decisions or alternatives the scenario no longer has are dropped.
    const choices = knownChoices(opened, state.choices);
    if (choices) state.choices = choices;
    else delete state.choices;
  }
  return state;
}

/**
 * The range a step plays of a scenario, by the indices of its steps, and the choices it plays them
 * with: those the scenario still has, and, for a step named that they do not play, those that reach
 * it, as going to it does; a step named that is gone gives the first or the last step that plays.
 */
export function playedRangeOf(
  scenario: ScenarioFile,
  play: NonNullable<TourStep['play']>,
): NonNullable<PlayableStep['play']> {
  const index = (id: Id | undefined) =>
    id === undefined ? -1 : scenario.steps.findIndex((each) => each.id === id);
  let choices = knownChoices(scenario, play.choices);
  // The step it starts on is reached last, so that it plays when the two cannot play together.
  for (const id of [play.to, play.from]) {
    const at = index(id);
    if (id !== undefined && at >= 0 && !playedSteps(scenario, choices).includes(at)) {
      choices = choicesToReach(scenario, id, choices) ?? choices;
    }
  }
  const order = playedSteps(scenario, choices);
  const at = (id: Id | undefined, fallback: number) => {
    const found = index(id);
    return found < 0 ? fallback : found;
  };
  const from = at(play.from, order[0] ?? 0);
  const to = at(play.to, order.at(-1) ?? scenario.steps.length - 1);
  return {
    scenario: scenario.id,
    from: Math.min(from, to),
    to: Math.max(from, to),
    ...(choices && Object.keys(choices).length > 0 ? { choices } : {}),
  };
}

/** The scenario with this id when it plays over the view. */
function playedOver(project: ProjectSnapshot, view: Id, scenario: Id) {
  const found = project.scenarios.find((each) => each.id === scenario);
  return found?.view === view ? found : undefined;
}

// ——— Ids the tours name ———

const named = new WeakMap<readonly TourFile[], ReadonlySet<Id>>();

/**
 * The ids the steps of the tours name as what they select, mark, reveal, point at, pulse along or
 * focus from, beside them too, and the tours' own ids.
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
        for (const reveal of step.reveal ?? []) for (const id of reveal.marks) set.add(id);
        if (step.caption.pointTo !== undefined) set.add(step.caption.pointTo);
        for (const id of step.pulse?.relations ?? []) set.add(id);
        for (const id of step.viewState.focus?.from ?? []) set.add(id);
        for (const id of step.beside?.select ?? []) set.add(id);
        for (const id of step.beside?.focus?.from ?? []) set.add(id);
        // So that no new explorable takes the id of one a broken step still names (ADR 0107).
        if (step.explorable !== undefined) set.add(step.explorable.id);
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

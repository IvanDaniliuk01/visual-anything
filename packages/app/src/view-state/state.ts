/**
 * The view state (core's `ViewState`) as the app holds it: the open view, the camera, the selection,
 * the explorer's filters with their time range and focus (ADR-0025, ADR 0044's clarification of
 * W44), the scenario session's scenario, step and choices (ADR-0031, ADR 0078), and the
 * physical-space panel while it is open, with what it shows and where it looks (ADR 0076). These functions
 * turn the one into the other, both ways, without touching anything.
 */
import {
  MAX_CAMERA_DISTANCE,
  MAX_CAMERA_ZOOM,
  MAX_FILTER_CONDITIONS,
  MAX_FILTER_TEXT,
  MAX_GUIDANCE_TARGETS,
  MAX_VIEW_STATE_IDS,
  MIN_CAMERA_ZOOM,
  checkViewState,
  knownChoices,
  modelIndexOf,
  type ProjectSnapshot,
  type ViewCamera,
  type ViewFilters,
  type ViewFocus,
  type ViewSimulation,
  type ViewState,
  type ViewSpace,
  type ViewTimeRange,
} from '@visual-anything/core';
import type { DecisionChoices, Id, ViewFile } from '@visual-anything/schema';
import { MAX_SCALE, MIN_SCALE, screenToWorld, type Camera } from '../canvas/camera';
import {
  ALL_DEGREES,
  isComplete,
  type Filters,
  type FocusSettings,
  type FocusTargets,
  type TimeRange,
} from '../canvas/explore';
import type { Size } from '../canvas/geometry';
import type { FocusState } from '../canvas/useExplorer';
import type { Selection } from '../editor/selection';

/** Where the canvas looks, as an address keeps it: rounded so that the address stays short. */
export function cameraOf(camera: Camera, viewport: Size): ViewCamera | undefined {
  if (viewport.width <= 0 || viewport.height <= 0) return undefined;
  const middle = screenToWorld(camera, { x: viewport.width / 2, y: viewport.height / 2 });
  const place = (value: number) =>
    zeroed(Math.round(clamp(value, -MAX_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE) * 10) / 10);
  return {
    x: place(middle.x),
    y: place(middle.y),
    zoom: Number(clamp(camera.scale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM).toPrecision(4)),
  };
}

/** The camera that shows what an address's camera keeps, in a canvas of this size. */
export function cameraFor(camera: ViewCamera, viewport: Size): Camera {
  const scale = clamp(camera.zoom, MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: viewport.width / 2 - camera.x * scale,
    y: viewport.height / 2 - camera.y * scale,
  };
}

/** What the view state is made from: the shell's state, as it is now. */
export interface AppViewState {
  project: ProjectSnapshot;
  viewId: Id;
  /** Where the canvas looks; absent before it has drawn. */
  camera?: ViewCamera | undefined;
  selection: Selection;
  filters: Filters;
  focus: FocusState;
  /**
   * The scenario open in the scenario panel, the index of the step it is on, and the alternatives the
   * tab chose at its decisions (ADR 0078).
   */
  scenario?: { id: Id; step: number; choices?: DecisionChoices } | undefined;
  /** The view's physical-space panel while it is open (ADR 0076); absent while it is closed. */
  space?: ViewSpace | undefined;
  /** The simulation shown, at its tick shown (ADR 0085); absent while none is open. */
  simulation?: ViewSimulation | undefined;
}

/**
 * The view state of the shell, as an address holds it, and whether the selection was left out, being
 * larger than an address holds. Filters keep only the conditions that apply.
 */
export function viewStateOf(input: AppViewState): { state: ViewState; selectionLeftOut: boolean } {
  const { project, viewId, camera, selection, filters, focus, scenario, space, simulation } = input;
  const selected = [...selection.elements, ...selection.relations, ...selection.freeShapes];
  const selectionLeftOut = selected.length > MAX_VIEW_STATE_IDS;
  const state: ViewState = { view: viewId };
  if (camera) state.camera = camera;
  if (selected.length > 0 && !selectionLeftOut) state.select = selected;
  const kept = filtersOf(filters);
  if (kept) state.filters = kept;
  if (focus.on) state.focus = focusOf(focus, selection);
  const played = scenario && project.scenarios.find((each) => each.id === scenario.id);
  if (played && played.view === viewId) {
    state.scenario = played.id;
    const step = played.steps[scenario.step];
    if (scenario.step > 0 && step) state.step = step.id;
    // Written only when the tab chose some, so that the address opens the step in its alternative.
    const choices = knownChoices(played, scenario.choices);
    if (choices) state.choices = choices;
  }
  if (space) state.space = space;
  if (simulation) state.simulation = simulation;
  // Whatever the core would refuse is left out rather than written, part by part.
  const checked = checkViewState(state);
  if (checked.ok) return { state: checked.state, selectionLeftOut };
  // Else the camera, the panel and the simulation, each kept when the core takes it.
  const plain: ViewState = { view: viewId };
  for (const part of [
    camera ? { camera } : {},
    space ? { space } : {},
    simulation ? { simulation } : {},
  ]) {
    const tried = checkViewState({ ...plain, ...part });
    if (tried.ok) Object.assign(plain, tried.state);
  }
  return { state: plain, selectionLeftOut };
}

/** The filters that hide something, as lists, with their time range; none when they hide nothing. */
function filtersOf(filters: Filters): ViewFilters | undefined {
  const conditions = filters.conditions
    .filter(isComplete)
    .filter(
      (each) => each.attribute.length <= MAX_FILTER_TEXT && each.value.length <= MAX_FILTER_TEXT,
    )
    .slice(0, MAX_FILTER_CONDITIONS)
    .map(({ of, attribute, test, value }) => ({
      of,
      attribute,
      test,
      value: test === 'set' || test === 'unset' ? '' : value,
    }));
  const components = [...filters.components].slice(0, MAX_GUIDANCE_TARGETS);
  const relationTypes = [...filters.relationTypes].slice(0, MAX_GUIDANCE_TARGETS);
  const range = rangeOf(filters.range);
  if (components.length + relationTypes.length + conditions.length === 0 && !range) {
    return undefined;
  }
  return { components, relationTypes, conditions, ...(range ? { range } : {}) };
}

/** The time range as an address holds it; none when there is none, or an address cannot hold it. */
function rangeOf(range: TimeRange | undefined): ViewTimeRange | undefined {
  if (range === undefined) return undefined;
  const { of, attribute, until, kind, from, to } = range;
  const names = until === undefined ? [attribute] : [attribute, until];
  if (names.some((name) => name.trim() === '' || name.length > MAX_FILTER_TEXT)) return undefined;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  return { of, attribute, ...(until === undefined ? {} : { until }), kind, from, to };
}

/** Focus as an address holds it: without what it starts from when that is the selection. */
function focusOf(focus: FocusState, selection: Selection): ViewFocus {
  const degrees =
    focus.degrees === ALL_DEGREES
      ? ('all' as const)
      : Math.min(5, Math.max(1, Math.round(focus.degrees)));
  const settings = { degrees, direction: focus.direction, isolate: focus.isolate };
  const { elements, relations } = focus.targets;
  const fromSelection =
    sameSet(elements, selection.elements) && sameSet(relations, selection.relations);
  const from = [...elements, ...relations].slice(0, MAX_VIEW_STATE_IDS);
  return fromSelection || from.length === 0 ? settings : { ...settings, from };
}

/**
 * The selection an address names in a view: its elements, relations and free shapes, and the ids it
 * names that the project, or the view, does not hold.
 */
export function selectionFrom(
  project: ProjectSnapshot,
  view: ViewFile | undefined,
  ids: readonly Id[],
): { selection: Selection; missing: Id[] } {
  const index = modelIndexOf(project);
  const freeShapes = new Set(view?.freeShapes.map((shape) => shape.id));
  const elements = new Set<Id>();
  const relations = new Set<Id>();
  const free = new Set<Id>();
  const missing: Id[] = [];
  for (const id of ids) {
    if (index.element(id) !== undefined && id !== project.model.world.id) elements.add(id);
    else if (index.relation(id) !== undefined) relations.add(id);
    else if (freeShapes.has(id)) free.add(id);
    else missing.push(id);
  }
  return { selection: { elements, relations, freeShapes: free }, missing };
}

/** Where focus from an address starts, and how far it reaches, as the explorer holds them. */
export function focusFrom(
  project: ProjectSnapshot,
  focus: ViewFocus,
  selection: Selection,
): { targets: FocusTargets; settings: FocusSettings } {
  const settings: FocusSettings = {
    degrees: focus.degrees === 'all' ? ALL_DEGREES : focus.degrees,
    direction: focus.direction,
    isolate: focus.isolate,
  };
  if (focus.from === undefined) {
    return { targets: { elements: selection.elements, relations: selection.relations }, settings };
  }
  const index = modelIndexOf(project);
  return {
    targets: {
      elements: new Set(focus.from.filter((id) => index.element(id) !== undefined)),
      relations: new Set(focus.from.filter((id) => index.relation(id) !== undefined)),
    },
    settings,
  };
}

function sameSet(a: ReadonlySet<Id>, b: ReadonlySet<Id>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function zeroed(value: number): number {
  return value === 0 ? 0 : value;
}

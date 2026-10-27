/**
 * Going to a view state, step by step, as the shell's state allows: an address's view opens first;
 * once it is open and drawn, the selection and the filters apply; once the explorer has seen that
 * selection, which focus would otherwise follow, focus and the scenario apply; and the camera moves
 * once the canvas has drawn, to the address's camera or else to the first thing selected. A search
 * result goes the same way, keeping the filters, focus and scenario as they are, and comes into sight
 * with a glide unless the system asks for reduced motion.
 *
 * It lives outside React's state, like the scenario session: the shell tells it how things are after
 * each render that matters (`sync`), and it does the next step it can.
 */
import { viewStateProblems, type ProjectSnapshot, type ViewState } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { fitCamera, type Camera } from '../canvas/camera';
import { NO_FILTERS } from '../canvas/explore';
import type { Rect, Size } from '../canvas/geometry';
import { relationLinesOf, shownBy, type Scene } from '../canvas/scene';
import type { Explore } from '../canvas/useExplorer';
import type { EmphasisStore } from '../editor/emphasis';
import { selectionOf, type Selectable, type Selection } from '../editor/selection';
import { filtersOf } from '../guidance/explore';
import type { NoticeLevel } from '../live/connection';
import { FOLLOW_MARGIN } from '../scenarios/follow';
import type { ScenarioSession } from '../scenarios/session';
import type { CanvasCamera, GlideOptions } from './canvas';
import { cameraFor, focusFrom, selectionFrom } from './state';

/** Where something found was brought into sight, for saying so. */
export interface Shown {
  /** The key of what the canvas shows for it, if it shows anything there. */
  key: string | undefined;
  /** Whether the filters or focus mode hide what shows it. */
  hidden: boolean;
  /** The name of the collapsed container that shows it, when only that shows. */
  holder?: string;
}

/** Where to go: an address's view state, or something found, in a view that draws it. */
export type GoTo =
  | { kind: 'address'; state: ViewState; travel?: Travel }
  | { kind: 'jump'; view: Id; target: Selectable; shown?: (shown: Shown) => void };

/**
 * How a tour's step moves the camera to its view state (ADR 0058, ADR 0077), in place of an
 * address's jump: with neither a camera nor a selection, it shows the whole view; and `move` says how
 * to get there, once the canvas has drawn it, from where the camera is: over some milliseconds, along
 * a path and after a delay when it gives them, or at once with 0. `sameView` says whether the step
 * stays in the view open when it started.
 */
export interface Travel {
  move(from: Camera | undefined, to: Camera, viewport: Size, sameView: boolean): TravelGlide;
  /**
   * What a step without a camera frames, in the scene of its view, in place of its selection or the
   * whole view: everything the scenario it plays plays over its range (ADR 0077). Nothing to frame
   * leaves it to the selection or the whole view.
   */
  frame?(scene: Scene): Rect | undefined;
}

/** How long a tour's step's camera takes to get there, and how. */
export type TravelGlide = { duration: number } & GlideOptions;

/**
 * What the view state reads and asks of scenario playback: the app's scenario session, or the
 * read-only page's playback, which has no recording (ADR 0041).
 */
export type PlaybackControl = Pick<ScenarioSession, 'subscribe' | 'getState' | 'close' | 'guide'>;

/** The shell as it is now, and what the applier may do to it. */
export interface ApplyContext {
  project: ProjectSnapshot;
  viewId: Id | undefined;
  scene: Scene | undefined;
  selection: Selection;
  select: (selection: Selection) => void;
  explore: Explore;
  openView: (view: Id) => void;
  /** Brings a shape into sight the way the outline does, when there is no canvas to glide. */
  reveal: (key: string) => void;
  scenarios: PlaybackControl;
  emphasis: EmphasisStore;
  /** The canvas's camera, once the canvas is made. */
  canvas: CanvasCamera | undefined;
  /** Whether the system asks for reduced motion: then nothing glides. */
  reduced: boolean;
  /** Says something in a notice; absent outside a live session. */
  notify?: ((level: NoticeLevel, message: string) => void) | undefined;
}

/** The templates of what the applier says, which the notices translate (ADR-0038). */
export const UNREADABLE = 'This address’s view state could not be read: {why}';
export const NOT_SHOWN = 'Part of this address could not be shown: {why}';

/** A request on its way, and how far it has come. */
interface Pending {
  request: GoTo;
  stage: 'select' | 'explore';
  /** Whether its view was asked to open. */
  opened: boolean;
  /** The view open when it started. */
  from: Id | undefined;
}

/** A camera, or a shape to bring into sight, waiting for the canvas to have drawn. */
interface Waiting {
  view: Id;
  camera?: ViewState['camera'];
  key?: string;
  /** For a tour's step without a camera or a selection: the whole view shows. */
  whole?: boolean;
  /** For a tour's step without a camera that frames what its scenario plays: all of this shows. */
  rect?: Rect;
  glide: boolean;
  shown?: () => void;
  /** How a tour's step moves there, and whether it stays in the view open when it started. */
  travel?: { travel: Travel; sameView: boolean };
}

export class ViewStateApplier {
  #pending: Pending | undefined;
  #waiting: Waiting | undefined;

  /** `busy` is told when a request starts and when its last step that changes state is done. */
  constructor(private readonly busy: (busy: boolean) => void = () => {}) {}

  /** Whether a request is on its way. */
  get applying(): boolean {
    return this.#pending !== undefined;
  }

  /** Starts going somewhere, from where things are now; whatever was on its way is dropped. */
  goTo(request: GoTo, context: ApplyContext): void {
    this.#waiting = undefined;
    this.#pending = { request, stage: 'select', opened: false, from: context.viewId };
    this.busy(true);
    this.sync(context);
  }

  /** Does the next step it can, now that the shell is as `context` says. */
  sync(context: ApplyContext): void {
    this.#step(context);
    this.#show(context);
  }

  #finish(): void {
    this.#pending = undefined;
    this.busy(false);
  }

  #step(context: ApplyContext): void {
    const pending = this.#pending;
    if (!pending) return;
    const { project, viewId, scene } = context;
    const { request } = pending;
    const goal = request.kind === 'address' ? request.state.view : request.view;
    const view = project.views.find((each) => each.id === goal);
    if (!view) {
      if (request.kind === 'address') {
        context.notify?.('warning', fill(NOT_SHOWN, `The project has no view "${goal}".`));
      }
      this.#finish();
      return;
    }
    if (viewId !== goal) {
      if (!pending.opened) {
        pending.opened = true;
        context.openView(goal);
      }
      return;
    }
    if (!scene) return;

    if (request.kind === 'jump') {
      this.#finish();
      context.select(selectionOf([request.target]));
      const where = whereShown(scene, request.target);
      const shown = () =>
        request.shown?.({
          key: where.key,
          hidden:
            where.key !== undefined && (context.emphasis.get().hidden?.has(where.key) ?? false),
          ...(where.holder === undefined ? {} : { holder: where.holder }),
        });
      if (where.key === undefined) shown();
      else this.#waiting = { view: goal, key: where.key, glide: !context.reduced, shown };
      return;
    }

    const { state } = request;
    if (pending.stage === 'select') {
      // Focus waits for the explorer to have seen this selection, which it would follow.
      pending.stage = 'explore';
      context.select(selectionFrom(project, view, state.select ?? []).selection);
      context.explore.setFilters(state.filters ? filtersOf(state.filters) : NO_FILTERS);
      const problems = viewStateProblems(project, state);
      if (problems.length > 0) context.notify?.('warning', fill(NOT_SHOWN, problems.join(' ')));
      return;
    }
    this.#finish();
    if (state.focus) {
      const { targets, settings } = focusFrom(project, state.focus, context.selection);
      context.explore.focusOn(targets, settings);
    } else if (context.explore.focus.on) {
      context.explore.setFocus({ on: false });
    }
    playScenario(context.scenarios, project, state);
    const [first] = state.select ?? [];
    const key =
      first === undefined
        ? undefined
        : whereShown(scene, selectableIn(context.selection, first)).key;
    const travel = request.travel && {
      travel: request.travel,
      sameView: pending.from === goal,
    };
    const moved = travel ? { travel } : {};
    const framed = state.camera || !travel ? undefined : travel.travel.frame?.(scene);
    if (state.camera) this.#waiting = { view: goal, camera: state.camera, glide: false, ...moved };
    else if (framed && travel) this.#waiting = { view: goal, rect: framed, glide: false, travel };
    else if (key !== undefined) this.#waiting = { view: goal, key, glide: false, ...moved };
    else if (travel) this.#waiting = { view: goal, whole: true, glide: false, travel };
  }

  /** Moves the camera as asked, once the canvas has drawn the view it was asked for. */
  #show(context: ApplyContext): void {
    const asked = this.#waiting;
    if (!asked) return;
    if (asked.view !== context.viewId) {
      // The person went to another view meanwhile: the move is for a view no longer open.
      this.#waiting = undefined;
      return;
    }
    const { canvas } = context;
    const drawn = canvas !== undefined && canvas.camera() !== undefined;
    // Without a canvas, as in tests, a shape is still brought into sight the outline's way.
    if (!drawn && (canvas !== undefined || asked.camera !== undefined)) return;
    this.#waiting = undefined;
    if (asked.travel && canvas) {
      // A tour's step: where it goes, then how it gets there, eased or at once (ADR 0058).
      const viewport = canvas.viewport();
      const to =
        asked.camera !== undefined
          ? cameraFor(asked.camera, viewport)
          : asked.rect !== undefined
            ? fitCamera(asked.rect, viewport, FOLLOW_MARGIN)
            : canvas.targetOf(asked.key !== undefined ? { key: asked.key } : { whole: true });
      const { duration, ...glide } = asked.travel.travel.move(
        canvas.camera(),
        to,
        viewport,
        asked.travel.sameView,
      );
      canvas.glideTo(to, duration, glide);
    } else if (asked.camera !== undefined && canvas) {
      canvas.setCamera(cameraFor(asked.camera, canvas.viewport()));
    } else if (asked.key !== undefined) {
      if (canvas) canvas.reveal(asked.key, asked.glide);
      else context.reveal(asked.key);
    }
    asked.shown?.();
  }
}

/** Opens the address's scenario at its step, or closes the one open when the address has none. */
function playScenario(
  scenarios: PlaybackControl,
  project: ProjectSnapshot,
  state: ViewState,
): void {
  const scenario = project.scenarios.find((each) => each.id === state.scenario);
  if (!scenario || scenario.view !== state.view) {
    if (scenarios.getState().scenario !== undefined) scenarios.close();
    return;
  }
  const step =
    state.step === undefined ? -1 : scenario.steps.findIndex((each) => each.id === state.step);
  // Quietly: the address places the camera itself, so playback does not bring the step into view.
  scenarios.guide(
    step > 0
      ? { scenario: scenario.id, action: 'go-to-step', step }
      : { scenario: scenario.id, action: 'open' },
    { quiet: true },
  );
}

/** What an id of the selection is, so that it can be shown. */
function selectableIn(selection: Selection, id: Id): Selectable {
  if (selection.elements.has(id)) return { kind: 'element', id };
  if (selection.relations.has(id)) return { kind: 'relation', id };
  return { kind: 'free-shape', id };
}

/** The key the canvas shows something with, and the collapsed container that shows it instead. */
export function whereShown(scene: Scene, target: Selectable): { key?: string; holder?: string } {
  switch (target.kind) {
    case 'element': {
      const shape = shownBy(scene, target.id);
      if (!shape) return {};
      return shape.element === target.id
        ? { key: shape.key }
        : { key: shape.key, holder: shape.name };
    }
    case 'relation': {
      const line = relationLinesOf(scene).get(target.id);
      return line ? { key: line.relation } : {};
    }
    case 'free-shape':
      return scene.notes.some((note) => note.id === target.id) ||
        scene.arrows.some((arrow) => arrow.id === target.id)
        ? { key: target.id }
        : {};
  }
}

/** A template with its reason filled in, as the notices translate it. */
export function fill(template: string, why: string): string {
  return template.replace('{why}', why);
}

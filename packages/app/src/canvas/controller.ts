/**
 * The canvas's gestures: pointing selects, dragging moves or selects with a box, the handle beside a
 * shape relates it to another, the wheel pans and zooms, and keys delete, select all and zoom. From
 * the keyboard, the arrow keys go from shape to shape, ] and [ step through an element's relations,
 * Enter follows a relation or edits a name, and Shift with an arrow key moves the selection; what the
 * keys select is announced to screen readers. The controller only turns gestures into selections and
 * commands; the local program applies commands and the canvas redraws what comes back.
 *
 * Dragging shapes onto a container puts them inside it, and dragging them clear of theirs takes them
 * out: while they are dragged, the canvas outlines where they would go and a caption beside the
 * pointer says it; Alt only moves. A secondary press, Shift+F10 or the menu key opens a shape's menu.
 *
 * The toggle in a container's corner collapses or expands it, and so do Alt with − and Alt with + for
 * the selected containers. Pointing goes past what the emphasis hides, as the canvas does not draw it.
 * An aggregated relation stands for the relations it aggregates: pointing at it selects them all.
 */
import {
  previewChangeContainer,
  type ChangeContainerCommand,
  type Command,
  type ContainerChangePreview,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import {
  EMPTY_SELECTION,
  isEmpty,
  isSelected,
  selectionOf,
  sizeOf,
  toggle,
  union,
  type Selectable,
  type Selection,
} from '../editor/selection';
import type { Emphasis } from '../editor/emphasis';
import { IS_APPLE } from '../live/platform';
import { describeRelation, describeSelection, nameOfEnd } from './announce';
import {
  panBy,
  revealCamera,
  screenToWorld,
  wheelFactor,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera';
import {
  REST_TO_ARM,
  REST_TOLERANCE,
  confirmLabelOf,
  dropAimAt,
  dropCaption,
  dropCommand,
  dropOverlay,
  landingCover,
  needsConfirmation,
  planDrop,
  type DropAim,
  type DropCaption,
  type DropPlan,
} from './drop';
import { collapseActions, type CollapseAction } from './collapse';
import { boundsOf, centerOf, distance, toggleRect, type Point, type Rect } from './geometry';
import { carriedKeys, moveCommand, movingShapes } from './gestures';
import { enclosedBy, hitAt, shapesAt, withoutShapes, type Hit, type IndexedScene } from './hit';
import {
  containerOf,
  drawnRelations,
  farEnd,
  firstInside,
  nearestInDirection,
  nearestTo,
  rectOf,
  stepRelation,
  type Direction,
  type Reachable,
  type RelationStop,
  type Start,
} from './navigation';
import { CanvasRenderer, type Overlay } from './renderer';
import { RouteEditor } from './routing/editor';
import { relationLinesOf, type ElementShape, type NoteShape } from './scene';
import { rectAround, rectBetween } from './spatial';

/** What the canvas asks of the rest of the app. */
export interface ControllerCallbacks {
  select(selection: Selection): void;
  /** Sends a command; resolves to whether the local program applied it. */
  command(command: Command): Promise<boolean>;
  /** Asks which relation type relates `from` to `to`; `at` is on screen, relative to the canvas. */
  relate(from: Id, to: Id, at: Point): void;
  /** Asks to delete the selection, after a preview of what cascades. */
  remove(): void;
  /** Asks to edit the name of an element's shape, or the text of a note, in place. */
  rename(
    target: { kind: 'element'; shape: ElementShape } | { kind: 'note'; note: NoteShape },
  ): void;
  camera(camera: Camera): void;
  failure(error: unknown): void;
  /** Says what the keys just selected, or why they selected nothing, for screen readers. */
  announce?(message: string): void;
  /**
   * Asks to confirm a drop that deletes more than the relations that placed the dropped shapes, before
   * it is sent; the answer comes back through `resolveChange`. Without it, such a drop is sent at once.
   */
  confirmChange?(change: ChangeToConfirm): void;
  /**
   * Asks to open the menu of a shape: `at` is on screen, relative to the canvas; `under` lists the
   * shapes under the pointer, topmost first, when the menu was opened with it.
   */
  menu?(at: Point, shape: ElementShape, under?: readonly ElementShape[]): void;
  /** Asks to open the menu of relations, their route's: `at` is on screen, relative to the canvas. */
  relationMenu?(at: Point, relations: readonly Id[]): void;
  /**
   * Asks to collapse or expand containers, as the toggle on a container's shape and the keys do; the
   * canvas sends I1's command and says what it did.
   */
  collapse?(action: CollapseAction, collapsed: boolean): void;
}

/**
 * Records a relation into a scenario, while the canvas records: `simultaneous` when Shift was held, so
 * that it joins the current step.
 */
export type Recorder = (relation: Id, simultaneous: boolean) => void;

/** A change of container a drop makes, which waits to be confirmed. */
export interface ChangeToConfirm {
  /** What is sent once confirmed: the change, alone or with the moves of the other dropped shapes. */
  command: Command;
  change: ChangeContainerCommand;
  /** What the change deletes, as it was when the shapes were dropped. */
  preview: ContainerChangePreview;
  /** How the history names it, which the dialog asks with a question mark. */
  label: string;
  confirmLabel: string;
}

export interface ControllerOptions {
  /** Where the caption that says what a drop would do is written, beside the pointer. */
  caption?: HTMLElement;
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; pointer: number; start: Point; camera: Camera }
  | { kind: 'press'; pointer: number; start: Point; world: Point; hit: Hit; additive: boolean }
  | DragGesture
  | { kind: 'box'; pointer: number; start: Point; additive: boolean }
  | { kind: 'connect'; pointer: number; from: ElementShape; anchor: Point; target?: Hit }
  /** A handle or a segment of a route being dragged, which the route editor follows. */
  | { kind: 'route'; pointer: number };

/**
 * Shapes being dragged: from where the press was, by how far, and the renderer's drawing of them; and
 * what releasing them would do, which changes as the pointer moves.
 */
interface DragGesture {
  kind: 'drag';
  pointer: number;
  /** Where the press was, in the scene. */
  world: Point;
  /** How far the shapes have been dragged, in scene units. */
  delta: Point;
  /** The renderer's drag, as `startDrag` named it: ending it leaves any later drag alone. */
  drag: number;
  /** What a drop into or out of a container may do; absent when the drag only moves shapes. */
  plan?: DropPlan;
  /** What releasing the shapes now would do, as last worked out. */
  aim: DropAim;
  /** Whether Alt is held, which only moves. */
  alt: boolean;
  /** The shape that would cover the grabbed one where it lands, as last checked. */
  cover: ElementShape | undefined;
  /** Where the pointer is, on screen relative to the canvas. */
  at: Point;
  /** The shape that holds nothing the pointer rested on long enough for it to take the drop. */
  armed: string | undefined;
  /** The shape that holds nothing the pointer rests on, where the rest started, and its timer. */
  rest: { leaf: string; from: Point; timer: ReturnType<typeof setTimeout> } | undefined;
  /** The frame that checks again where the grabbed shape lands, while the aim stays. */
  landingFrame: number | undefined;
}

/**
 * A move sent to the local program, until its change comes back. The live connection applies a
 * change before it answers the request that made it, but either may reach the canvas first; the move
 * is back once it is applied and the project is no longer the one it was made from. A move always
 * changes the project. A drop that waits to be confirmed is one too, sent once it is.
 */
interface SentMove {
  /** The project the move was made from. */
  from: ProjectSnapshot;
  /** Whether the local program said it did the move. */
  applied: boolean;
  /** For a drop: the drag that draws the dropped shapes until the change comes back, and where they land. */
  drop?: { drag: number; landing: () => Rect[] };
  /**
   * For a drop that asked to be confirmed, whose drag ended: where the dropped shapes land, shown
   * until its change comes back, or it is cancelled or refused.
   */
  ghost?: Rect[];
  /** What to say once the local program did it. */
  done?: string;
}

/** A drop waiting to be confirmed: what it sends, as one more move. */
interface Confirming {
  move: SentMove;
  command: Command;
}

/** A secondary press: where and when it was, and the shape it was on, whose menu it opens. */
interface SecondaryPress {
  at: Point;
  world: Point;
  time: number;
  shape?: string;
  /** The relations it was on, whose menu it opens. */
  relations?: Id[];
}

/** A press of Shift with an arrow key: the step, and what was selected when it was pressed. */
interface Nudge {
  step: Point;
  selection: Selection;
}

/** How far the pointer moves before a press becomes a drag, in screen pixels. */
const DRAG_THRESHOLD = 4;
/** How close to a line the pointer must be to point at it, in screen pixels. */
export const HIT_TOLERANCE = 6;
/** How far beside a shape its handle sits, and how close the pointer must be to grab it. */
const HANDLE_OFFSET = 14;
const HANDLE_REACH = 10;
/** The keys that step through the selected element's relations; . and , type alike on every keyboard. */
const RELATION_STEPS: Partial<Record<string, 1 | -1>> = { ']': 1, '[': -1, '.': 1, ',': -1 };
/** How much a key press zooms. */
const KEY_ZOOM = 1.25;
/** The scale a revealed shape is shown at, at least: large enough to read its name. */
const REVEAL_SCALE = 0.75;
/** How far Shift with an arrow key moves the selection, in scene units. */
const NUDGE = 10;
/** How many presses of Shift with an arrow key wait for the move before them, at most. */
const MAX_WAITING_NUDGES = 8;
/** How many rectangles show where dropped shapes land; more show as one around them all. */
const MAX_LANDING_MARKS = 100;
/** Where the drop caption sits from the pointer, in screen pixels. */
const CAPTION_OFFSET = { x: 16, y: 20 };
/** How long after Shift+F10 or the menu key a `contextmenu` event is theirs, in milliseconds. */
const MENU_KEY_WINDOW = 500;
/** How long after a secondary press a `contextmenu` event is its, in milliseconds. */
const SECONDARY_PRESS_WINDOW = 1000;

const DIRECTIONS: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const STEPS: Record<Direction, Point> = {
  left: { x: -NUDGE, y: 0 },
  right: { x: NUDGE, y: 0 },
  up: { x: 0, y: -NUDGE },
  down: { x: 0, y: NUDGE },
};

const TOWARDS: Record<Direction, string> = {
  left: 'to the left',
  right: 'to the right',
  up: 'above',
  down: 'below',
};

export class CanvasController {
  readonly renderer: CanvasRenderer;
  private indexed: IndexedScene | undefined;
  private project: ProjectSnapshot | undefined;
  private viewId: Id | undefined;
  private selection: Selection = EMPTY_SELECTION;
  private gesture: Gesture = { kind: 'idle' };
  private hovered: ElementShape | undefined;
  private spaceHeld = false;
  private editable = true;
  private destroyed = false;
  /**
   * The shape the keys move from: the key of an element's shape or the id of a free shape, last
   * pointed at or reached. An element with several shapes is selected in all of them at once.
   */
  private current: string | undefined;
  /** The element whose relations ] and [ step through, and the relation they last reached. */
  private stepping: { element: Id; relation: Id | undefined } | undefined;
  /** The moves sent, drops and nudges, in the order they were sent, until their changes come back. */
  private sent: SentMove[] = [];
  /** The last drag the renderer started; it drew over every drop made before it. */
  private lastDrag: number | undefined;
  /** The presses of Shift with an arrow key made while a move was on its way, each a move of its own. */
  private nudges: Nudge[] = [];
  /** What the gesture under way draws above the scene; where dropped shapes land is drawn with it. */
  private gestureOverlay: Overlay = {};
  /** A drop waiting to be confirmed, whose ghost shows where its shapes land. */
  private confirming: Confirming | undefined;
  /** The last secondary press, whose `contextmenu` event opens the menu where it was. */
  private secondary: SecondaryPress | undefined;
  /** When Shift+F10 or the menu key last opened the menu, so that their `contextmenu` event does not. */
  private menuKeyTime: number | undefined;
  /** Where the drop caption is written. */
  private readonly caption: HTMLElement | undefined;
  /** The emphasis drawn, which pointing and selecting everything go past what it hides. */
  private emphasis: Emphasis = {};
  /** While a scenario records: a click on a relation, or Enter on a selected one, records it. */
  private recorder: Recorder | undefined;
  /** Edits the route of the relation selected alone: its handles, gestures and keys (ADR 0039). */
  private readonly routes: RouteEditor;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: ControllerCallbacks,
    options: ControllerOptions = {},
  ) {
    this.caption = options.caption;
    this.renderer = new CanvasRenderer(host, {
      onFailure: (error) => callbacks.failure(error),
      onCamera: (camera) => callbacks.camera(camera),
    });
    this.routes = new RouteEditor({
      renderer: this.renderer,
      state: () =>
        this.indexed && this.project && this.viewId !== undefined
          ? {
              indexed: this.indexed,
              project: this.project,
              viewId: this.viewId,
              selection: this.selection,
              editable: this.editable,
            }
          : undefined,
      scale: () => this.camera.scale,
      command: (command) => callbacks.command(command),
      announce: (text) => this.announce(text),
      caption: (caption, at) => {
        this.showCaption(caption);
        if (at) this.placeCaption(at);
      },
      select: (relation) => this.select(selectionOf([{ kind: 'relation', id: relation }])),
    });
    host.addEventListener('pointerdown', this.onPointerDown);
    host.addEventListener('pointermove', this.onPointerMove);
    host.addEventListener('pointerup', this.onPointerUp);
    host.addEventListener('pointercancel', this.onPointerCancel);
    host.addEventListener('pointerleave', this.onPointerLeave);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    host.addEventListener('dblclick', this.onDoubleClick);
    host.addEventListener('contextmenu', this.onContextMenu);
    host.addEventListener('keydown', this.onKeyDown);
    host.addEventListener('keyup', this.onKeyUp);
    host.addEventListener('blur', this.onBlur);
    host.ownerDocument.defaultView?.addEventListener('blur', this.onBlur);
  }

  /** Shows a project's view; `editable` says whether gestures may change the project. */
  update(project: ProjectSnapshot, viewId: Id, indexed: IndexedScene, editable: boolean): void {
    this.project = project;
    this.viewId = viewId;
    this.indexed = indexed;
    this.editable = editable;
    // The hovered shape as it is now: where it is, and its handle, may have changed.
    this.hovered = this.hovered && indexed.byKey.get(this.hovered.key);
    // The drops whose changes this scene holds stop being drawn apart first, so that the scene is
    // drawn once, with them in it.
    for (const move of [...this.sent]) {
      if (move.applied && move.from !== project) this.forget(move, false);
    }
    this.renderer.show(indexed);
    this.refreshMarks();
    this.nudgeNext();
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
    this.refreshMarks();
  }

  /** Draws the emphasis (interface I2): pointing then goes past what it hides. */
  setEmphasis(emphasis: Emphasis): void {
    this.emphasis = emphasis;
    this.renderer.setEmphasis(emphasis);
    if (this.hovered && this.renderer.hiddenByEmphasis.has(this.hovered.key)) {
      this.hovered = undefined;
      this.refreshMarks();
    }
  }

  /** The emphasis drawn now. */
  get emphasized(): Emphasis {
    return this.emphasis;
  }

  /**
   * Starts or stops recording a scenario: while a recorder is set, a click on a relation records it
   * instead of selecting it alone or toggling it, and Enter on a selected relation records it and
   * follows it; with Shift, either joins the current step and Enter stays.
   */
  setRecorder(recorder: Recorder | undefined): void {
    this.recorder = recorder;
  }

  get camera(): Camera {
    return this.renderer.camera;
  }

  fit(): void {
    this.renderer.fit();
  }

  /** Edit the route…: the keys edit the route of a relation (ADR 0039). Says whether they do. */
  editRoute(relation: Id): boolean {
    if (this.gesture.kind !== 'idle') return false;
    this.host.focus({ preventScroll: true });
    return this.routes.editFromKeys(relation);
  }

  /** Zooms around the middle of the canvas. */
  zoomBy(factor: number): void {
    const { width, height } = this.renderer.viewport;
    this.renderer.setCamera(zoomAt(this.camera, { x: width / 2, y: height / 2 }, factor));
    this.refreshMarks();
  }

  /**
   * Moves the camera so that the shape with this key shows: when it is not wholly on screen, or too
   * small to read, it comes to the middle, at a scale where its name reads. The key is an element
   * shape's key, a free shape's id, or a relation's id for the line that draws it. The keys move on
   * from a shape revealed this way, as when it is chosen in the outline.
   */
  reveal(key: string): void {
    const indexed = this.indexed;
    if (!indexed) return;
    const shape = indexed.byKey.get(key);
    const reached: Reachable | undefined = shape ? { kind: 'shape', shape } : this.freeShape(key);
    if (reached) {
      this.current = key;
      this.revealRect(rectOf(reached));
      return;
    }
    const line = this.project && drawnRelations(indexed.scene, this.project).line(key);
    if (line) this.revealRect(rectAround(line.route));
  }

  /** Where the middle of the canvas is in the scene, for creating things there. */
  get center(): Point {
    const { width, height } = this.renderer.viewport;
    return screenToWorld(this.camera, { x: width / 2, y: height / 2 });
  }

  /** The element shape that holds the middle of the canvas, if any. */
  shapeAtCenter(): ElementShape | undefined {
    const hit = this.hit(this.center, 0);
    return hit?.kind === 'shape' ? hit.shape : undefined;
  }

  /**
   * Answers a drop that asked to be confirmed: confirmed, it is sent, and its ghost shows where its
   * shapes land until its change comes back; otherwise nothing changes.
   */
  resolveChange(confirmed: boolean): void {
    const confirming = this.confirming;
    if (!confirming) return;
    this.confirming = undefined;
    const { move, command } = confirming;
    if (!confirmed || this.destroyed || !this.project) {
      this.forget(move);
      this.nudgeNext();
      return;
    }
    // Back once the project is no longer the one it is sent on, which may have changed meanwhile.
    move.from = this.project;
    this.send(command, move);
  }

  /** Stops listening and releases the canvas; answers that come later change nothing. */
  destroy(): void {
    const { host } = this;
    host.removeEventListener('pointerdown', this.onPointerDown);
    host.removeEventListener('pointermove', this.onPointerMove);
    host.removeEventListener('pointerup', this.onPointerUp);
    host.removeEventListener('pointercancel', this.onPointerCancel);
    host.removeEventListener('pointerleave', this.onPointerLeave);
    host.removeEventListener('wheel', this.onWheel);
    host.removeEventListener('dblclick', this.onDoubleClick);
    host.removeEventListener('contextmenu', this.onContextMenu);
    host.removeEventListener('keydown', this.onKeyDown);
    host.removeEventListener('keyup', this.onKeyUp);
    host.removeEventListener('blur', this.onBlur);
    host.ownerDocument.defaultView?.removeEventListener('blur', this.onBlur);
    if (this.gesture.kind === 'drag') this.endDropFeedback(this.gesture);
    this.gesture = { kind: 'idle' };
    this.destroyed = true;
    this.sent = [];
    this.nudges = [];
    this.confirming = undefined;
    this.renderer.destroy();
  }

  /** Whether a shape counts by its drawn outline, where the canvas draws it, rather than its rectangle. */
  private readonly exact = (shape: ElementShape): boolean => this.renderer.showsOutline(shape.key);

  /**
   * What lies at a point of the scene, as drawn now: an element shape counts by its outline where the
   * canvas draws its outline, and by its rectangle where it draws a plain block.
   */
  private hit(world: Point, tolerance: number): Hit | undefined {
    if (!this.indexed) return undefined;
    return hitAt(this.indexed, world, tolerance, this.exact, this.renderer.hiddenByEmphasis);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const indexed = this.indexed;
    if (!indexed) return;
    if (this.gesture.kind !== 'idle') {
      // Another pointer, such as a second finger, leaves the gesture under way alone. The same
      // pointer pressing again means its release never came: what it was doing is dropped.
      if (event.pointerId !== this.gesture.pointer) return;
      this.cancel();
    }
    this.host.focus({ preventScroll: true });
    const screen = this.local(event);
    if (event.button === 1 || (event.button === 0 && this.spaceHeld)) {
      this.begin(event, {
        kind: 'pan',
        pointer: event.pointerId,
        start: screen,
        camera: this.camera,
      });
      this.host.style.cursor = 'grabbing';
      return;
    }
    if (isSecondaryPress(event)) {
      this.pressSecondary(event, screen);
      return;
    }
    if (event.button !== 0) return;
    const world = screenToWorld(this.camera, screen);
    // The handles of a route are hit before anything else.
    const modified = event.shiftKey || event.ctrlKey || event.metaKey;
    if (this.editable && this.routes.press(world, screen, modified)) {
      this.begin(event, { kind: 'route', pointer: event.pointerId });
      return;
    }
    const handleShape = this.handleShape();
    const handle = handleShape && this.handleOf(handleShape);
    if (
      this.editable &&
      handle &&
      handleShape &&
      distance(world, handle) <= HANDLE_REACH / this.camera.scale
    ) {
      this.begin(event, {
        kind: 'connect',
        pointer: event.pointerId,
        from: handleShape,
        anchor: handle,
      });
      return;
    }
    const hit = this.hit(world, HIT_TOLERANCE / this.camera.scale);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    this.stepping = undefined;
    if (!hit) {
      this.begin(event, { kind: 'box', pointer: event.pointerId, start: world, additive });
      return;
    }
    // The toggle in a container's corner collapses or expands it, and changes nothing else.
    if (hit.kind === 'shape' && !additive && this.onToggle(hit.shape, world)) {
      this.toggleCollapse(hit.shape);
      return;
    }
    // An aggregated relation stands for several, of which a step would not say which: it is
    // selected as when not recording.
    if (hit.kind === 'relation' && this.recorder && this.editable && !hit.line.aggregate) {
      // Recording: the relation is selected alone, which the step panel and the keys go on from.
      this.select(selectionOf(selectablesOf(hit)));
      this.recorder(hit.line.relation, event.shiftKey);
      return;
    }
    // The keys move on from what was pointed at.
    if (hit.kind !== 'relation') this.current = keyOf(hit);
    const items = selectablesOf(hit);
    if (additive) this.select(toggleAll(this.selection, items));
    else if (!allSelected(this.selection, items)) this.select(selectionOf(items));
    this.begin(event, {
      kind: 'press',
      pointer: event.pointerId,
      start: screen,
      world,
      hit,
      additive,
    });
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const indexed = this.indexed;
    if (!indexed) return;
    const screen = this.local(event);
    const world = screenToWorld(this.camera, screen);
    const gesture = this.gesture;
    switch (gesture.kind) {
      case 'pan':
        this.renderer.setCamera(
          panBy(gesture.camera, screen.x - gesture.start.x, screen.y - gesture.start.y),
        );
        return;
      case 'press': {
        if (distance(screen, gesture.start) < DRAG_THRESHOLD) return;
        const draggable = gesture.hit.kind !== 'relation';
        if (
          !this.editable ||
          !draggable ||
          (gesture.additive && !allSelected(this.selection, selectablesOf(gesture.hit)))
        ) {
          return;
        }
        const moving = movingShapes(indexed, this.selection);
        const keys = carriedKeys(indexed, moving);
        const drag = this.renderer.startDrag(keys, this.relationsOn(keys));
        this.lastDrag = drag;
        const delta = { x: world.x - gesture.world.x, y: world.y - gesture.world.y };
        const { project, viewId } = this;
        // What dropping can do is worked out once, for the shape grabbed.
        const plan =
          gesture.hit.kind === 'shape' && project && viewId
            ? planDrop(indexed, project, viewId, this.selection, gesture.hit.shape)
            : undefined;
        const dragged: DragGesture = {
          kind: 'drag',
          pointer: gesture.pointer,
          world: gesture.world,
          delta,
          drag,
          ...(plan ? { plan } : {}),
          aim: { kind: 'stay' },
          alt: event.altKey,
          cover: undefined,
          at: screen,
          armed: undefined,
          rest: undefined,
          landingFrame: undefined,
        };
        this.gesture = dragged;
        this.renderer.dragTo(delta);
        this.hovered = undefined;
        this.refreshMarks();
        // The drag drew over the drops still waiting: their marks show where they land.
        this.showOverlay({});
        this.aimDrop(dragged, true);
        return;
      }
      case 'drag': {
        gesture.delta = { x: world.x - gesture.world.x, y: world.y - gesture.world.y };
        gesture.at = screen;
        gesture.alt = event.altKey;
        this.renderer.dragTo(gesture.delta);
        this.aimDrop(gesture);
        return;
      }
      case 'box':
        this.showOverlay({ box: rectBetween(gesture.start, world) });
        return;
      case 'route':
        this.routes.move(world, screen, event.altKey);
        return;
      case 'connect': {
        const hit = this.hit(world, HIT_TOLERANCE / this.camera.scale);
        const target =
          hit &&
          !(hit.kind === 'shape' && hit.shape.element === gesture.from.element) &&
          hit.kind !== 'note' &&
          hit.kind !== 'arrow'
            ? hit
            : undefined;
        this.gesture = target ? { ...gesture, target } : { ...gesture, target: undefined };
        this.showOverlay({
          connect: { from: gesture.anchor, to: world },
          ...(target ? { target: targetRect(target) } : {}),
        });
        return;
      }
      case 'idle': {
        const hit = this.hit(world, HIT_TOLERANCE / this.camera.scale);
        const shape = hit?.kind === 'shape' ? hit.shape : undefined;
        const handleShape = this.handleShape();
        const handle = handleShape && this.handleOf(handleShape);
        const onHandle =
          this.editable &&
          handle !== undefined &&
          distance(world, handle) <= HANDLE_REACH / this.camera.scale;
        // On the way from the hovered shape to its handle, over a line or nothing, the shape stays
        // hovered, so that its handle stays to be grabbed.
        const onTheWay =
          this.editable &&
          !shape &&
          (hit === undefined || hit.kind === 'relation') &&
          this.hovered !== undefined &&
          this.onWayToHandle(this.hovered, world);
        if (!onHandle && !onTheWay && shape?.key !== this.hovered?.key) {
          this.hovered = shape;
          this.refreshMarks();
        }
        const routeCursor = this.routes.cursorAt(world);
        this.host.style.cursor = routeCursor
          ? routeCursor
          : onHandle
            ? 'crosshair'
            : this.spaceHeld
              ? 'grab'
              : hit
                ? hit.kind === 'relation' && this.recorder
                  ? 'copy'
                  : 'pointer'
                : 'default';
        if (shape && this.onToggle(shape, world)) this.host.title = toggleTitle(shape);
        else if (this.host.title !== '') this.host.title = '';
        return;
      }
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const indexed = this.indexed;
    const gesture = this.gesture;
    if (gesture.kind === 'idle' || !indexed || gesture.pointer !== event.pointerId) return;
    this.gesture = { kind: 'idle' };
    this.host.releasePointerCapture?.(event.pointerId);
    this.finish(gesture, indexed, event);
    // Back to idle: the hover mark and the handle show again.
    this.refreshMarks();
  };

  private finish(
    gesture: Exclude<Gesture, { kind: 'idle' }>,
    indexed: IndexedScene,
    event: PointerEvent,
  ): void {
    switch (gesture.kind) {
      case 'pan':
        this.host.style.cursor = this.spaceHeld ? 'grab' : 'default';
        return;
      case 'press': {
        const items = selectablesOf(gesture.hit);
        // A click on one of several selected things selects it alone.
        if (
          !gesture.additive &&
          sizeOf(this.selection) > items.length &&
          allSelected(this.selection, items)
        ) {
          this.select(selectionOf(items));
        }
        return;
      }
      case 'drag':
        this.drop(gesture);
        return;
      case 'route':
        this.routes.release();
        return;
      case 'box': {
        const world = screenToWorld(this.camera, this.local(event));
        const box = rectBetween(gesture.start, world);
        this.showOverlay({});
        if (box.width * this.camera.scale < 2 && box.height * this.camera.scale < 2) {
          if (!gesture.additive) this.select(EMPTY_SELECTION);
          return;
        }
        const { shapes, notes, arrows } = enclosedBy(indexed, box, this.renderer.hiddenByEmphasis);
        const found = selectionOf([
          ...shapes.map((shape): Selectable => ({ kind: 'element', id: shape.element })),
          ...notes.map((note): Selectable => ({ kind: 'free-shape', id: note.id })),
          ...arrows.map((arrow): Selectable => ({ kind: 'free-shape', id: arrow.id })),
        ]);
        this.select(gesture.additive ? union(this.selection, found) : found);
        return;
      }
      case 'connect': {
        this.showOverlay({});
        const target = gesture.target;
        const end =
          target?.kind === 'shape'
            ? target.shape.element
            : target?.kind === 'relation'
              ? target.line.relation
              : undefined;
        if (end !== undefined) this.callbacks.relate(gesture.from.element, end, this.local(event));
        this.refreshMarks();
        return;
      }
    }
  }

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.gesture.kind !== 'idle' && event.pointerId === this.gesture.pointer) this.cancel();
  };

  private readonly onPointerLeave = (): void => {
    if (this.gesture.kind === 'idle' && this.hovered) {
      this.hovered = undefined;
      this.refreshMarks();
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    if (event.ctrlKey || event.metaKey) {
      this.renderer.setCamera(
        zoomAt(this.camera, this.local(event), wheelFactor(event.deltaY * scale)),
      );
    } else if (event.shiftKey && event.deltaX === 0) {
      this.renderer.setCamera(panBy(this.camera, -event.deltaY * scale, 0));
    } else {
      this.renderer.setCamera(panBy(this.camera, -event.deltaX * scale, -event.deltaY * scale));
    }
    this.refreshMarks();
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (!this.indexed || !this.editable) return;
    const world = screenToWorld(this.camera, this.local(event));
    // A double-click on a bend point removes it.
    if (this.routes.doubleClick(world)) return;
    const hit = this.hit(world, HIT_TOLERANCE / this.camera.scale);
    if (hit?.kind === 'shape') this.callbacks.rename({ kind: 'element', shape: hit.shape });
    else if (hit?.kind === 'note') this.callbacks.rename({ kind: 'note', note: hit.note });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Editing a route takes its keys first: those of its mode, and Delete on a chosen bend point.
    if (this.routes.keyDown(event)) return;
    const command = event.ctrlKey || event.metaKey;
    const gesture = this.gesture;
    if (event.key === 'Alt' && gesture.kind === 'drag') {
      // Kept from the browser, which would show its menu bar, as Firefox on Windows does.
      event.preventDefault();
      if (!gesture.alt) {
        gesture.alt = true;
        this.aimDrop(gesture);
      }
      return;
    }
    if (
      event.key === 'ContextMenu' ||
      (event.key === 'F10' && event.shiftKey && !command && !event.altKey)
    ) {
      event.preventDefault();
      this.menuKeyTime = event.timeStamp;
      if (gesture.kind === 'idle') this.openMenuForCurrent();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        if (this.gesture.kind === 'idle') this.host.style.cursor = 'grab';
      }
      return;
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.editable &&
      !isEmpty(this.selection)
    ) {
      event.preventDefault();
      this.callbacks.remove();
      return;
    }
    if (event.key === 'Escape') {
      if (this.gesture.kind !== 'idle') this.cancel();
      else this.choose(EMPTY_SELECTION);
      return;
    }
    if (command && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
      return;
    }
    const direction = DIRECTIONS[event.key];
    if (direction) {
      this.onArrow(event, direction);
      return;
    }
    // Alt with − collapses the selected containers and Alt with + expands them, by the key's place,
    // which on Apple keyboards types another sign with ⌥; − and + alone zoom.
    const folding = !command && event.altKey ? COLLAPSE_KEYS[event.code] : undefined;
    if (folding !== undefined) {
      event.preventDefault();
      if (this.gesture.kind === 'idle') this.collapseSelection(folding);
      return;
    }
    // Some keyboards type [ and ] with AltGr, which browsers report as Ctrl and Alt together, and
    // as AltGraph. Otherwise, with Ctrl or ⌘, [ and ] are the stacking order's, which the canvas
    // area handles for the whole window; with Alt they are left alone.
    const altGraph = event.getModifierState('AltGraph');
    if (command && !altGraph) return;
    const step = RELATION_STEPS[event.key];
    if (step !== undefined && (altGraph || !event.altKey)) {
      event.preventDefault();
      if (this.gesture.kind === 'idle') this.stepRelations(step);
      return;
    }
    if (!event.altKey && (event.key === 'Enter' || event.key === 'F2')) {
      event.preventDefault();
      if (this.gesture.kind !== 'idle') return;
      if (event.key === 'Enter' && this.selectedRelation() !== undefined) {
        this.followOrRecord(event.shiftKey);
      } else this.edit();
      return;
    }
    if (event.key === '+' || event.key === '=') this.zoomBy(KEY_ZOOM);
    else if (event.key === '-' || event.key === '_') this.zoomBy(1 / KEY_ZOOM);
    else if (event.key === '0' || (event.key === '!' && event.shiftKey)) this.fit();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === ' ') this.releaseSpace();
    const gesture = this.gesture;
    if (event.key === 'Alt' && gesture.kind === 'drag') {
      event.preventDefault();
      gesture.alt = false;
      this.aimDrop(gesture);
    }
  };

  /**
   * `contextmenu` on the canvas never shows the browser's menu. Shortly after Shift+F10 or the menu
   * key, it is theirs, which opened the menu already; shortly after a secondary press, it opens the
   * menu where the press was; otherwise it comes from the keyboard, and opens the menu of the current
   * shape, wherever the event says it is.
   */
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const { menuKeyTime, secondary } = this;
    this.menuKeyTime = undefined;
    this.secondary = undefined;
    if (this.gesture.kind !== 'idle') return;
    if (menuKeyTime !== undefined && event.timeStamp - menuKeyTime <= MENU_KEY_WINDOW) return;
    if (secondary && event.timeStamp - secondary.time <= SECONDARY_PRESS_WINDOW) {
      this.openMenuAt(secondary);
      return;
    }
    this.openMenuForCurrent();
  };

  /**
   * A secondary press, with the right button or, on Apple platforms, with Ctrl: it selects what it
   * is on unless that is selected already, and neither toggles nor drags; the `contextmenu` event
   * that follows opens the menu.
   */
  private pressSecondary(event: PointerEvent, screen: Point): void {
    const world = screenToWorld(this.camera, screen);
    const hit = this.hit(world, HIT_TOLERANCE / this.camera.scale);
    this.stepping = undefined;
    if (hit) {
      if (hit.kind !== 'relation') this.current = keyOf(hit);
      const items = selectablesOf(hit);
      if (!allSelected(this.selection, items)) this.select(selectionOf(items));
    }
    this.secondary = {
      at: screen,
      world,
      time: event.timeStamp,
      ...(hit?.kind === 'shape' ? { shape: hit.shape.key } : {}),
      ...(hit?.kind === 'relation' ? { relations: relationsToAct(this.selection, hit) } : {}),
    };
  }

  /** Opens the menu of the shape a secondary press was on, there, with the shapes under it. */
  private openMenuAt(press: SecondaryPress): void {
    if (press.relations) {
      this.callbacks.relationMenu?.(press.at, press.relations);
      return;
    }
    const indexed = this.indexed;
    const shape = press.shape === undefined ? undefined : indexed?.byKey.get(press.shape);
    if (!indexed || !shape) return;
    this.callbacks.menu?.(
      press.at,
      shape,
      shapesAt(indexed, press.world, this.exact, this.renderer.hiddenByEmphasis),
    );
  }

  /** Opens the menu of the shape the keys act on, at its middle. */
  private openMenuForCurrent(): void {
    const current = this.currentReachable();
    const { elements, relations, freeShapes } = this.selection;
    if (!current && relations.size > 0 && elements.size === 0 && freeShapes.size === 0) {
      // The menu of the selected relations, at the middle of the first one's line.
      const [first] = relations;
      const line =
        first === undefined || !this.indexed
          ? undefined
          : relationLinesOf(this.indexed.scene).get(first);
      if (line) {
        this.callbacks.relationMenu?.(worldToScreen(this.camera, line.middle), [...relations]);
      }
      return;
    }
    if (current?.kind !== 'shape') return;
    this.callbacks.menu?.(worldToScreen(this.camera, centerOf(current.shape.rect)), current.shape);
  }

  /**
   * The canvas or the window lost the focus: a key let go elsewhere never comes to the canvas, so Space
   * counts as let go.
   */
  private readonly onBlur = (): void => {
    if (this.spaceHeld) this.releaseSpace();
  };

  private releaseSpace(): void {
    this.spaceHeld = false;
    if (this.gesture.kind === 'idle') this.host.style.cursor = 'default';
  }

  private begin(event: PointerEvent, gesture: Exclude<Gesture, { kind: 'idle' }>): void {
    this.gesture = gesture;
    this.host.setPointerCapture?.(event.pointerId);
    if (gesture.kind === 'box' || gesture.kind === 'connect') this.hovered = undefined;
    this.refreshMarks();
  }

  /**
   * Sends what the drag did, at once: it puts the shapes inside the container they were let go on,
   * takes them out of theirs, or moves them from where they were drawn to where they were let go. The
   * dragged shapes stay drawn there until the change comes back. A change that would delete more than
   * the relations that placed them is shown first, and waits to be confirmed; one the core would
   * refuse is not sent, and says why.
   */
  private drop(gesture: DragGesture): void {
    this.endDropFeedback(gesture);
    const { indexed, project, viewId, selection } = this;
    const { delta, drag, plan } = gesture;
    const dropped =
      indexed && project && viewId && plan
        ? dropCommand(indexed, project, viewId, selection, plan, gesture.aim, delta)
        : undefined;
    const command =
      dropped?.command ??
      (indexed && project && viewId
        ? moveCommand(indexed, project, viewId, selection, delta)
        : undefined);
    if (!indexed || !project || !command) {
      this.renderer.endDrag(drag);
      return;
    }
    let landing: Rect[] | undefined;
    // Worked out only if a later drag draws over this one before its change comes back.
    const lands = () => (landing ??= landingOf(indexed, selection, delta));
    const done = dropped && { done: `${dropped.label}.` };
    if (dropped?.change && takesOut(project, dropped.change)) {
      const { change } = dropped;
      const preview = previewChangeContainer(project, change);
      const [problem] = preview.problems;
      if (problem) {
        this.renderer.endDrag(drag);
        this.announce(problem.message);
        return;
      }
      if (needsConfirmation(preview) && this.callbacks.confirmChange) {
        // The drag ends, and the ghost shows where the shapes land while the question is asked.
        this.renderer.endDrag(drag);
        const move: SentMove = { from: project, applied: false, ghost: lands(), ...done };
        this.sent.push(move);
        this.confirming = { move, command };
        this.showOverlay({});
        this.callbacks.confirmChange({
          command,
          change,
          preview,
          label: dropped.label,
          confirmLabel: confirmLabelOf(project, change),
        });
        return;
      }
    }
    this.send(command, { from: project, applied: false, drop: { drag, landing: lands }, ...done });
  }

  private cancel(): void {
    if (this.gesture.kind === 'route') this.routes.cancel();
    if (this.gesture.kind === 'drag') {
      this.endDropFeedback(this.gesture);
      this.renderer.endDrag(this.gesture.drag);
    }
    this.gesture = { kind: 'idle' };
    this.showOverlay({});
    this.refreshMarks();
  }

  /**
   * Works out what releasing the dragged shapes would do now, from where the pointer is, and shows it
   * when it changed: the outlines of the containers it goes into or leaves, and the caption. Where the
   * grabbed shape would land behind another is checked again on each change, and once a frame while
   * the aim stays.
   */
  private aimDrop(gesture: DragGesture, first = false): void {
    this.placeCaption(gesture.at);
    const { indexed, project } = this;
    const { plan } = gesture;
    if (!indexed || !project || !plan) return;
    if (gesture.alt) gesture.armed = undefined;
    const world = screenToWorld(this.camera, gesture.at);
    // What the emphasis hides cannot be dropped onto.
    const aim = dropAimAt(
      withoutShapes(indexed, this.renderer.hiddenShapes),
      plan,
      world,
      gesture.delta,
      gesture.armed,
      this.exact,
      gesture.alt,
    );
    // Leaving the shape armed disarms it: coming back to it means resting on it again.
    if (gesture.armed !== undefined && !(aim.kind === 'into' && aim.target.key === gesture.armed)) {
      gesture.armed = undefined;
    }
    this.restOn(gesture, aim);
    if (first || !sameAim(aim, gesture.aim)) {
      gesture.aim = aim;
      gesture.cover = landingCover(indexed, plan, aim, gesture.delta);
      this.showDrop(gesture);
    } else {
      this.checkLandingSoon(gesture);
    }
  }

  /**
   * Times the rest on a shape that holds nothing, which arms it to take the drop: the timer starts
   * when the pointer comes onto another such shape, and again whenever it moves further than a few
   * pixels from where it started.
   */
  private restOn(gesture: DragGesture, aim: DropAim): void {
    const leaf = aim.kind === 'pending' ? aim.leaf.key : undefined;
    const rest = gesture.rest;
    if (rest && rest.leaf === leaf && distance(rest.from, gesture.at) <= REST_TOLERANCE) return;
    if (rest) clearTimeout(rest.timer);
    gesture.rest = undefined;
    if (leaf === undefined) return;
    gesture.rest = {
      leaf,
      from: gesture.at,
      timer: setTimeout(() => {
        if (this.gesture !== gesture) return;
        gesture.rest = undefined;
        gesture.armed = leaf;
        this.aimDrop(gesture);
      }, REST_TO_ARM),
    };
  }

  /** Checks at the next frame where the grabbed shape lands, and shows it when that changed. */
  private checkLandingSoon(gesture: DragGesture): void {
    if (gesture.landingFrame !== undefined) return;
    gesture.landingFrame = nextFrame(() => {
      gesture.landingFrame = undefined;
      const indexed = this.indexed;
      if (this.gesture !== gesture || !indexed || !gesture.plan) return;
      const cover = landingCover(indexed, gesture.plan, gesture.aim, gesture.delta);
      if (cover?.key === gesture.cover?.key) return;
      gesture.cover = cover;
      this.showDrop(gesture);
    });
  }

  /** Outlines where the dragged shapes would go, and says it beside the pointer. */
  private showDrop(gesture: DragGesture): void {
    const { indexed, project } = this;
    if (!indexed || !project || !gesture.plan) return;
    const drop = dropOverlay(indexed, gesture.plan, gesture.aim);
    this.showOverlay(drop ? { drop } : {});
    this.showCaption(dropCaption(project, gesture.plan, gesture.aim, gesture.cover));
    this.placeCaption(gesture.at);
  }

  /** Stops what a drag shows and times while it goes: the rest, the landing check and the caption. */
  private endDropFeedback(gesture: DragGesture): void {
    if (gesture.rest) clearTimeout(gesture.rest.timer);
    gesture.rest = undefined;
    if (gesture.landingFrame !== undefined) cancelFrame(gesture.landingFrame);
    gesture.landingFrame = undefined;
    this.showCaption(undefined);
  }

  /** Writes the caption: its line, and the details below it; nothing hides it. */
  private showCaption(caption: DropCaption | undefined): void {
    const element = this.caption;
    if (!element) return;
    element.textContent = caption?.text ?? '';
    if (caption?.detail === undefined) return;
    const detail = element.ownerDocument.createElement('span');
    detail.className = 'canvas-drop-caption-detail';
    detail.textContent = caption.detail;
    element.append(detail);
  }

  /** Puts the caption beside the pointer, within the canvas. */
  private placeCaption(at: Point): void {
    const element = this.caption;
    if (!element || element.textContent === '') return;
    const { width, height } = this.renderer.viewport;
    const x = Math.max(0, Math.min(at.x + CAPTION_OFFSET.x, width - element.offsetWidth));
    const y = Math.max(0, Math.min(at.y + CAPTION_OFFSET.y, height - element.offsetHeight));
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /**
   * Sends a move, and keeps it until its change comes back: once the local program has said it
   * applied it and the project is no longer the one it was made from, in whichever order the two come.
   */
  private send(command: Command, move: SentMove): void {
    if (!this.sent.includes(move)) this.sent.push(move);
    this.callbacks.command(command).then(
      (applied) => {
        if (!this.sent.includes(move)) return;
        if (!applied) this.moveFailed(move);
        else {
          move.applied = true;
          if (move.done !== undefined) this.announce(move.done);
          if (this.project !== move.from) this.moveBack(move);
        }
      },
      () => {
        if (this.sent.includes(move)) this.moveFailed(move);
      },
    );
  }

  /** A move's change came back: a drop's shapes are drawn from the scene again, and the next press moves. */
  private moveBack(move: SentMove): void {
    this.forget(move);
    this.nudgeNext();
  }

  /**
   * A move was refused or never answered: a drop's shapes go back to where they are, and the presses
   * waiting, made for shapes that did not move, are dropped.
   */
  private moveFailed(move: SentMove): void {
    this.forget(move);
    this.nudges = [];
  }

  /**
   * Forgets a move, and stops drawing a drop's shapes apart; with `redraw` off, the scene shown next
   * draws them.
   */
  private forget(move: SentMove, redraw = true): void {
    this.sent = this.sent.filter((each) => each !== move);
    if (this.destroyed) return;
    if (move.drop) this.renderer.endDrag(move.drop.drag, { redraw });
    if (move.drop || move.ghost) this.showOverlay(this.gestureOverlay);
  }

  /**
   * Draws a gesture's marks above the scene, with where the drops still waiting land: for each one a
   * later drag drew over, and each one asked to be confirmed, whose drag ended. Until their changes
   * come back, the scene still has them where they were.
   */
  private showOverlay(overlay: Overlay): void {
    this.gestureOverlay = overlay;
    const ghost = this.sent.flatMap(
      (move) =>
        move.ghost ??
        (move.drop && this.lastDrag !== undefined && move.drop.drag < this.lastDrag
          ? move.drop.landing()
          : []),
    );
    this.renderer.setOverlay(ghost.length > 0 ? { ...overlay, ghost } : overlay);
  }

  private select(selection: Selection): void {
    this.selection = selection;
    this.callbacks.select(selection);
    this.refreshMarks();
  }

  /** Selects everything the canvas draws: what the emphasis hides is left out. */
  private selectAll(): void {
    const scene = this.indexed?.scene;
    if (!scene) return;
    const hidden = this.renderer.hiddenByEmphasis;
    const elements = new Set<Id>();
    for (const shape of scene.shapes) if (!hidden.has(shape.key)) elements.add(shape.element);
    this.choose(
      selectionOf([
        ...[...elements].map((id): Selectable => ({ kind: 'element', id })),
        ...scene.notes
          .filter((note) => !hidden.has(note.id))
          .map((note): Selectable => ({ kind: 'free-shape', id: note.id })),
        ...scene.arrows
          .filter((arrow) => !hidden.has(arrow.id))
          .map((arrow): Selectable => ({ kind: 'free-shape', id: arrow.id })),
      ]),
    );
  }

  /** Whether a point is on the toggle in a container's corner, where the canvas draws it. */
  private onToggle(shape: ElementShape, world: Point): boolean {
    if (!this.editable || !this.renderer.showsOutline(shape.key)) return false;
    const toggle = toggleRect(shape);
    if (!toggle) return false;
    // A few pixels around it count, so that the small square is easy to press.
    const slack = 2 / this.camera.scale;
    return (
      world.x >= toggle.x - slack &&
      world.x <= toggle.x + toggle.width + slack &&
      world.y >= toggle.y - slack &&
      world.y <= toggle.y + toggle.height + slack
    );
  }

  /** The toggle of a container's shape: collapses it, or expands it when it is collapsed. */
  private toggleCollapse(shape: ElementShape): void {
    const collapsed = shape.collapsed === undefined;
    const name = shape.name;
    this.callbacks.collapse?.(
      { elements: [shape.element], label: `${collapsed ? 'Collapse' : 'Expand'} "${name}"` },
      collapsed,
    );
  }

  /** Alt with − or +: collapses or expands the selected containers, or says why nothing does. */
  private collapseSelection(collapsed: boolean): void {
    const { indexed, project } = this;
    if (!indexed || !project) return;
    if (!this.editable) {
      this.announce('The project cannot be changed now.');
      return;
    }
    const actions = collapseActions(indexed, project, this.selection);
    const action = collapsed ? actions.collapse : actions.expand;
    if (action) this.callbacks.collapse?.(action, collapsed);
    else {
      this.announce(
        collapsed
          ? 'Select an expanded container to collapse it.'
          : 'Select a collapsed container to expand it.',
      );
    }
  }

  /** Selects from the keyboard, and says what was selected. */
  private choose(selection: Selection, message?: string): void {
    this.select(selection);
    const { indexed, project } = this;
    if (indexed && project) {
      this.announce(message ?? describeSelection(indexed, project, selection, this.current));
    }
  }

  private announce(message: string): void {
    this.callbacks.announce?.(message);
  }

  private onArrow(event: KeyboardEvent, direction: Direction): void {
    // Ctrl and ⌘ with ↑ and ↓ are the stacking order's, which the canvas area handles for the whole
    // window; with ← and → they are left alone. So are Alt with Left and Right, which go back and
    // forward in the browser's history.
    if (event.ctrlKey || event.metaKey) return;
    if (event.altKey && (direction === 'left' || direction === 'right')) return;
    event.preventDefault();
    if (this.gesture.kind !== 'idle') return;
    if (event.altKey) {
      if (direction === 'up') this.selectContainer();
      else this.selectInside();
    } else if (event.shiftKey) {
      this.nudge(direction, event.repeat);
    } else {
      this.go(direction);
    }
  }

  /**
   * Selects the nearest shape in a direction from the selected one, or the shape nearest the middle
   * of the canvas when nothing is selected, and brings it into sight.
   */
  private go(direction: Direction): void {
    const indexed = this.indexed;
    if (!indexed) return;
    const start = this.startOfMove();
    const reached = start
      ? nearestInDirection(indexed, start, direction)
      : nearestTo(indexed, this.center);
    if (reached) this.reach(reached);
    else if (start) this.announce(`No shape ${TOWARDS[direction]}.`);
  }

  /** Alt+Up: the container of the selected shape. */
  private selectContainer(): void {
    const indexed = this.indexed;
    const current = this.currentReachable();
    if (!indexed || current?.kind !== 'shape') return;
    const container = containerOf(indexed, current.shape);
    if (container) this.reach({ kind: 'shape', shape: container });
    else this.announce(`${current.shape.name} sits directly in World.`);
  }

  /** Alt+Down: the first shape inside the selected container. */
  private selectInside(): void {
    const indexed = this.indexed;
    const current = this.currentReachable();
    if (!indexed || current?.kind !== 'shape') return;
    const inside = firstInside(indexed, current.shape);
    if (inside) this.reach({ kind: 'shape', shape: inside });
    else this.announce(`${current.shape.name} holds no shapes.`);
  }

  /** Selects a shape the keys reached, says what it is and brings it into sight. */
  private reach(reached: Reachable): void {
    this.stepping = undefined;
    if (reached.kind === 'shape') {
      this.current = reached.shape.key;
      this.choose(selectionOf([{ kind: 'element', id: reached.shape.element }]));
    } else {
      const id = reached.kind === 'note' ? reached.note.id : reached.arrow.id;
      this.current = id;
      this.choose(selectionOf([{ kind: 'free-shape', id }]));
    }
    this.revealRect(rectOf(reached));
  }

  /**
   * Where the keys move from: the shape last pointed at or reached when it is selected, or else the
   * first selected element's shape, free shape, or relation, whose line counts from its middle.
   */
  private startOfMove(): Start | undefined {
    const current = this.currentReachable();
    if (current) {
      return current.kind === 'shape'
        ? { rect: current.shape.rect, shape: current.shape }
        : { rect: rectOf(current) };
    }
    const [relation] = this.selection.relations;
    const line =
      relation !== undefined && this.indexed && this.project
        ? drawnRelations(this.indexed.scene, this.project).line(relation)
        : undefined;
    return line && { rect: { x: line.middle.x, y: line.middle.y, width: 0, height: 0 } };
  }

  /** The selected shape the keys act on: the one last pointed at or reached, or the first selected. */
  private currentReachable(): Reachable | undefined {
    const indexed = this.indexed;
    if (!indexed) return undefined;
    const { elements, freeShapes } = this.selection;
    if (this.current !== undefined) {
      const shape = indexed.byKey.get(this.current);
      if (shape && elements.has(shape.element)) return { kind: 'shape', shape };
      if (freeShapes.has(this.current)) {
        const free = this.freeShape(this.current);
        if (free) return free;
      }
    }
    const [element] = elements;
    const first = element === undefined ? undefined : indexed.byElement.get(element)?.[0];
    if (first) return { kind: 'shape', shape: first };
    const [free] = freeShapes;
    return free === undefined ? undefined : this.freeShape(free);
  }

  private freeShape(id: Id): Reachable | undefined {
    const scene = this.indexed?.scene;
    const note = scene?.notes.find((each) => each.id === id);
    if (note) return { kind: 'note', note };
    const arrow = scene?.arrows.find((each) => each.id === id);
    return arrow && { kind: 'arrow', arrow };
  }

  /** The relation selected, when it is all that is selected. */
  private selectedRelation(): Id | undefined {
    const { elements, relations, freeShapes } = this.selection;
    if (relations.size !== 1 || elements.size > 0 || freeShapes.size > 0) return undefined;
    const [relation] = relations;
    return relation;
  }

  /**
   * ] and [: selects the next or the previous relation of the selected element, clockwise around its
   * shape from the top, each followed by the relations that end on it; with one of them selected, the
   * one after or before it. A relation selected on its own steps from the element it is drawn on, or
   * the element of a relation it ends on.
   */
  private stepRelations(step: 1 | -1): void {
    const { indexed, project } = this;
    if (!indexed || !project) return;
    const drawn = drawnRelations(indexed.scene, project);
    const { elements, relations, freeShapes } = this.selection;
    let element: Id | undefined;
    let current: Id | undefined;
    const relation = this.selectedRelation();
    if (relation !== undefined) {
      const ends = drawn.relation(relation);
      if (!ends) return;
      const stepping = this.stepping?.element;
      element =
        stepping !== undefined && stopOf(drawn.steps(stepping), relation) !== undefined
          ? stepping
          : (drawn.elementOf(relation) ?? (drawn.shapeOf(ends.from) ? ends.from : ends.to));
      current = relation;
    } else if (elements.size === 1 && relations.size === 0 && freeShapes.size === 0) {
      [element] = elements;
      const stepping = this.stepping;
      current = stepping && stepping.element === element ? stepping.relation : undefined;
    }
    if (element === undefined) return;
    const line = stepRelation(drawn, element, current, step);
    if (!line) {
      this.announce(`${nameOfEnd(project, element)} has no relations in this view.`);
      return;
    }
    const stops = drawn.steps(element);
    const at = stops.findIndex((stop) => stop.line === line);
    const on = stops[at]?.on;
    this.stepping = { element, relation: line.relation };
    this.choose(
      selectionOf([{ kind: 'relation', id: line.relation }]),
      describeRelation(project, line.relation, {
        element,
        position: at + 1,
        count: stops.length,
        ...(on !== undefined && on !== element ? { through: on } : {}),
      }),
    );
    this.revealRect(rectAround(line.route));
  }

  /**
   * Enter on the selected relation: selects its far end, away from the element its relations were
   * being stepped through, or from the relation it was reached through; or else the end it points to.
   */
  private follow(): void {
    const { indexed, project } = this;
    const id = this.selectedRelation();
    if (!indexed || !project || id === undefined) return;
    const drawn = drawnRelations(indexed.scene, project);
    const relation = drawn.relation(id);
    if (!relation) return;
    const stepping = this.stepping?.element;
    const isEnd = stepping === relation.from || stepping === relation.to;
    const near =
      (stepping === undefined ? undefined : stopOf(drawn.steps(stepping), id)?.on) ??
      (isEnd ? stepping : undefined);
    const far = farEnd(relation, near);
    const shape = drawn.shapeOf(far);
    if (shape) {
      this.current = shape.key;
      // ] and [ go on from the relation the move came along.
      this.stepping = { element: far, relation: id };
      this.choose(selectionOf([{ kind: 'element', id: far }]));
      this.revealRect(shape.rect);
      return;
    }
    const line = drawn.line(far);
    if (!line) return;
    this.stepping = undefined;
    this.choose(selectionOf([{ kind: 'relation', id: far }]));
    this.revealRect(rectAround(line.route));
  }

  /**
   * Enter on the selected relation: follows it; while a scenario records, records it first, and with
   * Shift adds it to the current step and stays on it.
   */
  private followOrRecord(simultaneous: boolean): void {
    const relation = this.selectedRelation();
    if (relation !== undefined && this.recorder && this.editable) {
      this.recorder(relation, simultaneous);
      if (simultaneous) return;
    }
    this.follow();
  }

  /** Enter or F2: edits the name of the selected element, or the text of the selected note, in place. */
  private edit(): void {
    if (!this.editable || sizeOf(this.selection) !== 1) return;
    const current = this.currentReachable();
    if (current?.kind === 'shape') this.callbacks.rename({ kind: 'element', shape: current.shape });
    else if (current?.kind === 'note') this.callbacks.rename({ kind: 'note', note: current.note });
  }

  /**
   * Shift with an arrow key: moves what is selected a small step, as one undoable move. A press made
   * while a move is on its way, a drop's or another press's, waits for it, so that each one moves
   * from where the last left the shapes, and moves what was selected when it was pressed; a key held
   * down moves only as fast as the moves come back.
   */
  private nudge(direction: Direction, repeated: boolean): void {
    if (!this.editable) return;
    const nudge: Nudge = { step: STEPS[direction], selection: this.selection };
    if (this.sent.length > 0 || this.nudges.length > 0) {
      if (!repeated && this.nudges.length < MAX_WAITING_NUDGES) this.nudges.push(nudge);
      return;
    }
    this.sendNudge(nudge);
  }

  /** Sends the next press waiting, once no move is on its way; none waits once nothing can be changed. */
  private nudgeNext(): void {
    if (!this.editable) this.nudges = [];
    while (this.sent.length === 0 && this.nudges.length > 0) {
      this.sendNudge(this.nudges.shift() as Nudge);
    }
  }

  private sendNudge({ step, selection }: Nudge): void {
    const { indexed, project, viewId } = this;
    const command =
      indexed && project && viewId
        ? moveCommand(indexed, project, viewId, selection, step)
        : undefined;
    if (project && command) this.send(command, { from: project, applied: false });
  }

  private revealRect(rect: Rect): void {
    const camera = revealCamera(this.camera, this.renderer.viewport, rect, REVEAL_SCALE);
    if (!camera) return;
    this.renderer.setCamera(camera);
    this.refreshMarks();
  }

  /**
   * The lines drawn from or to anything being carried, and those that end on them, by their keys:
   * relations, and the aggregated relations drawn to a collapsed container that is carried.
   */
  private relationsOn(keys: ReadonlySet<string>): Set<Id> {
    const indexed = this.indexed;
    const hidden = new Set<Id>();
    if (!indexed) return hidden;
    const carried = (end: { kind: 'shape'; key: string } | { kind: 'relation'; relation: Id }) =>
      end.kind === 'shape' ? keys.has(end.key) : hidden.has(end.relation);
    let grew = true;
    while (grew) {
      grew = false;
      for (const line of indexed.scene.relations) {
        if (hidden.has(line.relation) || !line.ends) continue;
        if (carried(line.ends.from) || carried(line.ends.to)) {
          hidden.add(line.relation);
          grew = true;
        }
      }
    }
    return hidden;
  }

  /** The shape whose handle shows: the one under the pointer, or the only selected element's. */
  private handleShape(): ElementShape | undefined {
    if (!this.editable || !this.indexed || this.gesture.kind !== 'idle') return undefined;
    if (this.hovered) return this.hovered;
    if (this.selection.elements.size === 1 && this.selection.relations.size === 0) {
      const [id] = this.selection.elements;
      return id === undefined ? undefined : this.indexed.byElement.get(id)?.[0];
    }
    return undefined;
  }

  private handleOf(shape: ElementShape): Point {
    return {
      x: shape.rect.x + shape.rect.width + HANDLE_OFFSET / this.camera.scale,
      y: centerOf(shape.rect).y,
    };
  }

  /**
   * Whether a point lies on the hovered shape, or between its right side and its handle: the strip
   * the pointer crosses to reach the handle, where neither is under it.
   */
  private onWayToHandle(shape: ElementShape, world: Point): boolean {
    const { rect } = shape;
    const handle = this.handleOf(shape);
    const reach = HANDLE_REACH / this.camera.scale;
    const right = rect.x + rect.width;
    const inRect =
      world.x >= rect.x && world.x <= right && world.y >= rect.y && world.y <= rect.y + rect.height;
    const inStrip =
      world.x >= right &&
      world.x <= handle.x + reach &&
      world.y >= handle.y - reach &&
      world.y <= handle.y + reach;
    return inRect || inStrip;
  }

  private refreshMarks(): void {
    this.renderer.setSelection(this.selection, this.hovered?.key);
    this.routes.refresh();
    if (this.gesture.kind === 'idle') {
      const shape = this.handleShape();
      this.showOverlay(shape ? { handle: this.handleOf(shape) } : {});
    }
  }

  private local(event: MouseEvent): Point {
    const rect = this.host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}

/** Where a relation is among those ] and [ step through from an element, if it is one of them. */
function stopOf(stops: readonly RelationStop[], relation: Id): RelationStop | undefined {
  return stops.find((stop) => stop.line.relation === relation);
}

/** The key the keys move on from for what a pointer hit: a shape's key, or a free shape's id. */
function keyOf(hit: Exclude<Hit, { kind: 'relation' }>): string {
  switch (hit.kind) {
    case 'shape':
      return hit.shape.key;
    case 'note':
      return hit.note.id;
    case 'arrow':
      return hit.arrow.id;
  }
}

/**
 * Where a drop lands: the rectangles of the shapes and free shapes it moves, moved by `delta`; when
 * there are many, one rectangle around them all.
 */
function landingOf(indexed: IndexedScene, selection: Selection, delta: Point): Rect[] {
  const { notes, arrows } = indexed.scene;
  const free = selection.freeShapes;
  const rects = [
    ...movingShapes(indexed, selection).map((shape) => shape.rect),
    ...notes.filter((note) => free.has(note.id)).map((note) => note.rect),
    ...arrows
      .filter((arrow) => free.has(arrow.id))
      .map((arrow) => rectAround([arrow.from, arrow.to])),
  ].map((rect) => ({ ...rect, x: rect.x + delta.x, y: rect.y + delta.y }));
  if (rects.length <= MAX_LANDING_MARKS) return rects;
  const around = boundsOf(rects);
  return around ? [around] : [];
}

/**
 * Whether a press opens the menu rather than selects or drags: the right button, or on Apple
 * platforms the main one with Ctrl and without ⌘, where Ctrl then no longer adds to the selection.
 */
function isSecondaryPress(event: PointerEvent): boolean {
  return event.button === 2 || (IS_APPLE && event.button === 0 && event.ctrlKey && !event.metaKey);
}

/** Whether a change of container takes some element out of a container it sits in. */
function takesOut(project: ProjectSnapshot, change: ChangeContainerCommand): boolean {
  const world = project.model.world.id;
  const to = change.to === world ? undefined : change.to;
  return change.shapes.some(
    (shape) => shape.from !== undefined && shape.from !== world && shape.from !== to,
  );
}

/** Whether two aims would do the same: for the outlines and the caption to stay as they are. */
function sameAim(a: DropAim, b: DropAim): boolean {
  switch (a.kind) {
    case 'stay':
    case 'out':
      return b.kind === a.kind;
    case 'into':
      return b.kind === 'into' && b.target.key === a.target.key;
    case 'refused':
      return b.kind === 'refused' && b.target.key === a.target.key && b.reason === a.reason;
    case 'only-moves':
      return b.kind === 'only-moves' && b.reason === a.reason;
    case 'pending':
      return b.kind === 'pending' && b.leaf.key === a.leaf.key && sameAim(a.fallback, b.fallback);
  }
}

/** Runs at the next frame; where frames are not drawn, as in tests, soon after. */
function nextFrame(run: () => void): number {
  return typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(run)
    : (setTimeout(run, 16) as unknown as number);
}

function cancelFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  else clearTimeout(frame);
}

/** The keys that collapse (true) or expand (false) the selected containers, with Alt, by their place. */
const COLLAPSE_KEYS: Partial<Record<string, boolean>> = {
  Minus: true,
  NumpadSubtract: true,
  Equal: false,
  NumpadAdd: false,
};

/** What a container's toggle says it does, when the pointer rests on it. */
function toggleTitle(shape: ElementShape): string {
  return shape.collapsed === undefined
    ? `Collapse "${shape.name}" (Alt+−)`
    : `Expand "${shape.name}" (Alt++)`;
}

/**
 * The relations a secondary press on a line acts on: the selected relations when the line is one of
 * them, otherwise those the line draws.
 */
function relationsToAct(selection: Selection, hit: Extract<Hit, { kind: 'relation' }>): Id[] {
  const drawn = selectablesOf(hit).map((item) => item.id);
  return drawn.every((id) => selection.relations.has(id)) ? [...selection.relations] : drawn;
}

/** What pointing at something selects: an aggregated relation selects every relation it stands for. */
function selectablesOf(hit: Hit): Selectable[] {
  switch (hit.kind) {
    case 'shape':
      return [{ kind: 'element', id: hit.shape.element }];
    case 'relation':
      return hit.line.aggregate
        ? hit.line.aggregate.relations.map((id): Selectable => ({ kind: 'relation', id }))
        : [{ kind: 'relation', id: hit.line.relation }];
    case 'note':
      return [{ kind: 'free-shape', id: hit.note.id }];
    case 'arrow':
      return [{ kind: 'free-shape', id: hit.arrow.id }];
  }
}

function allSelected(selection: Selection, items: readonly Selectable[]): boolean {
  return items.every((item) => isSelected(selection, item));
}

/** The selection without these when it held them all, and with them all otherwise. */
function toggleAll(selection: Selection, items: readonly Selectable[]): Selection {
  if (items.length === 1) return toggle(selection, items[0] as Selectable);
  const holding = allSelected(selection, items);
  return items.reduce(
    (next, item) => (isSelected(next, item) === holding ? toggle(next, item) : next),
    selection,
  );
}

function targetRect(hit: Hit) {
  switch (hit.kind) {
    case 'shape':
      return hit.shape.rect;
    case 'relation':
      return rectAround(hit.line.route);
    case 'note':
      return hit.note.rect;
    case 'arrow':
      return rectAround([hit.arrow.from, hit.arrow.to]);
  }
}

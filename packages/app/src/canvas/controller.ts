/**
 * The canvas's gestures: pointing selects, dragging moves or selects with a box, the handle beside a
 * shape relates it to another, the wheel pans and zooms, and keys delete, select all and zoom. From
 * the keyboard, the arrow keys go from shape to shape, ] and [ step through an element's relations,
 * Enter follows a relation or edits a name, and Shift with an arrow key moves the selection; what the
 * keys select is announced to screen readers. The controller only turns gestures into selections and
 * commands; the local program applies commands and the canvas redraws what comes back.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
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
import { describeRelation, describeSelection, nameOfEnd } from './announce';
import { panBy, revealCamera, screenToWorld, wheelFactor, zoomAt, type Camera } from './camera';
import { centerOf, distance, type Point, type Rect } from './geometry';
import { carriedKeys, moveCommand, movingShapes } from './gestures';
import { enclosedBy, hitAt, type Hit, type IndexedScene } from './hit';
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
  type Start,
} from './navigation';
import { CanvasRenderer } from './renderer';
import type { ElementShape, NoteShape } from './scene';
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
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; pointer: number; start: Point; camera: Camera }
  | { kind: 'press'; pointer: number; start: Point; world: Point; hit: Hit; additive: boolean }
  | { kind: 'drag'; pointer: number; world: Point; delta: Point }
  | { kind: 'box'; pointer: number; start: Point; additive: boolean }
  | { kind: 'connect'; pointer: number; from: ElementShape; anchor: Point; target?: Hit };

/** How far the pointer moves before a press becomes a drag, in screen pixels. */
const DRAG_THRESHOLD = 4;
/** How close to a line the pointer must be to point at it, in screen pixels. */
const HIT_TOLERANCE = 6;
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
  private waitingForDrop = false;
  private editable = true;
  /**
   * The shape the keys move from: the key of an element's shape or the id of a free shape, last
   * pointed at or reached. An element with several shapes is selected in all of them at once.
   */
  private current: string | undefined;
  /** The element whose relations ] and [ step through, and the relation they last reached. */
  private stepping: { element: Id; relation: Id | undefined } | undefined;
  /** The move Shift with an arrow key sent, until the scene it makes comes back. */
  private nudging: { applied: boolean } | undefined;
  /** The presses made while a move was on its way, each one a move of its own. */
  private waitingNudges: Point[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: ControllerCallbacks,
  ) {
    this.renderer = new CanvasRenderer(host, {
      onFailure: (error) => callbacks.failure(error),
      onCamera: (camera) => callbacks.camera(camera),
    });
    host.addEventListener('pointerdown', this.onPointerDown);
    host.addEventListener('pointermove', this.onPointerMove);
    host.addEventListener('pointerup', this.onPointerUp);
    host.addEventListener('pointercancel', this.onPointerCancel);
    host.addEventListener('pointerleave', this.onPointerLeave);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    host.addEventListener('dblclick', this.onDoubleClick);
    host.addEventListener('keydown', this.onKeyDown);
    host.addEventListener('keyup', this.onKeyUp);
  }

  /** Shows a project's view; `editable` says whether gestures may change the project. */
  update(project: ProjectSnapshot, viewId: Id, indexed: IndexedScene, editable: boolean): void {
    this.project = project;
    this.viewId = viewId;
    this.indexed = indexed;
    this.editable = editable;
    if (this.hovered && !indexed.byKey.has(this.hovered.key)) this.hovered = undefined;
    this.renderer.show(indexed);
    if (this.waitingForDrop) {
      this.waitingForDrop = false;
      this.renderer.endDrag();
    }
    this.refreshMarks();
    if (!editable) this.stopNudging();
    else if (this.nudging?.applied) {
      // The last move came back: the next press waiting moves from where it left the shapes.
      this.nudging = undefined;
      const next = this.waitingNudges.shift();
      if (next) this.sendNudge(next);
    }
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
    this.refreshMarks();
  }

  get camera(): Camera {
    return this.renderer.camera;
  }

  fit(): void {
    this.renderer.fit();
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
    if (!this.indexed) return undefined;
    const hit = hitAt(this.indexed, this.center, 0);
    return hit?.kind === 'shape' ? hit.shape : undefined;
  }

  destroy(): void {
    const { host } = this;
    host.removeEventListener('pointerdown', this.onPointerDown);
    host.removeEventListener('pointermove', this.onPointerMove);
    host.removeEventListener('pointerup', this.onPointerUp);
    host.removeEventListener('pointercancel', this.onPointerCancel);
    host.removeEventListener('pointerleave', this.onPointerLeave);
    host.removeEventListener('wheel', this.onWheel);
    host.removeEventListener('dblclick', this.onDoubleClick);
    host.removeEventListener('keydown', this.onKeyDown);
    host.removeEventListener('keyup', this.onKeyUp);
    this.renderer.destroy();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const indexed = this.indexed;
    if (!indexed) return;
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
    if (event.button !== 0) return;
    const world = screenToWorld(this.camera, screen);
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
    const hit = hitAt(indexed, world, HIT_TOLERANCE / this.camera.scale);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    this.stepping = undefined;
    if (!hit) {
      this.begin(event, { kind: 'box', pointer: event.pointerId, start: world, additive });
      return;
    }
    // The keys move on from what was pointed at.
    if (hit.kind !== 'relation') this.current = keyOf(hit);
    const item = selectableOf(hit);
    if (additive) this.select(toggle(this.selection, item));
    else if (!isSelected(this.selection, item)) this.select(selectionOf([item]));
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
          (gesture.additive && !isSelected(this.selection, selectableOf(gesture.hit)))
        ) {
          return;
        }
        const moving = movingShapes(indexed, this.selection);
        const keys = carriedKeys(indexed, moving);
        this.renderer.startDrag(keys, this.relationsOn(keys));
        const delta = { x: world.x - gesture.world.x, y: world.y - gesture.world.y };
        this.gesture = { kind: 'drag', pointer: gesture.pointer, world: gesture.world, delta };
        this.renderer.dragTo(delta);
        this.hovered = undefined;
        this.refreshMarks();
        return;
      }
      case 'drag': {
        const delta = { x: world.x - gesture.world.x, y: world.y - gesture.world.y };
        this.gesture = { ...gesture, delta };
        this.renderer.dragTo(delta);
        return;
      }
      case 'box':
        this.renderer.setOverlay({ box: rectBetween(gesture.start, world) });
        return;
      case 'connect': {
        const hit = hitAt(indexed, world, HIT_TOLERANCE / this.camera.scale);
        const target =
          hit &&
          !(hit.kind === 'shape' && hit.shape.element === gesture.from.element) &&
          hit.kind !== 'note' &&
          hit.kind !== 'arrow'
            ? hit
            : undefined;
        this.gesture = target ? { ...gesture, target } : { ...gesture, target: undefined };
        this.renderer.setOverlay({
          connect: { from: gesture.anchor, to: world },
          ...(target ? { target: targetRect(target) } : {}),
        });
        return;
      }
      case 'idle': {
        const hit = hitAt(indexed, world, HIT_TOLERANCE / this.camera.scale);
        const shape = hit?.kind === 'shape' ? hit.shape : undefined;
        const handleShape = this.handleShape();
        const handle = handleShape && this.handleOf(handleShape);
        const onHandle =
          this.editable &&
          handle !== undefined &&
          distance(world, handle) <= HANDLE_REACH / this.camera.scale;
        if (!onHandle && shape?.key !== this.hovered?.key) {
          this.hovered = shape;
          this.refreshMarks();
        }
        this.host.style.cursor = onHandle
          ? 'crosshair'
          : this.spaceHeld
            ? 'grab'
            : hit
              ? 'pointer'
              : 'default';
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
        const item = selectableOf(gesture.hit);
        // A click on one of several selected things selects it alone.
        if (!gesture.additive && sizeOf(this.selection) > 1 && isSelected(this.selection, item)) {
          this.select(selectionOf([item]));
        }
        return;
      }
      case 'drag':
        this.drop(gesture.delta);
        return;
      case 'box': {
        const world = screenToWorld(this.camera, this.local(event));
        const box = rectBetween(gesture.start, world);
        this.renderer.setOverlay({});
        if (box.width * this.camera.scale < 2 && box.height * this.camera.scale < 2) {
          if (!gesture.additive) this.select(EMPTY_SELECTION);
          return;
        }
        const { shapes, notes, arrows } = enclosedBy(indexed, box);
        const found = selectionOf([
          ...shapes.map((shape): Selectable => ({ kind: 'element', id: shape.element })),
          ...notes.map((note): Selectable => ({ kind: 'free-shape', id: note.id })),
          ...arrows.map((arrow): Selectable => ({ kind: 'free-shape', id: arrow.id })),
        ]);
        this.select(gesture.additive ? union(this.selection, found) : found);
        return;
      }
      case 'connect': {
        this.renderer.setOverlay({});
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

  private readonly onPointerCancel = (): void => {
    this.cancel();
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
    const hit = hitAt(this.indexed, world, HIT_TOLERANCE / this.camera.scale);
    if (hit?.kind === 'shape') this.callbacks.rename({ kind: 'element', shape: hit.shape });
    else if (hit?.kind === 'note') this.callbacks.rename({ kind: 'note', note: hit.note });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const command = event.ctrlKey || event.metaKey;
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
    // Some keyboards type [ and ] with AltGr, which browsers report as Ctrl and Alt together, and
    // as AltGraph. Otherwise, with Ctrl or ⌘ and with Alt, [ and ] are left to other commands, such
    // as the stacking order.
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
      if (event.key === 'Enter' && this.selectedRelation() !== undefined) this.follow();
      else this.edit();
      return;
    }
    if (event.key === '+' || event.key === '=') this.zoomBy(KEY_ZOOM);
    else if (event.key === '-' || event.key === '_') this.zoomBy(1 / KEY_ZOOM);
    else if (event.key === '0' || (event.key === '!' && event.shiftKey)) this.fit();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === ' ') {
      this.spaceHeld = false;
      if (this.gesture.kind === 'idle') this.host.style.cursor = 'default';
    }
  };

  private begin(event: PointerEvent, gesture: Exclude<Gesture, { kind: 'idle' }>): void {
    this.gesture = gesture;
    this.host.setPointerCapture?.(event.pointerId);
    if (gesture.kind === 'box' || gesture.kind === 'connect') this.hovered = undefined;
    this.refreshMarks();
  }

  /** Sends the move the drag made; the dragged shapes stay drawn until the change comes back. */
  private drop(delta: Point): void {
    const { indexed, project, viewId } = this;
    const command =
      indexed && project && viewId
        ? moveCommand(indexed, project, viewId, this.selection, delta)
        : undefined;
    if (!command) {
      this.renderer.endDrag();
      return;
    }
    this.waitingForDrop = true;
    this.callbacks.command(command).then(
      (applied) => {
        if (!applied && this.waitingForDrop) {
          this.waitingForDrop = false;
          this.renderer.endDrag();
        }
      },
      () => {
        this.waitingForDrop = false;
        this.renderer.endDrag();
      },
    );
  }

  private cancel(): void {
    if (this.gesture.kind === 'drag') this.renderer.endDrag();
    this.gesture = { kind: 'idle' };
    this.renderer.setOverlay({});
    this.refreshMarks();
  }

  private select(selection: Selection): void {
    this.selection = selection;
    this.callbacks.select(selection);
    this.refreshMarks();
  }

  private selectAll(): void {
    const scene = this.indexed?.scene;
    if (!scene) return;
    this.choose(
      selectionOf([
        ...[...new Set(scene.shapes.map((shape) => shape.element))].map((id): Selectable => ({
          kind: 'element',
          id,
        })),
        ...scene.notes.map((note): Selectable => ({ kind: 'free-shape', id: note.id })),
        ...scene.arrows.map((arrow): Selectable => ({ kind: 'free-shape', id: arrow.id })),
      ]),
    );
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
    // Ctrl and ⌘ with an arrow key are left alone, and so are Alt with Left and Right, which go back
    // and forward in the browser's history.
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
   * shape from the top; with one of its relations selected, the one after or before it.
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
        stepping === ends.from || stepping === ends.to
          ? stepping
          : drawn.shapeOf(ends.from)
            ? ends.from
            : ends.to;
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
    const around = drawn.around(element);
    this.stepping = { element, relation: line.relation };
    this.choose(
      selectionOf([{ kind: 'relation', id: line.relation }]),
      describeRelation(project, line.relation, {
        element,
        position: around.indexOf(line) + 1,
        count: around.length,
      }),
    );
    this.revealRect(rectAround(line.route));
  }

  /**
   * Enter on the selected relation: selects its far end, away from the element its relations were
   * being stepped through, or else the end it points to.
   */
  private follow(): void {
    const { indexed, project } = this;
    const id = this.selectedRelation();
    if (!indexed || !project || id === undefined) return;
    const drawn = drawnRelations(indexed.scene, project);
    const relation = drawn.relation(id);
    if (!relation) return;
    const stepping = this.stepping?.element;
    const near = stepping === relation.from || stepping === relation.to ? stepping : undefined;
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

  /** Enter or F2: edits the name of the selected element, or the text of the selected note, in place. */
  private edit(): void {
    if (!this.editable || sizeOf(this.selection) !== 1) return;
    const current = this.currentReachable();
    if (current?.kind === 'shape') this.callbacks.rename({ kind: 'element', shape: current.shape });
    else if (current?.kind === 'note') this.callbacks.rename({ kind: 'note', note: current.note });
  }

  /**
   * Shift with an arrow key: moves the selection a small step, as one undoable move. A press made
   * while the last move is on its way waits for it, so that each one moves from where the last left
   * the shapes; a key held down moves only as fast as the moves come back.
   */
  private nudge(direction: Direction, repeated: boolean): void {
    if (!this.editable) return;
    const step = STEPS[direction];
    if (this.nudging) {
      if (!repeated && this.waitingNudges.length < MAX_WAITING_NUDGES) {
        this.waitingNudges.push(step);
      }
      return;
    }
    this.sendNudge(step);
  }

  private sendNudge(step: Point): void {
    const { indexed, project, viewId } = this;
    const command =
      indexed && project && viewId
        ? moveCommand(indexed, project, viewId, this.selection, step)
        : undefined;
    if (!command) return;
    const nudging = { applied: false };
    this.nudging = nudging;
    this.callbacks.command(command).then(
      (applied) => {
        if (this.nudging !== nudging) return;
        if (applied) nudging.applied = true;
        else this.stopNudging();
      },
      () => {
        if (this.nudging === nudging) this.stopNudging();
      },
    );
  }

  private stopNudging(): void {
    this.nudging = undefined;
    this.waitingNudges = [];
  }

  private revealRect(rect: Rect): void {
    const camera = revealCamera(this.camera, this.renderer.viewport, rect, REVEAL_SCALE);
    if (!camera) return;
    this.renderer.setCamera(camera);
    this.refreshMarks();
  }

  /** The relations drawn from or to anything being carried, and those that end on them. */
  private relationsOn(keys: ReadonlySet<string>): Set<Id> {
    const indexed = this.indexed;
    const project = this.project;
    const hidden = new Set<Id>();
    if (!indexed || !project) return hidden;
    const ends = new Set(
      [...keys]
        .map((key) => indexed.byKey.get(key)?.element)
        .filter((id): id is Id => id !== undefined),
    );
    let grew = true;
    while (grew) {
      grew = false;
      for (const relation of project.model.relations) {
        if (hidden.has(relation.id)) continue;
        if (
          ends.has(relation.from) ||
          ends.has(relation.to) ||
          hidden.has(relation.from) ||
          hidden.has(relation.to)
        ) {
          hidden.add(relation.id);
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

  private refreshMarks(): void {
    this.renderer.setSelection(this.selection, this.hovered?.key);
    if (this.gesture.kind === 'idle') {
      const shape = this.handleShape();
      this.renderer.setOverlay(shape ? { handle: this.handleOf(shape) } : {});
    }
  }

  private local(event: MouseEvent): Point {
    const rect = this.host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
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

function selectableOf(hit: Hit): Selectable {
  switch (hit.kind) {
    case 'shape':
      return { kind: 'element', id: hit.shape.element };
    case 'relation':
      return { kind: 'relation', id: hit.line.relation };
    case 'note':
      return { kind: 'free-shape', id: hit.note.id };
    case 'arrow':
      return { kind: 'free-shape', id: hit.arrow.id };
  }
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

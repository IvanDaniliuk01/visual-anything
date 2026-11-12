/**
 * The read-only page's canvas gestures (ADR 0041): the same renderer as the app's, with reading only.
 * Dragging pans, with a mouse, a pen or one finger; two fingers pinch to zoom and pan; the wheel pans
 * and, with Ctrl or ⌘ or a trackpad's pinch, zooms. A press that does not move selects what is under
 * it, Shift, Ctrl or ⌘ adding to the selection, and selects nothing on empty canvas; the toggle in a
 * container's corner collapses or expands it in this page only. From the keyboard, as in the app, the
 * arrow keys go from shape to shape, Alt with ↑ and ↓ to the container and inside it, ] and [ step
 * through an element's relations, Enter follows one, Escape clears the selection, + and − zoom, 0
 * fits, and Alt with − or + collapses or expands the selected containers. Nothing here changes the
 * project.
 *
 * A page that holds its solids' files turns them as the app does (ADR 0075): T turns the selected
 * shape's solid, dragging over its picture and the arrows turn it, the wheel over it zooms it, and
 * Escape or selecting something else ends it. Use this view, which stores a camera, is the app's.
 */
import type { ProjectSnapshot, ThemeName } from '@visual-anything/core';
import type { Id, SolidDefinition } from '@visual-anything/schema';
import { SolidTurner } from '../canvas/solids/turner';
import type { SolidClient } from '../solids/solid-client';
import type { MediaFiles } from '../canvas/pictures/media';
import { describeRelation, describeSelection, nameOfEnd } from '../canvas/announce';
import {
  panBy,
  revealCamera,
  screenToWorld,
  wheelFactor,
  zoomAt,
  type Camera,
} from '../canvas/camera';
import { collapseActions, type CollapseAction } from '../canvas/collapse';
import { distance, toggleRect, type Point, type Rect } from '../canvas/geometry';
import { hitAt, type Hit, type IndexedScene } from '../canvas/hit';
import { onLeavingMark } from '../canvas/leavingMark';
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
  reachableKey,
} from '../canvas/navigation';
import { CanvasRenderer } from '../canvas/renderer';
import type { ElementShape } from '../canvas/scene';
import { rectAround } from '../canvas/spatial';
import type { Emphasis } from '../editor/emphasis';
import {
  EMPTY_SELECTION,
  isSelected,
  selectionOf,
  toggle,
  type Selectable,
  type Selection,
} from '../editor/selection';
import { t } from '../i18n';
import type { CanvasTheme } from '../theme/themes';
import { leavingTitleOf } from './leaving';

/** What the canvas asks of the page. */
export interface ViewerCallbacks {
  select(selection: Selection): void;
  /** Collapses or expands containers, in this page only. */
  collapse(action: CollapseAction, collapsed: boolean): void;
  camera(camera: Camera): void;
  failure(error: unknown): void;
  /** Says what the keys just selected, or why they selected nothing, for screen readers. */
  announce(message: string): void;
  /** Says that the canvas shows a theme, in the frame that first shows it. */
  themeShown?(theme: ThemeName): void;
  /**
   * Says which shape the pointer rests on, or the keys reached, for its hover card (ADR 0082); none
   * when it leaves, when the keys reach a note or an arrow, on Escape and when the page loses focus.
   */
  hoverShape?(key: string | undefined): void;
}

type Gesture =
  | { kind: 'idle' }
  /** A press that has not moved yet: it selects once released, or pans once it moves. */
  | { kind: 'press'; pointer: number; start: Point; camera: Camera; additive: boolean }
  | { kind: 'pan'; pointer: number; start: Point; camera: Camera }
  /** Two pointers: the camera follows their middle and the distance between them. */
  | { kind: 'pinch'; start: { middle: Point; distance: number }; camera: Camera }
  /** A drag over a turning solid's picture, `width` screen pixels across, which turns it. */
  | { kind: 'turn'; pointer: number; width: number };

/** How far a press moves before it pans, in screen pixels: further for a finger than a mouse. */
const PAN_AFTER = { mouse: 4, touch: 10 };
/** How close to a line the pointer must be to point at it, in screen pixels. */
const HIT_TOLERANCE = 6;
/** How close to a line a finger must be: a fingertip is wider than a pointer. */
const TOUCH_TOLERANCE = 14;
/** How much a key press or a zoom button zooms. */
export const KEY_ZOOM = 1.25;
/** The scale a revealed shape is shown at, at least: large enough to read its name. */
const REVEAL_SCALE = 0.75;

const DIRECTIONS: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const TOWARDS: Record<Direction, string> = {
  left: 'to the left',
  right: 'to the right',
  up: 'above',
  down: 'below',
};

/** The keys that step through the selected element's relations. */
const RELATION_STEPS: Partial<Record<string, 1 | -1>> = { ']': 1, '[': -1, '.': 1, ',': -1 };

/** The keys that collapse (true) or expand (false) the selected containers, with Alt, by their place. */
const COLLAPSE_KEYS: Partial<Record<string, boolean>> = {
  Minus: true,
  NumpadSubtract: true,
  Equal: false,
  NumpadAdd: false,
};

export class ViewerController {
  readonly renderer: CanvasRenderer;
  private indexed: IndexedScene | undefined;
  private project: ProjectSnapshot | undefined;
  private selection: Selection = EMPTY_SELECTION;
  private gesture: Gesture = { kind: 'idle' };
  /** Where each pointer pressed on the canvas is now, on screen. */
  private readonly pointers = new Map<number, Point>();
  private hovered: ElementShape | undefined;
  /** The shape last said to be hovered, for its hover card. */
  private hoverSaid: string | undefined;
  /** The shape the keys move on from, by its key or a free shape's id. */
  private current: string | undefined;
  /** The element whose relations ] and [ step through, and the relation they are on. */
  private stepping: { element: Id; relation: Id | undefined } | undefined;

  /** What draws the page's solids (ADR 0075); none in a page without solids. */
  private readonly solids: SolidClient | undefined;
  private solidsFrom: ProjectSnapshot['packages'] | undefined;
  private solidDefinitions = new Map<Id, SolidDefinition>();
  /** Turning the selected shape's solid live, in a page that holds the solid worker (ADR 0075). */
  private readonly turner: SolidTurner;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: ViewerCallbacks,
    options: { theme?: CanvasTheme; solids?: SolidClient; media?: MediaFiles } = {},
  ) {
    this.solids = options.solids;
    this.renderer = new CanvasRenderer(
      host,
      {
        onFailure: (error) => callbacks.failure(error),
        onCamera: (camera) => callbacks.camera(camera),
        onThemeShown: (theme) => callbacks.themeShown?.(theme),
      },
      {
        ...(options.theme ? { theme: options.theme } : {}),
        ...(options.solids ? { solids: options.solids } : {}),
        ...(options.media ? { media: options.media } : {}),
        // Under reduced motion a GIF shows its first frame, and plays while hovered (ADR 0098).
        reducedMotion: () =>
          host.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches === true,
      },
    );
    const view = host.ownerDocument.defaultView;
    this.turner = new SolidTurner({
      client: () => this.solids,
      definition: (id) => this.solidDefinitions.get(id),
      project: () => this.project,
      scale: () => this.camera.scale,
      resolution: () => view?.devicePixelRatio ?? 1,
      show: (turning) => this.renderer.setTurning(turning),
      announce: (text) => callbacks.announce(text),
      // A page stores nothing: Use this view is the app's.
      command: () => Promise.resolve(false),
      reducedMotion: () => view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    });
    host.addEventListener('pointerdown', this.onPointerDown);
    host.addEventListener('pointermove', this.onPointerMove);
    host.addEventListener('pointerup', this.onPointerUp);
    host.addEventListener('pointercancel', this.onPointerCancel);
    host.addEventListener('pointerleave', this.onPointerLeave);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    host.addEventListener('keydown', this.onKeyDown);
    host.addEventListener('blur', this.onBlur);
  }

  /** Shows a project's view. */
  update(project: ProjectSnapshot, indexed: IndexedScene): void {
    this.project = project;
    this.indexed = indexed;
    this.followSolids(project);
    this.turner.follow(indexed.byKey);
    this.hovered = this.hovered && indexed.byKey.get(this.hovered.key);
    this.renderer.show(indexed);
    this.refreshMarks();
  }

  /** The named parts of the solids the project's packages define, for the parts' states (ADR 0075). */
  private followSolids(project: ProjectSnapshot): void {
    if (!this.solids || project.packages === this.solidsFrom) return;
    this.solidsFrom = project.packages;
    const definitions = new Map<Id, SolidDefinition>();
    for (const file of project.packages) {
      for (const solid of file.solids ?? [])
        if (!definitions.has(solid.id)) definitions.set(solid.id, solid);
    }
    this.solidDefinitions = definitions;
    this.renderer.setSolids(this.solids, (id) => definitions.get(id)?.parts);
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
    this.turner.selectionChanged(selection.elements);
    this.refreshMarks();
  }

  /** Draws the emphasis: pointing then goes past what it hides. */
  setEmphasis(emphasis: Emphasis): void {
    this.renderer.setEmphasis(emphasis);
    if (this.hovered && this.renderer.hiddenByEmphasis.has(this.hovered.key)) {
      this.hovered = undefined;
      this.refreshMarks();
    }
  }

  get camera(): Camera {
    return this.renderer.camera;
  }

  fit(): void {
    this.renderer.fit();
    this.refreshMarks();
  }

  /** Zooms around the middle of the canvas. */
  zoomBy(factor: number): void {
    const { width, height } = this.renderer.viewport;
    this.renderer.setCamera(zoomAt(this.camera, { x: width / 2, y: height / 2 }, factor));
    this.refreshMarks();
  }

  /**
   * Brings a shape into sight: an element shape by its key, a free shape by its id, or a relation by
   * its id; the keys move on from it.
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

  /** Stops listening and releases the canvas. */
  destroy(): void {
    const { host } = this;
    host.removeEventListener('pointerdown', this.onPointerDown);
    host.removeEventListener('pointermove', this.onPointerMove);
    host.removeEventListener('pointerup', this.onPointerUp);
    host.removeEventListener('pointercancel', this.onPointerCancel);
    host.removeEventListener('pointerleave', this.onPointerLeave);
    host.removeEventListener('wheel', this.onWheel);
    host.removeEventListener('keydown', this.onKeyDown);
    host.removeEventListener('blur', this.onBlur);
    this.gesture = { kind: 'idle' };
    this.pointers.clear();
    this.turner.end(false);
    this.renderer.destroy();
  }

  private hit(world: Point, tolerance: number): Hit | undefined {
    if (!this.indexed) return undefined;
    return hitAt(
      this.indexed,
      world,
      tolerance,
      (shape) => this.renderer.showsOutline(shape.key),
      this.renderer.hiddenByEmphasis,
    );
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.indexed) return;
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    const screen = this.local(event);
    this.pointers.set(event.pointerId, screen);
    this.host.setPointerCapture?.(event.pointerId);
    this.host.focus({ preventScroll: true });
    if (this.pointers.size >= 2) {
      // A second finger turns whatever the first was doing into a pinch.
      this.gesture = { kind: 'pinch', start: this.spread(), camera: this.camera };
      return;
    }
    // A press on a turning solid's picture turns it (ADR 0075).
    const turned = this.turner.turned;
    const turnedShape = turned && this.indexed.byKey.get(turned.key);
    if (
      event.button === 0 &&
      turnedShape &&
      this.turner.press(screenToWorld(this.camera, screen), screen, turnedShape)
    ) {
      this.gesture = {
        kind: 'turn',
        pointer: event.pointerId,
        width: (turnedShape.solid?.rect.width ?? 1) * this.camera.scale,
      };
      return;
    }
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    this.gesture =
      event.button === 1
        ? { kind: 'pan', pointer: event.pointerId, start: screen, camera: this.camera }
        : { kind: 'press', pointer: event.pointerId, start: screen, camera: this.camera, additive };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.indexed) return;
    const screen = this.local(event);
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, screen);
    const gesture = this.gesture;
    switch (gesture.kind) {
      case 'idle':
        if (event.pointerType === 'mouse') this.hover(screen);
        return;
      case 'press': {
        if (gesture.pointer !== event.pointerId) return;
        const reach = event.pointerType === 'mouse' ? PAN_AFTER.mouse : PAN_AFTER.touch;
        if (distance(screen, gesture.start) < reach) return;
        this.gesture = { ...gesture, kind: 'pan' };
        this.host.style.cursor = 'grabbing';
        this.panTo(gesture.camera, gesture.start, screen);
        return;
      }
      case 'pan':
        if (gesture.pointer === event.pointerId) this.panTo(gesture.camera, gesture.start, screen);
        return;
      case 'turn':
        if (gesture.pointer === event.pointerId) this.turner.move(screen, gesture.width);
        return;
      case 'pinch': {
        const now = this.spread();
        const moved = panBy(
          gesture.camera,
          now.middle.x - gesture.start.middle.x,
          now.middle.y - gesture.start.middle.y,
        );
        const factor = gesture.start.distance > 0 ? now.distance / gesture.start.distance : 1;
        this.renderer.setCamera(zoomAt(moved, now.middle, factor));
        this.refreshMarks();
        return;
      }
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    this.pointers.delete(event.pointerId);
    this.host.releasePointerCapture?.(event.pointerId);
    if (gesture.kind === 'pinch') {
      // The finger left on the canvas pans from where it is, so that the camera does not jump.
      const [left] = [...this.pointers];
      this.gesture = left
        ? { kind: 'pan', pointer: left[0], start: left[1], camera: this.camera }
        : { kind: 'idle' };
      return;
    }
    if (gesture.kind === 'idle' || gesture.pointer !== event.pointerId) return;
    this.gesture = { kind: 'idle' };
    this.host.style.cursor = '';
    if (gesture.kind === 'turn') this.turner.release();
    if (gesture.kind === 'press') this.click(gesture.start, gesture.additive, event.pointerType);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.gesture.kind === 'turn') this.turner.release();
    this.gesture = { kind: 'idle' };
    this.host.style.cursor = '';
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && this.gesture.kind === 'idle' && this.hovered) {
      this.hovered = undefined;
      this.refreshMarks();
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    // Over a turning solid's picture, the wheel zooms the solid rather than the canvas (ADR 0075).
    const turned = this.turner.turned;
    if (
      turned &&
      this.turner.wheel(
        screenToWorld(this.camera, this.local(event)),
        event.deltaY * scale,
        this.indexed?.byKey.get(turned.key),
      )
    ) {
      return;
    }
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

  /** The page lost the focus: a hover card the keys opened goes (ADR 0082). */
  private readonly onBlur = (): void => {
    this.callbacks.hoverShape?.(undefined);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // A turning solid takes its keys first (ADR 0075): the arrows, + and −, 0 and Escape.
    if (this.gesture.kind === 'idle' && this.turner.key(event)) return;
    const command = event.ctrlKey || event.metaKey;
    // T turns the selected shape's solid.
    if ((event.key === 't' || event.key === 'T') && !command && !event.altKey && !event.shiftKey) {
      const shape = this.selectedShape();
      if (shape && this.turner.canTurn(shape)) {
        event.preventDefault();
        this.turner.start(shape);
        return;
      }
    }
    if (event.key === 'Escape') {
      this.callbacks.hoverShape?.(undefined);
      this.choose(EMPTY_SELECTION);
      return;
    }
    if (command && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
      return;
    }
    const direction = DIRECTIONS[event.key];
    if (direction) {
      if (command || (event.altKey && (direction === 'left' || direction === 'right'))) return;
      event.preventDefault();
      if (event.altKey) {
        if (direction === 'up') this.selectContainer();
        else this.selectInside();
      } else this.go(direction);
      return;
    }
    const folding = !command && event.altKey ? COLLAPSE_KEYS[event.code] : undefined;
    if (folding !== undefined) {
      event.preventDefault();
      this.collapseSelection(folding);
      return;
    }
    const altGraph = event.getModifierState('AltGraph');
    if (command && !altGraph) return;
    const step = RELATION_STEPS[event.key];
    if (step !== undefined && (altGraph || !event.altKey)) {
      event.preventDefault();
      this.stepRelations(step);
      return;
    }
    if (event.key === 'Enter' && !event.altKey) {
      event.preventDefault();
      this.follow();
      return;
    }
    if (event.key === '+' || event.key === '=') this.zoomBy(KEY_ZOOM);
    else if (event.key === '-' || event.key === '_') this.zoomBy(1 / KEY_ZOOM);
    else if (event.key === '0' || (event.key === '!' && event.shiftKey)) this.fit();
  };

  /** The shape of the one element selected, the one the keys are on when it has several. */
  private selectedShape(): ElementShape | undefined {
    const indexed = this.indexed;
    const [only, ...more] = [...this.selection.elements];
    if (!indexed || only === undefined || more.length > 0) return undefined;
    const current = this.current === undefined ? undefined : indexed.byKey.get(this.current);
    if (current?.element === only) return current;
    return indexed.scene.shapes.find((shape) => shape.element === only);
  }

  /** A press that did not move: selects what is under it, or collapses a container by its toggle. */
  private click(screen: Point, additive: boolean, pointerType: string): void {
    const world = screenToWorld(this.camera, screen);
    const tolerance = pointerType === 'mouse' ? HIT_TOLERANCE : TOUCH_TOLERANCE;
    const hit = this.hit(world, tolerance / this.camera.scale);
    this.stepping = undefined;
    if (!hit) {
      if (!additive) this.select(EMPTY_SELECTION);
      return;
    }
    if (hit.kind === 'shape' && !additive && this.onToggle(hit.shape, world, pointerType)) {
      this.toggleCollapse(hit.shape);
      return;
    }
    // A click on a video whose file the page holds plays it, or stops it (ADR 0098, stage 2).
    if (hit.kind === 'picture' && hit.picture.video && !additive) {
      this.renderer.toggleVideo(hit.picture.id);
    }
    if (hit.kind !== 'relation') this.current = keyOf(hit);
    const items = selectablesOf(hit);
    this.select(additive ? toggleAll(this.selection, items) : selectionOf(items));
  }

  private hover(screen: Point): void {
    const world = screenToWorld(this.camera, screen);
    const hit = this.hit(world, HIT_TOLERANCE / this.camera.scale);
    const shape = hit?.kind === 'shape' ? hit.shape : undefined;
    // The toggle says what it does, and the mark of the relations that leave the view says which.
    const title =
      shape && this.onToggle(shape, world, 'mouse')
        ? toggleTitle(shape)
        : shape?.leaving && this.project && onLeavingMark(shape, world)
          ? leavingTitleOf(this.project, shape.leaving)
          : '';
    if (this.host.title !== title) this.host.title = title;
    if (shape?.key === this.hovered?.key) return;
    this.hovered = shape;
    this.refreshMarks();
  }

  private panTo(camera: Camera, start: Point, screen: Point): void {
    this.renderer.setCamera(panBy(camera, screen.x - start.x, screen.y - start.y));
    this.refreshMarks();
  }

  /** The middle of the first two pointers, and how far apart they are. */
  private spread(): { middle: Point; distance: number } {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return { middle: a ?? { x: 0, y: 0 }, distance: 0 };
    return { middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: distance(a, b) };
  }

  /** Whether a point is on the toggle in a container's corner, with some room for a finger. */
  private onToggle(shape: ElementShape, world: Point, pointerType: string): boolean {
    if (!this.renderer.showsOutline(shape.key)) return false;
    const toggled = toggleRect(shape);
    if (!toggled) return false;
    const slack = (pointerType === 'mouse' ? 2 : 8) / this.camera.scale;
    return (
      world.x >= toggled.x - slack &&
      world.x <= toggled.x + toggled.width + slack &&
      world.y >= toggled.y - slack &&
      world.y <= toggled.y + toggled.height + slack
    );
  }

  private toggleCollapse(shape: ElementShape): void {
    const collapsed = shape.collapsed === undefined;
    this.callbacks.collapse(
      {
        elements: [shape.element],
        label: `${collapsed ? 'Collapse' : 'Expand'} "${shape.name}"`,
      },
      collapsed,
    );
  }

  private collapseSelection(collapsed: boolean): void {
    const { indexed, project } = this;
    if (!indexed || !project) return;
    const actions = collapseActions(indexed, project, this.selection);
    const action = collapsed ? actions.collapse : actions.expand;
    if (action) this.callbacks.collapse(action, collapsed);
    else {
      this.announce(
        collapsed
          ? t('Select an expanded container to collapse it.')
          : t('Select a collapsed container to expand it.'),
      );
    }
  }

  private select(selection: Selection): void {
    this.selection = selection;
    this.callbacks.select(selection);
    this.refreshMarks();
  }

  private choose(selection: Selection, message?: string): void {
    this.select(selection);
    const { indexed, project } = this;
    if (indexed && project) {
      this.announce(message ?? describeSelection(indexed, project, selection, this.current));
    }
  }

  private announce(message: string): void {
    this.callbacks.announce(message);
  }

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

  private go(direction: Direction): void {
    const indexed = this.indexed;
    if (!indexed) return;
    const start = this.startOfMove();
    const { width, height } = this.renderer.viewport;
    const reached = start
      ? nearestInDirection(indexed, start, direction)
      : nearestTo(indexed, screenToWorld(this.camera, { x: width / 2, y: height / 2 }));
    if (reached) this.reach(reached);
    else if (start) this.announce(t('No shape {towards}.', { towards: t(TOWARDS[direction]) }));
  }

  private selectContainer(): void {
    const indexed = this.indexed;
    const current = this.currentReachable();
    if (!indexed || current?.kind !== 'shape') return;
    const container = containerOf(indexed, current.shape);
    if (container) this.reach({ kind: 'shape', shape: container });
    else this.announce(t('{name} sits directly in World.', { name: current.shape.name }));
  }

  private selectInside(): void {
    const indexed = this.indexed;
    const current = this.currentReachable();
    if (!indexed || current?.kind !== 'shape') return;
    const inside = firstInside(indexed, current.shape);
    if (inside) this.reach({ kind: 'shape', shape: inside });
    else this.announce(t('{name} holds no shapes.', { name: current.shape.name }));
  }

  private reach(reached: Reachable): void {
    this.stepping = undefined;
    if (reached.kind === 'shape') {
      this.current = reached.shape.key;
      this.choose(selectionOf([{ kind: 'element', id: reached.shape.element }]));
      // Its hover card, when the canvas cut its text, as the editor shows it (ADR 0082).
      this.callbacks.hoverShape?.(reached.shape.key);
    } else {
      const id = reachableKey(reached);
      this.current = id;
      this.choose(selectionOf([{ kind: 'free-shape', id }]));
      this.callbacks.hoverShape?.(undefined);
    }
    this.revealRect(rectOf(reached));
  }

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

  private selectedRelation(): Id | undefined {
    const { elements, relations, freeShapes } = this.selection;
    if (relations.size !== 1 || elements.size > 0 || freeShapes.size > 0) return undefined;
    const [relation] = relations;
    return relation;
  }

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
      this.announce(
        t('{name} has no relations in this view.', { name: nameOfEnd(project, element) }),
      );
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

  private revealRect(rect: Rect): void {
    const camera = revealCamera(this.camera, this.renderer.viewport, rect, REVEAL_SCALE);
    if (!camera) return;
    this.renderer.setCamera(camera);
    this.refreshMarks();
  }

  private refreshMarks(): void {
    this.renderer.setSelection(this.selection, this.hovered?.key);
    const hovered = this.gesture.kind === 'idle' ? this.hovered?.key : undefined;
    if (hovered !== this.hoverSaid) {
      this.hoverSaid = hovered;
      this.callbacks.hoverShape?.(hovered);
    }
  }

  private local(event: MouseEvent): Point {
    const rect = this.host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}

function stopOf(stops: readonly RelationStop[], relation: Id): RelationStop | undefined {
  return stops.find((stop) => stop.line.relation === relation);
}

function keyOf(hit: Exclude<Hit, { kind: 'relation' }>): string {
  switch (hit.kind) {
    case 'shape':
      return hit.shape.key;
    case 'note':
      return hit.note.id;
    case 'arrow':
      return hit.arrow.id;
    case 'picture':
      return hit.picture.id;
  }
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
    case 'picture':
      return [{ kind: 'free-shape', id: hit.picture.id }];
  }
}

/** The selection without these when it held them all, and with them all otherwise. */
function toggleAll(selection: Selection, items: readonly Selectable[]): Selection {
  const holding = items.every((item) => isSelected(selection, item));
  return items.reduce(
    (next, item) => (isSelected(next, item) === holding ? toggle(next, item) : next),
    selection,
  );
}

/** What a container's toggle says it does, when the pointer rests on it. */
function toggleTitle(shape: ElementShape): string {
  return shape.collapsed === undefined
    ? t('Collapse "{name}" (Alt+−)', { name: shape.name })
    : t('Expand "{name}" (Alt++)', { name: shape.name });
}

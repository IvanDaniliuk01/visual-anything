/**
 * Resizing shapes and the alignment guides on the canvas (ADR 0074).
 *
 * - A shape selected alone that can take a size, or a note, shows eight handles: corners resize both
 *   ways, the middles of the sides one way, and a shape that draws rows only its width, from its left
 *   and right sides. Shift keeps its proportions, or lets free geometry that keeps them change them;
 *   Alt resizes from its middle; Escape cancels. While the grid snaps, the sides it moves land on the
 *   grid of its container.
 * - While a shape is dragged or resized, a guide shows where its edges or its middle line up with
 *   those of the shapes in the same container, and it snaps to them within 6 pixels of the screen,
 *   before the grid does; Ctrl (⌘ on a Mac) turns them off, and so does Alt, which places a moved shape
 *   freely.
 *
 * The controller hands it its pointer and key events before its own; what it shows is drawn in the
 * marks layer, and letting go sends one command, whose ghost shows until the change comes back.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import { IS_APPLE } from '../live/platform';
import {
  ALL_EDGES,
  guideCandidates,
  guideLines,
  guideShift,
  guideTargets,
  snapToGuides,
  type GuideLine,
} from './align';
import { visibleRect, type Camera } from './camera';
import { boundsOf, distance, type Point, type Rect, type Size } from './geometry';
import { GRID_STEP, snap } from './grid';
import type { Hit, IndexedScene, Skipped } from './hit';
import { outlineIn } from './outlines';
import {
  handlePoint,
  handlesFor,
  holdsOf,
  keepsProportions,
  movingEdges,
  resizeCommand,
  resizeNoteCommand,
  resizedRect,
  sizeTakenBy,
  type HandleName,
  type SizeTaken,
} from './resize';
import { viewIn } from './routing/commands';
import { picturesOf, type ElementShape, type NoteShape, type PictureShape } from './scene';
import { HANDLE_SIZE, type ShapeEditOverlay } from './shapeEditMarks';
import { carrierOf } from './snapping';
import { rectAround } from './spatial';

/** How near a handle, in screen pixels, the pointer grabs it. */
export const RESIZE_REACH = 6;
/** How near, in screen pixels, an edge or a middle snaps to a guide. */
export const GUIDE_REACH = 6;
/** How far the pointer moves, in screen pixels, before a press on a handle resizes. */
const RESIZE_THRESHOLD = 2;
/** Below this many pixels on screen, a shape shows no handles; below three handles, no middle ones on that side. */
const SMALLEST_HANDLED = 8;
const SIDE_HANDLES_FROM = 3 * HANDLE_SIZE;

/** What the shape editor asks of the canvas. */
export interface ShapeEditorHost {
  readonly renderer: {
    setShapeEditOverlay(overlay: ShapeEditOverlay | undefined): void;
    readonly hiddenByEmphasis: Skipped;
    readonly viewport: Size;
  };
  /** What the canvas shows now; undefined before a scene shows. */
  state():
    | {
        indexed: IndexedScene;
        project: ProjectSnapshot;
        viewId: Id;
        selection: Selection;
        editable: boolean;
        /** The shape the keys act on, by its key: of the element selected, the copy resized. */
        current: string | undefined;
        /** Whether shapes are being dragged, which hides the handles. */
        moving: boolean;
      }
    | undefined;
  camera(): Camera;
  /** Whether hand moves snap to the grid now: while it shows, with snapping on (A3). */
  snapping(): boolean;
  /** Sends a command; resolves to whether the local program applied it. */
  command(command: Command): Promise<boolean>;
  announce(text: string): void;
  /** Writes the caption beside the pointer, at a point on screen, or clears it. */
  caption(caption: { text: string } | undefined, at?: Point): void;
}

/** The modifier keys a gesture reads, as a pointer or key event gives them. */
export interface Modifiers {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Whether a gesture's modifiers turn the guides off: Ctrl, or ⌘ on Apple platforms. */
export function guidesOff(modifiers: Pick<Modifiers, 'ctrlKey' | 'metaKey'>): boolean {
  return IS_APPLE ? modifiers.metaKey : modifiers.ctrlKey;
}

/** What can be resized: an element's shape, a note, or a picture (ADR 0098). */
type Target =
  | { kind: 'shape'; shape: ElementShape; rect: Rect; taken: SizeTaken; key: string }
  | { kind: 'note'; note: NoteShape; rect: Rect; taken: 'both'; key: string }
  | { kind: 'picture'; picture: PictureShape; rect: Rect; taken: 'both'; key: string };

interface ResizeDrag {
  target: Target;
  handle: HandleName;
  /** Where the press was, in the scene and on screen. */
  start: Point;
  startScreen: Point;
  moved: boolean;
  modifiers: Modifiers;
  /** Where the pointer is now, in the scene and on screen. */
  world: Point;
  screen: Point;
  /** Where the shape would be now. */
  result: Rect;
  /** The shapes beside it, on screen when the press came, which guide it, and their lines. */
  candidates: Rect[];
  xs: number[];
  ys: number[];
  /** What a container must hold. */
  holds?: Rect;
  /** Where the grid of its container starts. */
  origin: Point;
}

/** What a drag of shapes is guided by: what moves, as a rectangle, and what never guides it. */
export interface MoveGuide {
  rect: Rect;
  exclude: ReadonlySet<string>;
}

export class ShapeEditor {
  private drag: ResizeDrag | undefined;
  /** A resize sent, shown as it was let go until the change comes back. */
  private pending: { project: ProjectSnapshot; overlay: ShapeEditOverlay } | undefined;
  /** The guides of the shapes being dragged. */
  private moveLines: readonly GuideLine[] | undefined;
  private shown: ShapeEditOverlay | undefined;

  constructor(private readonly host: ShapeEditorHost) {}

  /** Whether a handle is being dragged. */
  get resizing(): boolean {
    return this.drag !== undefined;
  }

  /**
   * What can be resized now: the only thing selected is an element whose shape takes a size, the one
   * the keys act on, or the first, which the emphasis does not hide; or a note.
   */
  private target(): Target | undefined {
    const state = this.host.state();
    if (!state?.editable) return undefined;
    const { selection, indexed } = state;
    const hidden = this.host.renderer.hiddenByEmphasis;
    if (selection.relations.size > 0) return undefined;
    if (selection.elements.size === 1 && selection.freeShapes.size === 0) {
      const [element] = selection.elements;
      const shapes = element === undefined ? [] : (indexed.byElement.get(element) ?? []);
      const current = shapes.find((shape) => shape.key === state.current) ?? shapes[0];
      if (!current || hidden.has(current.key)) return undefined;
      // A turned shape shows no handles: the Arrange tab sizes it in its own axes (ADR 0088).
      const taken = current.rotation === undefined ? sizeTakenBy(current) : undefined;
      return taken
        ? { kind: 'shape', shape: current, rect: current.rect, taken, key: current.key }
        : undefined;
    }
    if (selection.freeShapes.size === 1 && selection.elements.size === 0) {
      const [id] = selection.freeShapes;
      const picture = picturesOf(indexed.scene).find((each) => each.id === id);
      if (picture) {
        if (hidden.has(picture.id)) return undefined;
        return { kind: 'picture', picture, rect: picture.rect, taken: 'both', key: picture.id };
      }
      const note = indexed.scene.notes.find((each) => each.id === id);
      if (!note || hidden.has(note.id)) return undefined;
      return { kind: 'note', note, rect: note.rect, taken: 'both', key: note.id };
    }
    return undefined;
  }

  /** The handles a target shows at the scale shown: none while it is too small on screen to point at. */
  private handlesOf(rect: Rect, taken: SizeTaken): HandleName[] {
    const scale = this.host.camera().scale;
    const width = rect.width * scale;
    const height = rect.height * scale;
    if (width < SMALLEST_HANDLED || height < SMALLEST_HANDLED) return [];
    return handlesFor(taken).filter((name) => {
      if ((name === 'n' || name === 's') && width < SIDE_HANDLES_FROM) return false;
      if ((name === 'e' || name === 'w') && height < SIDE_HANDLES_FROM && taken === 'both') {
        return false;
      }
      return true;
    });
  }

  /** The scene, the project, the selection or the camera changed: draws what shows now. */
  refresh(): void {
    const state = this.host.state();
    if (this.pending && state?.project !== this.pending.project) this.pending = undefined;
    if (this.drag) return;
    if (this.pending) {
      this.show(this.pending.overlay);
      return;
    }
    if (this.moveLines) {
      this.show(this.moveLines.length > 0 ? { guides: this.moveLines } : undefined);
      return;
    }
    const target = state && !state.moving ? this.target() : undefined;
    const names = target ? this.handlesOf(target.rect, target.taken) : [];
    this.show(target && names.length > 0 ? { handles: { rect: target.rect, names } } : undefined);
  }

  private show(overlay: ShapeEditOverlay | undefined): void {
    if (overlay === this.shown || sameHandles(overlay, this.shown)) return;
    this.shown = overlay;
    this.host.renderer.setShapeEditOverlay(overlay);
  }

  /** The handle at a point of the scene, if a target shows one there. */
  private handleAt(world: Point): { target: Target; handle: HandleName } | undefined {
    const state = this.host.state();
    if (!state || state.moving) return undefined;
    const target = this.target();
    if (!target) return undefined;
    const reach = RESIZE_REACH / this.host.camera().scale;
    // The corners first, which the middles of short sides come near.
    const names = this.handlesOf(target.rect, target.taken);
    const corners = names.filter((name) => name.length === 2);
    for (const handle of [...corners, ...names.filter((name) => name.length === 1)]) {
      const at = handlePoint(target.rect, handle);
      if (Math.abs(world.x - at.x) <= reach && Math.abs(world.y - at.y) <= reach) {
        return { target, handle };
      }
    }
    return undefined;
  }

  /** The cursor over a point, when it is over a handle. */
  cursorAt(world: Point): string | undefined {
    if (this.drag) return undefined;
    const found = this.handleAt(world);
    if (!found) return undefined;
    switch (found.handle) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
      default:
        return 'ns-resize';
    }
  }

  /** A press of the main button: on a handle, it starts a resize and says so. */
  press(world: Point, screen: Point, modifiers: Modifiers): boolean {
    const found = this.handleAt(world);
    const state = this.host.state();
    if (!found || !state) return false;
    const { target, handle } = found;
    const { indexed } = state;
    const view = visibleRect(this.host.camera(), this.host.renderer.viewport);
    const frame =
      target.kind === 'shape' && target.shape.containerShape !== undefined
        ? indexed.byKey.get(target.shape.containerShape)
        : undefined;
    const candidates = guideCandidates(
      indexed,
      target.kind === 'shape' ? (target.shape.containerShape ?? '') : '',
      view,
      new Set([target.key]),
      view,
      0,
    );
    const holds = target.kind === 'shape' ? holdsOf(indexed, target.shape) : undefined;
    this.drag = {
      target,
      handle,
      start: world,
      startScreen: screen,
      moved: false,
      modifiers,
      world,
      screen,
      result: target.rect,
      candidates,
      xs: guideTargets(candidates, 'x'),
      ys: guideTargets(candidates, 'y'),
      ...(holds ? { holds } : {}),
      origin: frame ? { x: frame.rect.x, y: frame.rect.y } : { x: 0, y: 0 },
    };
    return true;
  }

  /** The pointer moved while a resize is under way. */
  move(world: Point, screen: Point, modifiers: Modifiers): void {
    const drag = this.drag;
    if (!drag) return;
    drag.world = world;
    drag.screen = screen;
    drag.modifiers = modifiers;
    if (!drag.moved && distance(screen, drag.startScreen) < RESIZE_THRESHOLD) return;
    drag.moved = true;
    this.resize(drag);
  }

  /**
   * A key pressed or let go while a resize is under way: Shift, Alt, Ctrl and ⌘ change it at once.
   * Says whether it took the key.
   */
  keyChange(event: KeyboardEvent): boolean {
    const drag = this.drag;
    if (!drag || !['Shift', 'Alt', 'Control', 'Meta'].includes(event.key)) return false;
    // Kept from the browser, which would show its menu bar on Alt, as Firefox on Windows does.
    if (event.key === 'Alt') event.preventDefault();
    drag.modifiers = {
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
    if (drag.moved) this.resize(drag);
    return true;
  }

  /** Works out where the shape would be, and shows it with its guides and its size beside the pointer. */
  private resize(drag: ResizeDrag): void {
    const { target, handle, modifiers } = drag;
    const scale = this.host.camera().scale;
    const delta = { x: drag.world.x - drag.start.x, y: drag.world.y - drag.start.y };
    // A picture keeps its proportions, and Shift frees them (ADR 0098); a link card keeps none.
    const keeps =
      (target.kind === 'picture' && target.picture.link === undefined) ||
      (target.kind === 'shape' && keepsProportions(target.shape));
    const proportional = target.taken === 'width' ? false : keeps !== modifiers.shiftKey;
    const fromMiddle = modifiers.altKey;
    const guided = !guidesOff(modifiers);
    const tolerance = GUIDE_REACH / scale;
    const grid = this.host.snapping();
    const snapping = (targets: readonly number[], origin: number) => (value: number) => {
      const shift = guided ? guideShift([value], targets, tolerance) : undefined;
      if (shift !== undefined) return value + shift;
      return grid ? origin + snap(value - origin, GRID_STEP) : value;
    };
    drag.result = resizedRect(target.rect, handle, delta, {
      proportional,
      fromMiddle,
      ...(drag.holds ? { holds: drag.holds } : {}),
      snap: { x: snapping(drag.xs, drag.origin.x), y: snapping(drag.ys, drag.origin.y) },
    });
    const guides = guided
      ? guideLines(drag.result, drag.candidates, movingEdges(handle, fromMiddle))
      : [];
    const names = handlesFor(target.taken);
    this.show({
      ...ghostOf(target, drag.result),
      guides,
      handles: { rect: drag.result, names },
    });
    this.host.caption({ text: `${drag.result.width} × ${drag.result.height}` }, drag.screen);
  }

  /** The pointer was let go: sends the resize, if it changed anything. */
  release(): void {
    const drag = this.drag;
    this.drag = undefined;
    this.host.caption(undefined);
    const state = this.host.state();
    if (!drag || !state || !drag.moved) {
      this.refresh();
      return;
    }
    const { target, result } = drag;
    const view = viewIn(state.project, state.viewId);
    const command =
      target.kind === 'shape'
        ? resizeCommand(state.indexed, state.project, state.viewId, target.shape, result)
        : view
          ? resizeNoteCommand(
              view,
              target.kind === 'note' ? target.note.id : target.picture.id,
              result,
            )
          : undefined;
    if (!command) {
      this.refresh();
      return;
    }
    const overlay: ShapeEditOverlay = ghostOf(target, result);
    this.pending = { project: state.project, overlay };
    this.show(overlay);
    const label = command.type === 'batch' ? command.label : undefined;
    this.host.command(command).then(
      (done) => {
        if (!done) this.forget(overlay);
        else if (label !== undefined) this.host.announce(`${t.message(label)}.`);
      },
      () => this.forget(overlay),
    );
  }

  /** A resize that was refused or never answered: its ghost goes. */
  private forget(overlay: ShapeEditOverlay): void {
    if (this.pending?.overlay !== overlay) return;
    this.pending = undefined;
    this.refresh();
  }

  /** Stops the resize under way, leaving the shape as it was. */
  cancel(): void {
    if (!this.drag) return;
    this.drag = undefined;
    this.host.caption(undefined);
    this.refresh();
  }

  // ——— Guides for shapes being dragged ———

  /**
   * What guides a drag of the selection that pressed `pressed`: the moving shapes that sit beside the
   * one that carries it, with the notes and arrows selected when that is World, as one rectangle; and
   * what never guides it, everything that moves.
   */
  moveGuideOf(
    indexed: IndexedScene,
    selection: Selection,
    pressed: Hit,
    moving: readonly ElementShape[],
    carried: ReadonlySet<string>,
  ): MoveGuide | undefined {
    const anchor =
      pressed.kind === 'shape'
        ? (carrierOf(moving, pressed.shape.key) ?? pressed.shape)
        : undefined;
    const frame = anchor?.containerShape;
    const rects = moving
      .filter((shape) => shape.containerShape === frame)
      .map((shape) => shape.rect);
    if (frame === undefined) {
      const { notes, arrows } = indexed.scene;
      for (const note of notes) if (selection.freeShapes.has(note.id)) rects.push(note.rect);
      for (const picture of picturesOf(indexed.scene)) {
        if (selection.freeShapes.has(picture.id)) rects.push(picture.rect);
      }
      for (const arrow of arrows) {
        if (selection.freeShapes.has(arrow.id)) rects.push(rectAround([arrow.from, arrow.to]));
      }
    }
    const rect = boundsOf(rects);
    if (!rect) return undefined;
    return { rect, exclude: new Set([...carried, ...selection.freeShapes]) };
  }

  /**
   * How far dragged shapes move, guided: on each axis where an edge or the middle of what moves comes
   * within reach of a guide in `container` (key '' for World), the distance that puts it there, and
   * elsewhere `snapped`, what the grid gives; the guides show meanwhile. Off, it is `snapped`.
   */
  guideMove(
    guide: MoveGuide | undefined,
    raw: Point,
    snapped: Point,
    container: string,
    off: boolean,
  ): Point {
    const state = this.host.state();
    if (!guide || !state || off) {
      this.showMoveLines([]);
      return snapped;
    }
    const scale = this.host.camera().scale;
    const tolerance = GUIDE_REACH / scale;
    const view = visibleRect(this.host.camera(), this.host.renderer.viewport);
    const at = { ...guide.rect, x: guide.rect.x + raw.x, y: guide.rect.y + raw.y };
    const candidates = guideCandidates(
      state.indexed,
      container,
      at,
      guide.exclude,
      view,
      tolerance,
    );
    const found = snapToGuides(at, candidates, tolerance, ALL_EDGES);
    const onX = found.lines.some((line) => line.axis === 'x');
    const onY = found.lines.some((line) => line.axis === 'y');
    const delta = {
      x: onX ? raw.x + found.dx : snapped.x,
      y: onY ? raw.y + found.dy : snapped.y,
    };
    const moved = { ...guide.rect, x: guide.rect.x + delta.x, y: guide.rect.y + delta.y };
    this.showMoveLines(guideLines(moved, candidates, ALL_EDGES));
    return delta;
  }

  /** The drag of shapes ended: its guides go. */
  endMove(): void {
    if (this.moveLines === undefined) return;
    this.moveLines = undefined;
    this.refresh();
  }

  private showMoveLines(lines: readonly GuideLine[]): void {
    this.moveLines = lines;
    this.show(lines.length > 0 ? { guides: lines } : undefined);
  }
}

/**
 * Where a resized shape would be: its rectangle, and for a shape with its own outline and no plate,
 * that outline fitted to the new size, which the ghost follows as the shape's marks do (ADR 0066).
 */
function ghostOf(target: Target, rect: Rect): Pick<ShapeEditOverlay, 'ghost' | 'ghostOutline'> {
  const outline = target.kind === 'shape' && !target.shape.plate ? target.shape.outline : undefined;
  return outline
    ? { ghost: rect, ghostOutline: outlineIn(outline.source, rect.width, rect.height) }
    : { ghost: rect };
}

/** Whether two overlays show only the same handles on the same rectangle, which draw alike. */
function sameHandles(a: ShapeEditOverlay | undefined, b: ShapeEditOverlay | undefined): boolean {
  if (!a?.handles || !b?.handles || a.ghost || b.ghost || a.guides || b.guides) return false;
  return a.handles.rect === b.handles.rect && a.handles.names.join() === b.handles.names.join();
}

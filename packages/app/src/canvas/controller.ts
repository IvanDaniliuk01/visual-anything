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
 * A shape that shows a solid can be turned (ADR 0075): from its turn handle, its menu or T; while it
 * turns, dragging over its picture, the wheel there and the keys turn it, and Escape ends it.
 * Pointing at a drawing with parts that shows a solid finds the part its part buffer draws there.
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
  type ThemeName,
} from '@visual-anything/core';
import type { Id, PackageFile, SolidCamera, SolidDefinition } from '@visual-anything/schema';
import type { CanvasTheme } from '../theme/themes';
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
import { letterOf } from '../live/shortcuts';
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
import { carriedKeys, moveCommand, movingShapes, type MoveSelection } from './gestures';
import { enclosedBy, hitAt, shapesAt, withoutShapes, type Hit, type IndexedScene } from './hit';
import { drawnBoundsOf } from './nameTags';
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
import {
  CanvasRenderer,
  type DragFrame,
  type GridOptions,
  type Overlay,
  type RendererOptions,
} from './renderer';
import { RouteEditor } from './routing/editor';
import { linesOf, linesWithin } from './routing/resets';
import { sameSlot } from './rowDrop';
import { rowMoveFor, rowTargetFor } from './rowKeys';
import { headerMiddle } from './rows';
import { picturesOf, relationLinesOf, type ElementShape, type NoteShape } from './scene';
import { onLeavingMark } from './leavingMark';
import { destinationTitle, onDestinationMark } from './destinationMark';
import { leavingTitle } from './scope';
import {
  WORLD_FRAME,
  aimFrame,
  dragAnchor,
  nudgeStep,
  readoutText,
  snapDrag,
  type Anchor,
} from './snapping';
import { rectAround, rectBetween } from './spatial';
import type { AlignHow } from './align';
import { ALIGN_BY_KEY, alignCommand } from './alignActions';
import { ShapeEditor, guidesOff, type MoveGuide } from './shapeEditor';
import type { SolidClient } from '../solids/client';
import type { MediaFiles } from './pictures/media';
import { isAnchoredSolidPart } from './solidMark';
import { SolidTurner } from './solids/turner';
import { t } from '../i18n';

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
   * Asks to open the canvas's own menu, of a secondary press on no shape and no line (ADR 0103): `at`
   * is on screen, relative to the canvas, and `world` where it is in the scene.
   */
  canvasMenu?(at: Point, world: Point): void;
  /**
   * Asks to collapse or expand containers, as the toggle on a container's shape and the keys do; the
   * canvas sends I1's command and says what it did.
   */
  collapse?(action: CollapseAction, collapsed: boolean): void;
  /** Asks to show or hide the grid or the rulers, as Shift+G and Shift+R do: preferences (A3). */
  changeGrid?(changes: Partial<GridOptions>): void;
  /**
   * Asks to add a row to a shape that draws its contents as rows, below the row of `below` or at the
   * end, and to edit its name in place, as Ctrl+Enter does (ADR 0023).
   */
  addRow?(container: ElementShape, below?: Id): void;
  /** Says that the canvas shows a theme, in the frame that first shows it (ADR-0033). */
  themeShown?(theme: ThemeName): void;
  /**
   * Says which element's solid turns now (ADR 0075), once when turning starts and once when it ends,
   * so that the inspector can offer Use this view while it turns.
   */
  turning?(turned: { key: string; element: Id } | undefined): void;
  /** Asks to follow the first destination of an element, from its mark or Alt+Enter (ADR 0056). */
  follow?(element: Id): void;
  /**
   * Says which shape the pointer rests on, or the keys reached, for its hover card (ADR 0082); none
   * when it leaves it or a gesture starts.
   */
  hoverShape?(key: string | undefined, by: 'pointer' | 'keyboard'): void;
  /**
   * Asks to reset the routes of the selected lines and of the selected shapes' lines, as Alt+Shift+R
   * does (ADR 0092 §1); the canvas area sends it and says what it did, or why it did nothing.
   */
  resetRoutes?(): void;
  /** Asks to lay out, as Alt+Shift+L does, which the toolbar's Layout does too (ADR 0092 §1). */
  layOut?(): void;
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
  /** The marks on the rulers that follow the pointer, across the top and down the left (A3). */
  pointerMarks?: { across: HTMLElement; down: HTMLElement };
  /** The theme the canvas starts in; the light theme by default. */
  theme?: CanvasTheme;
  /** How the first scene is fitted (`RendererOptions.firstFit`). */
  firstFit?: 'readable' | 'whole';
  /** Draws solids' pictures, and turns them, through this client (ADR 0075). */
  solids?: SolidClient;
  /** Where pictures' media files come from (ADR 0098). */
  media?: MediaFiles;
  /** Whether the person asks for reduced motion, under which no solid's animation is offered. */
  reducedMotion?: () => boolean;
  /** How pictures are decoded and made textures; the browser's by default, as tests replace it. */
  images?: RendererOptions['images'];
  /** How text is made; PixiJS's by default, as tests in jsdom, which draws none, replace it. */
  text?: RendererOptions['text'];
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; pointer: number; start: Point; camera: Camera }
  | { kind: 'press'; pointer: number; start: Point; world: Point; hit: Hit; additive: boolean }
  | DragGesture
  | { kind: 'box'; pointer: number; start: Point; additive: boolean }
  | { kind: 'connect'; pointer: number; from: ElementShape; anchor: Point; target?: Hit }
  /** A handle or a segment of a route being dragged, which the route editor follows. */
  | { kind: 'route'; pointer: number }
  /** A handle of the shape selected alone being dragged, which the shape editor follows (ADR 0074). */
  | { kind: 'resize'; pointer: number }
  /** The pointer dragged over a turning solid's picture, which turns it (ADR 0075). */
  | { kind: 'turn'; pointer: number; width: number };

/**
 * Shapes being dragged: from where the press was, by how far, and the renderer's drawing of them; and
 * what releasing them would do, which changes as the pointer moves.
 */
interface DragGesture {
  kind: 'drag';
  pointer: number;
  /** Where the press was, in the scene. */
  world: Point;
  /** How far the shapes have been dragged, in canvas units, snapped to the grid while it snaps. */
  delta: Point;
  /** How far the pointer has gone, in canvas units. */
  raw: Point;
  /** What snaps: the moving shape that carries the grabbed one, or the free shape grabbed (A3). */
  anchor: Anchor | undefined;
  /** The renderer's drag, as `startDrag` named it: ending it leaves any later drag alone. */
  drag: number;
  /** The key of the shape grabbed, which moves without its element's other copies (ADR 0007). */
  grabbed?: string;
  /** What a drop into or out of a container may do; absent when the drag only moves shapes. */
  plan?: DropPlan;
  /** What releasing the shapes now would do, as last worked out. */
  aim: DropAim;
  /** Whether Alt is held, which only moves. */
  alt: boolean;
  /** What the alignment guides look at, and whether Ctrl (⌘) turns them off (ADR 0074). */
  guide: MoveGuide | undefined;
  unguided: boolean;
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
  /** Whether it was on nothing, no shape, line or free shape, where it opens the canvas's menu. */
  onNothing?: true;
}

/**
 * A press of Shift with an arrow key: its direction, and what was selected and current when it was
 * pressed; how far it moves is worked out when it is sent, from where the moves before it left things.
 */
interface Nudge {
  direction: Direction;
  selection: Selection;
  current: string | undefined;
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
  /** The camera each view was last shown at on this canvas, while it lives. */
  private readonly viewCameras = new Map<Id, Camera>();
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
  /** Whether the grid, snapping and the rulers are on (A3). */
  private grid: GridOptions = { grid: false, snapToGrid: true, rulers: false };
  /** The rulers' marks of the pointer, and where it last was on screen. */
  private readonly pointerMarks: { across: HTMLElement; down: HTMLElement } | undefined;
  private pointerAt: Point | undefined;
  /** Whether a drag let go with Alt held, whose Alt keyup Windows browsers would take for the menu. */
  private altDragged = false;
  /** Edits the route of the relation selected alone: its handles, gestures and keys (ADR 0039). */
  private readonly routes: RouteEditor;
  /** Resizes the shape selected alone, and guides what is dragged or resized (ADR 0074). */
  private readonly shapes: ShapeEditor;
  /** The shape last said to be hovered, for its hover card. */
  private hoverSaid: string | undefined;
  /** Turning the selected shape's solid (ADR 0075), and the solids the project's packages define. */
  private readonly turner: SolidTurner;
  /** The key of the shape whose turning was last said to the callbacks. */
  private turningSaid: string | undefined;
  private readonly solids: SolidClient | undefined;
  private solidDefinitions = new Map<Id, SolidDefinition>();
  private solidsFrom: readonly PackageFile[] | undefined;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: ControllerCallbacks,
    options: ControllerOptions = {},
  ) {
    this.caption = options.caption;
    this.pointerMarks = options.pointerMarks;
    this.markPointer(undefined);
    this.renderer = new CanvasRenderer(
      host,
      {
        onFailure: (error) => callbacks.failure(error),
        onCamera: (camera) => callbacks.camera(camera),
        onThemeShown: (theme) => callbacks.themeShown?.(theme),
      },
      {
        ...(options.theme ? { theme: options.theme } : {}),
        ...(options.firstFit ? { firstFit: options.firstFit } : {}),
        ...(options.solids ? { solids: options.solids } : {}),
        ...(options.media ? { media: options.media } : {}),
        ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
        ...(options.images ? { images: options.images } : {}),
        ...(options.text ? { text: options.text } : {}),
      },
    );
    this.solids = options.solids;
    const reducedMotion = options.reducedMotion ?? (() => false);
    this.turner = new SolidTurner({
      client: () => this.solids,
      definition: (id) => this.solidDefinitions.get(id),
      project: () => this.project,
      scale: () => this.camera.scale,
      resolution: () => this.host.ownerDocument.defaultView?.devicePixelRatio ?? 1,
      show: (turning) => {
        this.renderer.setTurning(turning);
        // Said once when turning starts and once when it ends, never for each frame.
        const key = turning?.key;
        if (key === this.turningSaid) return;
        this.turningSaid = key;
        const turned = this.turner.turned;
        callbacks.turning?.(
          key === undefined || turned === undefined ? undefined : { key, element: turned.element },
        );
      },
      announce: (text) => this.announce(text),
      command: (command) => callbacks.command(command),
      reducedMotion,
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
      snapping: () => this.snapping,
      command: (command) => callbacks.command(command),
      announce: (text) => this.announce(text),
      caption: (caption, at) => {
        this.showCaption(caption);
        if (at) this.placeCaption(at);
      },
      select: (relation) => this.select(selectionOf([{ kind: 'relation', id: relation }])),
    });
    this.shapes = new ShapeEditor({
      renderer: this.renderer,
      state: () =>
        this.indexed && this.project && this.viewId !== undefined
          ? {
              indexed: this.indexed,
              project: this.project,
              viewId: this.viewId,
              selection: this.selection,
              editable: this.editable,
              current: this.current,
              moving: this.gesture.kind === 'drag',
            }
          : undefined,
      camera: () => this.camera,
      snapping: () => this.snapping,
      command: (command) => callbacks.command(command),
      announce: (text) => this.announce(text),
      caption: (caption, at) => {
        this.showCaption(caption);
        if (at) this.placeCaption(at);
      },
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

  /**
   * Shows a project's view; `editable` says whether gestures may change the project. A view this
   * canvas showed before comes back at the camera it was left at; one it has not is fitted, as Fit
   * fits it (ADR 0029's clarification of 2026-10-26).
   */
  update(project: ProjectSnapshot, viewId: Id, indexed: IndexedScene, editable: boolean): void {
    if (this.viewId !== undefined && this.viewId !== viewId) {
      if (this.renderer.looking) this.viewCameras.set(this.viewId, this.renderer.camera);
      const kept = this.viewCameras.get(viewId);
      if (kept) this.renderer.setCamera(kept);
      else this.renderer.fitWhenShown();
    }
    this.project = project;
    this.viewId = viewId;
    this.indexed = indexed;
    this.editable = editable;
    this.followSolids(project);
    // The hovered shape as it is now: where it is, and its handle, may have changed.
    this.hovered = this.hovered && indexed.byKey.get(this.hovered.key);
    // The drops whose changes this scene holds stop being drawn apart first, so that the scene is
    // drawn once, with them in it.
    for (const move of [...this.sent]) {
      if (move.applied && move.from !== project) this.forget(move, false);
    }
    this.renderer.show(indexed);
    this.turner.follow(indexed.byKey);
    this.refreshMarks();
    this.nudgeNext();
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
    // Selecting something else ends turning (ADR 0075).
    this.turner.selectionChanged(selection.elements);
    this.refreshMarks();
  }

  /** The solids the project's packages define, by id, for the parts' states and turning. */
  private followSolids(project: ProjectSnapshot): void {
    if (project.packages === this.solidsFrom) return;
    this.solidsFrom = project.packages;
    const definitions = new Map<Id, SolidDefinition>();
    for (const file of project.packages) {
      for (const solid of file.solids ?? []) definitions.set(solid.id, solid);
    }
    this.solidDefinitions = definitions;
    this.renderer.setSolids(
      this.solids,
      (id) => this.solidDefinitions.get(id)?.parts,
      (id) => this.solidDefinitions.get(id),
    );
  }

  /** The shape turned now (ADR 0075), by its key and element, and the camera it is seen from. */
  get turning(): { key: string; element: Id } | undefined {
    return this.turner.turned;
  }

  /** Whether a shape's solid can be turned. */
  canTurn(key: string): boolean {
    return this.turner.canTurn(this.indexed?.byKey.get(key));
  }

  /**
   * Turns a shape's solid live (ADR 0075), as its menu and T do, from `camera` when given, as Claude's
   * `turn` guidance asks; says whether it started.
   */
  turn(key: string, camera?: SolidCamera): boolean {
    const shape = this.indexed?.byKey.get(key);
    if (!shape) return false;
    this.host.focus({ preventScroll: true });
    if (!this.selection.elements.has(shape.element) || this.selection.elements.size !== 1) {
      this.current = shape.key;
      this.select(selectionOf([{ kind: 'element', id: shape.element }]));
    }
    const started = this.turner.start(shape, camera);
    this.refreshMarks();
    return started;
  }

  /** Ends turning, and the shape's picture comes back. */
  endTurning(): void {
    this.turner.end();
    this.refreshMarks();
  }

  /** Use this view: keeps the turned solid's camera in its appearance, in one action. */
  useThisView(): Promise<boolean> {
    return this.turner.useThisView();
  }

  /** How many animations the turned solid offers to play, and whether one plays now. */
  get turningPlay(): { animations: number; playing: boolean } {
    return { animations: this.turner.animations, playing: this.turner.playing };
  }

  /** Plays or pauses the turned solid's animation; never under reduced motion. */
  playTurning(on: boolean): void {
    this.turner.play(on);
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

  /**
   * Shows or hides the grid and the rulers, and says whether hand moves and new shapes snap to the
   * grid, which they do only while it shows (A3).
   */
  setGrid(options: GridOptions): void {
    this.grid = options;
    this.renderer.setGrid(options);
    this.gridUnder();
  }

  /** Whether hand moves and new shapes snap to the grid now: while it shows, with snapping on. */
  get snapping(): boolean {
    return this.grid.grid && this.grid.snapToGrid;
  }

  get camera(): Camera {
    return this.renderer.camera;
  }

  /** Fit: the whole view, or `bounds` of it, at a scale where names draw (`renderer.fit`). */
  fit(bounds?: Rect): void {
    this.renderer.fit(bounds);
  }

  /** The whole view, whatever the scale. */
  fitWhole(): void {
    this.renderer.fitWhole();
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

  /** Where a point of the page, as a drop gives it, is in the scene. */
  worldAtClient(clientX: number, clientY: number): Point {
    const rect = this.host.getBoundingClientRect();
    return screenToWorld(this.camera, { x: clientX - rect.left, y: clientY - rect.top });
  }

  /** Where pictures' media files come from from now on (ADR 0098). */
  setMedia(files: MediaFiles | undefined): void {
    this.renderer.setMedia(files);
  }

  /** Where a point on screen, relative to the canvas, is in the scene. */
  worldAt(screen: Point): Point {
    return screenToWorld(this.camera, screen);
  }

  /** Where the pointer last was over the canvas, in the scene; undefined once it left. */
  get pointer(): Point | undefined {
    return this.pointerAt === undefined ? undefined : screenToWorld(this.camera, this.pointerAt);
  }

  /**
   * The innermost shape at a point of the scene that holds contents, drawn open, as the grid marks
   * it: what Paste as duplicates puts the duplicates inside (ADR 0103).
   */
  containerAt(world: Point): ElementShape | undefined {
    const indexed = this.indexed;
    if (!indexed) return undefined;
    return shapesAt(indexed, world, this.exact, this.renderer.hiddenByEmphasis).find(
      (shape) => shape.holdsContents && shape.collapsed === undefined,
    );
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
    this.turner.end(false);
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
    const hit = hitAt(this.indexed, world, tolerance, this.exact, this.renderer.hiddenByEmphasis);
    return hit?.kind === 'shape' ? this.solidPartHit(hit, world) : hit;
  }

  /**
   * A shape hit over a drawing with parts that shows a solid (ADR 0075): the part its part buffer
   * draws under the pointer, exact to a pixel of its picture, or the drawing where none, or before its
   * picture arrives. An anchored part's own dot points at nothing on its own.
   */
  private solidPartHit(hit: Extract<Hit, { kind: 'shape' }>, world: Point): Hit {
    let shape = hit.shape;
    if (isAnchoredSolidPart(shape) && shape.containerShape !== undefined) {
      shape = this.indexed?.byKey.get(shape.containerShape) ?? shape;
    }
    if (shape.solid?.placement === 'parts') shape = this.renderer.solidPartAt(shape, world);
    return shape === hit.shape ? hit : { kind: 'shape', shape };
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
    const screen = this.local(event);
    // The rulers take no presses: what lies under them is pressed once the camera brings it out.
    if (this.renderer.rulersContain(screen)) return;
    this.host.focus({ preventScroll: true });
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
    // A press on a turning solid's picture turns it; one on a selected shape's turn handle starts.
    const turned = this.turner.turned;
    const turnedShape = turned && indexed.byKey.get(turned.key);
    if (turnedShape && this.turner.press(world, screen, turnedShape)) {
      const rect = turnedShape.solid?.rect;
      this.begin(event, {
        kind: 'turn',
        pointer: event.pointerId,
        width: (rect?.width ?? 1) * this.camera.scale,
      });
      return;
    }
    const turnable = this.turnHandleShape();
    const turnHandle = this.turner.handleOf(turnable);
    if (turnable && turnHandle && distance(world, turnHandle) <= HANDLE_REACH / this.camera.scale) {
      this.turn(turnable.key);
      return;
    }
    // The handles of a route are hit before anything else.
    const modified = event.shiftKey || event.ctrlKey || event.metaKey;
    if (this.editable && this.routes.press(world, screen, modified)) {
      this.begin(event, { kind: 'route', pointer: event.pointerId });
      return;
    }
    // Then the handles of the shape selected alone (ADR 0074).
    if (this.editable && this.shapes.press(world, screen, event)) {
      this.begin(event, { kind: 'resize', pointer: event.pointerId });
      return;
    }
    const handleShape = this.handleShape();
    const handle = handleShape && this.handleOf(handleShape);
    if (
      this.editable &&
      handle &&
      handleShape &&
      distance(world, handle) <= HANDLE_REACH / this.camera.scale &&
      // Beside a row, a relation's line there is pressed rather than the handle (ADR 0023).
      !(
        handleShape.row !== undefined &&
        this.hit(world, HIT_TOLERANCE / this.camera.scale)?.kind === 'relation'
      )
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
    this.markPointer(screen);
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
        // A drag moves the shape it grabbed, not the element's copies in other containers.
        const selection: MoveSelection =
          gesture.hit.kind === 'shape'
            ? { ...this.selection, grabbed: gesture.hit.shape.key }
            : this.selection;
        const moving = movingShapes(indexed, selection);
        const keys = carriedKeys(indexed, moving);
        const drag = this.renderer.startDrag(keys, this.relationsOn(keys));
        this.lastDrag = drag;
        const delta = { x: world.x - gesture.world.x, y: world.y - gesture.world.y };
        const { project, viewId } = this;
        // What dropping can do is worked out once, for the shape grabbed.
        const plan =
          gesture.hit.kind === 'shape' && project && viewId
            ? planDrop(indexed, project, viewId, selection, gesture.hit.shape)
            : undefined;
        const dragged: DragGesture = {
          kind: 'drag',
          pointer: gesture.pointer,
          world: gesture.world,
          delta,
          raw: delta,
          anchor: dragAnchor(indexed, selection, gesture.hit),
          drag,
          ...(selection.grabbed === undefined ? {} : { grabbed: selection.grabbed }),
          ...(plan ? { plan } : {}),
          aim: { kind: 'stay' },
          alt: event.altKey,
          guide: this.shapes.moveGuideOf(indexed, selection, gesture.hit, moving, keys),
          unguided: guidesOff(event),
          cover: undefined,
          at: screen,
          armed: undefined,
          rest: undefined,
          landingFrame: undefined,
        };
        this.gesture = dragged;
        this.renderer.showContainerGrid(undefined);
        this.placeDrag(dragged);
        this.hovered = undefined;
        this.refreshMarks();
        // The drag drew over the drops still waiting: their marks show where they land.
        this.showOverlay({});
        this.aimDrop(dragged, true);
        return;
      }
      case 'drag': {
        gesture.raw = { x: world.x - gesture.world.x, y: world.y - gesture.world.y };
        gesture.at = screen;
        gesture.alt = event.altKey;
        gesture.unguided = guidesOff(event);
        this.placeDrag(gesture);
        this.aimDrop(gesture);
        return;
      }
      case 'resize':
        this.shapes.move(world, screen, event);
        return;
      case 'turn':
        this.turner.move(screen, gesture.width);
        return;
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
          hit.kind !== 'arrow' &&
          hit.kind !== 'picture'
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
        // Over a ruler nothing is hovered, and no handle or toggle shows.
        if (this.renderer.rulersContain(screen)) {
          this.idleOverRulers();
          return;
        }
        this.gridUnder(world);
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
        // Under reduced motion, a GIF plays while the pointer is on it (ADR 0098).
        this.renderer.hoverPicture(hit?.kind === 'picture' ? hit.picture.id : undefined);
        // The line under the pointer takes its type's color, and with `fadeOthers` the rest fade
        // (ADR 0086).
        this.renderer.setHoveredLine(
          hit?.kind === 'relation' && !shape ? hit.line.relation : undefined,
        );
        const routeCursor = this.routes.cursorAt(world) ?? this.shapes.cursorAt(world);
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
        // The mark of the relations that leave the view says which (ADR-0040).
        else if (shape?.leaving && this.project && onLeavingMark(shape, world)) {
          this.host.title = leavingTitle(this.project, shape.leaving);
        } else if (shape?.destinations && this.project && onDestinationMark(shape, world)) {
          // The mark of a destination says what double-clicking it opens (ADR 0056).
          this.host.title = destinationTitle(this.project, shape.element);
        } else if (this.host.title !== '') this.host.title = '';
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
        // A click on a video plays it, or stops it, as well as selecting it (ADR 0098, stage 2).
        if (gesture.hit.kind === 'picture' && gesture.hit.picture.video && !gesture.additive) {
          this.renderer.toggleVideo(gesture.hit.picture.id);
        }
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
      case 'resize':
        if (event.altKey) this.altDragged = true;
        this.shapes.release();
        return;
      case 'turn':
        this.turner.release();
        return;
      case 'box': {
        const world = screenToWorld(this.camera, this.local(event));
        const box = rectBetween(gesture.start, world);
        this.showOverlay({});
        if (box.width * this.camera.scale < 2 && box.height * this.camera.scale < 2) {
          if (!gesture.additive) this.select(EMPTY_SELECTION);
          return;
        }
        const { shapes, notes, arrows, pictures } = enclosedBy(
          indexed,
          box,
          this.renderer.hiddenByEmphasis,
        );
        // The lines wholly inside the box come with the shapes (ADR 0092 §1).
        const lines = linesWithin(indexed, box, this.renderer.hiddenByEmphasis);
        const found = selectionOf([
          ...shapes.map((shape): Selectable => ({ kind: 'element', id: shape.element })),
          ...lines.map((id): Selectable => ({ kind: 'relation', id })),
          ...notes.map((note): Selectable => ({ kind: 'free-shape', id: note.id })),
          ...pictures.map((picture): Selectable => ({ kind: 'free-shape', id: picture.id })),
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
    this.markPointer(undefined);
    if (this.gesture.kind === 'idle') this.renderer.showContainerGrid(undefined);
    this.renderer.setHoveredLine(undefined);
    if (this.gesture.kind === 'idle' && this.hovered) {
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
    if (this.gesture.kind === 'idle') this.gridUnder();
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (!this.indexed) return;
    if (this.renderer.rulersContain(this.local(event))) return;
    const world = screenToWorld(this.camera, this.local(event));
    // A double-click on a destination's mark follows it, also where nothing can be changed (ADR 0056).
    const marked = this.hit(world, HIT_TOLERANCE / this.camera.scale);
    if (marked?.kind === 'shape' && onDestinationMark(marked.shape, world)) {
      this.callbacks.follow?.(marked.shape.element);
      return;
    }
    if (!this.editable) return;
    // A double-click on a bend point removes it.
    if (this.routes.doubleClick(world)) return;
    const hit = this.hit(world, HIT_TOLERANCE / this.camera.scale);
    if (hit?.kind === 'shape') this.callbacks.rename({ kind: 'element', shape: hit.shape });
    else if (hit?.kind === 'note') this.callbacks.rename({ kind: 'note', note: hit.note });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // A turning solid takes its keys first (ADR 0075): the arrows, + and −, 0 and Escape.
    if (this.gesture.kind === 'idle' && this.turner.key(event)) return;
    // Editing a route takes its keys first: those of its mode, and Delete on a chosen bend point.
    if (this.routes.keyDown(event)) return;
    const command = event.ctrlKey || event.metaKey;
    const gesture = this.gesture;
    // T turns the selected shape's solid.
    if (
      (event.key === 't' || event.key === 'T') &&
      !command &&
      !event.altKey &&
      !event.shiftKey &&
      gesture.kind === 'idle'
    ) {
      const shape = this.turnHandleShape();
      if (shape && this.turner.canTurn(shape)) {
        event.preventDefault();
        this.turn(shape.key);
        return;
      }
    }
    // Shift, Alt, Ctrl and ⌘ change a resize under way at once (ADR 0074).
    if (gesture.kind === 'resize' && this.shapes.keyChange(event)) return;
    if ((event.key === 'Control' || event.key === 'Meta') && gesture.kind === 'drag') {
      this.guideAgain(gesture, event);
      return;
    }
    if (event.key === 'Alt' && gesture.kind === 'drag') {
      // Kept from the browser, which would show its menu bar, as Firefox on Windows does.
      event.preventDefault();
      if (!gesture.alt) {
        gesture.alt = true;
        this.placeDrag(gesture);
        this.aimDrop(gesture);
      }
      return;
    }
    if (this.routeKeys(event)) return;
    if (this.toggleGrid(event)) return;
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
      // A hover card the keys opened goes with it (ADR 0082).
      this.callbacks.hoverShape?.(undefined, 'keyboard');
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
    // Ctrl+Enter (⌘Enter) adds a row (ADR 0023).
    if (command && !altGraph && event.key === 'Enter' && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      if (this.gesture.kind === 'idle') this.addRowFromKeys();
      return;
    }
    if (command && !altGraph) return;
    // Alt+Enter follows the destination of the selected element, as double-clicking its mark does.
    if (event.altKey && !altGraph && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const reached = this.gesture.kind === 'idle' ? this.currentReachable() : undefined;
      if (reached?.kind === 'shape' && reached.shape.destinations) {
        this.callbacks.follow?.(reached.shape.element);
      }
      return;
    }
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
    if (gesture.kind === 'resize' && this.shapes.keyChange(event)) return;
    if ((event.key === 'Control' || event.key === 'Meta') && gesture.kind === 'drag') {
      this.guideAgain(gesture, event);
      return;
    }
    if (event.key === 'Alt' && gesture.kind === 'drag') {
      event.preventDefault();
      gesture.alt = false;
      this.placeDrag(gesture);
      this.aimDrop(gesture);
    } else if (event.key === 'Alt' && this.altDragged) {
      // The Alt of a drag let go with it: kept from Windows browsers, which would focus their menu.
      event.preventDefault();
      this.altDragged = false;
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
    // A secondary press on a ruler opens no menu.
    const fromPointer = event.button === 2 || (IS_APPLE && event.ctrlKey);
    if (fromPointer && this.renderer.rulersContain(this.local(event))) {
      this.secondary = undefined;
      return;
    }
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
      ...(hit === undefined ? { onNothing: true as const } : {}),
    };
  }

  /** Opens the menu of the shape a secondary press was on, there, with the shapes under it. */
  private openMenuAt(press: SecondaryPress): void {
    if (press.relations) {
      this.callbacks.relationMenu?.(press.at, press.relations);
      return;
    }
    const indexed = this.indexed;
    if (press.onNothing) {
      this.callbacks.canvasMenu?.(press.at, press.world);
      return;
    }
    if (press.shape === undefined) return;
    const shape = indexed?.byKey.get(press.shape);
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
    // So does a hover card: nothing on the canvas is reached once the focus is elsewhere (ADR 0082).
    this.callbacks.hoverShape?.(undefined, 'keyboard');
  };

  private releaseSpace(): void {
    this.spaceHeld = false;
    if (this.gesture.kind === 'idle') this.host.style.cursor = 'default';
  }

  private begin(event: PointerEvent, gesture: Exclude<Gesture, { kind: 'idle' }>): void {
    this.gesture = gesture;
    this.host.setPointerCapture?.(event.pointerId);
    this.renderer.setHoveredLine(undefined);
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
    if (gesture.alt) this.altDragged = true;
    const { indexed, project, viewId } = this;
    const { delta, drag, plan, grabbed } = gesture;
    const selection: MoveSelection =
      grabbed === undefined ? this.selection : { ...this.selection, grabbed };
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
    const done = dropped && { done: `${t.message(dropped.label)}.` };
    if (dropped?.change && takesOut(project, dropped.change)) {
      const { change } = dropped;
      const preview = previewChangeContainer(project, change);
      const [problem] = preview.problems;
      if (problem) {
        this.renderer.endDrag(drag);
        this.announce(t.message(problem.message));
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
    if (this.gesture.kind === 'turn') this.turner.release();
    if (this.gesture.kind === 'route') this.routes.cancel();
    if (this.gesture.kind === 'resize') this.shapes.cancel();
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
      // Where the shapes land may snap in another container now.
      if (!first) this.placeDrag(gesture);
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
    this.shapes.endMove();
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
        ...picturesOf(scene)
          .filter((picture) => !hidden.has(picture.id))
          .map((picture): Selectable => ({ kind: 'free-shape', id: picture.id })),
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
      this.announce(t('The project cannot be changed now.'));
      return;
    }
    const actions = collapseActions(indexed, project, this.selection);
    const action = collapsed ? actions.collapse : actions.expand;
    if (action) this.callbacks.collapse?.(action, collapsed);
    else {
      this.announce(
        collapsed
          ? t('Select an expanded container to collapse it.')
          : t('Select a collapsed container to expand it.'),
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
    // Alt+Shift with an arrow key aligns the selection to that side (ADR 0074).
    if (event.altKey && event.shiftKey) {
      event.preventDefault();
      if (this.gesture.kind === 'idle') this.alignFromKeys(ALIGN_BY_KEY[direction]);
      return;
    }
    if (event.altKey && (direction === 'left' || direction === 'right')) return;
    event.preventDefault();
    if (this.gesture.kind !== 'idle') return;
    if (event.altKey) {
      if (direction === 'up') this.selectContainer();
      else this.selectInside();
    } else if (event.shiftKey) {
      if (!this.moveRow(direction)) this.nudge(direction, event.repeat);
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
    else if (start) this.announce(t('No shape {towards}.', { towards: t(TOWARDS[direction]) }));
  }

  /** Alt+Up: the container of the selected shape. */
  private selectContainer(): void {
    const indexed = this.indexed;
    const current = this.currentReachable();
    if (!indexed || current?.kind !== 'shape') return;
    const container = containerOf(indexed, current.shape);
    if (container) this.reach({ kind: 'shape', shape: container });
    else this.announce(t('{name} sits directly in World.', { name: current.shape.name }));
  }

  /** Alt+Down: the first shape inside the selected container. */
  private selectInside(): void {
    const indexed = this.indexed;
    const current = this.currentReachable();
    if (!indexed || current?.kind !== 'shape') return;
    const inside = firstInside(indexed, current.shape);
    if (inside) this.reach({ kind: 'shape', shape: inside });
    else this.announce(t('{name} holds no shapes.', { name: current.shape.name }));
  }

  /** Selects a shape the keys reached, says what it is and brings it into sight. */
  private reach(reached: Reachable): void {
    this.stepping = undefined;
    if (reached.kind === 'shape') {
      this.current = reached.shape.key;
      this.choose(selectionOf([{ kind: 'element', id: reached.shape.element }]));
      this.callbacks.hoverShape?.(reached.shape.key, 'keyboard');
    } else {
      const id =
        reached.kind === 'note'
          ? reached.note.id
          : reached.kind === 'picture'
            ? reached.picture.id
            : reached.arrow.id;
      this.current = id;
      this.callbacks.hoverShape?.(undefined, 'keyboard');
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
    const picture = scene && picturesOf(scene).find((each) => each.id === id);
    if (picture) return { kind: 'picture', picture };
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
    const nudge: Nudge = { direction, selection: this.selection, current: this.current };
    if (this.sent.length > 0 || this.nudges.length > 0) {
      if (!repeated && this.nudges.length < MAX_WAITING_NUDGES) this.nudges.push(nudge);
      return;
    }
    this.sendNudge(nudge);
  }

  /**
   * Shift with an arrow key on a row, which has no position: Up and Down move it among its
   * container's rows, and Left and Right do nothing. Says whether the current shape is a row.
   */
  private moveRow(direction: Direction): boolean {
    const current = this.currentReachable();
    const { project, viewId } = this;
    if (current?.kind !== 'shape' || !project || viewId === undefined) return false;
    const { handled, command } = rowMoveFor(project, viewId, current.shape, direction);
    if (handled && command && this.editable) {
      const { name } = current.shape;
      void this.callbacks.command(command).then((done) => {
        if (!done) return;
        this.announce(
          direction === 'up'
            ? t('“{name}” moved up.', { name })
            : t('“{name}” moved down.', { name }),
        );
      });
    }
    return handled;
  }

  /**
   * Alt+Shift with an arrow key: aligns the selected shapes to that side, as one action, and says what
   * it did, or why it did nothing (ADR 0074).
   */
  private alignFromKeys(how: AlignHow): void {
    const { indexed, project, viewId } = this;
    if (!indexed || !project || viewId === undefined) return;
    if (!this.editable) {
      this.announce(t('The project cannot be changed now.'));
      return;
    }
    const aligned = alignCommand(indexed, project, viewId, this.selection, how);
    if ('reason' in aligned) {
      this.announce(aligned.reason);
      return;
    }
    void this.callbacks.command(aligned.command).then((done) => {
      if (done) this.announce(`${t.message(aligned.label)}.`);
    });
  }

  /** Ctrl or ⌘ pressed or let go while shapes are dragged: the guides go off or come back. */
  private guideAgain(gesture: DragGesture, event: KeyboardEvent): void {
    const unguided = guidesOff(event);
    if (unguided === gesture.unguided) return;
    gesture.unguided = unguided;
    this.placeDrag(gesture);
    this.aimDrop(gesture);
  }

  /** Ctrl+Enter: adds a row below the current row, or at the end of the current shape's rows. */
  private addRowFromKeys(): void {
    const current = this.currentReachable();
    const indexed = this.indexed;
    if (!this.editable || current?.kind !== 'shape' || !indexed) return;
    const target = rowTargetFor(indexed, current.shape);
    if (target) this.callbacks.addRow?.(target.container, target.below);
    else this.announce(t('“{name}” draws no rows to add a row to.', { name: current.shape.name }));
  }

  /** Sends the next press waiting, once no move is on its way; none waits once nothing can be changed. */
  private nudgeNext(): void {
    if (!this.editable) this.nudges = [];
    while (this.sent.length === 0 && this.nudges.length > 0) {
      this.sendNudge(this.nudges.shift() as Nudge);
    }
  }

  private sendNudge({ direction, selection, current }: Nudge): void {
    const { indexed, project, viewId } = this;
    const command =
      indexed && project && viewId
        ? moveCommand(
            indexed,
            project,
            viewId,
            selection,
            nudgeStep(indexed, selection, current, direction, this.snapping),
          )
        : undefined;
    if (project && command) this.send(command, { from: project, applied: false });
  }

  private revealRect(rect: Rect): void {
    const camera = revealCamera(
      this.camera,
      this.renderer.viewport,
      rect,
      REVEAL_SCALE,
      this.renderer.rulersInset,
    );
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
      // Beside the header of a shape that draws rows, where its own relations attach.
      y:
        shape.rowCount === undefined
          ? centerOf(shape.rect).y
          : headerMiddle(shape.rect, shape.header),
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

  /**
   * Moves the dragged shapes as far as the pointer went: onto an alignment guide in the frame a
   * release would put them in, on each axis where one is within reach and neither Alt nor Ctrl is held
   * (ADR 0074); elsewhere, while the grid snaps and Alt is not held, so that the anchor lands on the
   * grid in that frame. The preview and the drop take the same distance.
   */
  private placeDrag(gesture: DragGesture): void {
    const { anchor } = gesture;
    const frame = aimFrame(gesture.plan ? gesture.aim : undefined, anchor?.home ?? WORLD_FRAME);
    const snapping = this.snapping && !gesture.alt && anchor !== undefined;
    gesture.delta = this.shapes.guideMove(
      gesture.guide,
      gesture.raw,
      snapDrag(anchor, gesture.raw, frame, snapping),
      frame.container?.key ?? '',
      gesture.alt || gesture.unguided,
    );
    const shown = this.grid.grid || this.grid.rulers;
    const dragFrame: DragFrame = {
      snapping,
      ...(frame.container ? { container: frame.container.key } : {}),
      ...(anchor && shown
        ? { readout: { text: readoutText(anchor, gesture.delta, frame), at: gesture.at } }
        : {}),
    };
    this.renderer.dragTo(gesture.delta, dragFrame);
  }

  /**
   * Shows the grid on the innermost shape under the pointer that holds contents, while the grid shows;
   * with no point, where the pointer last was.
   */
  private gridUnder(world?: Point): void {
    const indexed = this.indexed;
    const at =
      world ??
      (this.pointerAt === undefined ? undefined : screenToWorld(this.camera, this.pointerAt));
    if (!this.grid.grid || !indexed || at === undefined || this.gesture.kind !== 'idle') {
      this.renderer.showContainerGrid(undefined);
      return;
    }
    const under = shapesAt(indexed, at, this.exact, this.renderer.hiddenByEmphasis);
    const container = under.find((shape) => shape.holdsContents && shape.collapsed === undefined);
    this.renderer.showContainerGrid(container?.key);
  }

  /** Over a ruler: nothing is hovered, and neither a handle nor a toggle shows. */
  private idleOverRulers(): void {
    this.renderer.showContainerGrid(undefined);
    this.host.style.cursor = 'default';
    if (this.host.title !== '') this.host.title = '';
    this.renderer.setHoveredLine(undefined);
    if (this.hovered) {
      this.hovered = undefined;
      this.refreshMarks();
    }
  }

  /** Moves the rulers' marks of the pointer, outside PixiJS; hides them once it leaves. */
  private markPointer(at: Point | undefined): void {
    this.pointerAt = at;
    const marks = this.pointerMarks;
    if (!marks) return;
    marks.across.hidden = at === undefined;
    marks.down.hidden = at === undefined;
    if (!at) return;
    marks.across.style.transform = `translateX(${Math.round(at.x)}px)`;
    marks.down.style.transform = `translateY(${Math.round(at.y)}px)`;
  }

  /**
   * The keys that get back to automatic routes (ADR 0092 §1): Alt+Shift+R resets the routes of the
   * selected lines and of the selected shapes' lines, Alt+Shift+L lays out, and Ctrl+Shift+E (⌘⇧E)
   * selects the lines of the selected shapes, or every line. Read by the key's place too, since ⌥
   * types other letters on Apple keyboards. Says whether a key was one of them.
   */
  private routeKeys(event: KeyboardEvent): boolean {
    if (event.getModifierState('AltGraph') || !event.shiftKey) return false;
    const command = event.ctrlKey || event.metaKey;
    const letter = letterOf(event);
    const idle = this.gesture.kind === 'idle';
    if (event.altKey && !command && (letter === 'r' || letter === 'l')) {
      event.preventDefault();
      if (!idle) return true;
      if (letter === 'r') this.callbacks.resetRoutes?.();
      else this.callbacks.layOut?.();
      return true;
    }
    if (command && !event.altKey && letter === 'e') {
      // Taken from the browser, which in Firefox would open its Network Monitor.
      event.preventDefault();
      if (idle) this.selectLines();
      return true;
    }
    return false;
  }

  /**
   * Selects the lines of the selected shapes, or every line the canvas draws when no shape is
   * selected, as Ctrl+Shift+E does; what the emphasis hides is left out.
   */
  private selectLines(): void {
    const scene = this.indexed?.scene;
    if (!scene) return;
    const elements = this.selection.elements;
    const relations = linesOf(
      scene,
      elements.size === 0 ? undefined : elements,
      this.renderer.hiddenByEmphasis,
    );
    if (relations.length === 0) {
      this.announce(
        elements.size === 0
          ? t('This view draws no lines.')
          : t('The selected shapes have no lines.'),
      );
      return;
    }
    this.choose(selectionOf(relations.map((id): Selectable => ({ kind: 'relation', id }))));
  }

  /** Shift+G and Shift+R show or hide the grid and the rulers; says whether a key was one of them. */
  private toggleGrid(event: KeyboardEvent): boolean {
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.getModifierState('AltGraph')) return false;
    const letter = event.key.toLowerCase();
    if (letter !== 'g' && letter !== 'r') return false;
    event.preventDefault();
    const name = letter === 'g' ? 'grid' : 'rulers';
    const shown = !this.grid[name];
    this.callbacks.changeGrid?.({ [name]: shown });
    this.announce(
      name === 'grid'
        ? shown
          ? t('The grid shows.')
          : t('The grid is hidden.')
        : shown
          ? t('The rulers show.')
          : t('The rulers are hidden.'),
    );
    return true;
  }

  private refreshMarks(): void {
    this.renderer.setSelection(this.selection, this.hovered?.key);
    const hovered = this.gesture.kind === 'idle' ? this.hovered?.key : undefined;
    if (hovered !== this.hoverSaid) {
      this.hoverSaid = hovered;
      this.callbacks.hoverShape?.(hovered, 'pointer');
    }
    this.routes.refresh();
    this.shapes.refresh();
    if (this.gesture.kind === 'idle') {
      const shape = this.handleShape();
      const turnHandle = this.turner.handleOf(this.turnHandleShape());
      this.showOverlay({
        ...(shape ? { handle: this.handleOf(shape) } : {}),
        ...(turnHandle ? { turnHandle } : {}),
      });
    }
  }

  /** The shape a turn handle and T turn: the one the keys are on, when its element is selected alone. */
  private turnHandleShape(): ElementShape | undefined {
    const indexed = this.indexed;
    if (!indexed || this.selection.elements.size !== 1 || this.selection.relations.size > 0) {
      return undefined;
    }
    const [id] = this.selection.elements;
    if (id === undefined) return undefined;
    const current = this.current === undefined ? undefined : indexed.byKey.get(this.current);
    return current?.element === id ? current : indexed.byElement.get(id)?.[0];
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
    case 'picture':
      return hit.picture.id;
  }
}

/**
 * Where a drop lands: the rectangles of the shapes and free shapes it moves, moved by `delta`; when
 * there are many, one rectangle around them all.
 */
function landingOf(indexed: IndexedScene, selection: MoveSelection, delta: Point): Rect[] {
  const { notes, arrows } = indexed.scene;
  const free = selection.freeShapes;
  const rects = [
    ...movingShapes(indexed, selection).map((shape) => shape.rect),
    ...notes.filter((note) => free.has(note.id)).map((note) => note.rect),
    ...picturesOf(indexed.scene)
      .filter((picture) => free.has(picture.id))
      .map((picture) => picture.rect),
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
      return b.kind === 'into' && b.target.key === a.target.key && sameSlot(a.rows, b.rows);
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
    ? t('Collapse "{name}" (Alt+−)', { name: shape.name })
    : t('Expand "{name}" (Alt++)', { name: shape.name });
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
    case 'picture':
      return [{ kind: 'free-shape', id: hit.picture.id }];
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
      // With its name tag, which is part of it (ADR 0066's clarification of 2026-10-27).
      return drawnBoundsOf(hit.shape);
    case 'relation':
      return rectAround(hit.line.route);
    case 'note':
      return hit.note.rect;
    case 'arrow':
      return rectAround([hit.arrow.from, hit.arrow.to]);
  }
}

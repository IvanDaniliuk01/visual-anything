/**
 * The PixiJS side of the canvas. It draws a scene in tiles, so that the GPU skips what is off screen
 * and an edit redraws only the tiles it touches; it shows text only when it is large enough to read;
 * and it draws the selection and the gestures on their own, above the scene.
 *
 * Element shapes are drawn in the scene's drawing order, in bands of shapes that do not overlap: every
 * pair that overlaps is drawn in order whatever tiles the shapes fall in, and shapes that do not
 * overlap, touching ones included, share tiles. Relations, then free shapes, are drawn in front of
 * every element shape.
 *
 * A new scene that keeps the shapes' keys and drawing order, as after a move or a rename, plans again
 * only the tiles its changed shapes and lines leave and enter. The emphasis is drawn the same way:
 * what it hides leaves the tiles, what it dims goes in tiles drawn faintly, and what it highlights and
 * the markers it moves along relations are drawn above the scene, apart from the tiles.
 */
import { Application, Container, Graphics, Matrix, RenderTexture, Text } from 'pixi.js';
import type { Id } from '@visual-anything/schema';
import type { Emphasis } from '../editor/emphasis';
import { ImageError, drawInChunks, planImage, toPng, type ImageRequest } from '../export/image';
import type { Selection } from '../editor/selection';
import { EMPTY_SELECTION } from '../editor/selection';
import { visibleRect, type Camera, fitCamera } from './camera';
import {
  NOTHING_EMPHASIZED,
  NOTHING_HIDDEN,
  emphasize,
  type Emphasized,
  type Hidden,
} from './emphasize';
import {
  drawFreeShapes,
  drawPieceLines,
  drawRelationLines,
  drawRelationRoutes,
  drawRoutePieces,
  drawShapeBlocks,
  drawShapeOutlines,
  writeNoteTexts,
  writeRelationLabels,
  writeShapeLabels,
  type TextFactory,
} from './draw';
import {
  arrowheadAt,
  boundsOf,
  centerOf,
  directionOf,
  grow,
  type Point,
  type Rect,
  type Size,
} from './geometry';
import type { IndexedScene, Skipped } from './hit';
import { bitmapText, installFonts } from './labels';
import { CANVAS_BACKGROUND, DIMMED_ALPHA, HIGHLIGHT, MARKER_RING } from './palette';
import { midpointOf, pointAlong, routeBetweenEnds, type RouteEnd } from './route';
import {
  relationLinesOf,
  type ArrowShape,
  type DrawnEnd,
  type ElementShape,
  type NoteShape,
  type RelationLine,
  type Scene,
} from './scene';

export { emphasize, type Emphasized } from './emphasize';
import { meets } from './spatial';
import {
  MAX_BANDS,
  TILE,
  bandTileKeyOf,
  planTiles,
  plannedTiles,
  relationTileKeysOf,
  relationTiles,
  replannedTiles,
  type PlannedTile,
  type RelationTile,
  type RoutePiece,
} from './tiles';

/** Names show from this scale on, and component names and relation labels from the next. */
export const NAMES_FROM = 0.45;
export const DETAILS_FROM = 0.9;
/** Below this scale shapes are drawn as plain blocks and relations as plain lines. */
export const COARSE_BELOW = 0.25;
/** With this many shapes on screen or fewer, component names show from the scale names show at. */
const FEW_SHAPES = 300;
/** How long a frame may spend writing labels; the rest are written in the frames after. */
const LABEL_BUDGET = 6;
/** How many shapes or relations get their labels between two looks at the clock. */
const LABEL_BATCH = 6;
/**
 * How much new drawing a frame takes on, in shapes or pieces of relations, and always at least one
 * tile. PixiJS does the costly part of a new drawing when it first renders it, after the clock above
 * has stopped, so the work is counted rather than timed.
 */
const FULL_SHAPES_PER_FRAME = 150;
const LABELS_PER_FRAME = 32;
/**
 * How many labels written before a frame shows again, nearest the middle first, when zooming in brings
 * them back: PixiJS prepares each label it shows again, which for thousands takes a long frame.
 */
const LABELS_SHOWN_PER_FRAME = 600;
/**
 * How many shapes or relations an edit may draw at once, in full and named, in tiles made in place of
 * tiles that showed them so: what a restack or a drag splits or joins shows no plain blocks meanwhile.
 */
const AT_ONCE = 200;
/** Above this many selection marks, a zoom draws them again for the new scale once the camera rests. */
const MARKS_WHILE_MOVING = 1000;
/**
 * Selection marks are drawn in chunks of this many, and a frame shows this many new chunks: marking
 * thousands of shapes takes a few short frames rather than one long one.
 */
const MARKS_PER_CHUNK = 500;
const MARK_CHUNKS_PER_FRAME = 1;
/** Up to this many dragged shapes are drawn in full wherever they are; beyond it, only those on screen. */
const DRAG_DETAIL = 400;
/**
 * How many cells each side of a region holds. Tiles are drawn by region, each region by PixiJS on its
 * own, so that a tile shown, hidden, made or dropped makes it gather again the drawings of its region
 * only, not of the whole view.
 */
const REGION = 4;
/**
 * How far off screen, as a share of the screen's longer side, a tile's full drawing and labels, and
 * a region's plain drawings, are left out of the frame.
 */
const TILE_CULLED_AFTER = 1 / 8;
const REGION_CULLED_AFTER = 1 / 2;
/** Room kept around the scene when fitting it, in screen pixels. */
export const FIT_MARGIN = 32;
/**
 * How long the camera must rest before text is drawn again at the new resolution and the tiles around
 * the screen get ready.
 */
const SETTLE_AFTER = 180;

/** Where a frame measured with the GPU reads its one pixel back. */
const ONE_PIXEL = new Uint8Array(4);

const SELECTED = '#2563EB';
const HOVERED = '#60A5FA';
const REFUSED = '#DC2626';

/** The marks a gesture draws above the scene, in scene coordinates. */
export interface Overlay {
  /** The box being dragged to select. */
  box?: Rect;
  /** The line being dragged from one element to another. */
  connect?: { from: Point; to: Point };
  /** The handle to drag from to relate an element to another. */
  handle?: Point;
  /** The shape or relation a dragged line would end on. */
  target?: Rect;
  /** Where dragged shapes would land if dropped now. */
  drop?: {
    /** The container they would go into: a light fill and a wide outline. */
    into?: Rect;
    /** The other copies of that container. */
    copies?: Rect[];
    /** The container they would leave. */
    leaving?: Rect;
    /** A shape that becomes a container to go into once the pointer rests on it. */
    pending?: Rect;
    /** A container they may not go into. */
    refused?: Rect;
  };
  /** Where dropped shapes will be while their change waits to be confirmed. */
  ghost?: Rect[];
}

interface Tile {
  key: string;
  signature: string;
  container: Container;
  bounds: Rect;
  kind: 'shapes' | 'relations' | 'free';
  /** Whether what it draws is dimmed, drawn faintly. */
  dim: boolean;
  /** For element shapes: the band, MAX_BANDS beyond the last one, and the cell. */
  band: number;
  cell: string;
  /** For shapes beyond the bands: the drawing rank of the first one, which orders their tiles. */
  rank: number;
  shapes: ElementShape[];
  /**
   * For relations: those named in the tile, the pieces of routes it draws, the arrowheads, and every
   * relation it draws something of.
   */
  lines: RelationLine[];
  pieces: RoutePiece[];
  ends: RelationLine[];
  touching: RelationLine[];
  notes: NoteShape[];
  /** The plain drawing shown when zoomed far out; free shapes have none. */
  coarse?: Graphics;
  /** Whether the plain drawing shows, rather than being made clear under the full one. */
  plainShown: boolean;
  /** The full drawing, made the first time the tile is seen close enough. */
  full?: Graphics;
  /** The labels written, and for which level of detail. */
  labels?: Container;
  level: 0 | 1 | 2;
  /** How many of its shapes or relations have their labels at `level`; the rest come later. */
  labelled: number;
}

/** How far a shape was drawn before an edit: in full, and named for which detail, or not yet. */
interface Readiness {
  named: Tile['level'];
  labelled: boolean;
}

interface Drag {
  id: number;
  delta: Point;
  /** How far the dragged shapes were drawn before they left their tiles. */
  ready: ReadonlyMap<string, Readiness>;
  /** The relations whose both ends move with the drag, which move with it as they are. */
  rigid: ReadonlySet<Id>;
  /** The relations between a dragged shape and one that stays, routed again as the drag goes. */
  routed: RelationLine[];
  /** The distance they were last routed for. */
  routedAt?: Point;
}

export interface RendererCallbacks {
  /** The canvas cannot start, or a scene cannot be drawn. */
  onFailure(error: unknown): void;
  /** The camera moved or zoomed. */
  onCamera?(camera: Camera): void;
}

export interface RendererOptions {
  /** Makes the labels; bitmap text by default. */
  text?: TextFactory;
}

type Status = 'starting' | 'ready' | 'failed' | 'destroyed';

export class CanvasRenderer {
  private readonly app = new Application();
  // Drawn by PixiJS with a transform of its own, so that moving the camera changes one transform
  // instead of every shape's. What changes often is drawn apart from the tiles, in containers drawn
  // the same way, so that a change there never makes PixiJS gather the tiles' drawings again.
  private readonly world = new Container({ isRenderGroup: true });
  /** Element shapes: the bands in increasing order, then the shapes beyond the bands. */
  private readonly elementShapes = new Container();
  private readonly relations = regionsIn(new Container());
  private readonly freeShapes = new Container();
  private readonly rerouted = new Container({ isRenderGroup: true });
  private readonly reroutedLines = new Graphics();
  private readonly dragged = new Container({ isRenderGroup: true });
  /** The marks of the selection, of the shape under the pointer and of the gesture under way. */
  private readonly marks = new Container({ isRenderGroup: true });
  private readonly hoverMark = new Graphics();
  /** What the emphasis highlights, under the hover mark, and its markers, above the selection's marks. */
  private readonly emphasisMarks = new Graphics();
  private readonly markerMarks = new Graphics();
  /** The selection's marks: those of relations and arrows, and boxes in chunks drawn a few a frame. */
  private readonly selectionMarks = new Container();
  private readonly lineMarks = new Graphics();
  private readonly selectionChunks: Graphics[] = [];
  /**
   * The shapes to draw boxes around, how many are drawn, the boxes' width and their gap to the
   * shapes, and the chunks used.
   */
  private markRects: Rect[] = [];
  private marksDrawn = 0;
  private markWidth = 1;
  private markGap = 0;
  private chunksUsed = 0;
  /** The marks of what is dragged, which move with it. */
  private readonly movingMarks = new Graphics();
  private readonly gestureMarks = new Graphics();
  /** The regions of each band in use, in increasing order, under the shapes beyond the bands. */
  private readonly bands: Regions[] = [];
  private readonly overflowBand = new Container({ isRenderGroup: true });
  /** Where the plain drawings of each region lie, once the tiles change; culling goes by them. */
  private plainBounds: Map<Container, Rect> | undefined;
  private readonly tiles = new Map<string, Tile>();
  private tileOfShape = new Map<string, Tile>();
  /** The tiles each relation draws something in: the pieces of its route, its arrowhead, its name. */
  private readonly tilesOfLine = new Map<string, Set<Tile>>();
  private readonly text: TextFactory;
  private status: Status = 'starting';
  private indexed: IndexedScene | undefined;
  private selection: Selection = EMPTY_SELECTION;
  private hovered: string | undefined;
  private overlay: Overlay = {};
  /** What a drag takes out of the tiles. */
  private hidden: Hidden = NOTHING_HIDDEN;
  private emphasis: Emphasis = {};
  /** What the emphasis does to the scene shown, worked out for it. */
  private emphasized: Emphasized = NOTHING_EMPHASIZED;
  private emphasizedFor: { scene: Scene; emphasis: Emphasis } | undefined;
  /** What neither a drag nor the emphasis leaves in the tiles. */
  private left: { drag: Hidden; emphasis: Hidden; union: Hidden } | undefined;
  private drag: Drag | undefined;
  private drags = 0;
  /** How far the shapes of a drag ended without a redraw were drawn, for the next rebuild. */
  private endedReady: ReadonlyMap<string, Readiness> | undefined;
  /** What the tiles of element shapes, of relations and of free shapes were last made from. */
  private shapesFrom:
    { indexed: IndexedScene; hidden: ReadonlySet<string>; dimmed: ReadonlySet<string> } | undefined;
  private relationsFrom:
    | { lines: readonly RelationLine[]; hidden: ReadonlySet<Id>; dimmed: ReadonlySet<Id> }
    | undefined;
  private freeFrom:
    | {
        notes: readonly NoteShape[];
        arrows: readonly ArrowShape[];
        hidden: ReadonlySet<Id>;
        dimmed: ReadonlySet<Id>;
      }
    | undefined;
  /** How many selection marks are drawn, and whether they wait for the camera to rest. */
  private markCount = 0;
  private marksStale = false;
  private observer: ResizeObserver | undefined;
  private frame = 0;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the camera rests, so that spare time can go to the tiles around the screen. */
  private settled = false;
  private fitted = false;
  private resolution = 1;
  camera: Camera = { x: 0, y: 0, scale: 1 };

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: RendererCallbacks,
    options: RendererOptions = {},
  ) {
    this.text = options.text ?? bitmapText;
    this.elementShapes.addChild(this.overflowBand);
    this.rerouted.addChild(this.reroutedLines);
    this.selectionMarks.addChild(this.lineMarks);
    this.marks.addChild(
      this.emphasisMarks,
      this.hoverMark,
      this.selectionMarks,
      this.movingMarks,
      this.markerMarks,
      this.gestureMarks,
    );
    this.world.addChild(
      this.elementShapes,
      this.relations.container,
      this.freeShapes,
      this.rerouted,
      this.dragged,
      this.marks,
    );
    void this.start();
  }

  /** The canvas element, once the renderer has started. */
  get canvas(): HTMLCanvasElement | undefined {
    return this.status === 'ready' ? this.app.canvas : undefined;
  }

  /** The size of the area the canvas draws into, in screen pixels. */
  get viewport(): Size {
    return { width: this.host.clientWidth, height: this.host.clientHeight };
  }

  /** Draws this scene from now on, redrawing only the tiles that changed. */
  show(indexed: IndexedScene): void {
    this.indexed = indexed;
    if (this.status !== 'ready') return;
    try {
      this.updateEmphasized();
      this.rebuild();
      if (!this.fitted) this.fit();
      this.drawSelection();
      this.drawHover();
      this.drawEmphasis();
      this.requestRender();
    } catch (error) {
      this.callbacks.onFailure(error);
    }
  }

  /**
   * Draws the emphasis from now on (interface I2): what it hides is not drawn and cannot be pointed
   * at, what it dims is drawn faintly, what it highlights is drawn marked, and its markers travel
   * along their relations. A change of markers alone draws only the markers again.
   */
  setEmphasis(emphasis: Emphasis): void {
    if (emphasis === this.emphasis) return;
    const before = this.emphasized;
    this.emphasis = emphasis;
    const after = this.updateEmphasized();
    if (this.status !== 'ready') return;
    try {
      if (after.hidden !== before.hidden || after.dimmed !== before.dimmed) {
        this.rebuild();
        this.drawSelection();
        this.drawHover();
      }
      if (after.highlighted !== before.highlighted) this.drawHighlights();
      if (after.markers !== before.markers) this.drawMarkers();
      this.requestRender();
    } catch (error) {
      this.callbacks.onFailure(error);
    }
  }

  /** What the emphasis hides now, which pointing at the canvas leaves out. */
  get hiddenByEmphasis(): Skipped {
    const { hidden } = this.updateEmphasized();
    if (this.skipped?.hidden !== hidden) {
      this.skipped = {
        hidden,
        skip: {
          has: (key) => hidden.shapes.has(key) || hidden.relations.has(key) || hidden.free.has(key),
        },
      };
    }
    return this.skipped.skip;
  }

  private skipped: { hidden: Hidden; skip: Skipped } | undefined;

  /** The keys of the element shapes the emphasis hides now: drops and menus look past them. */
  get hiddenShapes(): ReadonlySet<string> {
    return this.updateEmphasized().hidden.shapes;
  }

  /** What the emphasis does to the scene shown, worked out again only when either changed. */
  private updateEmphasized(): Emphasized {
    const scene = this.indexed?.scene;
    if (!scene) return this.emphasized;
    const was = this.emphasizedFor;
    if (was?.scene === scene && was.emphasis === this.emphasis) return this.emphasized;
    this.emphasized = keptEmphasized(this.emphasized, emphasize(scene, this.emphasis));
    this.emphasizedFor = { scene, emphasis: this.emphasis };
    return this.emphasized;
  }

  /** What leaves the tiles: what a drag carries, and what the emphasis hides. */
  private hiddenNow(): Hidden {
    const drag = this.hidden;
    const emphasis = this.emphasized.hidden;
    if (emphasis === NOTHING_HIDDEN) return drag;
    if (drag === NOTHING_HIDDEN) return emphasis;
    const left = this.left;
    if (left?.drag === drag && left.emphasis === emphasis) return left.union;
    const union: Hidden = {
      shapes: unite(drag.shapes, emphasis.shapes),
      relations: unite(drag.relations, emphasis.relations),
      free: unite(drag.free, emphasis.free),
    };
    this.left = { drag, emphasis, union };
    return union;
  }

  /** Marks what is selected and the shape under the pointer. */
  setSelection(selection: Selection, hovered: string | undefined): void {
    if (selection === this.selection && hovered === this.hovered) return;
    if (selection !== this.selection) {
      this.selection = selection;
      this.drawSelection();
    }
    if (hovered !== this.hovered) {
      this.hovered = hovered;
      this.drawHover();
    }
    this.requestRender();
  }

  /** Draws the marks of the gesture under way. */
  setOverlay(overlay: Overlay): void {
    this.overlay = overlay;
    this.drawGesture();
    this.requestRender();
  }

  /**
   * Starts drawing shapes that are being dragged: they, the relations on them and the selected free
   * shapes leave their tiles and are drawn on their own, following the pointer. Relations between a
   * dragged shape and one that stays are routed again as it goes. Says which drag it is, so that
   * ending an earlier one leaves this one alone.
   */
  startDrag(shapes: ReadonlySet<string>, relations: ReadonlySet<Id>): number {
    const id = ++this.drags;
    const indexed = this.indexed;
    if (!indexed || this.status === 'destroyed') return id;
    this.clearDrag();
    const ready = new Map<string, Readiness>();
    for (const key of shapes) {
      const tile = this.tileOfShape.get(key);
      if (tile?.full) ready.set(key, readinessOf(tile));
    }
    this.hidden = {
      shapes: new Set(shapes),
      relations: new Set(relations),
      free: new Set(this.selection.freeShapes),
    };
    this.drag = { id, delta: { x: 0, y: 0 }, ready, rigid: new Set(), routed: [] };
    try {
      this.rebuild();
      this.drawDrag(indexed, this.drag);
    } catch (error) {
      this.callbacks.onFailure(error);
    }
    this.dragged.alpha = 0.85;
    this.rerouted.alpha = 0.85;
    this.dragged.position.set(0, 0);
    this.movingMarks.position.set(0, 0);
    this.drawSelection();
    this.requestRender();
    return id;
  }

  /** Moves the dragged shapes by a distance in scene units. */
  dragTo(delta: Point): void {
    this.dragged.position.set(delta.x, delta.y);
    this.movingMarks.position.set(delta.x, delta.y);
    if (this.drag) this.drag.delta = delta;
    this.requestRender();
  }

  /**
   * Stops drawing a drag: the shapes go back to their tiles, where they are in the scene. Given the
   * drag `startDrag` named, it stops only that one, and leaves a later drag alone. With `redraw` off,
   * the tiles are made again only by the `show` that follows, as when a drop's change comes back: the
   * scene that holds it is then drawn once, not first as it was and then as it is.
   */
  endDrag(drag?: number, { redraw = true }: { redraw?: boolean } = {}): void {
    const ended = this.drag;
    if (this.status === 'destroyed') return;
    if (!ended || (drag !== undefined && drag !== ended.id)) return;
    this.clearDrag();
    this.drag = undefined;
    this.hidden = NOTHING_HIDDEN;
    if (!redraw) {
      // How far the dragged shapes were drawn, for the tiles the next rebuild makes for them.
      this.endedReady = new Map([...(this.endedReady ?? []), ...ended.ready]);
      return;
    }
    try {
      if (this.indexed) this.rebuild(ended.ready);
    } catch (error) {
      this.callbacks.onFailure(error);
    }
    this.drawSelection();
    this.requestRender();
  }

  /** Whether shapes are being drawn as dragged. */
  get dragging(): boolean {
    return this.drag !== undefined;
  }

  /** Whether some of the selection's marks are still to be drawn, in the frames that follow. */
  get drawingMarks(): boolean {
    return this.marksDrawn < this.markRects.length;
  }

  /**
   * Whether the shape with this key is drawn now with its outline, rather than as a plain block or not
   * at all, as while it is dragged. Pointing goes by the outline only where it is drawn.
   */
  showsOutline(key: string): boolean {
    if (this.camera.scale < COARSE_BELOW || this.hiddenNow().shapes.has(key)) return false;
    return this.tileOfShape.get(key)?.full !== undefined;
  }

  /** Looks at the scene through this camera. */
  setCamera(camera: Camera): void {
    const zoomed = camera.scale !== this.camera.scale;
    this.camera = camera;
    this.world.position.set(camera.x, camera.y);
    this.world.scale.set(camera.scale);
    if (zoomed) {
      // Marks keep their width on screen; many of them are drawn again only once the camera rests.
      if (this.markCount <= MARKS_WHILE_MOVING) this.drawSelection();
      else this.marksStale = true;
      this.drawHover();
      this.drawGesture();
      this.drawEmphasis();
    }
    this.settled = false;
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settled = true;
      this.sharpen();
      if (this.marksStale) this.drawSelection();
      this.requestRender();
    }, SETTLE_AFTER);
    this.callbacks.onCamera?.(camera);
    this.requestRender();
  }

  /** Zooms and pans so that the whole scene shows. */
  fit(): void {
    const { width, height } = this.viewport;
    if (width === 0 || height === 0 || !this.indexed) return;
    this.fitted = true;
    this.setCamera(fitCamera(this.indexed.scene.bounds, { width, height }, FIT_MARGIN));
  }

  /**
   * Draws the open view as a PNG image (R27): what is visible, or the whole view, at 1× or 2×, as the
   * canvas draws it in the current theme, on its background: what filters and focus hide is left out
   * and what they dim is faint, but no mark of the selection, the pointer, guidance or a gesture
   * shows. Every tile the image shows is first drawn in full and named for the image's scale, outside
   * the frame budget, since an image is asked for once; the image is drawn in pieces any GPU can hold,
   * through PixiJS's extraction, and everything changed for it is put back before the next frame.
   * Rejects with an `ImageError` when the canvas has not started, the view draws nothing or the image
   * would be too large.
   */
  async exportImage(request: ImageRequest): Promise<Blob> {
    const indexed = this.indexed;
    if (this.status !== 'ready' || !indexed) throw new ImageError({ reason: 'not-ready' });
    const planned = planImage(request, {
      camera: this.camera,
      viewport: this.viewport,
      bounds: indexed.scene.bounds,
    });
    if (!planned.ok) throw new ImageError(planned.problem);
    const { plan } = planned;
    const scale = plan.drawingScale;
    // What is visible is written as the screen writes it; the whole view as the canvas would at 1:1.
    const { coarse, wanted } =
      request.area === 'visible'
        ? this.detailNow()
        : {
            coarse: scale < COARSE_BELOW,
            wanted: (scale >= DETAILS_FROM ? 2 : scale >= NAMES_FROM ? 1 : 0) as Tile['level'],
          };
    // What is changed for the image, to put back once it is drawn, the last change first.
    const putBack: (() => void)[] = [];
    const change = <T extends object, K extends keyof T>(target: T, key: K, value: T[K]) => {
      const was = target[key];
      if (was === value) return;
      target[key] = value;
      putBack.push(() => {
        target[key] = was;
      });
    };
    const textResolution = Math.min(4, Math.max(1, Math.ceil(plan.pixelsPerUnit * 4) / 4));
    let canvas: HTMLCanvasElement;
    try {
      // Only the scene: no mark, and nothing a drag carries.
      for (const child of this.world.children) {
        const scene =
          child === this.elementShapes ||
          child === this.relations.container ||
          child === this.freeShapes;
        if (!scene) change(child, 'visible', false);
      }
      for (const tile of this.tiles.values()) {
        if (!meets(tile.bounds, plan.frame)) continue;
        const plain = tile.plainShown;
        putBack.push(() => showPlain(tile, plain));
        if (!coarse && !tile.full) this.drawFully(tile);
        const full = !coarse && tile.full !== undefined;
        showPlain(tile, !full);
        if (tile.full) change(tile.full, 'visible', full || !tile.coarse);
        const level = wantedFor(tile.kind, wanted);
        if (level > 0 && (full || !tile.coarse)) {
          try {
            this.labelUpTo(tile, level, labelCount(tile));
          } catch {
            // Without fonts, the image is drawn unnamed, as the canvas is.
          }
        }
        if (tile.labels) {
          change(tile.labels, 'visible', level > 0);
          for (const label of tile.labels.children) {
            if (label instanceof Text) change(label, 'resolution', textResolution);
          }
        }
        change(tile.container, 'culled', false);
        const region = tile.coarse?.parent;
        if (region && region !== tile.container) change(region, 'culled', false);
      }
      const { renderer } = this.app;
      const background = renderer.background.colorRgba;
      const clearColor = [background[0], background[1], background[2], background[3]];
      const { frame, pixelsPerUnit } = plan;
      canvas = drawInChunks(plan, (chunk) => {
        const target = RenderTexture.create({
          width: chunk.width,
          height: chunk.height,
          antialias: false,
        });
        try {
          renderer.render({
            container: this.world,
            target,
            clear: true,
            clearColor,
            transform: new Matrix(
              pixelsPerUnit,
              0,
              0,
              pixelsPerUnit,
              -frame.x * pixelsPerUnit - chunk.x,
              -frame.y * pixelsPerUnit - chunk.y,
            ),
          });
          return renderer.extract.canvas(target) as unknown as CanvasImageSource;
        } finally {
          target.destroy(true);
        }
      });
    } catch (error) {
      if (error instanceof ImageError) throw error;
      throw new ImageError({
        reason: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      for (const step of putBack.reverse()) step();
      this.requestRender();
    }
    return toPng(canvas);
  }

  /** Releases the canvas, now or as soon as its start finishes. */
  destroy(): void {
    if (this.status === 'ready') {
      this.observer?.disconnect();
      cancelFrame(this.frame);
      clearTimeout(this.settleTimer);
      this.app.destroy(true, { children: true, context: true });
    }
    this.status = 'destroyed';
  }

  private async start(): Promise<void> {
    try {
      await this.app.init({
        preference: 'webgl',
        background: CANVAS_BACKGROUND,
        // Off: on the reference laptop it costs about 2.5 times the GPU's time far out, which keeps
        // 10,000 elements from the frame budget; at density 2 its jagged edges hardly show (ADR 0014).
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        autoStart: false,
        width: Math.max(1, this.host.clientWidth),
        height: Math.max(1, this.host.clientHeight),
      });
    } catch (error) {
      if (this.status === 'destroyed') return;
      this.status = 'failed';
      this.callbacks.onFailure(error);
      return;
    }
    if (this.status === 'destroyed') {
      this.app.destroy(true, { children: true, context: true });
      return;
    }
    this.status = 'ready';
    this.resolution = this.app.renderer.resolution;
    this.app.stage.addChild(this.world);
    this.app.canvas.style.display = 'block';
    this.host.appendChild(this.app.canvas);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();
    if (this.indexed) this.show(this.indexed);
    // The label fonts take a moment to draw, and PixiJS prepares how to draw each kind of drawing
    // the first time it draws one: done now, both are ready before the first zoom.
    setTimeout(() => {
      try {
        if (this.status !== 'ready') return;
        installFonts();
        this.warmUp();
      } catch {
        // Without fonts, labels are written when needed, or not at all.
      }
    }, 0);
  }

  /** Draws once, out of sight, one of each kind of drawing and label the canvas makes. */
  private warmUp(): void {
    const { shapes, lines, notes } = SAMPLE_DRAWINGS;
    const sample = new Container();
    const outlines = new Graphics();
    drawShapeOutlines(outlines, shapes);
    drawRelationRoutes(outlines, lines);
    drawFreeShapes(outlines, notes, []);
    const blocks = batched(new Graphics());
    drawShapeBlocks(blocks, shapes);
    drawRelationLines(blocks, lines);
    sample.addChild(
      blocks,
      outlines,
      ...writeShapeLabels(shapes, true, this.text),
      ...writeRelationLabels(lines, this.text),
      ...writeNoteTexts(notes),
    );
    sample.position.set(-100_000, -100_000);
    this.app.stage.addChild(sample);
    try {
      this.app.render();
    } finally {
      sample.destroy({ children: true, context: true });
    }
  }

  private resize(): void {
    if (this.status !== 'ready') return;
    const { width, height } = this.viewport;
    if (width === 0 || height === 0) return;
    const { renderer } = this.app;
    if (renderer.screen.width !== width || renderer.screen.height !== height) {
      renderer.resize(width, height);
    }
    if (!this.fitted) this.fit();
    this.requestRender();
  }

  /**
   * Makes the tiles for what the scene draws, keeping the tiles whose content is unchanged, wherever
   * their band or key now puts them. `ready` adds shapes drawn in full before, elsewhere than in a tile.
   */
  private rebuild(ready?: ReadonlyMap<string, Readiness>): void {
    const indexed = this.indexed;
    if (!indexed) return;
    const budget = { left: AT_ONCE };
    const ended = this.endedReady;
    this.endedReady = undefined;
    this.rebuildShapes(indexed, ready ?? this.drag?.ready ?? ended, budget);
    this.rebuildRelations(indexed.scene.relations, budget);
    this.rebuildFree(indexed.scene.notes, indexed.scene.arrows);
  }

  private rebuildShapes(
    indexed: IndexedScene,
    extra: ReadonlyMap<string, Readiness> | undefined,
    budget: { left: number },
  ): void {
    const hidden = this.hiddenNow().shapes;
    const dimmed = this.emphasized.dimmed.shapes;
    const from = this.shapesFrom;
    if (from?.indexed === indexed && from.hidden === hidden && from.dimmed === dimmed) return;
    const changed = from && changedShapes(from, indexed, hidden, dimmed);
    if (!from || changed === undefined) {
      const previous = new Map<string, Tile>();
      for (const tile of this.tiles.values())
        if (tile.kind === 'shapes') previous.set(tile.key, tile);
      const planned = plannedTiles(indexed, hidden, dimmed);
      this.applyShapePlan(previous, planned, extra, budget);
      this.tileOfShape = new Map();
      for (const tile of this.tiles.values()) {
        if (tile.kind !== 'shapes') continue;
        for (const shape of tile.shapes) this.tileOfShape.set(shape.key, tile);
      }
    } else if (changed.length > 0) {
      // Only the tiles the changed shapes leave and enter are planned again.
      const before = new Map<string, Tile>();
      const shapesBefore = from.indexed.scene.shapes;
      for (const at of changed) {
        const left = this.tileOfShape.get((shapesBefore[at] as ElementShape).key);
        if (left) before.set(left.key, left);
        const key = bandTileKeyOf(indexed, at, hidden, dimmed);
        const entered = key === undefined ? undefined : this.tiles.get(key);
        if (entered?.kind === 'shapes') before.set(entered.key, entered);
      }
      const planned = replannedTiles(indexed, before, changed, hidden, dimmed);
      for (const tile of before.values()) {
        for (const shape of tile.shapes) {
          if (this.tileOfShape.get(shape.key) === tile) this.tileOfShape.delete(shape.key);
        }
      }
      const touched = this.applyShapePlan(before, planned, extra, budget);
      for (const tile of touched) {
        for (const shape of tile.shapes) this.tileOfShape.set(shape.key, tile);
      }
    }
    this.shapesFrom = { indexed, hidden, dimmed };
  }

  /**
   * Draws the planned tiles of element shapes in place of the `previous` ones: keeps those that draw
   * what they drew, moves those that draw what another planned tile draws, drops the rest and makes
   * the planned ones left. Says which tiles now draw the planned ones.
   */
  private applyShapePlan(
    previous: ReadonlyMap<string, Tile>,
    planned: readonly PlannedTile[],
    extra: ReadonlyMap<string, Readiness> | undefined,
    budget: { left: number },
  ): Tile[] {
    const plan = planTiles(previous, planned);
    const { coarse, wanted } = this.detailNow();
    // How far each shape was drawn before this edit, for the tiles it makes.
    const ready = plan.make.length > 0 && !coarse ? this.readiness(previous, extra) : undefined;
    const byKey = new Map(planned.map((tile) => [tile.key, tile]));
    const touched: Tile[] = [];
    let reorder = false;

    for (const key of plan.keep) {
      const tile = previous.get(key) as Tile;
      const next = byKey.get(key) as PlannedTile;
      tile.shapes = next.shapes;
      if (tile.band === MAX_BANDS && tile.rank !== next.rank) reorder = true;
      tile.rank = next.rank;
      dimTile(tile, next.dim);
      touched.push(tile);
    }
    // A key can pass from one tile to another, so the tiles that move leave their keys first.
    const moving = plan.move.map(({ from, to }) => {
      this.tiles.delete(from);
      return { tile: previous.get(from) as Tile, to: byKey.get(to) as PlannedTile };
    });
    for (const key of plan.drop) {
      const tile = previous.get(key) as Tile;
      if (tile.band === MAX_BANDS) reorder = true;
      this.tiles.delete(key);
      destroyTile(tile);
    }
    for (const { tile, to } of moving) {
      if (tile.band === MAX_BANDS || to.band === MAX_BANDS) reorder = true;
      Object.assign(tile, {
        key: to.key,
        band: to.band,
        cell: to.cell,
        rank: to.rank,
        shapes: to.shapes,
      });
      this.place(tile);
      dimTile(tile, to.dim);
      this.tiles.set(to.key, tile);
      touched.push(tile);
    }
    for (const next of plan.make) {
      const tile = this.makeShapeTile(next);
      this.tiles.set(next.key, tile);
      this.place(tile);
      dimTile(tile, next.dim);
      if (next.band === MAX_BANDS) reorder = true;
      const wasReady =
        ready !== undefined && next.shapes.every((shape) => isReady(ready.get(shape.key), wanted));
      if (wasReady && budget.left > 0) {
        budget.left -= next.shapes.length;
        this.drawAtOnce(tile, wanted);
      }
      touched.push(tile);
    }
    if (reorder) this.orderOverflow();
    if (plan.make.length > 0 || plan.move.length > 0 || plan.drop.length > 0) {
      this.plainBounds = undefined;
    }
    return touched;
  }

  /**
   * Makes the tiles of relations: all of them, or, when the scene keeps most lines, only the tiles
   * the changed ones drew something in and now draw something in, each worked out again from the
   * lines it drew that did not change and the changed ones that now go in it, in the scene's order.
   */
  private rebuildRelations(relations: readonly RelationLine[], budget: { left: number }): void {
    const hidden = this.hiddenNow().relations;
    const dimmed = this.emphasized.dimmed.relations;
    const from = this.relationsFrom;
    if (from?.lines === relations && from.hidden === hidden && from.dimmed === dimmed) return;
    const changed = from && changedLines(from, relations, hidden, dimmed);
    const previous = new Map<string, Tile>();
    let planned: RelationTile[];
    if (!from || changed === undefined) {
      for (const tile of this.tiles.values()) {
        if (tile.kind === 'relations') previous.set(tile.key, tile);
      }
      planned = relationTiles(relations, hidden, dimmed);
    } else {
      if (changed.changed.size === 0) {
        this.relationsFrom = { lines: relations, hidden, dimmed };
        return;
      }
      const keys = new Set<string>();
      for (const [id, line] of changed.changed) {
        for (const tile of this.tilesOfLine.get(id) ?? []) keys.add(tile.key);
        if (line && !hidden.has(id)) {
          for (const key of relationTileKeysOf(line, dimmed.has(id))) keys.add(key);
        }
      }
      for (const key of keys) {
        const tile = this.tiles.get(key);
        if (tile?.kind === 'relations') previous.set(key, tile);
      }
      const lines = new Map<string, RelationLine>();
      for (const tile of previous.values()) {
        for (const line of tile.touching) {
          if (!changed.changed.has(line.relation)) lines.set(line.relation, line);
        }
      }
      for (const [id, line] of changed.changed) if (line) lines.set(id, line);
      const order = changed.order();
      const sorted = [...lines.values()].sort(
        (a, b) => (order.get(a.relation) ?? 0) - (order.get(b.relation) ?? 0),
      );
      planned = relationTiles(sorted, hidden, dimmed, keys);
    }
    const byKey = new Map(planned.map((tile) => [tile.key, tile]));
    const plan = planTiles(previous, planned);
    const { coarse, wanted: detail } = this.detailNow();
    for (const tile of previous.values()) {
      for (const line of tile.touching) this.tilesOfLine.get(line.relation)?.delete(tile);
    }
    const contentOf = (tile: Tile, next: RelationTile) =>
      Object.assign(tile, {
        lines: next.lines,
        pieces: next.pieces,
        ends: next.ends,
        touching: next.touching,
      });
    const touched: Tile[] = [];
    for (const key of plan.keep) {
      const tile = previous.get(key) as Tile;
      const next = byKey.get(key) as RelationTile;
      contentOf(tile, next);
      dimTile(tile, next.dim);
      touched.push(tile);
    }
    const moving = plan.move.map(({ from: was, to }) => {
      this.tiles.delete(was);
      return { tile: previous.get(was) as Tile, to: byKey.get(to) as RelationTile };
    });
    const dropped = new Map(plan.drop.map((key) => [key, previous.get(key) as Tile]));
    for (const key of plan.drop) this.tiles.delete(key);
    for (const { tile, to } of moving) {
      tile.key = to.key;
      contentOf(tile, to);
      dimTile(tile, to.dim);
      this.tiles.set(to.key, tile);
      touched.push(tile);
    }
    for (const next of plan.make) {
      const tile = this.makeRelationTile(next);
      this.tiles.set(next.key, tile);
      this.place(tile);
      dimTile(tile, next.dim);
      // In place of a tile drawn in full, the new one is drawn in full at once.
      const existing = dropped.get(next.key);
      if (existing && !coarse && existing.full && budget.left > 0) {
        budget.left -= next.pieces.length;
        this.drawAtOnce(
          tile,
          existing.level === wantedFor('relations', detail) ? existing.level : 0,
        );
      }
      touched.push(tile);
    }
    for (const tile of dropped.values()) destroyTile(tile);
    if (plan.make.length > 0 || plan.move.length > 0 || plan.drop.length > 0) {
      this.plainBounds = undefined;
    }
    for (const tile of touched) {
      for (const line of tile.touching) {
        const tiles = this.tilesOfLine.get(line.relation);
        if (tiles) tiles.add(tile);
        else this.tilesOfLine.set(line.relation, new Set([tile]));
      }
    }
    this.relationsFrom = { lines: relations, hidden, dimmed };
  }

  private rebuildFree(notes: readonly NoteShape[], arrows: readonly ArrowShape[]): void {
    const hidden = this.hiddenNow().free;
    const dimmed = this.emphasized.dimmed.free;
    const from = this.freeFrom;
    if (
      from?.notes === notes &&
      from.arrows === arrows &&
      from.hidden === hidden &&
      from.dimmed === dimmed
    ) {
      return;
    }
    for (const dim of [false, true]) {
      const key = dim ? 'free dim' : 'free';
      const shownNotes = notes.filter(
        (note) => !hidden.has(note.id) && dimmed.has(note.id) === dim,
      );
      const shownArrows = arrows.filter(
        (arrow) => !hidden.has(arrow.id) && dimmed.has(arrow.id) === dim,
      );
      const existing = this.tiles.get(key);
      const signature = JSON.stringify([shownNotes, shownArrows]);
      if (existing?.signature === signature) continue;
      if (existing) {
        this.tiles.delete(key);
        destroyTile(existing);
      }
      if (shownNotes.length > 0 || shownArrows.length > 0) {
        const tile = this.makeFreeTile(key, signature, shownNotes, shownArrows);
        dimTile(tile, dim);
        this.tiles.set(key, tile);
        this.place(tile);
      }
    }
    this.freeFrom = { notes, arrows, hidden, dimmed };
  }

  /** How far each shape in the tiles given was drawn, when drawn in full, and `extra`. */
  private readiness(
    tiles: ReadonlyMap<string, Tile>,
    extra: ReadonlyMap<string, Readiness> | undefined,
  ): Map<string, Readiness> {
    const ready = new Map(extra ?? []);
    for (const tile of tiles.values()) {
      if (tile.kind !== 'shapes' || !tile.full) continue;
      const readiness = readinessOf(tile);
      for (const shape of tile.shapes) ready.set(shape.key, readiness);
    }
    return ready;
  }

  /**
   * Puts a tile's drawings where they are drawn. In a band, or among the relations, its plain drawing
   * goes with the plain drawings of its region, which are drawn together and stay as they are when
   * the camera moves, and the rest with the full drawings and labels of its region. Beyond the bands,
   * the tile is drawn whole and on its own, in drawing order.
   */
  private place(tile: Tile): void {
    // Only what goes elsewhere moves: every move makes PixiJS gather again what it left and entered.
    const into = (parent: Container, child: Container, at?: number) => {
      if (child.parent === parent) return;
      if (at === undefined) parent.addChild(child);
      else parent.addChildAt(child, at);
    };
    if (tile.kind === 'free') {
      into(this.freeShapes, tile.container);
      return;
    }
    if (tile.kind === 'shapes' && tile.band >= MAX_BANDS) {
      if (tile.coarse) into(tile.container, tile.coarse, 0);
      // What the tile shows or leaves out then changes it alone, not the other shapes beyond the bands.
      tile.container.isRenderGroup = true;
      into(this.overflowBand, tile.container);
    } else {
      tile.container.isRenderGroup = false;
      const regions = tile.kind === 'shapes' ? this.band(tile.band) : this.relations;
      if (tile.coarse) into(regionIn(regions.plain, regions.plainRegions, tile.cell), tile.coarse);
      into(regionIn(regions.detail, regions.detailRegions, tile.cell), tile.container);
    }
    // Inside the tile's container or apart from it, the plain drawing is dimmed differently.
    showPlain(tile, tile.plainShown);
  }

  /** The regions of a band, made with the bands below it when first needed. */
  private band(band: number): Regions {
    while (this.bands.length <= band) {
      // Below the shapes beyond the bands, which are always drawn last.
      const regions = regionsIn(new Container());
      this.elementShapes.addChildAt(regions.container, this.bands.length);
      this.bands.push(regions);
    }
    return this.bands[band] as Regions;
  }

  /** Puts the tiles of the shapes beyond the bands in drawing order. */
  private orderOverflow(): void {
    const tiles = [...this.tiles.values()]
      .filter((tile) => tile.kind === 'shapes' && tile.band === MAX_BANDS)
      .sort((a, b) => a.rank - b.rank);
    const children = this.overflowBand.children;
    if (
      tiles.length === children.length &&
      tiles.every((tile, at) => children[at] === tile.container)
    ) {
      return;
    }
    this.overflowBand.removeChildren();
    for (const tile of tiles) this.overflowBand.addChild(tile.container);
  }

  private makeShapeTile(planned: PlannedTile): Tile {
    // Shapes start with their plain drawing, which is cheap to make; the full one is made when the
    // tile is first seen close up.
    const coarse = batched(new Graphics());
    drawShapeBlocks(coarse, planned.shapes, planned.band === MAX_BANDS);
    return this.tileOf({
      key: planned.key,
      signature: planned.signature,
      kind: 'shapes',
      band: planned.band,
      cell: planned.cell,
      rank: planned.rank,
      shapes: planned.shapes,
      coarse,
      bounds: boundsOf(planned.shapes.map((shape) => shape.rect)),
    });
  }

  private makeRelationTile(planned: RelationTile): Tile {
    const coarse = batched(new Graphics());
    drawPieceLines(coarse, planned.pieces);
    return this.tileOf({
      key: planned.key,
      signature: planned.signature,
      kind: 'relations',
      cell: planned.cell,
      lines: planned.lines,
      pieces: planned.pieces,
      ends: planned.ends,
      touching: planned.touching,
      coarse,
      bounds: planned.bounds,
    });
  }

  private makeFreeTile(
    key: string,
    signature: string,
    notes: NoteShape[],
    arrows: readonly ArrowShape[],
  ): Tile {
    const full = new Graphics();
    drawFreeShapes(full, notes, arrows);
    return this.tileOf({
      key,
      signature,
      kind: 'free',
      notes,
      full,
      bounds: boundsOf(
        notes.map((note) => note.rect),
        arrows.flatMap((arrow) => [arrow.from, arrow.to]),
      ),
    });
  }

  private tileOf(
    parts: Pick<Tile, 'key' | 'signature' | 'kind'> &
      Partial<
        Pick<
          Tile,
          | 'band'
          | 'cell'
          | 'rank'
          | 'shapes'
          | 'lines'
          | 'pieces'
          | 'ends'
          | 'touching'
          | 'notes'
          | 'coarse'
          | 'full'
        >
      > & {
        bounds: Rect | undefined;
      },
  ): Tile {
    // The plain drawing goes where `place` puts it.
    const container = new Container();
    if (parts.full) container.addChild(parts.full);
    const { bounds, ...rest } = parts;
    return {
      band: 0,
      cell: '',
      rank: 0,
      dim: false,
      shapes: [],
      lines: [],
      pieces: [],
      ends: [],
      touching: [],
      notes: [],
      plainShown: true,
      ...rest,
      container,
      bounds: grow(bounds ?? { x: 0, y: 0, width: 0, height: 0 }, 16),
      level: 0,
      labelled: 0,
    };
  }

  /** Makes the full drawing of a tile, over its plain drawing and under its labels. */
  private drawFully(tile: Tile): void {
    const full = new Graphics();
    if (tile.kind === 'shapes') drawShapeOutlines(full, tile.shapes);
    else drawRoutePieces(full, tile.pieces, tile.ends);
    tile.container.addChildAt(full, tile.coarse?.parent === tile.container ? 1 : 0);
    tile.full = full;
    showPlain(tile, false);
  }

  /** Draws a tile in full and writes all its labels for `shown` now, outside the frame's budget. */
  private drawAtOnce(tile: Tile, shown: Tile['level']): void {
    this.drawFully(tile);
    const wanted = wantedFor(tile.kind, shown);
    if (wanted === 0) return;
    try {
      this.labelUpTo(tile, wanted, labelCount(tile));
    } catch {
      // Without fonts, the labels come when the frames write them, or not at all.
    }
  }

  /** Writes a tile's labels for `wanted`, from where they stopped up to `until` of them. */
  private labelUpTo(tile: Tile, wanted: Tile['level'], until: number): number {
    if (tile.level !== wanted || !tile.labels) {
      tile.labels?.destroy({ children: true });
      // Drawn on its own: labels are many, and showing or writing them then makes PixiJS gather
      // again only the tile's labels, not the drawings of its whole region.
      tile.labels = new Container({ isRenderGroup: true });
      tile.container.addChild(tile.labels);
      tile.level = wanted;
      tile.labelled = 0;
    }
    const from = tile.labelled;
    const to = Math.min(labelCount(tile), until);
    if (to <= from) return 0;
    const texts =
      tile.kind === 'shapes'
        ? writeShapeLabels(tile.shapes.slice(from, to), wanted === 2, this.text)
        : tile.kind === 'relations'
          ? writeRelationLabels(tile.lines.slice(from, to), this.text)
          : writeNoteTexts(tile.notes);
    for (const text of texts) {
      if (text instanceof Text) text.resolution = this.textResolution();
      tile.labels.addChild(text);
    }
    tile.labelled = to;
    return texts.length;
  }

  /** How the canvas draws at the present scale: as plain blocks or not, and with which labels. */
  private detailNow(): { coarse: boolean; wanted: Tile['level'] } {
    const { scale } = this.camera;
    // Component names show once they are large enough to read, or earlier when few shapes are on
    // screen, which is when they cost little.
    const few =
      scale >= NAMES_FROM &&
      scale < DETAILS_FROM &&
      (this.indexed?.shapes.query(visibleRect(this.camera, this.viewport)).length ?? 0) <=
        FEW_SHAPES;
    return {
      coarse: scale < COARSE_BELOW,
      wanted: scale >= DETAILS_FROM || few ? 2 : scale >= NAMES_FROM ? 1 : 0,
    };
  }

  /**
   * Gives the tiles on screen the detail the scale allows: plain drawings far out; full drawings and
   * then labels closer in, made the first time a tile needs them, nearest the middle of the screen
   * first and within a budget per frame, so that zooming never stalls.
   */
  private updateDetail(): void {
    const { coarse, wanted: detail } = this.detailNow();
    const { scale } = this.camera;
    const shown = visibleRect(this.camera, this.viewport);
    // While the camera moves, only what is on screen; once it rests, the tiles around it too, so
    // that the next pan finds them drawn.
    const reach = this.settled
      ? Math.max(shown.width, shown.height) / 2
      : Math.max(64 / scale, TILE / 2);
    const visible = grow(shown, reach);
    const middle = centerOf(visible);
    const work: { tile: Tile; draw: boolean; wanted: Tile['level']; distance: number }[] = [];
    const showing: { labels: Container; distance: number }[] = [];
    const distanceOf = (tile: Tile) => {
      const center = centerOf(tile.bounds);
      return Math.hypot(center.x - middle.x, center.y - middle.y);
    };
    for (const tile of this.tiles.values()) {
      const near = meets(tile.bounds, visible);
      // A tile left out of the frame shows what it should once it is near again, as this runs
      // before culling: changing what it shows now would only make PixiJS gather its region again.
      if (!near && tile.container.culled) continue;
      const wanted = wantedFor(tile.kind, detail);
      const full = !coarse && tile.full !== undefined;
      showPlain(tile, !full);
      if (tile.full) tile.full.visible = full || !tile.coarse;
      if (tile.labels) {
        if (wanted === 0) tile.labels.visible = false;
        else if (!tile.labels.visible)
          showing.push({ labels: tile.labels, distance: distanceOf(tile) });
      }
      if (!near) continue;
      const draw = !coarse && !tile.full;
      const label = wanted > 0 && (tile.level !== wanted || tile.labelled < labelCount(tile));
      if (!draw && !label) continue;
      const center = centerOf(tile.bounds);
      work.push({
        tile,
        draw,
        wanted,
        distance: Math.hypot(center.x - middle.x, center.y - middle.y),
      });
    }
    work.sort((a, b) => a.distance - b.distance);

    let more = false;
    showing.sort((a, b) => a.distance - b.distance);
    let shownAgain = 0;
    for (const { labels } of showing) {
      if (shownAgain >= LABELS_SHOWN_PER_FRAME) {
        more = true;
        break;
      }
      labels.visible = true;
      shownAgain += labels.children.length;
    }
    let drawn = 0;
    let drawings = 0;
    for (const { tile, draw } of work) {
      if (!draw) continue;
      if (drawings > 0 && drawn >= FULL_SHAPES_PER_FRAME) {
        more = true;
        break;
      }
      this.drawFully(tile);
      drawings += 1;
      drawn += drawingSize(tile);
    }

    const began = performance.now();
    let written = 0;
    const spent = () => performance.now() - began > LABEL_BUDGET || written >= LABELS_PER_FRAME;
    labelling: for (const { tile, wanted } of work) {
      if (wanted === 0 || (tile.coarse && !tile.full)) continue;
      // A few at a time, so that no frame goes much over the budget, however full the tile.
      const total = labelCount(tile);
      while (tile.level !== wanted || tile.labelled < total) {
        if (spent()) {
          more = true;
          break labelling;
        }
        const from = tile.level === wanted ? tile.labelled : 0;
        written += this.labelUpTo(tile, wanted, from + LABEL_BATCH);
      }
    }
    if (more) this.requestRender();
  }

  /** Draws the canvas text of the tiles on screen again at the resolution the zoom now shows it at. */
  private sharpen(): void {
    const resolution = this.textResolution();
    const visible = visibleRect(this.camera, this.viewport);
    for (const tile of this.tiles.values()) {
      if (!tile.labels || !meets(tile.bounds, visible)) continue;
      for (const child of tile.labels.children) {
        // Bitmap labels keep the resolution of their font; canvas text is drawn again.
        if (child instanceof Text && child.resolution !== resolution) child.resolution = resolution;
      }
    }
    for (const child of this.dragged.children) {
      if (child instanceof Text && child.resolution !== resolution) child.resolution = resolution;
    }
  }

  private textResolution(): number {
    const wanted = this.resolution * Math.max(1, this.camera.scale);
    return Math.min(4, Math.max(0.5, Math.ceil(wanted * 4) / 4));
  }

  /** Draws what a drag carries: its shapes band by band, the relations among them, its free shapes. */
  private drawDrag(indexed: IndexedScene, drag: Drag): void {
    const { scene } = indexed;
    const hidden = this.hidden;
    const { scale } = this.camera;
    const coarse = scale < COARSE_BELOW;
    const named = scale >= NAMES_FROM;
    const details = scale >= DETAILS_FROM;
    const shown = visibleRect(this.camera, this.viewport);
    const near = grow(shown, Math.max(shown.width, shown.height) / 2);

    // What the emphasis hides is not drawn while dragged either.
    const unseen = this.emphasized.hidden;
    const carried = indexed.drawing.filter((at) => {
      const { key } = scene.shapes[at] as ElementShape;
      return hidden.shapes.has(key) && !unseen.shapes.has(key);
    });
    const inBands = new Map<number, ElementShape[]>();
    const beyond: ElementShape[] = [];
    for (const at of carried) {
      const shape = scene.shapes[at] as ElementShape;
      const band = indexed.bands[at] as number;
      if (band >= MAX_BANDS) beyond.push(shape);
      else {
        const shapes = inBands.get(band);
        if (shapes) shapes.push(shape);
        else inBands.set(band, [shape]);
      }
    }
    // Many dragged shapes are drawn in full only near the screen, and named only on it.
    const inFull = (shape: ElementShape) =>
      !coarse && (carried.length <= DRAG_DETAIL || meets(shape.rect, near));
    let names = 0;
    const label = (shapes: readonly ElementShape[]): Container[] => {
      if (!named) return [];
      const wanted = shapes.filter((shape) => inFull(shape) && meets(shape.rect, shown));
      const room = Math.max(0, DRAG_DETAIL - names);
      names += Math.min(room, wanted.length);
      try {
        return writeShapeLabels(wanted.slice(0, room), details, this.text);
      } catch {
        // Without fonts, the shapes move unnamed.
        return [];
      }
    };
    for (const band of [...inBands.keys()].sort((a, b) => a - b)) {
      const shapes = inBands.get(band) as ElementShape[];
      const graphics = new Graphics();
      drawShapeBlocks(
        graphics,
        shapes.filter((shape) => !inFull(shape)),
      );
      drawShapeOutlines(graphics, shapes.filter(inFull));
      this.dragged.addChild(graphics, ...label(shapes));
    }
    // Beyond the bands, one after another, each over the names of those before it.
    let graphics: Graphics | undefined;
    for (const shape of beyond) {
      if (!graphics) {
        graphics = new Graphics();
        this.dragged.addChild(graphics);
      }
      if (inFull(shape)) drawShapeOutlines(graphics, [shape]);
      else drawShapeBlocks(graphics, [shape], true);
      const names = label([shape]);
      if (names.length > 0) {
        this.dragged.addChild(...names);
        graphics = undefined;
      }
    }

    // Relations whose ends all move go with the drag as they are; the others are routed again.
    const lines = scene.relations.filter(
      (line) => hidden.relations.has(line.relation) && !unseen.relations.has(line.relation),
    );
    const byId = new Map(lines.map((line) => [line.relation, line]));
    const motion = new Map<Id, 'rigid' | 'routed'>();
    const motionOf = (line: RelationLine): 'rigid' | 'routed' => {
      const known = motion.get(line.relation);
      if (known) return known;
      // A relation that ends, through others, on itself is routed, which draws it where it is.
      motion.set(line.relation, 'routed');
      const moves = (end: DrawnEnd): boolean => {
        if (end.kind === 'shape') return hidden.shapes.has(end.key);
        const other = byId.get(end.relation);
        return other !== undefined && motionOf(other) === 'rigid';
      };
      const result =
        !line.ends || (moves(line.ends.from) && moves(line.ends.to)) ? 'rigid' : 'routed';
      motion.set(line.relation, result);
      return result;
    };
    const rigid = lines.filter((line) => motionOf(line) === 'rigid');
    drag.rigid = new Set(rigid.map((line) => line.relation));
    drag.routed = lines.filter((line) => motionOf(line) === 'routed');
    if (rigid.length > 0) {
      const drawn = new Graphics();
      if (coarse) drawRelationLines(drawn, rigid);
      else drawRelationRoutes(drawn, rigid);
      this.dragged.addChild(drawn);
    }

    const notes = scene.notes.filter(
      (note) => hidden.free.has(note.id) && !unseen.free.has(note.id),
    );
    const arrows = scene.arrows.filter(
      (arrow) => hidden.free.has(arrow.id) && !unseen.free.has(arrow.id),
    );
    if (notes.length > 0 || arrows.length > 0) {
      const free = new Graphics();
      drawFreeShapes(free, notes, arrows);
      this.dragged.addChild(free);
      if (named) {
        for (const text of writeNoteTexts(notes)) {
          text.resolution = this.textResolution();
          this.dragged.addChild(text);
        }
      }
    }
    this.routeDrag();
  }

  /** Routes again, for where the drag now is, the relations between dragged shapes and others. */
  private routeDrag(): void {
    const drag = this.drag;
    const indexed = this.indexed;
    this.reroutedLines.clear();
    if (!drag || !indexed || drag.routed.length === 0) return;
    const { delta } = drag;
    drag.routedAt = delta;
    const hidden = this.hidden;
    const byId = linesById(indexed.scene.relations);
    const routed = new Map<Id, RelationLine>();
    const resolving = new Set<Id>();
    const endOf = (end: DrawnEnd): RouteEnd | undefined => {
      if (end.kind === 'shape') {
        const shape = indexed.byKey.get(end.key);
        if (!shape) return undefined;
        return { rect: hidden.shapes.has(end.key) ? moved(shape.rect, delta) : shape.rect };
      }
      const other = byId.get(end.relation);
      if (!other) return undefined;
      if (drag.rigid.has(end.relation)) return { point: movedPoint(other.middle, delta) };
      if (!hidden.relations.has(end.relation)) return { point: other.middle };
      return { point: lineFor(other).middle };
    };
    const lineFor = (line: RelationLine): RelationLine => {
      const known = routed.get(line.relation);
      if (known) return known;
      if (!line.ends || resolving.has(line.relation)) return line;
      resolving.add(line.relation);
      const from = endOf(line.ends.from);
      const to = endOf(line.ends.to);
      resolving.delete(line.relation);
      let next = line;
      if (from && to) {
        const route = routeBetweenEnds(from, to, line.ends.offset);
        const end = route.at(-1) as Point;
        const beforeEnd = route.at(-2) as Point;
        if (directionOf(beforeEnd, end)) {
          next = {
            ...line,
            route,
            from: route[0] as Point,
            to: end,
            middle: midpointOf(route),
            ...(line.arrowhead ? { arrowhead: arrowheadAt(beforeEnd, end, line.width) } : {}),
          };
        }
      }
      routed.set(line.relation, next);
      return next;
    };
    const lines = drag.routed.map(lineFor);
    if (this.camera.scale < COARSE_BELOW) drawRelationLines(this.reroutedLines, lines);
    else drawRelationRoutes(this.reroutedLines, lines);
  }

  private clearDrag(): void {
    if (this.status === 'destroyed') return;
    for (const child of this.dragged.removeChildren()) {
      child.destroy({ children: true, context: true });
    }
    this.reroutedLines.clear();
    this.dragged.position.set(0, 0);
    this.movingMarks.position.set(0, 0);
  }

  /**
   * Marks what is selected: the marks of what a drag carries move with it. Marks of one kind are drawn
   * as one path, which costs far less than one for each, and the boxes of thousands of shapes are
   * drawn a few chunks a frame.
   */
  private drawSelection(): void {
    const moving = this.movingMarks;
    const lineMarks = this.lineMarks;
    // The chunks past those used were cleared when used last; clearing one makes PixiJS redo it.
    for (const chunk of this.selectionChunks.slice(0, this.chunksUsed)) chunk.clear();
    moving.clear();
    lineMarks.clear();
    this.markCount = 0;
    this.marksStale = false;
    this.markRects = [];
    this.marksDrawn = 0;
    this.chunksUsed = 0;
    const indexed = this.indexed;
    if (!indexed) return;
    const { scene } = indexed;
    const { scale } = this.camera;
    const width = 2 / scale;
    const gap = 3 / scale;
    this.markWidth = width;
    this.markGap = gap;
    const hidden = this.hidden;
    // What the emphasis hides shows no mark.
    const unseen = this.emphasized.hidden;
    let carriedBoxes = 0;
    const box = (rect: Rect, carried: boolean) => {
      if (carried) {
        const around = grow(rect, gap);
        moving.rect(around.x, around.y, around.width, around.height);
        carriedBoxes += 1;
      } else {
        this.markRects.push(rect);
      }
    };
    for (const id of this.selection.elements) {
      for (const shape of indexed.byElement.get(id) ?? []) {
        if (!unseen.shapes.has(shape.key)) box(shape.rect, hidden.shapes.has(shape.key));
      }
    }
    const free = freeShapesById(scene.notes, scene.arrows);
    const arrows: ArrowShape[] = [];
    for (const id of this.selection.freeShapes) {
      const shape = free.get(id);
      if (!shape || unseen.free.has(id)) continue;
      if ('rect' in shape) box(shape.rect, hidden.free.has(id));
      else arrows.push(shape);
    }
    if (carriedBoxes > 0) moving.stroke({ color: SELECTED, width });

    // A relation an aggregated relation stands for marks that line, once however many are selected.
    const lines = relationLinesOf(scene);
    const marked = new Set<string>();
    const byWidth = new Map<number, { still: RelationLine[]; moving: RelationLine[] }>();
    for (const id of this.selection.relations) {
      const line = lines.get(id);
      if (!line || marked.has(line.relation) || unseen.relations.has(line.relation)) continue;
      marked.add(line.relation);
      const carried = hidden.relations.has(line.relation);
      // Relations routed again while dragged show no mark until the drop.
      if (carried && !this.drag?.rigid.has(line.relation)) continue;
      let same = byWidth.get(line.width);
      if (!same) {
        same = { still: [], moving: [] };
        byWidth.set(line.width, same);
      }
      same[carried ? 'moving' : 'still'].push(line);
    }
    for (const [lineWidth, { still, moving: carried }] of byWidth) {
      const style = {
        color: SELECTED,
        width: lineWidth + 6 / scale,
        alpha: 0.35,
        join: 'round',
        cap: 'round',
      } as const;
      for (const [graphics, each] of [
        [lineMarks, still],
        [moving, carried],
      ] as const) {
        if (each.length === 0) continue;
        for (const line of each) traceRoute(graphics, line.route);
        graphics.stroke(style);
        this.markCount += each.length;
      }
    }
    const stillArrows = arrows.filter((arrow) => !hidden.free.has(arrow.id));
    const movingArrows = arrows.filter((arrow) => hidden.free.has(arrow.id));
    for (const [graphics, each] of [
      [lineMarks, stillArrows],
      [moving, movingArrows],
    ] as const) {
      if (each.length === 0) continue;
      for (const arrow of each) traceRoute(graphics, [arrow.from, arrow.to]);
      graphics.stroke({ color: SELECTED, width: 8 / scale, alpha: 0.35, cap: 'round' });
    }
    this.markCount += this.markRects.length + carriedBoxes + arrows.length;
    this.drawChunks();
  }

  /**
   * Draws the next chunks of the selection's box marks, and asks for a frame for the ones left:
   * PixiJS turns a drawing into geometry when it first shows it, so a frame takes on only a few.
   */
  private drawChunks(): void {
    const rects = this.markRects;
    for (
      let chunks = 0;
      chunks < MARK_CHUNKS_PER_FRAME && this.marksDrawn < rects.length;
      chunks++
    ) {
      let chunk = this.selectionChunks[this.chunksUsed];
      if (!chunk) {
        chunk = new Graphics();
        this.selectionChunks.push(chunk);
        this.selectionMarks.addChild(chunk);
      }
      const until = Math.min(rects.length, this.marksDrawn + MARKS_PER_CHUNK);
      const gap = this.markGap;
      for (let at = this.marksDrawn; at < until; at++) {
        const { x, y, width, height } = rects[at] as Rect;
        chunk.rect(x - gap, y - gap, width + 2 * gap, height + 2 * gap);
      }
      chunk.stroke({ color: SELECTED, width: this.markWidth });
      this.marksDrawn = until;
      this.chunksUsed += 1;
    }
    if (this.marksDrawn < rects.length) this.requestRender();
  }

  /** Draws what the emphasis highlights and its markers, for the scale the canvas shows. */
  private drawEmphasis(): void {
    this.drawHighlights();
    this.drawMarkers();
  }

  /**
   * Marks what the emphasis highlights, under the selection's marks: each shape with a halo, a ring
   * and corner marks around it, each line wider in the highlight color over a halo, with a dot at
   * each end. The corner marks and the dots tell a highlight apart without its color.
   */
  private drawHighlights(): void {
    const marks = this.emphasisMarks;
    marks.clear();
    const { shapes, lines, notes, arrows } = this.emphasized.highlighted;
    if (shapes.length + lines.length + notes.length + arrows.length === 0) return;
    const { scale } = this.camera;
    const halo = { color: HIGHLIGHT, alpha: 0.28, join: 'round', cap: 'round' } as const;
    const rects = [...shapes.map((shape) => shape.rect), ...notes.map((note) => note.rect)];
    for (const rect of rects) {
      const around = grow(rect, 5 / scale);
      marks.rect(around.x, around.y, around.width, around.height);
    }
    if (rects.length > 0) marks.stroke({ ...halo, width: 10 / scale });
    for (const rect of rects) {
      const around = grow(rect, 5 / scale);
      marks.rect(around.x, around.y, around.width, around.height);
    }
    if (rects.length > 0) marks.stroke({ color: HIGHLIGHT, width: 2.5 / scale });
    for (const rect of rects) traceCorners(marks, grow(rect, 11 / scale), 14 / scale);
    if (rects.length > 0) marks.stroke({ color: HIGHLIGHT, width: 3 / scale, cap: 'square' });

    const routes = [
      ...lines.map((line) => ({ route: line.route, width: line.width })),
      ...arrows.map((arrow) => ({ route: [arrow.from, arrow.to], width: 2 })),
    ];
    for (const { route, width } of routes) {
      traceRoute(marks, route);
      marks.stroke({ ...halo, width: width + 12 / scale });
      traceRoute(marks, route);
      marks.stroke({ color: HIGHLIGHT, width: width + 2 / scale, join: 'round', cap: 'round' });
    }
    for (const { route } of routes) {
      for (const end of [route[0], route.at(-1)]) {
        if (end) marks.circle(end.x, end.y, 4 / scale);
      }
    }
    if (routes.length > 0) marks.fill(HIGHLIGHT);
  }

  /** Draws the markers travelling along relations: discs ringed in white, above the selection. */
  private drawMarkers(): void {
    const marks = this.markerMarks;
    marks.clear();
    const { markers } = this.emphasized;
    if (markers.length === 0) return;
    const { scale } = this.camera;
    for (const { line, along } of markers) {
      const at = pointAlong(line.route, along);
      marks.circle(at.x, at.y, 7 / scale);
    }
    marks.fill(HIGHLIGHT).stroke({ color: MARKER_RING, width: 2.5 / scale });
  }

  /** Marks the shape under the pointer, under the selection's marks. */
  private drawHover(): void {
    const mark = this.hoverMark;
    mark.clear();
    const shape = this.hovered === undefined ? undefined : this.indexed?.byKey.get(this.hovered);
    if (!shape) return;
    const rect = grow(shape.rect, 3 / this.camera.scale);
    mark
      .rect(rect.x, rect.y, rect.width, rect.height)
      .stroke({ color: HOVERED, width: 1.5 / this.camera.scale });
  }

  private drawGesture(): void {
    const marks = this.gestureMarks;
    marks.clear();
    const { box, connect, handle, target, drop, ghost } = this.overlay;
    const width = 1.5 / this.camera.scale;
    const outline = (rect: Rect, color: string, lineWidth: number) =>
      marks.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color, width: lineWidth });
    for (const rect of ghost ?? []) {
      marks
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color: SELECTED, alpha: 0.08 })
        .stroke({ color: SELECTED, width });
    }
    if (drop?.into) {
      const rect = drop.into;
      marks
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color: SELECTED, alpha: 0.06 })
        .stroke({ color: SELECTED, width: width * 2 });
    }
    for (const rect of drop?.copies ?? []) outline(rect, SELECTED, width);
    if (drop?.leaving) outline(drop.leaving, HOVERED, width * 1.5);
    if (drop?.pending) outline(drop.pending, HOVERED, width);
    if (drop?.refused) outline(drop.refused, REFUSED, width * 2);
    if (box) {
      marks
        .rect(box.x, box.y, box.width, box.height)
        .fill({ color: SELECTED, alpha: 0.08 })
        .stroke({ color: SELECTED, width });
    }
    if (target) outline(grow(target, 4 / this.camera.scale), SELECTED, width * 2);
    if (connect) {
      marks
        .moveTo(connect.from.x, connect.from.y)
        .lineTo(connect.to.x, connect.to.y)
        .stroke({ color: SELECTED, width: width * 1.5 });
      marks.circle(connect.to.x, connect.to.y, 4 / this.camera.scale).fill(SELECTED);
    }
    if (handle) {
      marks
        .circle(handle.x, handle.y, 7 / this.camera.scale)
        .fill('#FFFFFF')
        .stroke({ color: SELECTED, width: width * 1.5 });
      const arm = 3.5 / this.camera.scale;
      marks
        .moveTo(handle.x - arm, handle.y)
        .lineTo(handle.x + arm, handle.y)
        .moveTo(handle.x, handle.y - arm)
        .lineTo(handle.x, handle.y + arm)
        .stroke({ color: SELECTED, width });
    }
  }

  /**
   * Leaves out of the frame what is off screen, for where the camera is now: the full drawings and
   * labels of each tile, and the plain drawings of whole regions. Something comes back as soon as it
   * shows, but goes only once it is some way off, since every change of what shows makes PixiJS
   * gather again the drawings around it: a tile, which changes only the short list of its region, an
   * eighth of a screen away; a region, which changes the list of all of them, half a screen away. A
   * tile's plain drawing is never left out on its own: that would make PixiJS gather again every
   * plain drawing of its region.
   */
  private cull(): void {
    const shown = visibleRect(this.camera, this.viewport);
    const side = Math.max(shown.width, shown.height);
    const cullBy = (container: Container, bounds: Rect, away: Rect) => {
      if (container.culled) container.culled = !meets(bounds, shown);
      else container.culled = !meets(bounds, away);
    };
    const tileAway = grow(shown, side * TILE_CULLED_AFTER);
    for (const { container, bounds } of this.tiles.values()) cullBy(container, bounds, tileAway);
    const regionAway = grow(shown, side * REGION_CULLED_AFTER);
    this.plainBounds ??= this.boundsOfPlainRegions();
    for (const [region, bounds] of this.plainBounds) cullBy(region, bounds, regionAway);
  }

  /** Where the plain drawings of each region lie, from the tiles in it. */
  private boundsOfPlainRegions(): Map<Container, Rect> {
    const bounds = new Map<Container, Rect>();
    for (const tile of this.tiles.values()) {
      const region = tile.coarse?.parent;
      if (!region || region === tile.container) continue;
      const known = bounds.get(region);
      bounds.set(region, known ? (boundsOf([known, tile.bounds]) as Rect) : tile.bounds);
    }
    return bounds;
  }

  /**
   * Draws a frame now: labels within their budget, culling and rendering. With `waitForGpu`, returns
   * only once the GPU has drawn it, so that the time it takes can be measured.
   */
  renderNow(waitForGpu = false): void {
    if (this.status !== 'ready') return;
    try {
      if (this.marksDrawn < this.markRects.length) this.drawChunks();
      this.updateDetail();
      const drag = this.drag;
      if (drag && drag.routed.length > 0 && drag.routedAt !== drag.delta) this.routeDrag();
      this.cull();
      this.app.render();
      if (waitForGpu) this.waitForGpu();
    } catch (error) {
      this.callbacks.onFailure(error);
    }
  }

  /**
   * Waits until the GPU has drawn what was sent. Chrome's `finish` returns at once, leaving the
   * drawing queued, but it cannot read a pixel back before everything sent before is drawn.
   */
  private waitForGpu(): void {
    const gl = (this.app.renderer as { gl?: WebGLRenderingContext }).gl;
    gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ONE_PIXEL);
  }

  private requestRender(): void {
    if (this.status !== 'ready' || this.frame !== 0) return;
    this.frame = nextFrame(() => {
      this.frame = 0;
      this.renderNow();
    });
  }
}

/** One drawing of each kind: a shape of each kind, a container, relations of each dash, a note. */
const SAMPLE_DRAWINGS: { shapes: ElementShape[]; lines: RelationLine[]; notes: NoteShape[] } =
  (() => {
    const kinds = ['rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person'] as const;
    const shapes = kinds.map((kind, at): ElementShape => {
      const rect = { x: at * 200, y: 0, width: 180, height: 80 };
      return {
        key: `sample-${kind}`,
        element: `sample-${kind}`,
        offset: { x: rect.x, y: rect.y },
        positioned: 'placed',
        name: 'Sample',
        componentName: 'Sample',
        kind,
        fill: '#F3F5F8',
        stroke: '#3E4C59',
        rect,
        extent: rect,
        holdsContents: at === 0,
        ...(at === 1 ? { collapsed: { contents: 3 } } : {}),
      };
    });
    const dashes = ['solid', 'dashed', 'dotted'] as const;
    const lines = dashes.map((dash, at): RelationLine => {
      const from = { x: 0, y: 200 + at * 40 };
      const to = { x: 400, y: 200 + at * 40 };
      return {
        relation: `sample-${dash}`,
        label: 'Sample',
        route: [from, to],
        from,
        to,
        middle: { x: 200, y: from.y },
        arrowhead: arrowheadAt(from, to, 2),
        stroke: '#3E4C59',
        width: 2,
        dash,
      };
    });
    const notes: NoteShape[] = [
      { id: 'sample-note', rect: { x: 0, y: 400, width: 200, height: 60 }, text: 'Sample' },
    ];
    return { shapes, lines, notes };
  })();

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

/**
 * Tiles drawn by region: the plain drawings of a region together, under the full drawings and labels
 * of the same region. Shapes in one band never overlap, so the order of the tiles of a band is
 * invisible, and a tile's plain drawing never shows with its full one.
 */
interface Regions {
  container: Container;
  plain: Container;
  detail: Container;
  plainRegions: Map<string, Container>;
  detailRegions: Map<string, Container>;
}

function regionsIn(container: Container): Regions {
  const plain = new Container();
  const detail = new Container();
  container.addChild(plain, detail);
  return { container, plain, detail, plainRegions: new Map(), detailRegions: new Map() };
}

/**
 * Shows or hides a tile's plain drawing. It is hidden by making it clear rather than by leaving it
 * out: leaving out one drawing would make PixiJS gather again every plain drawing of its region.
 */
function showPlain(tile: Tile, shown: boolean): void {
  tile.plainShown = shown;
  const { coarse } = tile;
  if (!coarse) return;
  // Apart from the tile's container, the plain drawing is dimmed on its own; inside it, with it.
  const alpha = !shown ? 0 : tile.dim && coarse.parent !== tile.container ? DIMMED_ALPHA : 1;
  if (coarse.alpha !== alpha) coarse.alpha = alpha;
}

/** The container for the region a cell falls in, among the regions of `container`. */
function regionIn(container: Container, regions: Map<string, Container>, cell: string): Container {
  const [column = 0, row = 0] = cell.split(',').map(Number);
  const key = `${Math.floor(column / REGION)},${Math.floor(row / REGION)}`;
  let region = regions.get(key);
  if (!region) {
    region = new Container({ isRenderGroup: true });
    regions.set(key, region);
    container.addChild(region);
  }
  return region;
}

/**
 * Has PixiJS draw a drawing together with the others, whatever its size: plain drawings change only
 * with the scene, so gathering them again now and then costs less than drawing each on its own.
 */
function batched(graphics: Graphics): Graphics {
  graphics.context.batchMode = 'batch';
  return graphics;
}

/** Destroys a tile with all it drew, its drawings' geometry included, its plain drawing wherever it is. */
function destroyTile(tile: Tile): void {
  tile.coarse?.destroy({ context: true });
  tile.container.destroy({ children: true, context: true });
}

/** Draws a tile faintly while what it draws is dimmed, and in full otherwise, its plain drawing too. */
function dimTile(tile: Tile, dim: boolean): void {
  tile.dim = dim;
  const alpha = dim ? DIMMED_ALPHA : 1;
  if (tile.container.alpha !== alpha) tile.container.alpha = alpha;
  showPlain(tile, tile.plainShown);
}

/**
 * The indexes of the shapes whose tiles may differ from the ones made from `from`: those that are new
 * objects, in another band, or hidden, shown, dimmed or brightened since. Undefined when the shapes
 * no longer have the same keys in the same drawing order, when most of them changed, or when one of
 * them is beyond the bands: then every tile is planned again.
 */
function changedShapes(
  from: { indexed: IndexedScene; hidden: ReadonlySet<string>; dimmed: ReadonlySet<string> },
  indexed: IndexedScene,
  hidden: ReadonlySet<string>,
  dimmed: ReadonlySet<string>,
): number[] | undefined {
  const was = from.indexed;
  const before = was.scene.shapes;
  const after = indexed.scene.shapes;
  if (before.length !== after.length) return undefined;
  if (was.drawing !== indexed.drawing && !sameNumbers(was.drawing, indexed.drawing)) {
    return undefined;
  }
  const changed = new Set<number>();
  if (before !== after || was.bands !== indexed.bands) {
    for (let at = 0; at < after.length; at++) {
      const a = before[at] as ElementShape;
      const b = after[at] as ElementShape;
      if (a !== b) {
        if (a.key !== b.key) return undefined;
        changed.add(at);
      } else if (was.bands[at] !== indexed.bands[at]) changed.add(at);
    }
  }
  const add = (key: string) => {
    const at = indexed.indexOfKey.get(key);
    if (at !== undefined) changed.add(at);
  };
  if (from.hidden !== hidden) eachDifference(from.hidden, hidden, add);
  if (from.dimmed !== dimmed) eachDifference(from.dimmed, dimmed, add);
  if (changed.size > after.length / 2) return undefined;
  for (const at of changed) {
    if ((was.bands[at] as number) >= MAX_BANDS || (indexed.bands[at] as number) >= MAX_BANDS) {
      return undefined;
    }
  }
  return [...changed];
}

/**
 * The lines whose tiles may differ from the ones made from `from`: those that are new objects, went
 * or came, or are hidden, shown, dimmed or brightened since, by key, each with its line now, if it is
 * still drawn; and the order of the lines, by key, which `from`'s lines keep while the keys stay in
 * their places. Undefined when most of them changed: then every tile of relations is worked out again.
 */
function changedLines(
  from: { lines: readonly RelationLine[]; hidden: ReadonlySet<Id>; dimmed: ReadonlySet<Id> },
  lines: readonly RelationLine[],
  hidden: ReadonlySet<Id>,
  dimmed: ReadonlySet<Id>,
):
  { changed: Map<string, RelationLine | undefined>; order: () => Map<string, number> } | undefined {
  const changed = new Map<string, RelationLine | undefined>();
  let keysKept = true;
  if (from.lines !== lines) {
    const before = from.lines;
    if (before.length === lines.length) {
      for (let at = 0; at < lines.length; at++) {
        const a = before[at] as RelationLine;
        const b = lines[at] as RelationLine;
        if (a === b) continue;
        if (a.relation !== b.relation) {
          keysKept = false;
          if (!changed.has(a.relation)) changed.set(a.relation, undefined);
        }
        changed.set(b.relation, b);
      }
      // A key that moved to another place is still drawn.
      if (!keysKept) {
        const now = linesById(lines);
        for (const [key, line] of changed) if (line === undefined) changed.set(key, now.get(key));
      }
    } else {
      keysKept = false;
      const byKey = linesById(before);
      const now = linesById(lines);
      for (const [key, line] of now) if (byKey.get(key) !== line) changed.set(key, line);
      for (const key of byKey.keys()) if (!now.has(key)) changed.set(key, undefined);
    }
  }
  const lineOf = (key: string) =>
    changed.has(key)
      ? changed.get(key)
      : keysKept
        ? linesById(from.lines).get(key)
        : linesById(lines).get(key);
  const add = (key: string) => {
    if (!changed.has(key)) changed.set(key, lineOf(key));
  };
  if (from.hidden !== hidden) eachDifference(from.hidden, hidden, add);
  if (from.dimmed !== dimmed) eachDifference(from.dimmed, dimmed, add);
  if (changed.size > lines.length / 2) return undefined;
  return { changed, order: () => lineOrderOf(keysKept ? from.lines : lines) };
}

/** Calls `each` with what is in one set and not the other. */
function eachDifference(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  each: (key: string) => void,
): void {
  for (const key of a) if (!b.has(key)) each(key);
  for (const key of b) if (!a.has(key)) each(key);
}

function sameNumbers(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
  return true;
}

function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

/** Both sets together; one of them when the other is empty. */
function unite(a: ReadonlySet<string>, b: ReadonlySet<string>): ReadonlySet<string> {
  if (b.size === 0) return a;
  if (a.size === 0) return b;
  return new Set([...a, ...b]);
}

/**
 * What the emphasis does now, keeping each part of what it did before that holds the same, so that
 * the tiles are planned again only for what changed, however the emphasis was made.
 */
function keptEmphasized(before: Emphasized, after: Emphasized): Emphasized {
  if (after === NOTHING_EMPHASIZED && before === NOTHING_EMPHASIZED) return before;
  const kept = (was: Hidden, now: Hidden): Hidden => {
    if (now.shapes.size === 0 && now.relations.size === 0 && now.free.size === 0) {
      return NOTHING_HIDDEN;
    }
    const shapes = sameMembers(was.shapes, now.shapes) ? was.shapes : now.shapes;
    const relations = sameMembers(was.relations, now.relations) ? was.relations : now.relations;
    const free = sameMembers(was.free, now.free) ? was.free : now.free;
    return shapes === was.shapes && relations === was.relations && free === was.free
      ? was
      : { shapes, relations, free };
  };
  const sameList = <T>(a: readonly T[], b: readonly T[]) =>
    a.length === b.length && a.every((item, at) => item === b[at]);
  const lit = after.highlighted;
  const wasLit = before.highlighted;
  const highlighted =
    sameList(lit.shapes, wasLit.shapes) &&
    sameList(lit.lines, wasLit.lines) &&
    sameList(lit.notes, wasLit.notes) &&
    sameList(lit.arrows, wasLit.arrows)
      ? wasLit
      : lit;
  const markers =
    after.markers.length === before.markers.length &&
    after.markers.every(
      (marker, at) =>
        marker.line === before.markers[at]?.line && marker.along === before.markers[at]?.along,
    )
      ? before.markers
      : after.markers;
  return {
    hidden: kept(before.hidden, after.hidden),
    dimmed: kept(before.dimmed, after.dimmed),
    highlighted,
    markers,
  };
}

const lineOrders = new WeakMap<readonly RelationLine[], Map<string, number>>();

/** Each line's place among the scene's lines, by its key. */
function lineOrderOf(lines: readonly RelationLine[]): Map<string, number> {
  let order = lineOrders.get(lines);
  if (!order) {
    order = new Map(lines.map((line, at) => [line.relation, at]));
    lineOrders.set(lines, order);
  }
  return order;
}

function readinessOf(tile: Tile): Readiness {
  return { named: tile.level, labelled: tile.labelled >= labelCount(tile) };
}

/** Whether a shape drawn so before an edit can be drawn as fully again at once. */
function isReady(readiness: Readiness | undefined, wanted: Tile['level']): boolean {
  return (
    readiness !== undefined && (wanted === 0 || (readiness.named === wanted && readiness.labelled))
  );
}

/** The detail a tile of this kind shows when shapes show `wanted`: relations and notes have only one. */
function wantedFor(kind: Tile['kind'], wanted: Tile['level']): Tile['level'] {
  if (kind === 'shapes') return wanted;
  if (kind === 'relations') return wanted === 2 ? 2 : 0;
  return wanted === 0 ? 0 : 2;
}

/** How much a tile's full drawing draws: its shapes, the pieces of routes in it, or its notes. */
function drawingSize(tile: Tile): number {
  return tile.kind === 'shapes'
    ? tile.shapes.length
    : tile.kind === 'relations'
      ? tile.pieces.length
      : tile.notes.length;
}

/** How many things in a tile have labels to write. */
function labelCount(tile: Tile): number {
  return tile.kind === 'shapes'
    ? tile.shapes.length
    : tile.kind === 'relations'
      ? tile.lines.length
      : 1;
}

function moved(rect: Rect, delta: Point): Rect {
  return { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
}

function movedPoint(point: Point, delta: Point): Point {
  return { x: point.x + delta.x, y: point.y + delta.y };
}

/** Traces an L at each corner of a rectangle, its arms `arm` long, or shorter on a small one. */
function traceCorners(graphics: Graphics, rect: Rect, arm: number): void {
  const { x, y, width, height } = rect;
  const across = Math.min(arm, width / 3);
  const down = Math.min(arm, height / 3);
  const right = x + width;
  const bottom = y + height;
  graphics
    .moveTo(x, y + down)
    .lineTo(x, y)
    .lineTo(x + across, y)
    .moveTo(right - across, y)
    .lineTo(right, y)
    .lineTo(right, y + down)
    .moveTo(right, bottom - down)
    .lineTo(right, bottom)
    .lineTo(right - across, bottom)
    .moveTo(x + across, bottom)
    .lineTo(x, bottom)
    .lineTo(x, bottom - down);
}

function traceRoute(graphics: Graphics, route: readonly Point[]): void {
  const [first, ...rest] = route;
  if (!first) return;
  graphics.moveTo(first.x, first.y);
  for (const point of rest) graphics.lineTo(point.x, point.y);
}

const relationLookups = new WeakMap<readonly RelationLine[], Map<Id, RelationLine>>();

function linesById(relations: readonly RelationLine[]): Map<Id, RelationLine> {
  let byId = relationLookups.get(relations);
  if (!byId) {
    byId = new Map(relations.map((line) => [line.relation, line]));
    relationLookups.set(relations, byId);
  }
  return byId;
}

const freeLookups = new WeakMap<
  readonly NoteShape[],
  WeakMap<readonly ArrowShape[], Map<Id, NoteShape | ArrowShape>>
>();

function freeShapesById(
  notes: readonly NoteShape[],
  arrows: readonly ArrowShape[],
): Map<Id, NoteShape | ArrowShape> {
  let byArrows = freeLookups.get(notes);
  if (!byArrows) {
    byArrows = new WeakMap();
    freeLookups.set(notes, byArrows);
  }
  let byId = byArrows.get(arrows);
  if (!byId) {
    byId = new Map<Id, NoteShape | ArrowShape>([
      ...notes.map((note): [Id, NoteShape] => [note.id, note]),
      ...arrows.map((arrow): [Id, ArrowShape] => [arrow.id, arrow]),
    ]);
    byArrows.set(arrows, byId);
  }
  return byId;
}

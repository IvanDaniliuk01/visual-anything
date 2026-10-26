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
import {
  Application,
  Container,
  Graphics,
  Matrix,
  RenderTexture,
  Text,
  type Buffer,
  type GraphicsContext,
  type Texture,
} from 'pixi.js';
import type { Legend, ThemeName } from '@visual-anything/core';
import type { Id, LevelOfDetail } from '@visual-anything/schema';
import { levelDetail, namesFromOf, type TileDetail } from './levels';
import type { Emphasis } from '../editor/emphasis';
import { ImageError, drawInChunks, planImage, toPng, type ImageRequest } from '../export/image';
import { withLegendBand } from '../export/legendBand';
import { t } from '../i18n';
import type { Selection } from '../editor/selection';
import { EMPTY_SELECTION } from '../editor/selection';
import { visibleRect, type Camera, type Inset, fitCamera, readableFitCamera } from './camera';
import {
  NOTHING_EMPHASIZED,
  NOTHING_HIDDEN,
  emphasize,
  type Emphasized,
  type Hidden,
} from './emphasize';
import type { TextFactory } from './draw';
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
import { GridMarks } from './gridMarks';
import { watchResolution } from './resolution';
import { ScreenMarks, selectionBounds } from './screenMarks';
import { browserImagePlatform, type ImagePlatform } from './images';
import { CodeDrawingLayer } from './code-drawings';
import type { Drawing as CodeDrawing } from '@visual-anything/core';
import { TileImages, type ImageView } from './images-draw';
import { bitmapText, installFonts } from './labels';
import { THEMES, type CanvasTheme } from '../theme/themes';
import { DIMMED_ALPHA } from './colors';
import { midpointOf, pointAlong, type RouteEnd } from './route';
import { drawRouteOverlay, type RouteOverlay } from './routing/overlay';
import { rerouted } from './routing/scene-routes';
import { routeWithSides } from './rowRoutes';
import { dragEnds } from './rowShapes';
import { holdsRows, levelWithRows } from './rowsDraw';
import { nameBandOf } from './shape-images';
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
  cellsOfShapes,
  chunkBase,
  chunkKey,
  cutAtItsCells,
  planTiles,
  plannedTiles,
  relationTileKey,
  relationTileKeysOf,
  relationTiles,
  replannedTiles,
  routePieces,
  type PlannedTile,
  type RelationTile,
  type RoutePiece,
} from './tiles';
import { ARROW_PAINT, LINE_PAINT, NOTE_PAINT, SHAPE_PAINT, sameListButPaint } from './theme/paint';
import {
  buildGeometry,
  painterOf,
  type GeometryBuilder,
  type LabelPaint,
  type Painter,
} from './theme/painter';
import {
  RESTYLE_BUDGET,
  RestyleCosts,
  SWAP_WITHIN,
  drawingsFollowTheme,
  labelsFollowTheme,
  shownDrawings,
  stampOf,
  takeRepaints,
  type Drawing,
  type RestyleStats,
} from './theme/restyle';

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
/**
 * How long a frame may spend on those new drawings, their geometry included, which it builds itself
 * so that the clock sees it: crowded tiles of heavy shapes are far costlier than their count says.
 */
const FULL_BUDGET = 4;
/** How many shapes or pieces a frame draws in full whatever its clock says, so that it goes on. */
const FULL_SHAPES_AT_LEAST = 40;
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
/** How long destroying the drawings no frame shows any longer may take at a time, between frames. */
const DISPOSE_BUDGET = 3;
/**
 * How many tiles' plain drawings a frame puts together in the copies of their regions a switch will
 * show: PixiJS gathers each copy in the frame it is put together, outside the clock.
 */
const SHADOW_TILES_PER_FRAME = 240;
/**
 * How long a frame may take, from its start, before it stops what the camera's rest leaves to do:
 * planning the cells left after a change, and drawing again what a switch or a recolor left off
 * screen. A frame busy with what shows does none of it, and each region it changes makes PixiJS
 * gather that region's drawings again after the clock, so a frame changes one region at most.
 */
const IDLE_BUDGET = 5;
/** The most cells listed at once; beyond them every cell is planned at once, as before. */
const MAX_LISTED_CELLS = 4096;

/**
 * The selection's marks are drawn in white and tinted to the theme's selection color, so that a theme
 * switch only tints them, however many they are.
 */
const MARK = '#FFFFFF';

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
    /** Where among the rows of the container they would become rows: a bar across it. */
    slot?: Rect;
  };
  /** Where dropped shapes will be while their change waits to be confirmed. */
  ghost?: Rect[];
}

/** What the grid, snapping and the rulers do: each person's preferences (A3). */
export interface GridOptions {
  grid: boolean;
  snapToGrid: boolean;
  rulers: boolean;
}

/** Where a drag places its shapes, for the container's grid and the readout beside the pointer (A3). */
export interface DragFrame {
  /** Whether the drag snaps to the grid now; Alt places freely. */
  snapping: boolean;
  /** The key of the container's shape the moving shape lands in; absent in World. */
  container?: string;
  /** What the readout beside the pointer says, and where the pointer is on screen. */
  readout?: { text: string; at: Point };
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
  /** For free shapes: the arrows it draws. */
  arrows: readonly ArrowShape[];
  /** For relations drawn in full: the casings under their lines, in white, tinted to the canvas. */
  casing?: Graphics;
  /** The theme whose canvas the casings are tinted to; those off screen are tinted before they show. */
  casingTheme?: ThemeName;
  /**
   * How many times the colors of what it draws changed, and what its drawings and labels were made
   * for, as `theme/restyle.ts` stamps them; and drawings made for another stamp, until they show.
   */
  paints: number;
  /**
   * How many times what its labels are written on changed its colors while its own drawings did not:
   * the fill of the container its drawings' names are written on (ADR-0027). Its labels' stamp
   * counts it, so that they are tinted again.
   */
  retints: number;
  coarseStamp: string;
  fullStamp: string;
  labelStamp: string;
  prepared?: { stamp: string; coarse?: GraphicsContext; full?: GraphicsContext };
  /** Each label written, with what its tint follows. */
  labelPaint: LabelPaint[];
  /** Whether it had a full drawing when the colors of what it draws last changed. */
  hadFull?: boolean;
  /**
   * For shapes that declare levels of detail (ADR 0055): those levels, the one they show now, by its
   * index in `sortedLevels`, which the next scale goes on from, and what it shows. Absent for the
   * canvas's own steps.
   */
  levels?: readonly LevelOfDetail[];
  levelAt?: number;
  levelDetail?: TileDetail;
  /** Whether its level shows no pictures, which the image drawings then leave out. */
  imagesHidden?: boolean;
}

/** What the tiles of element shapes were last made from. */
interface ShapesFrom {
  indexed: IndexedScene;
  hidden: ReadonlySet<string>;
  dimmed: ReadonlySet<string>;
}

/** What the tiles of relations were last made from. */
interface RelationsFrom {
  lines: readonly RelationLine[];
  hidden: ReadonlySet<Id>;
  dimmed: ReadonlySet<Id>;
}

/**
 * Which cells are planned: every one while `partial` is off; while it is on, only those in
 * `planned`, the others keeping, off screen, the tiles they had before.
 */
interface CellPlan {
  partial: boolean;
  planned: Set<string>;
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
  /** The canvas shows a theme it did not show before: called in the frame that first shows it. */
  onThemeShown?(theme: ThemeName): void;
}

export interface RendererOptions {
  /** Makes the labels; bitmap text by default. */
  text?: TextFactory;
  /** Decodes pictures and makes their textures; the browser's by default. */
  images?: ImagePlatform<Texture, unknown>;
  /** The theme to draw in from the start; the light theme by default. */
  theme?: CanvasTheme;
  /**
   * How the first scene shown is fitted while nothing has set the camera: as Fit fits, at a scale
   * where names draw, by default; or whole, whatever the scale, as the benchmark measures it.
   */
  firstFit?: 'readable' | 'whole';
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
  /** What editing a route draws: its handles and its line as it now runs, above everything. */
  private readonly routeMarks = new Graphics();
  private routeOverlay: RouteOverlay | undefined;
  /** What the route edit takes out of the tiles: the line it draws itself. */
  private routeHiding: Hidden | undefined;
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
  /** The pictures drawn in the tiles, and the textures they are drawn with. */
  private readonly pictures: TileImages<Texture, unknown>;
  /** Draws in the theme the canvas shows; a switch draws in the next one until it shows (ADR-0033). */
  private painter: Painter;
  /** A switch or a recolor being drawn, all shown in one frame once the screen is ready for it. */
  private pending: { theme: CanvasTheme; opened: number } | undefined;
  /** Whether a drawing or a label may be stale, for a theme or colors no longer current. */
  private restyling = false;
  /** Frames drawn while restyling, which time a switch or a recolor. */
  private restyleFrames = 0;
  /** Drawings replaced by restyles, destroyed once the frame that replaced them is rendered. */
  private retired: GraphicsContext[] = [];
  /**
   * Drawings no frame shows any longer, and regions a switch replaced, destroyed between frames a
   * few milliseconds at a time: destroying hundreds at once, as a switch of the whole view retires,
   * takes a frame of its own.
   */
  private disposal: (GraphicsContext | Container)[] = [];
  private disposing: ReturnType<typeof setTimeout> | undefined;
  /** What drawing tiles again costs, so that a restyle stops before it overruns the frame's clock. */
  private readonly restyleCosts = new RestyleCosts();
  /** What drawing tiles in full costs, geometry included, for the same reason. */
  private readonly drawCosts = new RestyleCosts();
  /** The copies of regions of plain drawings a switch or a recolor will show, by region. */
  private readonly shadows = new Map<Container, Shadow>();
  /** What this frame's restyle left off screen, for `catchUp` once the frame's other work is done. */
  private catchUpWork: CatchUp | undefined;
  /** Whether this frame found the cells near the screen planned, so that the rest may be. */
  private nearPlanned = false;
  /** What restyles did, for the benchmark. */
  readonly stats: RestyleStats = { fallbacks: 0, staleShown: 0, swapAfter: [] };
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
  private shapesFrom: ShapesFrom | undefined;
  private relationsFrom: RelationsFrom | undefined;
  /**
   * Which cells' tiles of shapes, and of relations, are planned from what the tiles were last made
   * from. A change that touches most of them plans at once only the cells near the screen; the
   * others keep the tiles they had, off screen, until they come near or the camera rests.
   */
  private readonly shapeCells: CellPlan = { partial: false, planned: new Set() };
  private readonly relationCells: CellPlan = { partial: false, planned: new Set() };
  /** What the cells near the screen were last planned for: the camera, the canvas and the scene. */
  private nearFor:
    | {
        camera: Camera;
        width: number;
        height: number;
        settled: boolean;
        shapes: ShapesFrom | undefined;
        relations: RelationsFrom | undefined;
      }
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
  /**
   * Runs from each change shown or made on the canvas, a selection, a gesture's marks, a drag or an
   * edit, until it has rested as long as the camera must: what the camera's rest leaves to do waits
   * for that too, so that it never takes time from frames the person is using.
   */
  private activeTimer: ReturnType<typeof setTimeout> | undefined;
  private fitted = false;
  private readonly firstFit: 'readable' | 'whole';
  private resolution = 1;
  camera: Camera = { x: 0, y: 0, scale: 1 };
  /** The grid over the canvas and on one container, and the rulers and the readout (A3). */
  private readonly gridMarks = new GridMarks();
  private readonly screenMarks = new ScreenMarks();
  private grid: GridOptions = { grid: false, snapToGrid: true, rulers: false };
  /** The container under the pointer, whose grid shows while the camera rests, and a drag's frame. */
  private gridHover: string | undefined;
  private gridDrag: DragFrame | undefined;
  private stopFollowingResolution: (() => void) | undefined;
  /** What package code draws inside shapes (ADR 0054), above the shapes and under the relations. */
  private readonly codeDrawings: CodeDrawingLayer;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: RendererCallbacks,
    options: RendererOptions = {},
  ) {
    this.text = options.text ?? bitmapText;
    this.firstFit = options.firstFit ?? 'readable';
    this.pictures = new TileImages(options.images ?? browserImagePlatform(), () =>
      this.requestRender(),
    );
    this.painter = painterOf(options.theme ?? THEMES.light.canvas);
    this.codeDrawings = new CodeDrawingLayer(this.text, () => this.requestRender());
    this.codeDrawings.setDark(this.painter.theme.name === 'dark');
    this.tintMarks();
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
      this.routeMarks,
    );
    this.world.addChild(
      this.elementShapes,
      this.codeDrawings.container,
      this.relations.container,
      this.freeShapes,
      this.rerouted,
      this.dragged,
      this.marks,
    );
    this.world.addChildAt(this.gridMarks.whole, 0);
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
    this.noteActivity();
    this.indexed = indexed;
    this.pictures.show(indexed.scene.shapes);
    if (this.status !== 'ready') return;
    try {
      this.updateEmphasized();
      this.followCodeDrawings();
      // Fitted first, so that the first plan knows what is near the screen.
      if (!this.fitted) this.fitFirst();
      this.rebuild();
      this.drawSelection();
      this.drawHover();
      this.drawEmphasis();
      this.gridFollowsScene();
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
    this.noteActivity();
    const before = this.emphasized;
    this.emphasis = emphasis;
    const after = this.updateEmphasized();
    this.followCodeDrawings();
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
    this.noteActivity();
    if (selection !== this.selection) {
      this.selection = selection;
      this.drawSelection();
      this.markExtent();
    }
    if (hovered !== this.hovered) {
      this.hovered = hovered;
      this.drawHover();
    }
    this.requestRender();
  }

  /** Draws the marks of the gesture under way. */
  setOverlay(overlay: Overlay): void {
    this.noteActivity();
    this.overlay = overlay;
    this.drawGesture();
    this.requestRender();
  }

  /**
   * Draws a relation's route as it is edited (ADR 0039): its handles, and while it changes, its line
   * as it now runs, which leaves its tiles meanwhile, with what a dragged end would attach to. Nothing
   * else is drawn again while the edit goes on.
   */
  setRouteOverlay(overlay: RouteOverlay | undefined): void {
    this.noteActivity();
    this.routeOverlay = overlay;
    const hides = overlay?.preview ? overlay.relation : undefined;
    const hiding =
      this.routeHiding && this.hidden === this.routeHiding
        ? [...this.routeHiding.relations][0]
        : undefined;
    if (!this.drag && hides !== hiding) {
      this.routeHiding =
        hides === undefined
          ? undefined
          : {
              shapes: NOTHING_HIDDEN.shapes,
              relations: new Set([hides]),
              free: NOTHING_HIDDEN.free,
            };
      this.hidden = this.routeHiding ?? NOTHING_HIDDEN;
      try {
        if (this.indexed && this.status === 'ready') this.rebuild();
      } catch (error) {
        this.callbacks.onFailure(error);
      }
      this.drawSelection();
    }
    this.drawRouteMarks();
    this.requestRender();
  }

  /** Draws the route edit for the scale and the theme shown now. */
  private drawRouteMarks(): void {
    drawRouteOverlay(this.routeMarks, this.routeOverlay, this.camera.scale, this.painter);
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
    this.noteActivity();
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

  /**
   * Moves the dragged shapes by a distance in canvas units; `frame` says where they land, for the
   * container's grid and the readout (A3).
   */
  dragTo(delta: Point, frame?: DragFrame): void {
    this.noteActivity();
    this.dragged.position.set(delta.x, delta.y);
    this.movingMarks.position.set(delta.x, delta.y);
    if (this.drag) this.drag.delta = delta;
    this.dragMarks(delta, frame);
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
    this.dragMarks({ x: 0, y: 0 }, undefined);
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
    if (this.hiddenNow().shapes.has(key)) return false;
    const tile = this.tileOfShape.get(key);
    // Far out, or at a level of detail that shows a silhouette, shapes are plain blocks.
    if (!tile || this.coarseFor(tile, this.camera.scale < COARSE_BELOW)) return false;
    return tile.full !== undefined;
  }

  /**
   * Whether the tile that draws the shape with this key is drawn in full, with every label the
   * scale shows: what the benchmark's edit of one column waits for (ADR 0023).
   */
  shownInFull(key: string): boolean {
    const tile = this.tileOfShape.get(key);
    if (!tile?.full || (tile.coarse && tile.plainShown)) return false;
    if (!isPlanned(this.shapeCells, tile.cell)) return false;
    const level = this.detailOf(tile, this.detailNow(), this.camera.scale).wanted;
    return level === 0 || (tile.level === level && tile.labelled >= labelCount(tile));
  }

  /**
   * Starts again the time the canvas must rest, from a change shown or made on it, before what the
   * camera's rest leaves to do goes on; a frame comes once it has.
   */
  private noteActivity(): void {
    clearTimeout(this.activeTimer);
    this.activeTimer = setTimeout(() => {
      this.activeTimer = undefined;
      this.requestRender();
    }, SETTLE_AFTER);
  }

  /** Whether the camera rests and nothing else happened on the canvas for as long. */
  private get resting(): boolean {
    return this.settled && this.activeTimer === undefined;
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
      this.drawRouteMarks();
    }
    this.settled = false;
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settled = true;
      this.sharpen();
      if (this.marksStale) this.drawSelection();
      this.followGrid(true);
      this.requestRender();
    }, SETTLE_AFTER);
    this.followGrid();
    this.codeDrawings.setCamera(camera, this.viewport, NAMES_FROM);
    this.callbacks.onCamera?.(camera);
    this.requestRender();
  }

  /** Draws what package code drew inside shapes from now on, by element (ADR 0054). */
  setCodeDrawings(drawings: ReadonlyMap<Id, CodeDrawing>): void {
    this.codeDrawings.setDrawings(drawings);
    this.followCodeDrawings();
    this.requestRender();
  }

  /** Keeps package code's drawings on the shapes shown, as the emphasis leaves them, on screen. */
  private followCodeDrawings(): void {
    this.codeDrawings.setScene(
      this.indexed?.scene,
      this.emphasized.hidden.shapes,
      this.emphasized.dimmed.shapes,
    );
    this.codeDrawings.setCamera(this.camera, this.viewport, NAMES_FROM);
  }

  /**
   * Fit: zooms and pans so that the whole scene shows, or `bounds` of it, at a scale where names
   * draw; when the whole would draw none, at the scale they start to, from its top left corner
   * (`readableFitCamera`). Names start where the shapes' levels write them, or the canvas's own step
   * for shapes that declare none (`namesFromOf`).
   */
  fit(bounds?: Rect): void {
    const { width, height } = this.viewport;
    if (width === 0 || height === 0 || !this.indexed) return;
    this.fitted = true;
    this.setCamera(
      readableFitCamera(
        bounds ?? this.indexed.scene.bounds,
        { width, height },
        FIT_MARGIN,
        namesFromOf(this.indexed.scene.shapes, NAMES_FROM),
        this.rulersInset,
      ),
    );
  }

  /** Fits the next scene shown, as the first one is: another view's, whose camera nothing set. */
  fitWhenShown(): void {
    this.fitted = false;
  }

  /**
   * Whether the camera looks at the scene shown: it was fitted to it, or set since. Before, as while
   * the canvas starts, it is where every canvas starts, which belongs to no view.
   */
  get looking(): boolean {
    return this.fitted;
  }

  /** Fits the first scene shown, as the options say. */
  private fitFirst(): void {
    if (this.firstFit === 'whole') this.fitWhole();
    else this.fit();
  }

  /** Zooms and pans so that the whole scene shows, whatever the scale, as the benchmark measures it. */
  fitWhole(): void {
    const { width, height } = this.viewport;
    if (width === 0 || height === 0 || !this.indexed) return;
    this.fitted = true;
    this.setCamera(
      fitCamera(this.indexed.scene.bounds, { width, height }, FIT_MARGIN, this.rulersInset),
    );
  }

  /**
   * Shows or hides the grid and the rulers, and says whether shapes snap to the grid, which they do
   * only while it shows (A3).
   */
  setGrid(options: GridOptions): void {
    this.grid = options;
    this.gridMarks.set({ shown: options.grid, snapping: options.grid && options.snapToGrid });
    const rulers = this.screenMarks.rulersShown;
    this.screenMarks.setRulers(options.rulers);
    if (options.rulers && !rulers) this.markExtent();
    this.followGrid();
    this.placeContainerGrid();
    this.requestRender();
  }

  /**
   * Draws the grid, the rulers and the readout in a theme's colors (A3), in the frame that shows the
   * rest of the canvas in it: the grid is retinted, and drawn again where the themes' strengths differ.
   */
  private themeGrid(theme: CanvasTheme): void {
    this.gridMarks.setTheme(theme);
    this.screenMarks.setTheme(theme);
    this.followGrid();
  }

  /**
   * Draws the grid on the fill of the shape with this key, the innermost under the pointer that holds
   * contents, while the grid shows and the camera rests; nothing for `undefined` (A3).
   */
  showContainerGrid(key: string | undefined): void {
    if (key === this.gridHover) return;
    this.gridHover = key;
    this.placeContainerGrid();
    this.requestRender();
  }

  /** Whether a point on screen, relative to the canvas, lies on a ruler (A3). */
  rulersContain(point: Point): boolean {
    return this.screenMarks.contains(point);
  }

  /** How far in from the canvas's left and top the rulers cover it (A3). */
  get rulersInset(): Inset {
    return this.screenMarks.inset;
  }

  /**
   * The grid and the rulers follow the camera, the canvas's size and its resolution; with `rest`, the
   * camera rests, and the grid is drawn exactly for it.
   */
  private followGrid(rest = false): void {
    if (this.status !== 'ready') return;
    const viewport = this.viewport;
    this.gridMarks.follow(this.camera, viewport, this.resolution, rest);
    this.screenMarks.follow(this.camera, viewport, this.resolution);
    this.placeContainerGrid();
  }

  /** A new scene can move the container whose grid shows, and what is selected. */
  private gridFollowsScene(): void {
    this.placeContainerGrid();
    this.markExtent();
  }

  /**
   * Shows the grid in the container a drag snaps in, or else, while the camera rests, in the one under
   * the pointer: last in the band its shape is drawn in, so over its fill and under its contents.
   */
  private placeContainerGrid(): void {
    const drag = this.gridDrag;
    const key =
      drag !== undefined
        ? drag.snapping
          ? drag.container
          : undefined
        : this.settled && this.drag === undefined
          ? this.gridHover
          : undefined;
    const indexed = this.indexed;
    const shape = key === undefined || !this.grid.grid ? undefined : indexed?.byKey.get(key);
    const at = shape && indexed?.indexOfKey.get(shape.key);
    const band = at === undefined ? undefined : indexed?.bands[at];
    const drawn =
      shape !== undefined &&
      band !== undefined &&
      band < MAX_BANDS &&
      shape.holdsContents &&
      shape.collapsed === undefined &&
      // Rows are stacked by their table, never placed on a grid (ADR 0023).
      shape.rowCount === undefined &&
      !this.hiddenNow().shapes.has(shape.key);
    this.gridMarks.showInside(
      drawn ? { shape, parent: this.band(band).container } : undefined,
      this.camera,
      this.resolution,
    );
  }

  /** Marks where the selection lies on the rulers, while they show. */
  private markExtent(): void {
    if (!this.screenMarks.rulersShown) return;
    const indexed = this.indexed;
    this.screenMarks.setExtent(
      indexed && selectionBounds(indexed, this.selection, this.emphasized.hidden),
    );
  }

  /** A drag moves the selection's marks on the rulers, the container's grid and the readout. */
  private dragMarks(delta: Point, frame: DragFrame | undefined): void {
    this.gridDrag = frame;
    this.placeContainerGrid();
    this.screenMarks.moveExtent(delta);
    const readout = frame?.readout;
    if (readout && (this.grid.grid || this.grid.rulers)) {
      this.screenMarks.showReadout(readout.text, readout.at);
    } else this.screenMarks.hideReadout();
  }

  /**
   * Follows devicePixelRatio, which a browser zoom or a move to another screen changes: the canvas is
   * drawn at the new resolution, its text sharpened and the grid drawn again (A3).
   */
  private followResolution(): void {
    this.stopFollowingResolution = watchResolution(
      this.host.ownerDocument.defaultView,
      (resolution) => {
        if (this.status !== 'ready') return;
        const { width, height } = this.viewport;
        this.app.renderer.resize(Math.max(1, width), Math.max(1, height), resolution);
        this.resolution = resolution;
        this.sharpen();
        this.followGrid();
        this.requestRender();
      },
    );
  }

  /**
   * Draws the open view as a PNG image (R27): what is visible, or the whole view, at 1Ã— or 2Ã—, as the
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
    const detail: { coarse: boolean; wanted: Tile['level'] } =
      request.area === 'visible'
        ? this.detailNow()
        : {
            coarse: scale < COARSE_BELOW,
            wanted: scale >= DETAILS_FROM ? 2 : scale >= NAMES_FROM ? 1 : 0,
          };
    const { coarse, wanted } = detail;
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
      // A container's grid is drawn among the shapes, but it is a mark too.
      change(this.gridMarks.inside, 'visible', false);
      // Every cell the image shows is planned from the scene as it is.
      if (request.area === 'view') this.planEverything();
      else this.planWithin(plan.frame);
      const lookups = this.lookups();
      for (const tile of this.tiles.values()) {
        if (!meets(tile.bounds, plan.frame)) continue;
        const plain = tile.plainShown;
        putBack.push(() => showPlain(tile, plain));
        // What the image alone draws in full and names, away from the screen, goes once it is drawn.
        const before = {
          full: tile.full,
          labels: tile.labels,
          level: tile.level,
          labelled: tile.labelled,
        };
        putBack.push(() => this.forgetDrawnFor(tile, before));
        // Drawn in the theme and colors shown, off screen too: a tile the canvas would draw again
        // before it shows is drawn again now.
        if (!this.pending) this.restyleNow(tile, lookups);
        // Shapes that declare levels of detail show what their level shows: what is visible as the
        // screen shows it, the whole view at the scale it is drawn at (ADR 0055).
        const own =
          tile.kind === 'shapes' && tile.levels !== undefined
            ? request.area === 'visible' && tile.levelDetail
              ? tile.levelDetail
              : this.detailOf(tile, detail, scale, false)
            : { coarse, wanted: wantedFor(tile.kind, wanted) };
        if (!own.coarse && !tile.full) this.drawFully(tile);
        const full = !own.coarse && tile.full !== undefined;
        showPlain(tile, !full);
        if (tile.full) change(tile.full, 'visible', full || !tile.coarse);
        if (tile.casing) change(tile.casing, 'visible', full || !tile.coarse);
        const level = own.wanted;
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
    // The legend of the view's overlays goes in a band below the drawing (ADR 0055).
    const legend = this.legend;
    return toPng(
      legend ? withLegendBand(canvas, legend, t, this.painter.name, request.scale) : canvas,
    );
  }

  /** The legend of the open view's overlays, which an image draws in a band below it (ADR 0055). */
  setLegend(legend: Legend | undefined): void {
    this.legend = legend;
  }

  private legend: Legend | undefined;

  /**
   * Lets go of what an image drew for a tile that the canvas had not drawn so, unless the tile is
   * near the screen, where the canvas would draw it so anyway: its full drawing and casings, and the
   * labels it wrote. The drawings go between frames.
   */
  private forgetDrawnFor(
    tile: Tile,
    before: { full?: Graphics; labels?: Container; level: Tile['level']; labelled: number },
  ): void {
    if (meets(tile.bounds, this.nearRect())) return;
    if (!before.full && tile.full) {
      const gone: Container[] = [tile.full];
      if (tile.casing) gone.push(tile.casing);
      for (const each of gone) each.removeFromParent();
      this.dispose(gone);
      tile.full = undefined;
      tile.casing = undefined;
      tile.casingTheme = undefined;
      showPlain(tile, true);
    }
    const wrote =
      tile.labels !== before.labels ||
      tile.level !== before.level ||
      tile.labelled !== before.labelled;
    if (wrote && tile.labels) {
      tile.labels.removeFromParent();
      this.dispose([tile.labels]);
      tile.labels = undefined;
      tile.level = 0;
      tile.labelled = 0;
      tile.labelPaint = [];
      tile.labelStamp = '';
    }
  }

  /** How many tiles are drawn in full, and how many shapes and relations are named, for the benchmark. */
  get drawnInFull(): { tiles: number; labels: number } {
    let tiles = 0;
    let labels = 0;
    for (const tile of this.tiles.values()) {
      if (tile.full) tiles += 1;
      if (tile.labels) labels += tile.labelled;
    }
    return { tiles, labels };
  }

  /** Releases the canvas, now or as soon as its start finishes. */
  destroy(): void {
    if (this.status === 'ready') {
      this.stopFollowingResolution?.();
      this.observer?.disconnect();
      cancelFrame(this.frame);
      clearTimeout(this.settleTimer);
      clearTimeout(this.activeTimer);
      clearTimeout(this.disposing);
      this.disposing = undefined;
      this.dropShadows();
      for (const item of this.disposal.splice(0)) destroyDisposed(item);
      for (const context of this.retired.splice(0)) context.destroy();
      this.app.destroy(true, { children: true, context: true });
    }
    this.pictures.destroy();
    this.status = 'destroyed';
  }

  /**
   * Lets every picture's texture go and forgets what each SVG costs, so that the pictures on screen are
   * decoded again as when nothing was drawn yet: the benchmark's cold runs start so.
   */
  resetImages(): void {
    this.pictures.reset();
    this.requestRender();
  }

  /** How many textures the pictures take now, and the estimate of their GPU memory, in bytes. */
  get imageMemory(): { textures: number; bytes: number } {
    return { textures: this.pictures.store.size, bytes: this.pictures.store.gpuBytes };
  }

  /** How the canvas is seen now, for the image drawings, the frame having spent `spent` ms so far. */
  private imageView(spent: number): ImageView {
    return {
      scale: this.camera.scale,
      shown: visibleRect(this.camera, this.viewport),
      resolution: this.resolution,
      settled: this.settled,
      theme: this.painter.name,
      spent,
    };
  }

  private async start(): Promise<void> {
    try {
      await this.app.init({
        preference: 'webgl',
        background: this.painter.theme.background,
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
    this.app.stage.addChild(this.screenMarks.container);
    this.followResolution();
    this.app.canvas.style.display = 'block';
    this.host.appendChild(this.app.canvas);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();
    // The theme may have changed while the canvas started: it shows from the first frame.
    this.app.renderer.background.color = this.painter.theme.background;
    this.callbacks.onThemeShown?.(this.painter.name);
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
    const { painter } = this;
    const outlines = new Graphics();
    painter.shapeOutlines(outlines, shapes);
    painter.relationRoutes(outlines, lines);
    painter.freeShapes(outlines, notes, []);
    const blocks = batched(new Graphics());
    painter.shapeBlocks(blocks, shapes);
    painter.relationLines(blocks, lines);
    sample.addChild(
      blocks,
      outlines,
      ...painter.shapeLabels(shapes, true, this.text),
      ...painter.relationLabels(lines, this.text),
      ...painter.noteTexts(notes),
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
    this.followGrid();
    if (!this.fitted) this.fitFirst();
    this.requestRender();
  }

  /**
   * Makes the tiles for what the scene draws, keeping the tiles whose content is unchanged, wherever
   * their band or key now puts them. `ready` adds shapes drawn in full before, elsewhere than in a tile.
   */
  private rebuild(ready?: ReadonlyMap<string, Readiness>): void {
    const indexed = this.indexed;
    if (!indexed) return;
    // Tiles made, moved or dropped would leave the copies of their regions behind: a switch under way
    // puts them together again.
    this.dropShadows();
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
    this.shapesFrom = { indexed, hidden, dimmed };
    if (!from || changed === undefined) {
      // Every cell is planned again: those near the screen now, the rest before they come near or
      // while the camera rests, so that the cost goes with what shows, not with the whole view.
      const near = this.cellsNear('shapes');
      if (near === undefined) this.planAllShapes(extra, budget);
      else {
        this.shapeCells.partial = true;
        this.shapeCells.planned.clear();
        this.planShapeCells(near, extra, budget);
      }
    } else if (changed.length > 0) {
      // Only the tiles the changed shapes leave and enter are planned again, in cells already
      // planned: the others are planned from the scene as it is then.
      const inPlanned = (cell: string) => isPlanned(this.shapeCells, cell);
      const before = new Map<string, Tile>();
      // A cell's tile in a band is planned again with all its chunks.
      const addGroup = (key: string) => {
        for (const tile of this.chunksOf(chunkBase(key))) {
          if (tile.kind === 'shapes' && inPlanned(tile.cell)) before.set(tile.key, tile);
        }
      };
      const shapesBefore = from.indexed.scene.shapes;
      for (const at of changed) {
        const left = this.tileOfShape.get((shapesBefore[at] as ElementShape).key);
        if (left && inPlanned(left.cell)) {
          if (left.band >= MAX_BANDS) before.set(left.key, left);
          else addGroup(left.key);
        }
        const key = bandTileKeyOf(indexed, at, hidden, dimmed);
        if (key !== undefined) addGroup(key);
      }
      const planned = replannedTiles(
        indexed,
        before,
        changed,
        hidden,
        dimmed,
        this.shapeCells.partial ? inPlanned : undefined,
      );
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
    this.retintUnderRecolored(from?.indexed, indexed);
  }

  /** Plans every tile of element shapes again, in every cell. */
  private planAllShapes(
    extra: ReadonlyMap<string, Readiness> | undefined,
    budget: { left: number },
  ): void {
    const { indexed, hidden, dimmed } = this.shapesFrom as ShapesFrom;
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
    this.shapeCells.partial = false;
    this.shapeCells.planned.clear();
  }

  /**
   * Plans the tiles of element shapes of these cells from the scene as it is, in place of the ones
   * they had, and counts them planned.
   */
  private planShapeCells(
    cells: ReadonlySet<string>,
    extra: ReadonlyMap<string, Readiness> | undefined,
    budget: { left: number },
  ): void {
    if (cells.size === 0) return;
    const { indexed, hidden, dimmed } = this.shapesFrom as ShapesFrom;
    const planned = plannedTiles(indexed, hidden, dimmed, cells);
    const previous = new Map<string, Tile>();
    for (const tile of this.tiles.values()) {
      if (tile.kind === 'shapes' && cells.has(tile.cell)) previous.set(tile.key, tile);
    }
    // Shapes beyond the bands are keyed by their first shape, which another cell may still hold.
    for (const next of planned) {
      const held = this.tiles.get(next.key);
      if (held?.kind === 'shapes' && !previous.has(next.key)) previous.set(next.key, held);
    }
    for (const tile of previous.values()) {
      for (const shape of tile.shapes) {
        if (this.tileOfShape.get(shape.key) === tile) this.tileOfShape.delete(shape.key);
      }
    }
    const touched = this.applyShapePlan(previous, planned, extra, budget);
    for (const tile of touched) {
      for (const shape of tile.shapes) this.tileOfShape.set(shape.key, tile);
    }
    for (const cell of cells) this.shapeCells.planned.add(cell);
  }

  /**
   * The cells of `kind` near the screen, which a change plans at once: those that meet the screen
   * grown as `updateDetail` grows it, those of the shapes or the pieces of routes that reach into
   * it, and those of the tiles drawn before that reach into it. Undefined when that is every cell of
   * the view, or more cells than are worth listing: then every cell is planned at once, as before.
   */
  private cellsNear(kind: 'shapes' | 'relations'): Set<string> | undefined {
    const indexed = this.indexed;
    const { width, height } = this.viewport;
    if (!indexed || width === 0 || height === 0) return undefined;
    const near = this.nearRect();
    const bounds = indexed.scene.bounds;
    if (!bounds) return undefined;
    // The whole view near the screen, as fitted or far out: every cell at once.
    if (contains(near, bounds)) return undefined;
    const cells = cellsMeeting(near);
    if (cells === undefined) return undefined;
    // What reaches into `near` from a cell outside it crosses its border, or holds all of it: only
    // what lies on its border, or on its middle, is looked at, however much `near` holds.
    const edges = edgesOf(near);
    if (kind === 'shapes') {
      const cellOfShape = cellsOfShapes(indexed.scene.shapes);
      for (const edge of edges) {
        for (const at of indexed.shapes.query(edge)) cells.add(cellOfShape[at] as string);
      }
    } else {
      // What a tile of relations draws lies in its cell, but for a little more than a line's width,
      // an arrowhead, half a piece of a curve or a name, all far short of how far `near` reaches
      // beyond the screen; but for a route left whole, which reaches as far as it goes.
      const lines = indexed.scene.relations;
      for (const edge of edges) {
        for (const at of indexed.relations.query(edge)) {
          const line = lines[at] as RelationLine;
          if (cutAtItsCells(line)) continue;
          for (const piece of routePieces(line)) cells.add(piece.cell);
        }
      }
    }
    for (const tile of this.tiles.values()) {
      if (tile.kind === kind && meets(tile.bounds, near)) cells.add(tile.cell);
    }
    return cells;
  }

  /** The tiles of a cell's chunks, by the key of the first, in order. */
  private chunksOf(base: string): Tile[] {
    const found: Tile[] = [];
    for (let index = 0; ; index++) {
      const tile = this.tiles.get(chunkKey(base, index));
      if (!tile) return found;
      found.push(tile);
    }
  }

  /** Whether a tile's cell is planned: a tile of free shapes always is. */
  private tilePlanned(tile: Tile): boolean {
    if (tile.kind === 'free') return true;
    return isPlanned(tile.kind === 'shapes' ? this.shapeCells : this.relationCells, tile.cell);
  }

  /**
   * The screen, grown as far as `updateDetail` draws ahead of the camera, and at least half a cell:
   * what a tile of relations draws beyond its cell stays within that.
   */
  private nearRect(): Rect {
    const shown = visibleRect(this.camera, this.viewport);
    const reach = this.settled
      ? Math.max(shown.width, shown.height) / 2
      : Math.max(64 / this.camera.scale, TILE / 2);
    return grow(shown, Math.max(reach, TILE / 2));
  }

  /**
   * Plans, before the frame draws, the cells near the screen not planned since the last change that
   * touched most shapes or lines: those the camera brought near. While the camera rests, it plans the
   * others too, the nearest first, within a clock of its own, until every cell is planned.
   */
  private planNear(): void {
    if (!this.shapeCells.partial && !this.relationCells.partial) return;
    const { width, height } = this.viewport;
    const looked = this.nearFor;
    const same =
      looked !== undefined &&
      looked.camera === this.camera &&
      looked.width === width &&
      looked.height === height &&
      looked.settled === this.settled &&
      looked.shapes === this.shapesFrom &&
      looked.relations === this.relationsFrom;
    if (!same) {
      const budget = { left: AT_ONCE };
      if (this.shapeCells.partial) {
        const near = this.cellsNear('shapes');
        if (near === undefined) this.planAllShapes(undefined, budget);
        else this.planShapeCells(unplanned(near, this.shapeCells), undefined, budget);
      }
      if (this.relationCells.partial) {
        const near = this.cellsNear('relations');
        if (near === undefined) this.planAllRelations(budget);
        else this.planRelationCells(unplanned(near, this.relationCells), budget);
      }
      this.nearFor = {
        camera: this.camera,
        width,
        height,
        settled: this.settled,
        shapes: this.shapesFrom,
        relations: this.relationsFrom,
      };
      // The frame that draws a change, or a camera that moves, draws nothing more than that.
      if (this.shapeCells.partial || this.relationCells.partial) this.requestRender();
      return;
    }
    this.nearPlanned = true;
  }

  /**
   * Does, while the camera rests, what that leaves to do, in what the frame's own work leaves of
   * `IDLE_BUDGET`: first the cells not planned yet, then what a switch or a recolor left off screen,
   * one region at a time.
   */
  private idle(frameBegan: number): void {
    const work = this.catchUpWork;
    this.catchUpWork = undefined;
    const near = this.nearPlanned;
    this.nearPlanned = false;
    if (!this.resting) return;
    const left = () => IDLE_BUDGET - (performance.now() - frameBegan);
    if (near && (this.shapeCells.partial || this.relationCells.partial) && this.planRest(left)) {
      return;
    }
    if (work && !this.pending) this.catchUp(work, left);
  }

  /**
   * Plans the cells not planned yet of one region, the nearest the middle of the screen first, as
   * many as `left` allows; asks for another frame while some are left. Says whether it planned any.
   */
  private planRest(left: () => number): boolean {
    const indexed = this.indexed;
    if (!indexed) return false;
    const waiting = new Set<string>();
    const bounds = indexed.scene.bounds;
    if (bounds) for (const cell of cellsMeeting(bounds) ?? []) waiting.add(cell);
    for (const tile of this.tiles.values()) if (tile.kind !== 'free') waiting.add(tile.cell);
    const middle = centerOf(visibleRect(this.camera, this.viewport));
    const isLeft = (cell: string) =>
      !isPlanned(this.shapeCells, cell) || !isPlanned(this.relationCells, cell);
    const waitingCells = [...waiting]
      .filter(isLeft)
      .map((cell) => ({ cell, distance: cellDistance(cell, middle) }))
      .sort((a, b) => a.distance - b.distance);
    const budget = { left: 0 };
    const first = waitingCells[0];
    let planned = 0;
    if (first) {
      // The cells of one region, the nearest first, as many as the clock allows: the frame then
      // gathers again the drawings of that region only, which PixiJS does after the clock. A frame
      // that left most of its time plans one at least, so that planning always ends.
      const region = regionOfCell(first.cell);
      for (const { cell } of waitingCells) {
        if (left() <= (planned > 0 ? 0 : IDLE_BUDGET / 2)) break;
        if (regionOfCell(cell) !== region) continue;
        const cells = new Set([cell]);
        if (this.shapeCells.partial) {
          this.planShapeCells(unplanned(cells, this.shapeCells), undefined, budget);
        }
        if (this.relationCells.partial) {
          this.planRelationCells(unplanned(cells, this.relationCells), budget);
        }
        planned += 1;
      }
    }
    if (!waitingCells.some(({ cell }) => isLeft(cell))) {
      // Every cell is planned: the tiles are as a full plan would make them.
      this.shapeCells.partial = false;
      this.shapeCells.planned.clear();
      this.relationCells.partial = false;
      this.relationCells.planned.clear();
    } else {
      this.requestRender();
    }
    return planned > 0;
  }

  /** Plans at once every cell not planned yet: the tiles are then as a plan of the whole view makes them. */
  private planEverything(): void {
    const budget = { left: 0 };
    if (this.shapeCells.partial) this.planAllShapes(undefined, budget);
    if (this.relationCells.partial) this.planAllRelations(budget);
  }

  /** Plans at once every cell that meets `rect` and is not planned yet, as an image needs. */
  private planWithin(rect: Rect): void {
    if (!this.shapeCells.partial && !this.relationCells.partial) return;
    const cells = cellsMeeting(rect);
    const budget = { left: 0 };
    if (cells === undefined) {
      if (this.shapeCells.partial) this.planAllShapes(undefined, budget);
      if (this.relationCells.partial) this.planAllRelations(budget);
      return;
    }
    for (const tile of this.tiles.values()) {
      if (tile.kind !== 'free' && meets(tile.bounds, rect)) cells.add(tile.cell);
    }
    if (this.shapeCells.partial)
      this.planShapeCells(unplanned(cells, this.shapeCells), undefined, budget);
    if (this.relationCells.partial)
      this.planRelationCells(unplanned(cells, this.relationCells), budget);
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
    // Tiles made again only for new colors are kept, and restyled in place.
    const repaints = takeRepaints(plan, (key, next) =>
      sameListButPaint((previous.get(key) as Tile).shapes, next.shapes, SHAPE_PAINT),
    );
    const now = this.detailNow();
    // How far each shape was drawn before this edit, for the tiles it makes; far out, only shapes
    // that declare levels of detail may show more than plain blocks (ADR 0055).
    const ready =
      plan.make.length > 0 && (!now.coarse || plan.make.some((next) => next.levels !== undefined))
        ? this.readiness(previous, extra)
        : undefined;
    const byKey = new Map(planned.map((tile) => [tile.key, tile]));
    const touched: Tile[] = [];
    let reorder = false;

    for (const key of plan.keep) {
      const tile = previous.get(key) as Tile;
      const next = byKey.get(key) as PlannedTile;
      tile.shapes = next.shapes;
      this.relevel(tile, next.levels);
      if (tile.band === MAX_BANDS && tile.rank !== next.rank) reorder = true;
      tile.rank = next.rank;
      dimTile(tile, next.dim);
      touched.push(tile);
    }
    for (const next of repaints) {
      const tile = previous.get(next.key) as Tile;
      if (tile.band === MAX_BANDS && tile.rank !== next.rank) reorder = true;
      Object.assign(tile, { shapes: next.shapes, signature: next.signature, rank: next.rank });
      this.relevel(tile, next.levels);
      dimTile(tile, next.dim);
      this.repaint(tile);
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
      this.relevel(tile, to.levels);
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
      const own = this.detailOf(tile, now, this.camera.scale);
      const shown = own.wanted;
      const wasReady =
        !own.coarse &&
        ready !== undefined &&
        next.shapes.every((shape) => isReady(ready.get(shape.key), shown));
      if (wasReady && budget.left > 0) {
        budget.left -= next.shapes.length;
        this.drawAtOnce(tile, shown);
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
    this.relationsFrom = { lines: relations, hidden, dimmed };
    if (!from || changed === undefined) {
      // As for shapes: the cells near the screen now, the rest before they show.
      const near = this.cellsNear('relations');
      if (near === undefined) this.planAllRelations(budget);
      else {
        this.relationCells.partial = true;
        this.relationCells.planned.clear();
        this.planRelationCells(near, budget);
      }
      return;
    }
    if (changed.changed.size === 0) return;
    // Only in cells already planned: the others are planned from the scene as it is then. A cell's
    // tile of relations is planned again with all its chunks.
    const keys = new Set<string>();
    const add = (key: string) => {
      if (isPlanned(this.relationCells, relationCellOf(key))) keys.add(chunkBase(key));
    };
    for (const [id, line] of changed.changed) {
      for (const tile of this.tilesOfLine.get(id) ?? []) add(tile.key);
      if (line && !hidden.has(id)) {
        for (const key of relationTileKeysOf(line, dimmed.has(id))) add(key);
      }
    }
    const previous = new Map<string, Tile>();
    for (const key of keys) {
      for (const tile of this.chunksOf(key)) {
        if (tile.kind === 'relations') previous.set(tile.key, tile);
      }
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
    this.applyRelationPlan(previous, relationTiles(sorted, hidden, dimmed, keys), budget);
  }

  /** Plans every tile of relations again, in every cell. */
  private planAllRelations(budget: { left: number }): void {
    const { lines, hidden, dimmed } = this.relationsFrom as RelationsFrom;
    const previous = new Map<string, Tile>();
    for (const tile of this.tiles.values()) {
      if (tile.kind === 'relations') previous.set(tile.key, tile);
    }
    this.applyRelationPlan(previous, relationTiles(lines, hidden, dimmed), budget);
    this.relationCells.partial = false;
    this.relationCells.planned.clear();
  }

  /**
   * Plans the tiles of relations of these cells from the scene as it is, from the lines that reach
   * them, in place of the ones they had, and counts them planned.
   */
  private planRelationCells(cells: ReadonlySet<string>, budget: { left: number }): void {
    if (cells.size === 0) return;
    const { lines, hidden, dimmed } = this.relationsFrom as RelationsFrom;
    const keys = new Set<string>();
    for (const cell of cells) {
      keys.add(relationTileKey(cell, false));
      keys.add(relationTileKey(cell, true));
    }
    // The lines whose routes cross the cells, in the scene's order: those whose pieces, arrowheads
    // and names go in them are among these.
    const index = this.indexed?.relations;
    let reaching: readonly RelationLine[] = lines;
    if (index && this.indexed?.scene.relations === lines) {
      const found = new Set<number>();
      for (const cell of cells) for (const at of index.query(cellRect(cell))) found.add(at);
      reaching = [...found].sort((a, b) => a - b).map((at) => lines[at] as RelationLine);
    }
    const previous = new Map<string, Tile>();
    for (const tile of this.tiles.values()) {
      if (tile.kind === 'relations' && cells.has(tile.cell)) previous.set(tile.key, tile);
    }
    this.applyRelationPlan(previous, relationTiles(reaching, hidden, dimmed, keys), budget);
    for (const cell of cells) this.relationCells.planned.add(cell);
  }

  /**
   * Draws the planned tiles of relations in place of the `previous` ones, as `applyShapePlan` does
   * for shapes, and keeps the tiles each relation draws something in.
   */
  private applyRelationPlan(
    previous: ReadonlyMap<string, Tile>,
    planned: readonly RelationTile[],
    budget: { left: number },
  ): void {
    const byKey = new Map(planned.map((tile) => [tile.key, tile]));
    const plan = planTiles(previous, planned);
    // Tiles made again only for new colors are kept, and restyled in place.
    const repaints = takeRepaints(plan, (key, next) =>
      sameListButPaint((previous.get(key) as Tile).touching, next.touching, LINE_PAINT),
    );
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
    for (const next of repaints) {
      const tile = previous.get(next.key) as Tile;
      contentOf(tile, next);
      tile.signature = next.signature;
      dimTile(tile, next.dim);
      this.repaint(tile);
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
      // Free shapes that changed only their colors are restyled in place.
      if (
        existing &&
        sameListButPaint(existing.notes, shownNotes, NOTE_PAINT) &&
        sameListButPaint(existing.arrows, shownArrows, ARROW_PAINT)
      ) {
        Object.assign(existing, { notes: shownNotes, arrows: shownArrows, signature });
        this.repaint(existing);
        continue;
      }
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
    this.painter.shapeBlocks(coarse, planned.shapes, planned.band === MAX_BANDS);
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
      ...(planned.levels === undefined ? {} : { levels: planned.levels }),
    });
  }

  private makeRelationTile(planned: RelationTile): Tile {
    const coarse = batched(new Graphics());
    this.painter.pieceLines(coarse, planned.pieces);
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
    this.painter.freeShapes(full, notes, arrows);
    return this.tileOf({
      key,
      signature,
      kind: 'free',
      notes,
      arrows,
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
          | 'arrows'
          | 'coarse'
          | 'full'
          | 'levels'
        >
      > & {
        bounds: Rect | undefined;
      },
  ): Tile {
    // The plain drawing goes where `place` puts it.
    const container = new Container();
    if (parts.full) container.addChild(parts.full);
    const { bounds, ...rest } = parts;
    const tile: Tile = {
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
      arrows: [],
      plainShown: true,
      ...rest,
      container,
      bounds: grow(bounds ?? { x: 0, y: 0, width: 0, height: 0 }, 16),
      level: 0,
      labelled: 0,
      paints: 0,
      retints: 0,
      coarseStamp: '',
      fullStamp: '',
      labelStamp: '',
      labelPaint: [],
    };
    // Drawn in the theme shown.
    const stamp = this.stampFor(tile, this.painter.name, 'drawings');
    tile.coarseStamp = stamp;
    tile.fullStamp = stamp;
    return tile;
  }

  /** Makes the full drawing of a tile, over its plain drawing and under its labels. */
  private drawFully(tile: Tile): void {
    const full = new Graphics();
    if (tile.kind === 'shapes') this.painter.shapeOutlines(full, tile.shapes);
    else this.painter.routePieces(full, tile.pieces, tile.ends);
    const at = tile.coarse?.parent === tile.container ? 1 : 0;
    if (tile.kind === 'relations') tile.container.addChildAt(this.casingOf(tile), at);
    tile.container.addChildAt(full, tile.casing ? at + 1 : at);
    tile.full = full;
    tile.fullStamp = this.stampFor(tile, this.painter.name, 'drawings');
    showPlain(tile, false);
  }

  /**
   * Builds the geometry of a tile's full drawing and casings now, inside the frame's clock, rather
   * than when PixiJS first renders them, after it.
   */
  private buildFullGeometry(tile: Tile): void {
    const builder = this.geometryBuilder();
    if (tile.full) buildGeometry(builder, tile.full.context);
    if (tile.casing) buildGeometry(builder, tile.casing.context);
  }

  /** Draws a tile in full and writes all its labels for `shown` now, outside the frame's budget. */
  private drawAtOnce(tile: Tile, shown: Tile['level']): void {
    this.drawFully(tile);
    this.pictures.drawAtOnce(tile, this.imageView(0));
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
      tile.labelPaint = [];
      tile.labelStamp = this.stampFor(tile, this.painter.name, 'labels');
    }
    const from = tile.labelled;
    const to = Math.min(labelCount(tile), until);
    if (to <= from) return 0;
    const { painter } = this;
    const texts =
      tile.kind === 'shapes'
        ? painter.shapeLabels(
            tile.shapes.slice(from, to),
            wanted === 2,
            this.text,
            tile.labelPaint,
            this.lookups(),
          )
        : tile.kind === 'relations'
          ? painter.relationLabels(tile.lines.slice(from, to), this.text, tile.labelPaint)
          : painter.noteTexts(tile.notes, tile.labelPaint);
    for (const text of texts) {
      if (text instanceof Text) text.resolution = this.textResolution();
      tile.labels.addChild(text);
    }
    tile.labelled = to;
    return texts.length;
  }

  /**
   * What a tile shows at a scale: as `detail`, the canvas's own steps there, say, or, for shapes that
   * declare levels of detail, as their levels say (ADR 0055). With `remember`, the level reached is
   * the tile's from now on, which hysteresis goes on from; an image looks without moving it.
   */
  private detailOf(
    tile: Tile,
    detail: { coarse: boolean; wanted: Tile['level'] },
    scale: number,
    remember = true,
  ): { coarse: boolean; wanted: Tile['level'] } {
    if (tile.kind !== 'shapes' || tile.levels === undefined) {
      return {
        coarse: detail.coarse,
        wanted: levelWithRows(tile.shapes, wantedFor(tile.kind, detail.wanted), scale),
      };
    }
    const { at, detail: own } = levelDetail(
      tile.levels,
      scale,
      remember ? tile.levelAt : undefined,
      holdsRows(tile.shapes),
    );
    if (remember) {
      tile.levelAt = at;
      tile.levelDetail = own;
      tile.imagesHidden = !own.images;
    }
    return own;
  }

  /** Whether a tile shows its plain drawing now: far out, or at a level that shows a silhouette. */
  private coarseFor(tile: Tile, coarse: boolean): boolean {
    return tile.kind === 'shapes' && tile.levels !== undefined
      ? (tile.levelDetail?.coarse ?? coarse)
      : coarse;
  }

  /** Gives a tile the levels of detail its shapes declare now; another list starts it afresh. */
  private relevel(tile: Tile, levels: readonly LevelOfDetail[] | undefined): void {
    if (tile.levels === levels) return;
    if (levels === undefined) delete tile.levels;
    else tile.levels = levels;
    delete tile.levelAt;
    delete tile.levelDetail;
    delete tile.imagesHidden;
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
    // Restyles first: what shows a theme or colors no longer current comes before any other work.
    const restyled = this.restyle();
    const now = this.detailNow();
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
      // The canvas's own steps, or the levels of detail its shapes declare (ADR 0055).
      const { coarse, wanted } = this.detailOf(tile, now, scale);
      const full = !coarse && tile.full !== undefined;
      showPlain(tile, !full);
      if (tile.full) {
        const visible = full || !tile.coarse;
        if (tile.full.visible !== visible) tile.full.visible = visible;
        // The casings under the lines go with the lines they case: far out, neither is drawn.
        if (tile.casing && tile.casing.visible !== visible) tile.casing.visible = visible;
      }
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
    const drawing = performance.now();
    for (const { tile, draw } of work) {
      if (!draw) continue;
      // Within a count, and within a clock that the geometry built with each drawing counts in,
      // stopping before a drawing that would overrun it, by what drawings like it cost so far.
      const kind = `full ${tile.kind}`;
      const expected = this.drawCosts.estimate(kind, drawingSize(tile));
      const late =
        drawn >= FULL_SHAPES_AT_LEAST && performance.now() - drawing + expected > FULL_BUDGET;
      if (drawings > 0 && (drawn >= FULL_SHAPES_PER_FRAME || late)) {
        more = true;
        break;
      }
      const began = performance.now();
      this.drawFully(tile);
      this.buildFullGeometry(tile);
      this.drawCosts.learn(kind, drawingSize(tile), performance.now() - began);
      drawings += 1;
      drawn += drawingSize(tile);
    }

    const began = performance.now();
    let written = 0;
    const spent = () =>
      performance.now() - began > LABEL_BUDGET - restyled || written >= LABELS_PER_FRAME;
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
    // A shape that declares levels of detail is drawn as its level says, with or without its name
    // and detail (ADR 0055); any other as the canvas's own steps say.
    const levelled = new Map<ElementShape, TileDetail>();
    const ownDetail = (shape: ElementShape): { coarse: boolean; wanted: Tile['level'] } => {
      if (shape.levels === undefined) {
        return { coarse, wanted: details ? 2 : named ? 1 : 0 };
      }
      let known = levelled.get(shape);
      if (!known) {
        known =
          this.tileOfShape.get(shape.key)?.levelDetail ??
          levelDetail(shape.levels, scale, undefined, shape.row !== undefined).detail;
        levelled.set(shape, known);
      }
      return known;
    };
    // Many dragged shapes are drawn in full only near the screen, and named only on it.
    const inFull = (shape: ElementShape) =>
      !ownDetail(shape).coarse && (carried.length <= DRAG_DETAIL || meets(shape.rect, near));
    // Pictures show with the full drawing, but at a level that leaves them out.
    const pictured = (shape: ElementShape) =>
      inFull(shape) && (shape.levels === undefined || levelled.get(shape)?.images === true);
    let names = 0;
    const label = (shapes: readonly ElementShape[]): Container[] => {
      const wanted = shapes.filter(
        (shape) => ownDetail(shape).wanted > 0 && inFull(shape) && meets(shape.rect, shown),
      );
      const room = Math.max(0, DRAG_DETAIL - names);
      names += Math.min(room, wanted.length);
      const chosen = wanted.slice(0, room);
      try {
        const write = (some: readonly ElementShape[], withDetails: boolean) =>
          some.length === 0
            ? []
            : this.painter.shapeLabels(some, withDetails, this.text, undefined, this.lookups());
        return [
          ...write(
            chosen.filter((shape) => ownDetail(shape).wanted === 1),
            false,
          ),
          ...write(
            chosen.filter((shape) => ownDetail(shape).wanted === 2),
            true,
          ),
        ];
      } catch {
        // Without fonts, the shapes move unnamed.
        return [];
      }
    };
    for (const band of [...inBands.keys()].sort((a, b) => a - b)) {
      const shapes = inBands.get(band) as ElementShape[];
      const graphics = new Graphics();
      this.painter.shapeBlocks(
        graphics,
        shapes.filter((shape) => !inFull(shape)),
      );
      this.painter.shapeOutlines(graphics, shapes.filter(inFull));
      this.dragged.addChild(
        graphics,
        ...this.pictures.dragged(shapes.filter(pictured), this.imageView(0)),
        ...label(shapes),
      );
    }
    // Beyond the bands, one after another, each over the names of those before it.
    let graphics: Graphics | undefined;
    for (const shape of beyond) {
      if (!graphics) {
        graphics = new Graphics();
        this.dragged.addChild(graphics);
      }
      if (inFull(shape)) this.painter.shapeOutlines(graphics, [shape]);
      else this.painter.shapeBlocks(graphics, [shape], true);
      const pictures = pictured(shape) ? this.pictures.dragged([shape], this.imageView(0)) : [];
      const names = label([shape]);
      if (names.length > 0 || pictures.length > 0) {
        this.dragged.addChild(...pictures, ...names);
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
      if (coarse) this.painter.relationLines(drawn, rigid);
      else this.painter.relationRoutes(drawn, rigid);
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
      this.painter.freeShapes(free, notes, arrows);
      this.dragged.addChild(free);
      if (named) {
        for (const text of this.painter.noteTexts(notes)) {
          if (text instanceof Text) text.resolution = this.textResolution();
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
    const shapeOf = (end: DrawnEnd) =>
      end.kind === 'shape' ? indexed.byKey.get(end.key) : undefined;
    const endOf = (end: DrawnEnd): RouteEnd | undefined => {
      if (end.kind === 'shape') {
        const shape = indexed.byKey.get(end.key);
        if (!shape) return undefined;
        const rect = shape.plate ?? shape.rect;
        return { rect: hidden.shapes.has(end.key) ? moved(rect, delta) : rect };
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
        // Rows and the shapes that draw them are left beside them, as the scene does (ADR 0023).
        const [start, stop] = dragEnds(
          line.ends,
          from,
          to,
          (key) => indexed.byKey.get(key),
          (key) => {
            const shape = indexed.byKey.get(key);
            return shape && (hidden.shapes.has(key) ? moved(shape.rect, delta) : shape.rect);
          },
        );
        // Routed by hand, through its bend points, or to connection points, where it is so.
        const byHand = rerouted(line, start, stop, shapeOf(line.ends.from), shapeOf(line.ends.to));
        const route = byHand?.route ?? routeWithSides(start, stop, line.ends.offset);
        const end = route.at(-1) as Point;
        const beforeEnd = route.at(-2) as Point;
        if (directionOf(beforeEnd, end)) {
          next = {
            ...line,
            curve: byHand?.curve,
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
    if (this.camera.scale < COARSE_BELOW) this.painter.relationLines(this.reroutedLines, lines);
    else this.painter.relationRoutes(this.reroutedLines, lines);
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
        if (!unseen.shapes.has(shape.key)) {
          box(shape.plate ?? shape.rect, hidden.shapes.has(shape.key));
        }
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
    if (carriedBoxes > 0) moving.stroke({ color: MARK, width });

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
        color: MARK,
        width: lineWidth + 6 / scale,
        alpha: this.painter.theme.selectedGlowAlpha,
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
      graphics.stroke({
        color: MARK,
        width: 8 / scale,
        alpha: this.painter.theme.selectedGlowAlpha,
        cap: 'round',
      });
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
      chunk.stroke({ color: MARK, width: this.markWidth });
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
    const { highlight } = this.painter.theme;
    const halo = { color: highlight, alpha: 0.28, join: 'round', cap: 'round' } as const;
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
    if (rects.length > 0) marks.stroke({ color: highlight, width: 2.5 / scale });
    for (const rect of rects) traceCorners(marks, grow(rect, 11 / scale), 14 / scale);
    if (rects.length > 0) marks.stroke({ color: highlight, width: 3 / scale, cap: 'square' });

    const routes = [
      ...lines.map((line) => ({ route: line.route, width: line.width })),
      ...arrows.map((arrow) => ({ route: [arrow.from, arrow.to], width: 2 })),
    ];
    for (const { route, width } of routes) {
      traceRoute(marks, route);
      marks.stroke({ ...halo, width: width + 12 / scale });
      traceRoute(marks, route);
      marks.stroke({ color: highlight, width: width + 2 / scale, join: 'round', cap: 'round' });
    }
    for (const { route } of routes) {
      for (const end of [route[0], route.at(-1)]) {
        if (end) marks.circle(end.x, end.y, 4 / scale);
      }
    }
    if (routes.length > 0) marks.fill(highlight);
  }

  /** Draws the markers travelling along relations: discs ringed in the canvas color, above the selection. */
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
    const { highlight, background } = this.painter.theme;
    marks.fill(highlight).stroke({ color: background, width: 2.5 / scale });
  }

  /** Marks the shape under the pointer, under the selection's marks. */
  private drawHover(): void {
    const mark = this.hoverMark;
    mark.clear();
    const shape = this.hovered === undefined ? undefined : this.indexed?.byKey.get(this.hovered);
    if (!shape) return;
    const rect = grow(shape.plate ?? shape.rect, 3 / this.camera.scale);
    mark
      .rect(rect.x, rect.y, rect.width, rect.height)
      .stroke({ color: this.painter.theme.selected, width: 1 / this.camera.scale });
  }

  private drawGesture(): void {
    const marks = this.gestureMarks;
    marks.clear();
    const { box, connect, handle, target, drop, ghost } = this.overlay;
    const width = 1.5 / this.camera.scale;
    const { selected, refused, handleFill, boxFillAlpha } = this.painter.theme;
    const outline = (rect: Rect, color: string, lineWidth: number) =>
      marks.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color, width: lineWidth });
    for (const rect of ghost ?? []) {
      marks
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color: selected, alpha: boxFillAlpha })
        .stroke({ color: selected, width });
    }
    if (drop?.into) {
      const rect = drop.into;
      marks
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color: selected, alpha: boxFillAlpha * 0.75 })
        .stroke({ color: selected, width: width * 2 });
    }
    for (const rect of drop?.copies ?? []) outline(rect, selected, width);
    if (drop?.leaving) outline(drop.leaving, selected, width);
    if (drop?.pending) outline(drop.pending, selected, width * 0.75);
    if (drop?.refused) outline(drop.refused, refused, width * 2);
    if (drop?.slot) {
      const bar = drop.slot;
      const thick = Math.max(bar.height, 3 / this.camera.scale);
      marks.rect(bar.x, bar.y - thick / 2, bar.width, thick).fill({ color: selected });
    }
    if (box) {
      marks
        .rect(box.x, box.y, box.width, box.height)
        .fill({ color: selected, alpha: boxFillAlpha })
        .stroke({ color: selected, width });
    }
    if (target) outline(grow(target, 4 / this.camera.scale), selected, width * 2);
    if (connect) {
      marks
        .moveTo(connect.from.x, connect.from.y)
        .lineTo(connect.to.x, connect.to.y)
        .stroke({ color: selected, width: width * 1.5 });
      marks.circle(connect.to.x, connect.to.y, 4 / this.camera.scale).fill(selected);
    }
    if (handle) {
      marks
        .circle(handle.x, handle.y, 7 / this.camera.scale)
        .fill(handleFill)
        .stroke({ color: selected, width: width * 1.5 });
      const arm = 3.5 / this.camera.scale;
      marks
        .moveTo(handle.x - arm, handle.y)
        .lineTo(handle.x + arm, handle.y)
        .moveTo(handle.x, handle.y - arm)
        .lineTo(handle.x, handle.y + arm)
        .stroke({ color: selected, width });
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
    const began = performance.now();
    try {
      // What comes near the screen is planned from the scene as it is, before anything draws it.
      this.planNear();
      if (this.marksDrawn < this.markRects.length) this.drawChunks();
      this.updateDetail();
      // Pictures within what is left of the frame's budget; the store asks for frames as they arrive.
      if (this.pictures.frame(this.tiles.values(), this.imageView(performance.now() - began))) {
        this.requestRender();
      }
      // What the camera's rest leaves to do, in what the frame has left of its time.
      this.idle(began);
      const drag = this.drag;
      if (drag && drag.routed.length > 0 && drag.routedAt !== drag.delta) this.routeDrag();
      this.cull();
      this.countStale();
      this.app.render();
      this.sendShadows();
      this.dispose(this.retired.splice(0));
      if (waitForGpu) this.waitForGpu();
    } catch (error) {
      this.callbacks.onFailure(error);
    }
  }

  /**
   * Destroys between frames these drawings, or these containers with what they hold but not the
   * geometry of their drawings, which no frame shows any longer.
   */
  private dispose(items: readonly (GraphicsContext | Container)[]): void {
    if (items.length === 0) return;
    this.disposal.push(...items);
    this.disposing ??= setTimeout(() => this.drainDisposal(), 0);
  }

  /** Destroys what waits for it, for a few milliseconds, and leaves the rest for later. */
  private drainDisposal(): void {
    this.disposing = undefined;
    const began = performance.now();
    while (this.disposal.length > 0) {
      destroyDisposed(this.disposal.pop() as GraphicsContext | Container);
      if (performance.now() - began > DISPOSE_BUDGET) break;
    }
    if (this.disposal.length > 0) this.disposing = setTimeout(() => this.drainDisposal(), 0);
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

  /** The theme the canvas shows: during a switch, the one it shows until the switch does. */
  get theme(): ThemeName {
    return this.painter.name;
  }

  /** Whether a theme switch or a recolor is being drawn, and has not shown yet. */
  get switching(): boolean {
    return this.pending !== undefined;
  }

  /**
   * Draws the canvas in this theme (ADR-0033). The tiles on screen that follow the theme are drawn
   * again behind the ones showing, within the frame's clock, and then the canvas shows the new theme in
   * one frame, its background, tiles, labels and marks together, and says so with `onThemeShown`; the
   * tiles off screen are drawn again before they show. The scene is never built again. Before the
   * canvas has started, the theme is only kept, and the canvas starts in it.
   */
  setTheme(theme: CanvasTheme): void {
    const target = this.pending?.theme ?? this.painter.theme;
    if (theme === target) return;
    this.codeDrawings.setDark(theme.name === 'dark');
    if (this.status !== 'ready') {
      this.painter = painterOf(theme);
      this.pending = undefined;
      this.tintMarks();
      return;
    }
    this.pending = { theme, opened: this.restyleFrames };
    this.restyling = true;
    this.requestRender();
  }

  /** Restyles in place a tile whose shapes, lines or notes changed only their colors. */
  private repaint(tile: Tile): void {
    tile.paints += 1;
    tile.hadFull = tile.full !== undefined;
    this.pending ??= { theme: this.painter.theme, opened: this.restyleFrames };
    this.restyling = true;
  }

  /** What a tile's drawings or labels show in a theme, as `theme/restyle.ts` stamps them. */
  private stampFor(tile: Tile, theme: ThemeName, of: 'drawings' | 'labels'): string {
    if (of === 'drawings') return stampOf(drawingsFollowTheme(tile), theme, tile.paints);
    return `${stampOf(labelsFollowTheme(tile), theme, tile.paints)} ${tile.retints}`;
  }

  /**
   * Tints again the names written under the drawings that sit in a container whose fill changed, in
   * the frame that shows the rest of the change: they are written on that fill (ADR-0027), while
   * their own tiles stay as they are. Only the shapes drawn by their pictures are looked at.
   */
  private retintUnderRecolored(was: IndexedScene | undefined, indexed: IndexedScene): void {
    if (!was || was === indexed) return;
    let any = false;
    for (const shape of namedUnderDrawings(indexed.scene.shapes)) {
      const key = shape.containerShape as string;
      const before = was.byKey.get(key);
      const after = indexed.byKey.get(key);
      if (!before || !after || before === after) continue;
      if (before.fill === after.fill && before.dark?.fill === after.dark?.fill) continue;
      const tile = this.tileOfShape.get(shape.key);
      if (!tile) continue;
      tile.retints += 1;
      any = true;
    }
    if (!any) return;
    this.restyling = true;
    this.requestRender();
  }

  /**
   * Draws again the drawings that show a theme or colors no longer current (`theme/restyle.ts`), and
   * says how long it took. While a switch or a recolor is drawn, those on screen are drawn behind the
   * ones showing, nearest the middle first and at least one a frame; once none is left, or after
   * `SWAP_WITHIN` frames, all show at once. Then what comes near the screen is drawn again before it
   * shows, and the rest while the camera rests.
   */
  private restyle(): number {
    if (!this.restyling) return 0;
    const began = performance.now();
    const elapsed = () => performance.now() - began;
    // Whether drawing this tile again still fits the clock, by what drawings like it cost so far.
    const fits = (work: Work) =>
      elapsed() + this.restyleCosts.estimate(costKind(work), drawingSize(work.tile)) <=
      RESTYLE_BUDGET;
    this.restyleFrames += 1;
    const opened = this.pending;
    const painter = opened ? painterOf(opened.theme) : this.painter;
    const coarse = this.camera.scale < COARSE_BELOW;
    const screen = visibleRect(this.camera, this.viewport);
    const near = grow(
      screen,
      this.settled
        ? Math.max(screen.width, screen.height) / 2
        : Math.max(64 / this.camera.scale, TILE / 2),
    );
    const middle = centerOf(screen);
    const pixels = this.camera.scale * this.resolution;
    const shown: Work[] = [];
    const hidden: Work[] = [];
    const drawnAgain: Work[] = [];
    for (const tile of this.tiles.values()) {
      // A tile of a cell not planned yet is planned again, in the theme shown, before it shows.
      if (!this.tilePlanned(tile)) continue;
      const stamp = this.stampFor(tile, painter.name, 'drawings');
      // Drawn again off screen while the camera rested, and kept until the rest of its region is.
      const unshown = opened === undefined && tile.prepared?.stamp === stamp;
      const stale = staleDrawings(tile, stamp);
      if (stale.length === 0 && !unshown) continue;
      const center = centerOf(tile.bounds);
      const distance = Math.hypot(center.x - middle.x, center.y - middle.y);
      const onScreen = meets(tile.bounds, screen);
      const isNear = onScreen || meets(tile.bounds, near);
      // Shown as soon as it comes near, before it shows on screen.
      if (unshown && isNear) this.showPrepared(tile);
      else if (unshown) drawnAgain.push({ tile, drawings: [], distance, onScreen: false });
      const showing = isNear
        ? shownDrawings(tile, this.coarseFor(tile, coarse), pixels).filter((drawing) =>
            stale.includes(drawing),
          )
        : [];
      if (showing.length > 0) shown.push({ tile, drawings: showing, distance, onScreen });
      const rest = stale.filter((drawing) => !showing.includes(drawing));
      if (rest.length > 0) hidden.push({ tile, drawings: rest, distance, onScreen: false });
    }
    // What is on screen first, then what is near it, each nearest the middle first.
    shown.sort((a, b) =>
      a.onScreen === b.onScreen ? a.distance - b.distance : a.onScreen ? -1 : 1,
    );
    // Once a switch has waited long enough, what is on screen is drawn at once, and it shows.
    const capped = opened !== undefined && this.restyleFrames - opened.opened >= SWAP_WITHIN;
    // A switch whose tiles on screen are all drawn again shows in a frame of its own, which draws
    // nothing else again: showing it costs that frame enough.
    const ready = opened !== undefined && !shown.some((work) => work.onScreen);
    let next = ready ? shown.length : 0;
    let drew = false;
    for (; next < shown.length; next++) {
      const work = shown[next] as Work;
      // What shows a theme or colors no longer current is never shown so: once a switch or a recolor
      // has shown, or once it waited long enough, what is on screen is drawn again whatever the clock.
      const now = work.onScreen && (opened === undefined || capped);
      if (drew && !now && !fits(work)) break;
      this.prepareTimed(work.tile, work.drawings, painter);
      drew = true;
      if (!this.pending) this.showPrepared(work.tile);
    }
    // What was left near the screen is drawn again once the switch shows, before it shows itself.
    const left = ready ? shown.length > 0 : next < shown.length;
    // A region whose plain drawings are all ready is put together behind the one that shows, so that
    // the switch shows it whole rather than gathering it again; it shows a frame later for that.
    // Only plain drawings are copied, so only where they show, far out.
    const shadowed = opened !== undefined && !ready && coarse && this.shadowRegions(painter);
    let swapped = false;
    if (this.pending && ready && !shadowed) {
      this.swap(painter);
      swapped = true;
    }
    let labelsLeft = false;
    let shownSpent = elapsed();
    this.catchUpWork = undefined;
    if (!this.pending) {
      // Labels are tinted again for what shows, or is about to, before they show; the rest while the
      // camera rests, in what is left of a frame (`catchUp`).
      const lookups = this.lookups();
      const theme = this.painter.name;
      const later: Tile[] = [];
      // Labels show only from the scale names show at, and casings with the full drawings: far out,
      // tinting them again waits for the camera to rest, or to come close enough.
      const named = this.camera.scale >= NAMES_FROM;
      for (const tile of this.tiles.values()) {
        if (!this.tilePlanned(tile)) continue;
        const casing = tile.casing !== undefined && tile.casingTheme !== theme;
        const stamp = tile.labels ? this.stampFor(tile, theme, 'labels') : undefined;
        const labels = stamp !== undefined && tile.labelStamp !== stamp;
        if (!casing && !labels) continue;
        const shows = (labels && named) || (casing && !coarse);
        if (shows && (!tile.container.culled || meets(tile.bounds, near))) {
          if (labels) {
            this.painter.retint(tile.labelPaint, lookups);
            tile.labelStamp = stamp;
          }
          // The casings under its lines, in white, take the canvas's color.
          if (casing) this.tintCasing(tile);
        } else {
          labelsLeft = true;
          later.push(tile);
        }
      }
      shownSpent = elapsed();
      // The rest while the camera rests, nearest the screen first, never in the frame that shows a
      // switch, and only in what the frame's other work leaves of its time.
      hidden.sort((a, b) => a.distance - b.distance);
      if (!swapped) this.catchUpWork = { drawings: hidden, drawnAgain, labels: later };
    }
    const waiting = hidden.length > 0 || drawnAgain.length > 0 || labelsLeft;
    this.restyling = this.pending !== undefined || left || waiting;
    if (this.pending || left || (this.resting && waiting)) this.requestRender();
    // Labels share the clock of what shows, not that of catching up while the camera rests.
    return shownSpent;
  }

  /**
   * Draws again, while the camera rests, what a switch or a recolor left off screen, as `left` allows:
   * first the tints of its labels and casings, then one region at a time, the nearest the screen
   * first, its drawings kept until all of them are drawn again and then shown together, since each
   * change of a region's drawings makes PixiJS gather all of them again.
   */
  private catchUp(work: CatchUp, left: () => number): void {
    const lookups = this.lookups();
    const theme = this.painter.name;
    for (const tile of work.labels) {
      if (left() <= 0) return;
      const stamp = tile.labels ? this.stampFor(tile, theme, 'labels') : undefined;
      if (stamp !== undefined && tile.labelStamp !== stamp) {
        this.painter.retint(tile.labelPaint, lookups);
        tile.labelStamp = stamp;
      }
      if (tile.casing && tile.casingTheme !== theme) this.tintCasing(tile);
    }
    let nearest: Work | undefined;
    for (const each of [...work.drawings, ...work.drawnAgain]) {
      if (!nearest || each.distance < nearest.distance) nearest = each;
    }
    if (!nearest) return;
    const region = regionOf(nearest.tile);
    let drew = false;
    for (const drawing of work.drawings) {
      if (regionOf(drawing.tile) !== region) continue;
      const expected = this.restyleCosts.estimate(costKind(drawing), drawingSize(drawing.tile));
      // A frame that left most of its time draws one at least, so that catching up always ends.
      if (left() < expected && (drew || left() < IDLE_BUDGET / 2)) return;
      this.prepareTimed(drawing.tile, drawing.drawings, this.painter);
      drew = true;
    }
    for (const each of [...work.drawings, ...work.drawnAgain]) {
      if (regionOf(each.tile) === region) this.showPrepared(each.tile);
    }
  }

  /**
   * Draws a tile now in the theme and colors shown, whatever it still had to draw again: its
   * drawings, its labels' tints and its casings.
   */
  private restyleNow(tile: Tile, lookups: ReturnType<CanvasRenderer['lookups']>): void {
    const { painter } = this;
    const stamp = this.stampFor(tile, painter.name, 'drawings');
    const stale = staleDrawings(tile, stamp);
    if (stale.length > 0) this.prepare(tile, stale, painter);
    if (tile.prepared?.stamp === stamp) this.showPrepared(tile);
    const labels = tile.labels ? this.stampFor(tile, painter.name, 'labels') : undefined;
    if (labels !== undefined && tile.labelStamp !== labels) {
      painter.retint(tile.labelPaint, lookups);
      tile.labelStamp = labels;
    }
    if (tile.casing && tile.casingTheme !== painter.name) this.tintCasing(tile);
  }

  /** Draws a tile again as `prepare` does, and learns what drawing it cost. */
  private prepareTimed(tile: Tile, drawings: readonly Drawing[], painter: Painter): void {
    const began = performance.now();
    this.prepare(tile, drawings, painter);
    this.restyleCosts.learn(
      costKind({ tile, drawings }),
      drawingSize(tile),
      performance.now() - began,
    );
  }

  /** Draws again, for `painter`'s theme, the given drawings of a tile, behind the ones showing. */
  private prepare(tile: Tile, drawings: readonly Drawing[], painter: Painter): void {
    const stamp = this.stampFor(tile, painter.name, 'drawings');
    if (tile.prepared && tile.prepared.stamp !== stamp) dropPrepared(tile);
    const prepared = (tile.prepared ??= { stamp });
    for (const drawing of drawings) {
      if (prepared[drawing] || !tile[drawing]) continue;
      const graphics = new Graphics();
      if (drawing === 'coarse') {
        graphics.context.batchMode = 'batch';
        if (tile.kind === 'shapes') {
          painter.shapeBlocks(graphics, tile.shapes, tile.band === MAX_BANDS);
        } else {
          painter.pieceLines(graphics, tile.pieces);
        }
      } else if (tile.kind === 'shapes') {
        painter.shapeOutlines(graphics, tile.shapes);
      } else if (tile.kind === 'relations') {
        painter.routePieces(graphics, tile.pieces, tile.ends);
      } else {
        painter.freeShapes(graphics, tile.notes, tile.arrows);
      }
      const { context } = graphics;
      graphics.destroy({ context: false });
      // Its geometry is built now, inside the clock, rather than when it is first rendered.
      buildGeometry(this.geometryBuilder(), context);
      prepared[drawing] = context;
    }
  }

  /** Shows a tile's drawings made again in place of the ones showing, which go once rendered. */
  private showPrepared(tile: Tile): void {
    const prepared = tile.prepared;
    if (!prepared) return;
    tile.prepared = undefined;
    for (const drawing of ['coarse', 'full'] as const) {
      const context = prepared[drawing];
      if (!context) continue;
      const graphics = tile[drawing];
      if (!graphics) {
        this.retired.push(context);
        continue;
      }
      this.retired.push(graphics.context);
      graphics.context = context;
      if (drawing === 'coarse') tile.coarseStamp = prepared.stamp;
      else tile.fullStamp = prepared.stamp;
    }
  }

  /**
   * Shows a switch or a recolor: every drawing made for it, and, for a switch, the new theme's canvas,
   * casings and marks, all in this frame.
   */
  private swap(painter: Painter): void {
    const pending = this.pending;
    if (!pending) return;
    this.showShadows(painter);
    for (const tile of this.tiles.values()) {
      if (!tile.prepared) continue;
      if (tile.prepared.stamp === this.stampFor(tile, painter.name, 'drawings')) {
        this.showPrepared(tile);
      } else {
        dropPrepared(tile);
      }
    }
    const before = this.painter;
    this.painter = painter;
    this.pending = undefined;
    this.stats.swapAfter.push(this.restyleFrames - pending.opened);
    if (before === painter) return;
    const { theme } = painter;
    this.app.renderer.background.color = theme.background;
    // The casings of what shows take the canvas's color now; the others before they show.
    for (const tile of this.tiles.values()) {
      if (tile.casing && !tile.container.culled) this.tintCasing(tile);
    }
    this.restyling = true;
    this.tintMarks();
    // Many marks keep their tint, and take the new theme's glow once the camera rests.
    if (this.markCount <= MARKS_WHILE_MOVING) this.drawSelection();
    else this.marksStale = true;
    this.drawHover();
    this.drawGesture();
    this.drawEmphasis();
    this.drawRouteMarks();
    this.redrawDrag();
    if (before.name !== painter.name) this.callbacks.onThemeShown?.(painter.name);
  }

  /**
   * Puts together, behind each region of plain drawings that shows, a copy of it in the theme or the
   * colors a switch or a recolor brings, once every plain drawing of the region is ready for it: the
   * copy is drawn by PixiJS on its own while hidden, so that showing it costs the switch's frame
   * nothing, where changing the drawings of the region in place would make PixiJS gather all of them
   * again in that frame. A copy that no longer holds what its region does is put together again.
   * Says whether it put any together in this frame.
   */
  private shadowRegions(painter: Painter): boolean {
    const byRegion = plainTilesByRegion(this.tiles.values());
    let built = 0;
    for (const [region, tiles] of byRegion) {
      const known = this.shadows.get(region);
      if (known && this.shadowHolds(known, tiles, painter)) continue;
      if (known) this.dropShadow(region);
      if (built >= SHADOW_TILES_PER_FRAME) continue;
      // Ready once each plain drawing is current for the switch, made again or as it was.
      let changes = false;
      let ready = true;
      for (const tile of tiles) {
        const target = this.shadowTarget(tile, painter);
        if (target === undefined) {
          ready = false;
          break;
        }
        if (target !== tile.coarse?.context) changes = true;
      }
      if (!ready || !changes) continue;
      const shadow = new Container({ isRenderGroup: true });
      shadow.visible = false;
      const copies = new Map<Tile, Graphics>();
      for (const tile of tiles) {
        const copy = new Graphics(this.shadowTarget(tile, painter));
        copy.alpha = (tile.coarse as Graphics).alpha;
        shadow.addChild(copy);
        copies.set(tile, copy);
      }
      const parent = region.parent as Container;
      parent.addChildAt(shadow, parent.getChildIndex(region) + 1);
      this.shadows.set(region, { shadow, copies, theme: painter.name, sent: false });
      built += tiles.length;
    }
    return built > 0;
  }

  /**
   * The drawing a tile's plain drawing shows once the switch or recolor `painter` draws for has
   * shown: the one made again for it, or the one it has when that one is current; none while its new
   * one is still to be made.
   */
  private shadowTarget(tile: Tile, painter: Painter): GraphicsContext | undefined {
    const stamp = this.stampFor(tile, painter.name, 'drawings');
    if (tile.prepared?.stamp === stamp && tile.prepared.coarse) return tile.prepared.coarse;
    return tile.coarseStamp === stamp ? tile.coarse?.context : undefined;
  }

  /** Whether a region's copy still holds the region's tiles, each with the drawing it will show. */
  private shadowHolds(shadow: Shadow, tiles: readonly Tile[], painter: Painter): boolean {
    if (shadow.theme !== painter.name || shadow.copies.size !== tiles.length) return false;
    for (const tile of tiles) {
      const copy = shadow.copies.get(tile);
      if (!copy || copy.context !== this.shadowTarget(tile, painter)) return false;
      // A plain drawing shown or made clear since follows in its copy.
      const alpha = (tile.coarse as Graphics).alpha;
      if (copy.alpha !== alpha) copy.alpha = alpha;
    }
    return true;
  }

  /** Shows, in place of their regions, the copies that still hold what their regions do. */
  private showShadows(painter: Painter): void {
    if (this.shadows.size === 0) return;
    const byRegion = plainTilesByRegion(this.tiles.values());
    for (const [region, shadow] of [...this.shadows]) {
      const tiles = byRegion.get(region) ?? [];
      if (!this.shadowHolds(shadow, tiles, painter)) {
        this.dropShadow(region);
        continue;
      }
      this.shadows.delete(region);
      for (const tile of tiles) {
        const copy = shadow.copies.get(tile) as Graphics;
        const old = tile.coarse as Graphics;
        const prepared = tile.prepared;
        if (prepared?.coarse === copy.context) {
          // The drawing replaced goes once the frame that replaced it is rendered.
          this.retired.push(old.context);
          tile.coarseStamp = prepared.stamp;
          prepared.coarse = undefined;
        }
        tile.coarse = copy;
      }
      // The region leaves whole, and its drawings go between frames, their geometry apart: the copies
      // draw with what did not change, and what did goes with the drawings retired.
      (region.parent as Container).removeChild(region);
      const where = regionPlaces.get(region);
      if (where) {
        where.regions.set(where.key, shadow.shadow);
        regionPlaces.set(shadow.shadow, where);
      }
      shadow.shadow.culled = region.culled;
      shadow.shadow.visible = true;
      this.dispose([region]);
      this.plainBounds = undefined;
    }
  }

  /**
   * Sends to the GPU the geometry of the copies of regions this frame put together. PixiJS gathers a
   * hidden copy's drawings in the frame it is put together, but sends them only the first time it
   * draws them, which would be the switch's frame, every copy at once.
   */
  private sendShadows(): void {
    const renderer = this.app.renderer as unknown as {
      geometry?: { unbind?: () => void };
      buffer?: { updateBuffer?: (buffer: Buffer) => unknown };
    };
    const unbind = renderer.geometry?.unbind;
    const send = renderer.buffer?.updateBuffer;
    if (typeof unbind !== 'function' || typeof send !== 'function') return;
    let unbound = false;
    for (const shadow of this.shadows.values()) {
      if (shadow.sent) continue;
      const set = shadow.shadow.renderGroup?.instructionSet;
      if (!set) continue;
      shadow.sent = true;
      for (let at = 0; at < set.instructionSize; at++) {
        const instruction = set.instructions[at] as {
          renderPipeId?: string;
          action?: string;
          batcher?: { geometry?: { buffers: Buffer[] } };
        };
        if (instruction.renderPipeId !== 'batch' || instruction.action !== 'startBatch') continue;
        const buffers = instruction.batcher?.geometry?.buffers ?? [];
        // No vertex array stays bound, so that sending an index buffer changes none PixiJS keeps.
        if (!unbound) {
          unbind.call(renderer.geometry);
          unbound = true;
        }
        for (const buffer of buffers) send.call(renderer.buffer, buffer);
      }
    }
  }

  /** Lets a region's copy go, its drawings with it but not their geometry, which tiles still hold. */
  private dropShadow(region: Container): void {
    const shadow = this.shadows.get(region);
    if (!shadow) return;
    this.shadows.delete(region);
    shadow.shadow.destroy({ children: true, context: false });
  }

  /** Lets every region's copy go. */
  private dropShadows(): void {
    for (const region of [...this.shadows.keys()]) this.dropShadow(region);
  }

  /** Draws again what a drag carries, where it is now, as at a switch. */
  private redrawDrag(): void {
    const { drag, indexed } = this;
    if (!drag || !indexed) return;
    for (const child of this.dragged.removeChildren()) {
      child.destroy({ children: true, context: true });
    }
    this.drawDrag(indexed, drag);
  }

  /** Tints the selection's marks, drawn in white, to the theme's selection color. */
  private tintMarks(): void {
    this.selectionMarks.tint = this.painter.theme.selected;
    this.movingMarks.tint = this.painter.theme.selected;
    this.themeGrid(this.painter.theme);
  }

  /** The casings under a tile's relations: white, tinted to the canvas, the same in every theme. */
  private casingOf(tile: Tile): Graphics {
    const casing = new Graphics();
    this.painter.casings(casing, tile.pieces, tile.ends);
    tile.casing = casing;
    this.tintCasing(tile);
    return casing;
  }

  /** Tints a tile's casings to the canvas the theme shown draws. */
  private tintCasing(tile: Tile): void {
    if (!tile.casing) return;
    tile.casing.tint = this.painter.theme.background;
    tile.casingTheme = this.painter.name;
  }

  /** Where a retint finds the shapes and notes as the scene shown holds them. */
  private lookups(): {
    shape(key: string): ElementShape | undefined;
    note(id: Id): NoteShape | undefined;
  } {
    const indexed = this.indexed;
    return {
      shape: (key) => indexed?.byKey.get(key),
      note: (id) => {
        const free = indexed && freeShapesById(indexed.scene.notes, indexed.scene.arrows).get(id);
        return free && 'rect' in free ? free : undefined;
      },
    };
  }

  /** What builds drawings' geometry ahead of their first render, where the renderer has one. */
  private geometryBuilder(): GeometryBuilder | undefined {
    const system = (this.app.renderer as { graphicsContext?: Partial<GeometryBuilder> })
      .graphicsContext;
    return typeof system?.updateGpuContext === 'function' &&
      typeof system.getContextRenderData === 'function'
      ? (system as GeometryBuilder)
      : undefined;
  }

  /** Counts the tiles that show stale drawings once a switch or a recolor has shown, for `stats`. */
  private countStale(): void {
    if (!this.restyling || this.pending) return;
    const coarse = this.camera.scale < COARSE_BELOW;
    const screen = visibleRect(this.camera, this.viewport);
    for (const tile of this.tiles.values()) {
      if (tile.container.culled || !meets(tile.bounds, screen)) continue;
      const stamp = this.stampFor(tile, this.painter.name, 'drawings');
      const plain = this.coarseFor(tile, coarse);
      const stale = shownDrawings(tile, plain, this.camera.scale * this.resolution).some(
        (drawing) => (drawing === 'coarse' ? tile.coarseStamp : tile.fullStamp) !== stamp,
      );
      if (stale) this.stats.staleShown += 1;
      if (!plain && tile.hadFull && !tile.full) this.stats.fallbacks += 1;
    }
  }
}

/**
 * A region of plain drawings as a switch or a recolor will show it: a hidden copy beside it, with a
 * drawing for each of its tiles, in the theme `theme`.
 */
interface Shadow {
  shadow: Container;
  copies: Map<Tile, Graphics>;
  theme: ThemeName;
  /** Whether its geometry was sent to the GPU, in the frame that put it together. */
  sent: boolean;
}

/** The tiles whose plain drawings are drawn in each region of plain drawings, by region. */
function plainTilesByRegion(tiles: Iterable<Tile>): Map<Container, Tile[]> {
  const byRegion = new Map<Container, Tile[]>();
  for (const tile of tiles) {
    const region = tile.coarse?.parent;
    if (!region || region === tile.container) continue;
    const list = byRegion.get(region);
    if (list) list.push(tile);
    else byRegion.set(region, [tile]);
  }
  return byRegion;
}

/** Drawings of a tile to draw again for a switch or a recolor, and where the tile is. */
interface Work {
  tile: Tile;
  drawings: Drawing[];
  distance: number;
  onScreen: boolean;
}

/**
 * What a switch or a recolor left off screen once it showed: drawings to draw again, tiles drawn
 * again but not shown yet, and tiles whose labels or casings are still to tint.
 */
interface CatchUp {
  drawings: Work[];
  drawnAgain: Work[];
  labels: Tile[];
}

/**
 * The region PixiJS gathers again when a tile's drawings change: its plain drawing's, or the one its
 * own container is in.
 */
function regionOf(tile: Tile): Container {
  const plain = tile.coarse?.parent;
  if (plain && plain !== tile.container) return plain;
  return tile.container.parent ?? tile.container;
}

/** What drawings `RestyleCosts` learns the cost of together: a tile's kind and the drawings made. */
function costKind(work: { tile: Tile; drawings: readonly Drawing[] }): string {
  return `${work.tile.kind} ${work.drawings.join('+')}`;
}

/** The drawings of a tile made for another stamp than `stamp`, and not made again for it yet. */
function staleDrawings(tile: Tile, stamp: string): Drawing[] {
  const stale: Drawing[] = [];
  const prepared = tile.prepared?.stamp === stamp ? tile.prepared : undefined;
  if (tile.coarse && tile.coarseStamp !== stamp && !prepared?.coarse) stale.push('coarse');
  if (tile.full && tile.fullStamp !== stamp && !prepared?.full) stale.push('full');
  return stale;
}

/** Drops a tile's drawings made for a stamp it no longer needs. */
function dropPrepared(tile: Tile): void {
  tile.prepared?.coarse?.destroy();
  tile.prepared?.full?.destroy();
  tile.prepared = undefined;
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

/** Where each region's container is kept, so that a copy shown in its place takes its place there. */
const regionPlaces = new WeakMap<Container, { regions: Map<string, Container>; key: string }>();

/** The container for the region a cell falls in, among the regions of `container`. */
function regionIn(container: Container, regions: Map<string, Container>, cell: string): Container {
  const [column = 0, row = 0] = cell.split(',').map(Number);
  const key = `${Math.floor(column / REGION)},${Math.floor(row / REGION)}`;
  let region = regions.get(key);
  if (!region) {
    region = new Container({ isRenderGroup: true });
    regions.set(key, region);
    regionPlaces.set(region, { regions, key });
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

/** Whether a cell's tiles are planned from what the tiles were last made from. */
function isPlanned(plan: CellPlan, cell: string): boolean {
  return !plan.partial || plan.planned.has(cell);
}

/** The cells of these that are not planned. */
function unplanned(cells: Iterable<string>, plan: CellPlan): Set<string> {
  const left = new Set<string>();
  for (const cell of cells) if (!isPlanned(plan, cell)) left.add(cell);
  return left;
}

/**
 * The cells a rectangle meets; undefined when they would be more than `MAX_LISTED_CELLS`, as far
 * out over a view whose places reach far, which then plans every cell at once.
 */
function cellsMeeting(rect: Rect): Set<string> | undefined {
  const left = Math.floor(rect.x / TILE);
  const top = Math.floor(rect.y / TILE);
  const right = Math.floor((rect.x + rect.width) / TILE);
  const bottom = Math.floor((rect.y + rect.height) / TILE);
  const count = (right - left + 1) * (bottom - top + 1);
  if (!(count <= MAX_LISTED_CELLS)) return undefined;
  const cells = new Set<string>();
  for (let column = left; column <= right; column++) {
    for (let row = top; row <= bottom; row++) cells.add(`${column},${row}`);
  }
  return cells;
}

/** A cell's rectangle, in canvas units. */
function cellRect(cell: string): Rect {
  const [column = 0, row = 0] = cell.split(',').map(Number);
  return { x: column * TILE, y: row * TILE, width: TILE, height: TILE };
}

/** How far a cell's middle is from a point. */
function cellDistance(cell: string, point: Point): number {
  const middle = centerOf(cellRect(cell));
  return Math.hypot(middle.x - point.x, middle.y - point.y);
}

/** The key of the region a cell falls in. */
function regionOfCell(cell: string): string {
  const [column = 0, row = 0] = cell.split(',').map(Number);
  return `${Math.floor(column / REGION)},${Math.floor(row / REGION)}`;
}

/** The cell of a tile of relations, from its key: `relations ${cell}`, ` dim` after it when dimmed. */
function relationCellOf(key: string): string {
  return key.split(' ')[1] ?? '';
}

/** A rectangle's four sides, as rectangles without breadth, and its middle, as one without size. */
function edgesOf(rect: Rect): Rect[] {
  const { x, y, width, height } = rect;
  return [
    { x, y, width, height: 0 },
    { x, y: y + height, width, height: 0 },
    { x, y, width: 0, height },
    { x: x + width, y, width: 0, height },
    { x: x + width / 2, y: y + height / 2, width: 0, height: 0 },
  ];
}

/** Whether `inner` lies within `outer`. */
function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Destroys a drawing no frame shows, or a container that left the canvas, without its geometry. */
function destroyDisposed(item: GraphicsContext | Container): void {
  if (item instanceof Container) item.destroy({ children: true, context: false });
  else item.destroy();
}

/** Destroys a tile with all it drew, its drawings' geometry included, its plain drawing wherever it is. */
function destroyTile(tile: Tile): void {
  tile.prepared?.coarse?.destroy();
  tile.prepared?.full?.destroy();
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
const namedUnder = new WeakMap<readonly ElementShape[], readonly ElementShape[]>();

/**
 * The shapes drawn by their pictures inside a container, whose names are written on its fill: worked
 * out once for each list of shapes.
 */
function namedUnderDrawings(shapes: readonly ElementShape[]): readonly ElementShape[] {
  let found = namedUnder.get(shapes);
  if (!found) {
    found = shapes.filter(
      (shape) => shape.containerShape !== undefined && nameBandOf(shape) !== undefined,
    );
    namedUnder.set(shapes, found);
  }
  return found;
}

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

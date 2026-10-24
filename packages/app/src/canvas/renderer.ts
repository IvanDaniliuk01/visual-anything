/**
 * The PixiJS side of the canvas. It draws a scene in tiles, so that the GPU skips what is off screen
 * and an edit redraws only the tiles it touches; it shows text only when it is large enough to read;
 * and it draws the selection and the gestures in layers of their own, above the scene.
 *
 * Element shapes are drawn by depth, containers before what they contain, so that a container never
 * hides its contents, whatever tiles they fall in.
 */
import { Application, Container, Culler, Graphics, Rectangle, Text } from 'pixi.js';
import type { Id } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { EMPTY_SELECTION } from '../editor/selection';
import { visibleRect, type Camera, fitCamera } from './camera';
import {
  drawFreeShapes,
  drawRelationLines,
  drawRelationRoutes,
  drawShapeBlocks,
  drawShapeOutlines,
  writeNoteTexts,
  writeRelationLabels,
  writeShapeLabels,
} from './draw';
import { boundsOf, centerOf, type Point, type Rect, type Size } from './geometry';
import type { IndexedScene } from './hit';
import { bitmapText, installFonts } from './labels';
import { CANVAS_BACKGROUND } from './palette';
import type { ElementShape, RelationLine } from './scene';
import { meets, rectAround } from './spatial';

/** The size of a tile, in scene units. */
const TILE = 1024;
/** Names show from this scale on, and component names and relation labels from the next. */
const NAMES_FROM = 0.45;
const DETAILS_FROM = 0.9;
/** With this many shapes on screen or fewer, component names show from the scale names show at. */
const FEW_SHAPES = 300;
/** How long a frame may spend writing labels; the rest are written in the frames after. */
const LABEL_BUDGET = 6;
/** How many shapes or relations get their labels between two looks at the clock. */
const LABEL_BATCH = 6;
/**
 * How much new drawing a frame takes on. PixiJS does the costly part of a new drawing when it first
 * renders it, after the clock above has stopped, so the work is counted as well as timed.
 */
const FULL_DRAWINGS_PER_FRAME = 1;
const LABELS_PER_FRAME = 32;
/** Below this scale shapes are drawn as plain blocks and relations as plain lines. */
const COARSE_BELOW = 0.25;
/** Room kept around the scene when fitting it, in screen pixels. */
const FIT_MARGIN = 32;
/**
 * How long the camera must rest before text is drawn again at the new resolution and the tiles around
 * the screen get ready.
 */
const SETTLE_AFTER = 180;

const SELECTED = '#2563EB';
const HOVERED = '#60A5FA';

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
}

interface Tile {
  key: string;
  signature: string;
  container: Container;
  bounds: Rect;
  kind: 'shapes' | 'relations' | 'free';
  shapes: ElementShape[];
  lines: RelationLine[];
  /** The plain drawing shown when zoomed far out; free shapes have none. */
  coarse?: Graphics;
  /** The full drawing, made the first time the tile is seen close enough. */
  full?: Graphics;
  /** The labels written, and for which level of detail. */
  labels?: Container;
  level: 0 | 1 | 2;
  /** How many of its shapes or relations have their labels at `level`; the rest come later. */
  labelled: number;
}

export interface RendererCallbacks {
  /** The canvas cannot start, or a scene cannot be drawn. */
  onFailure(error: unknown): void;
  /** The camera moved or zoomed. */
  onCamera?(camera: Camera): void;
}

type Status = 'starting' | 'ready' | 'failed' | 'destroyed';

export class CanvasRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly shapeLayer = new Container();
  private readonly relationLayer = new Container();
  private readonly freeLayer = new Container();
  private readonly dragLayer = new Container();
  private readonly selectionMarks = new Graphics();
  private readonly gestureMarks = new Graphics();
  private readonly depthLayers: Container[] = [];
  private readonly tiles = new Map<string, Tile>();
  private status: Status = 'starting';
  private indexed: IndexedScene | undefined;
  private selection: Selection = EMPTY_SELECTION;
  private hovered: string | undefined;
  private overlay: Overlay = {};
  private hidden = { shapes: new Set<string>(), relations: new Set<Id>() };
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
  ) {
    this.world.addChild(this.shapeLayer, this.relationLayer, this.freeLayer, this.dragLayer);
    this.world.addChild(this.selectionMarks, this.gestureMarks);
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
      this.rebuild();
      if (!this.fitted) this.fit();
      this.drawSelection();
      this.requestRender();
    } catch (error) {
      this.callbacks.onFailure(error);
    }
  }

  /** Marks what is selected and the shape under the pointer. */
  setSelection(selection: Selection, hovered: string | undefined): void {
    if (selection === this.selection && hovered === this.hovered) return;
    this.selection = selection;
    this.hovered = hovered;
    this.drawSelection();
    this.requestRender();
  }

  /** Draws the marks of the gesture under way. */
  setOverlay(overlay: Overlay): void {
    this.overlay = overlay;
    this.drawGesture();
    this.requestRender();
  }

  /**
   * Starts drawing shapes that are being dragged: they and the relations on them leave their tiles and
   * are drawn in a layer of their own, which follows the pointer.
   */
  startDrag(shapes: ReadonlySet<string>, relations: ReadonlySet<Id>): void {
    if (!this.indexed) return;
    this.hidden = { shapes: new Set(shapes), relations: new Set(relations) };
    this.rebuild();
    this.dragLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    const moving = this.indexed.scene.shapes.filter((shape) => shapes.has(shape.key));
    const graphics = new Graphics();
    drawShapeOutlines(graphics, moving);
    this.dragLayer.addChild(graphics);
    if (this.camera.scale >= NAMES_FROM) {
      // Names make the drag easier to follow, but the drag works without them.
      try {
        for (const text of writeShapeLabels(
          moving,
          this.camera.scale >= DETAILS_FROM,
          bitmapText,
        )) {
          this.dragLayer.addChild(text);
        }
      } catch {
        // Without fonts, the shapes move unnamed.
      }
    }
    this.dragLayer.alpha = 0.85;
    this.dragLayer.position.set(0, 0);
    this.requestRender();
  }

  /** Moves the dragged shapes by a distance in scene units. */
  dragTo(delta: Point): void {
    this.dragLayer.position.set(delta.x, delta.y);
    this.drawSelection(delta);
    this.requestRender();
  }

  /** Stops drawing a drag: the shapes go back to their tiles, where they are in the scene. */
  endDrag(): void {
    if (this.hidden.shapes.size === 0 && this.hidden.relations.size === 0) return;
    this.hidden = { shapes: new Set(), relations: new Set() };
    this.dragLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.dragLayer.position.set(0, 0);
    if (this.indexed) this.rebuild();
    this.drawSelection();
    this.requestRender();
  }

  /** Whether shapes are being drawn as dragged. */
  get dragging(): boolean {
    return this.hidden.shapes.size > 0;
  }

  /** Looks at the scene through this camera. */
  setCamera(camera: Camera): void {
    const zoomed = camera.scale !== this.camera.scale;
    this.camera = camera;
    this.world.position.set(camera.x, camera.y);
    this.world.scale.set(camera.scale);
    if (zoomed) {
      this.drawSelection();
      this.drawGesture();
    }
    this.settled = false;
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settled = true;
      if (zoomed) this.sharpen();
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

  /** Releases the canvas, now or as soon as its start finishes. */
  destroy(): void {
    if (this.status === 'ready') {
      this.observer?.disconnect();
      cancelFrame(this.frame);
      clearTimeout(this.settleTimer);
      this.app.destroy(true, { children: true });
    }
    this.status = 'destroyed';
  }

  private async start(): Promise<void> {
    try {
      await this.app.init({
        preference: 'webgl',
        background: CANVAS_BACKGROUND,
        antialias: true,
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
      this.app.destroy(true, { children: true });
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
    // The label fonts take a moment to draw: drawn now, they are ready before the first zoom.
    setTimeout(() => {
      try {
        if (this.status === 'ready') installFonts();
      } catch {
        // Without fonts, labels are written when needed, or not at all.
      }
    }, 0);
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

  /** Groups what the scene draws into tiles, and redraws the tiles whose content changed. */
  private rebuild(): void {
    const scene = this.indexed?.scene;
    if (!scene) return;
    const groups = new Map<
      string,
      { kind: Tile['kind']; depth: number; shapes: ElementShape[]; lines: RelationLine[] }
    >();
    const groupOf = (key: string, kind: Tile['kind'], depth: number) => {
      let group = groups.get(key);
      if (!group) {
        group = { kind, depth, shapes: [], lines: [] };
        groups.set(key, group);
      }
      return group;
    };
    for (const shape of scene.shapes) {
      if (this.hidden.shapes.has(shape.key)) continue;
      const depth = shape.key.split('/').length - 1;
      groupOf(`shapes ${depth} ${cellOf(centerOf(shape.rect))}`, 'shapes', depth).shapes.push(
        shape,
      );
    }
    for (const line of scene.relations) {
      if (this.hidden.relations.has(line.relation)) continue;
      groupOf(`relations ${cellOf(line.middle)}`, 'relations', 0).lines.push(line);
    }
    if (scene.notes.length > 0 || scene.arrows.length > 0) groupOf('free', 'free', 0);

    for (const [key, tile] of this.tiles) {
      if (!groups.has(key)) {
        tile.container.destroy({ children: true });
        this.tiles.delete(key);
      }
    }
    for (const [key, group] of groups) {
      const signature =
        group.kind === 'free'
          ? JSON.stringify([scene.notes, scene.arrows])
          : group.kind === 'shapes'
            ? group.shapes.map(shapeSignature).join('|')
            : group.lines.map(lineSignature).join('|');
      const existing = this.tiles.get(key);
      if (existing?.signature === signature) continue;
      existing?.container.destroy({ children: true });
      const tile = this.makeTile(key, signature, group.kind, group.shapes, group.lines);
      this.tiles.set(key, tile);
      this.layerFor(group.kind, group.depth).addChild(tile.container);
    }
  }

  private makeTile(
    key: string,
    signature: string,
    kind: Tile['kind'],
    shapes: ElementShape[],
    lines: RelationLine[],
  ): Tile {
    const scene = this.indexed?.scene;
    const container = new Container();
    let bounds: Rect | undefined;
    let coarse: Graphics | undefined;
    let full: Graphics | undefined;
    // Shapes and relations start with their plain drawing, which is cheap to make; the full one is
    // made when the tile is first seen close up.
    if (kind === 'shapes') {
      coarse = new Graphics();
      drawShapeBlocks(coarse, shapes);
      bounds = boundsOf(shapes.map((shape) => shape.rect));
    } else if (kind === 'relations') {
      coarse = new Graphics();
      drawRelationLines(coarse, lines);
      bounds = boundsOf(lines.map((line) => rectAround(line.route)));
    } else if (scene) {
      full = new Graphics();
      drawFreeShapes(full, scene.notes, scene.arrows);
      bounds = boundsOf(
        scene.notes.map((note) => note.rect),
        scene.arrows.flatMap((arrow) => [arrow.from, arrow.to]),
      );
    }
    if (coarse) container.addChild(coarse);
    if (full) container.addChild(full);
    const area = grow(bounds ?? { x: 0, y: 0, width: 0, height: 0 }, 16);
    container.cullable = true;
    container.cullableChildren = false;
    container.cullArea = new Rectangle(area.x, area.y, area.width, area.height);
    return {
      key,
      signature,
      container,
      bounds: area,
      kind,
      shapes,
      lines,
      ...(coarse ? { coarse } : {}),
      ...(full ? { full } : {}),
      level: 0,
      labelled: 0,
    };
  }

  /** Makes the full drawing of a tile, under its labels. */
  private drawFully(tile: Tile): void {
    const full = new Graphics();
    if (tile.kind === 'shapes') drawShapeOutlines(full, tile.shapes);
    else drawRelationRoutes(full, tile.lines);
    tile.container.addChildAt(full, tile.coarse ? 1 : 0);
    tile.full = full;
  }

  private layerFor(kind: Tile['kind'], depth: number): Container {
    if (kind === 'relations') return this.relationLayer;
    if (kind === 'free') return this.freeLayer;
    while (this.depthLayers.length <= depth) {
      const layer = new Container();
      this.depthLayers.push(layer);
      this.shapeLayer.addChild(layer);
    }
    return this.depthLayers[depth] as Container;
  }

  /**
   * Gives the tiles on screen the detail the scale allows: plain drawings far out; full drawings and
   * then labels closer in, made the first time a tile needs them, nearest the middle of the screen
   * first and within a budget per frame, so that zooming never stalls.
   */
  private updateDetail(): void {
    const { scale } = this.camera;
    const coarse = scale < COARSE_BELOW;
    const shown = visibleRect(this.camera, this.viewport);
    // Component names show once they are large enough to read, or earlier when few shapes are on
    // screen, which is when they cost little.
    const few =
      scale >= NAMES_FROM &&
      scale < DETAILS_FROM &&
      (this.indexed?.shapes.query(shown).length ?? 0) <= FEW_SHAPES;
    const level: Tile['level'] = scale >= DETAILS_FROM || few ? 2 : scale >= NAMES_FROM ? 1 : 0;
    // While the camera moves, only what is on screen; once it rests, the tiles around it too, so
    // that the next pan finds them drawn.
    const reach = this.settled
      ? Math.max(shown.width, shown.height) / 2
      : Math.max(64 / scale, TILE / 2);
    const visible = grow(shown, reach);
    const middle = centerOf(visible);
    const work: { tile: Tile; draw: boolean; wanted: Tile['level']; distance: number }[] = [];
    for (const tile of this.tiles.values()) {
      const wanted: Tile['level'] =
        tile.kind === 'shapes'
          ? level
          : tile.kind === 'relations'
            ? level === 2
              ? 2
              : 0
            : level === 0
              ? 0
              : 2;
      const full = !coarse && tile.full !== undefined;
      if (tile.coarse) tile.coarse.visible = !full;
      if (tile.full) tile.full.visible = full || !tile.coarse;
      if (tile.labels) tile.labels.visible = wanted > 0;
      if (!meets(tile.bounds, visible)) continue;
      const draw = !coarse && !tile.full;
      const label = wanted > 0 && (tile.level !== wanted || tile.labelled < labelCount(tile));
      if (!draw && !label) continue;
      const center = centerOf(tile.bounds);
      work.push({
        tile,
        draw,
        wanted: label ? wanted : tile.level,
        distance: Math.hypot(center.x - middle.x, center.y - middle.y),
      });
    }
    work.sort((a, b) => a.distance - b.distance);
    const began = performance.now();
    let drawings = 0;
    let written = 0;
    const spent = () =>
      performance.now() - began > LABEL_BUDGET ||
      drawings >= FULL_DRAWINGS_PER_FRAME ||
      written >= LABELS_PER_FRAME;
    for (const { tile, draw, wanted } of work) {
      if (spent()) {
        this.requestRender();
        return;
      }
      if (draw) {
        drawings += 1;
        this.drawFully(tile);
        if (tile.coarse) tile.coarse.visible = false;
      }
      if (wanted === 0) continue;
      if (tile.level !== wanted || !tile.labels) {
        tile.labels?.destroy({ children: true });
        tile.labels = new Container();
        tile.container.addChild(tile.labels);
        tile.level = wanted;
        tile.labelled = 0;
      }
      // A few shapes at a time, so that no frame goes much over the budget, however full the tile.
      const total = labelCount(tile);
      while (tile.labelled < total) {
        if (spent()) {
          this.requestRender();
          return;
        }
        const next = tile.labelled + LABEL_BATCH;
        const texts =
          tile.kind === 'shapes'
            ? writeShapeLabels(tile.shapes.slice(tile.labelled, next), wanted === 2, bitmapText)
            : tile.kind === 'relations'
              ? writeRelationLabels(tile.lines.slice(tile.labelled, next), bitmapText)
              : writeNoteTexts(this.indexed?.scene.notes ?? []);
        for (const text of texts) {
          if (text instanceof Text) text.resolution = this.textResolution();
          tile.labels.addChild(text);
        }
        written += texts.length;
        tile.labelled = Math.min(total, next);
      }
    }
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
  }

  private textResolution(): number {
    const wanted = this.resolution * Math.max(1, this.camera.scale);
    return Math.min(4, Math.max(0.5, Math.ceil(wanted * 4) / 4));
  }

  private drawSelection(dragDelta?: Point): void {
    const marks = this.selectionMarks;
    marks.clear();
    const indexed = this.indexed;
    if (!indexed) return;
    const width = 2 / this.camera.scale;
    const gap = 3 / this.camera.scale;
    const moved = (shape: ElementShape) =>
      dragDelta && this.hidden.shapes.has(shape.key) ? dragDelta : { x: 0, y: 0 };
    if (this.hovered) {
      const shape = indexed.byKey.get(this.hovered);
      if (shape) {
        const rect = grow(shape.rect, gap);
        marks
          .rect(rect.x, rect.y, rect.width, rect.height)
          .stroke({ color: HOVERED, width: width * 0.75 });
      }
    }
    for (const id of this.selection.elements) {
      for (const shape of indexed.byElement.get(id) ?? []) {
        const offset = moved(shape);
        const rect = grow(shape.rect, gap);
        marks
          .rect(rect.x + offset.x, rect.y + offset.y, rect.width, rect.height)
          .stroke({ color: SELECTED, width });
      }
    }
    for (const line of indexed.scene.relations) {
      if (!this.selection.relations.has(line.relation) || this.hidden.relations.has(line.relation))
        continue;
      const [first, ...rest] = line.route;
      if (!first) continue;
      marks.moveTo(first.x, first.y);
      for (const point of rest) marks.lineTo(point.x, point.y);
      marks.stroke({
        color: SELECTED,
        width: line.width + 6 / this.camera.scale,
        alpha: 0.35,
        join: 'round',
        cap: 'round',
      });
    }
    for (const note of indexed.scene.notes) {
      if (!this.selection.freeShapes.has(note.id)) continue;
      const rect = grow(note.rect, gap);
      marks.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: SELECTED, width });
    }
    for (const arrow of indexed.scene.arrows) {
      if (!this.selection.freeShapes.has(arrow.id)) continue;
      marks
        .moveTo(arrow.from.x, arrow.from.y)
        .lineTo(arrow.to.x, arrow.to.y)
        .stroke({ color: SELECTED, width: 8 / this.camera.scale, alpha: 0.35, cap: 'round' });
    }
  }

  private drawGesture(): void {
    const marks = this.gestureMarks;
    marks.clear();
    const { box, connect, handle, target } = this.overlay;
    const width = 1.5 / this.camera.scale;
    if (box) {
      marks
        .rect(box.x, box.y, box.width, box.height)
        .fill({ color: SELECTED, alpha: 0.08 })
        .stroke({ color: SELECTED, width });
    }
    if (target) {
      const rect = grow(target, 4 / this.camera.scale);
      marks
        .rect(rect.x, rect.y, rect.width, rect.height)
        .stroke({ color: SELECTED, width: width * 2 });
    }
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
   * Draws a frame now: labels within their budget, culling and rendering. With `waitForGpu`, returns
   * only once the GPU has drawn it, so that the time it takes can be measured.
   */
  renderNow(waitForGpu = false): void {
    if (this.status !== 'ready') return;
    try {
      this.updateDetail();
      Culler.shared.cull(this.world, this.app.renderer.screen);
      this.app.render();
      if (waitForGpu) (this.app.renderer as { gl?: WebGLRenderingContext }).gl?.finish();
    } catch (error) {
      this.callbacks.onFailure(error);
    }
  }

  private requestRender(): void {
    if (this.status !== 'ready' || this.frame !== 0) return;
    this.frame = nextFrame(() => {
      this.frame = 0;
      this.renderNow();
    });
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

/** How many things in a tile have labels to write. */
function labelCount(tile: Tile): number {
  return tile.kind === 'shapes'
    ? tile.shapes.length
    : tile.kind === 'relations'
      ? tile.lines.length
      : 1;
}

function cellOf(point: Point): string {
  return `${Math.floor(point.x / TILE)},${Math.floor(point.y / TILE)}`;
}

function grow(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function shapeSignature(shape: ElementShape): string {
  const { rect } = shape;
  return [
    shape.key,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    shape.kind,
    shape.fill,
    shape.stroke,
    shape.name,
    shape.componentName,
    shape.holdsContents ? 1 : 0,
  ].join(' ');
}

function lineSignature(line: RelationLine): string {
  return [
    line.relation,
    line.label ?? '',
    line.stroke,
    line.width,
    line.dash,
    line.arrowhead ? 1 : 0,
    ...line.route.flatMap((point) => [point.x, point.y]),
  ].join(' ');
}

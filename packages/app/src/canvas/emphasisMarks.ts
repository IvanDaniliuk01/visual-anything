/**
 * How the emphasis's highlights and markers are drawn (A4, `docs/designs/benchmark-12.md`): on
 * screen, so that a round join or cap takes the few segments a few pixels need at any zoom, where
 * stroked in world units at the whole view each took about 150. Their paths are given in world units
 * and stroked with widths in pixels, counted in the marks' unit: a mark's graphics is scaled by the
 * unit over the camera's scale, and its context by the inverse, so that panning moves them with the
 * scene and only a zoom draws them again.
 *
 * They look as they did when stroked in world units. A marker's disc is one drawing that every marker
 * shows, moved rather than drawn again; and the highlights are compared by what they draw, so that a
 * scene whose shapes changed only their fill keeps them as they were.
 */
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import type { CanvasTheme } from '../theme/themes';
import { traceMark, type MarkTarget } from './draw';
import type { Lit, PlacedMarker } from './emphasize';
import { grow, type Point, type Rect } from './geometry';
import { drawnBoundsOf, nameTagOf, type NameTag } from './nameTags';
import { lengthOf, pointAlong } from './route';
import type { ElementShape, RelationLine } from './scene';
import { isAnchoredSolidPart } from './solidMark';

/** A travelling marker's radius, in pixels on screen. */
export const MARKER_RADIUS = 7;
/** The longest a marker's trail runs behind it, in pixels on screen, and in how many pieces it fades. */
export const TRAIL_LENGTH = 56;
export const TRAIL_PIECES = 6;

/**
 * The marks' unit, in pixels on screen. PixiJS gives a round join or cap `15 √r` segments a half
 * turn, `r` its radius in its graphics' units: counted in units of 16 pixels, a half turn of `r`
 * pixels takes `3.75 √r`, which strays from the circle by less than a tenth of a pixel at any radius,
 * where counted in pixels it took four times as many.
 */
export const MARK_UNIT = 16;

/** A width or a length in pixels, in the marks' unit. */
function px(pixels: number): number {
  return pixels / MARK_UNIT;
}

/**
 * Starts `graphics` again on screen at this scale: what is traced after it is given in world units
 * and stroked with widths in pixels, in the marks' unit.
 */
export function startOnScreen(graphics: Graphics, scale: number): void {
  graphics.clear();
  const size = MARK_UNIT / scale;
  if (graphics.scale.x !== size) graphics.scale.set(size);
  graphics.context.setTransform(scale / MARK_UNIT, 0, 0, scale / MARK_UNIT, 0, 0);
}

/** Traces circles at these world points, each `radius` pixels, and leaves the context on screen. */
function circlesOnScreen(
  graphics: Graphics,
  points: readonly Point[],
  radius: number,
  scale: number,
): void {
  // A circle's segments follow its radius before the context's transform: given in pixels here.
  graphics.context.setTransform(1 / MARK_UNIT, 0, 0, 1 / MARK_UNIT, 0, 0);
  for (const point of points) graphics.circle(point.x * scale, point.y * scale, radius);
  graphics.context.setTransform(scale / MARK_UNIT, 0, 0, scale / MARK_UNIT, 0, 0);
}

/**
 * Marks these shapes and notes in `graphics` (`startOnScreen`): each with a
 * halo, a ring and corner marks around it. The halo and the ring go along a shape's own outline (ADR
 * 0066), the corners around its box; a shape's name tag is part of it, inside the ring and the
 * corners (ADR 0066's clarifications). An anchored part of a solid is left to the solid layer (ADR
 * 0075).
 */
export function traceLitShapes(
  graphics: Graphics,
  lit: Pick<Lit, 'shapes' | 'notes'>,
  scale: number,
  highlight: CanvasTheme['highlight'],
): void {
  const shapes = lit.shapes.some(isAnchoredSolidPart)
    ? lit.shapes.filter((shape) => !isAnchoredSolidPart(shape))
    : lit.shapes;
  const { notes } = lit;
  if (shapes.length + notes.length === 0) return;
  const rects = [...shapes.map(drawnBoundsOf), ...notes.map((note) => note.rect)];
  const ringed: MarkTarget[] = [...shapes.map(markTargetOf), ...notes.map((note) => note.rect)];
  for (const target of ringed) traceMark(graphics, target, 5 / scale);
  graphics.stroke({ color: highlight, alpha: 0.28, join: 'round', cap: 'round', width: px(10) });
  for (const target of ringed) traceMark(graphics, target, 5 / scale);
  graphics.stroke({ color: highlight, width: px(2.5) });
  for (const rect of rects) traceCorners(graphics, grow(rect, 11 / scale), 14 / scale);
  graphics.stroke({ color: highlight, width: px(3), cap: 'square' });
}

/**
 * What a mark around a shape goes along: its own outline (ADR 0066), or its box, with its name tag
 * when it has one.
 */
export function markTargetOf(shape: ElementShape): MarkTarget {
  const tag = nameTagOf(shape);
  if (!shape.outline && !tag) return shape.rect;
  return {
    rect: shape.rect,
    ...(shape.outline ? { outline: shape.outline } : {}),
    ...(tag ? { tag } : {}),
  };
}

/**
 * Marks these lines and arrows in `graphics` (`startOnScreen`): each wider
 * in the highlight color over a halo, with a dot at each end. The dots tell a highlight apart without
 * its color.
 */
export function traceLitLines(
  graphics: Graphics,
  lit: Pick<Lit, 'lines' | 'arrows'>,
  scale: number,
  highlight: CanvasTheme['highlight'],
): void {
  const routes = [
    ...lit.lines.map((line) => ({ route: line.route, width: line.width })),
    ...lit.arrows.map((arrow) => ({ route: [arrow.from, arrow.to], width: 2 })),
  ];
  if (routes.length === 0) return;
  for (const { route, width } of routes) traceLitRoute(graphics, route, width, scale, highlight);
  const ends: Point[] = [];
  for (const { route } of routes) {
    for (const end of [route[0], route.at(-1)]) if (end) ends.push(end);
  }
  circlesOnScreen(graphics, ends, 4, scale);
  graphics.fill(highlight);
}

/** How many lit lines' graphics are kept, shown or not, before those not shown are let go. */
const MOST_LINES_KEPT = 1000;

/**
 * The lines the emphasis lights, as `traceLitLines` marks them, each in a graphics of its own kept by
 * its key while it is drawn along the same route at the same scale in the same color: lighting
 * other lines, as a simulation's ticks do one after another, shows and hides them, and draws only
 * those lit for the first time. Its arrows are marked together, above them.
 */
export class LitLines {
  readonly container = new Container();
  private readonly lines = new Container();
  private readonly arrows = new Graphics();
  private readonly kept = new Map<
    string,
    { line: RelationLine; graphics: Graphics; scale: number; color: CanvasTheme['highlight'] }
  >();
  private shown: Graphics[] = [];

  constructor() {
    this.container.addChild(this.lines, this.arrows);
  }

  /** Marks these lines and arrows, on screen at this scale. */
  show(lit: Pick<Lit, 'lines' | 'arrows'>, scale: number, color: CanvasTheme['highlight']): void {
    const now: Graphics[] = [];
    for (const line of lit.lines) {
      let each = this.kept.get(line.relation);
      if (!each || each.scale !== scale || each.color !== color || !sameLitLine(each.line, line)) {
        const graphics = each?.graphics ?? new Graphics();
        startOnScreen(graphics, scale);
        traceLitLines(graphics, { lines: [line], arrows: [] }, scale, color);
        if (!each) this.lines.addChild(graphics);
        each = { line, graphics, scale, color };
        this.kept.set(line.relation, each);
      }
      now.push(each.graphics);
    }
    const showing = new Set(now);
    for (const graphics of this.shown) if (!showing.has(graphics)) graphics.visible = false;
    for (const graphics of now) if (!graphics.visible) graphics.visible = true;
    this.shown = now;
    startOnScreen(this.arrows, scale);
    traceLitLines(this.arrows, { lines: [], arrows: lit.arrows }, scale, color);
    if (this.kept.size > MOST_LINES_KEPT) this.letGo(showing);
  }

  /** The graphics that marks the line with this key, while one is kept. */
  graphicsOf(key: string): Graphics | undefined {
    return this.kept.get(key)?.graphics;
  }

  /** The graphics that marks the arrows lit. */
  get arrowMarks(): Graphics {
    return this.arrows;
  }

  /** The graphics shown now, one a line. */
  get shownLines(): readonly Graphics[] {
    return this.shown;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.kept.clear();
  }

  private letGo(showing: ReadonlySet<Graphics>): void {
    for (const [key, each] of this.kept) {
      if (showing.has(each.graphics)) continue;
      each.graphics.destroy();
      this.kept.delete(key);
    }
  }
}

/**
 * Traces the pieces of lines that draw from their start (ADR 0084) in `graphics`
 * (`startOnScreen`), over a halo, and a dot at each end the line has reached.
 */
export function traceDrawingLines(
  graphics: Graphics,
  drawn: readonly { line: RelationLine; pieces: readonly (readonly Point[])[]; ends: Point[] }[],
  scale: number,
  highlight: CanvasTheme['highlight'],
): void {
  const ends: Point[] = [];
  for (const { line, pieces, ends: reached } of drawn) {
    for (const piece of pieces) traceLitRoute(graphics, piece, line.width, scale, highlight);
    ends.push(...reached);
  }
  if (ends.length === 0) return;
  circlesOnScreen(graphics, ends, 4, scale);
  graphics.fill(highlight);
}

/** A lit route: wider than its line, `width` in world units, in the highlight color over a halo. */
function traceLitRoute(
  graphics: Graphics,
  route: readonly Point[],
  width: number,
  scale: number,
  highlight: CanvasTheme['highlight'],
): void {
  traceRoute(graphics, route);
  graphics.stroke({
    color: highlight,
    alpha: 0.28,
    join: 'round',
    cap: 'round',
    width: px(width * scale + 12),
  });
  traceRoute(graphics, route);
  graphics.stroke({
    color: highlight,
    width: px(width * scale + 2),
    join: 'round',
    cap: 'round',
  });
}

/**
 * Traces the markers' trails in `graphics` (`startOnScreen`): each from
 * where its marker was a moment before to it, in pieces that fade and narrow away from it; nothing
 * for one that stands still.
 */
export function traceTrails(
  graphics: Graphics,
  markers: readonly PlacedMarker[],
  scale: number,
  color: CanvasTheme['highlight'],
): void {
  for (const marker of markers) traceTrail(graphics, marker, scale, color);
}

function traceTrail(
  graphics: Graphics,
  marker: PlacedMarker,
  scale: number,
  color: CanvasTheme['highlight'],
): void {
  const { line, along, from } = marker;
  if (from === undefined || from === along) return;
  const length = lengthOf(line.route);
  if (!(length > 0)) return;
  // Never longer on screen than a short trail, however far the marker went since.
  const most = TRAIL_LENGTH / scale / length;
  const start = along > from ? Math.max(from, along - most) : Math.min(from, along + most);
  for (let piece = 0; piece < TRAIL_PIECES; piece++) {
    const a = pointAlong(line.route, start + ((along - start) * piece) / TRAIL_PIECES);
    const b = pointAlong(line.route, start + ((along - start) * (piece + 1)) / TRAIL_PIECES);
    const near = (piece + 1) / TRAIL_PIECES;
    graphics
      .moveTo(a.x, a.y)
      .lineTo(b.x, b.y)
      .stroke({
        color,
        alpha: 0.55 * near * near,
        width: px(MARKER_RADIUS * 2 * (0.35 + 0.65 * near)),
        cap: 'round',
      });
  }
}

/**
 * The markers' discs: one drawing, a disc ringed in the canvas color, that each marker shows where it
 * is, so that a marker moving changes where its disc is, not what any disc draws.
 */
export class MarkerDiscs {
  readonly container = new Container();
  private disc: GraphicsContext | undefined;
  private colors: { highlight: CanvasTheme['highlight']; background: string } | undefined;
  private readonly discs: Graphics[] = [];
  private shown = 0;

  constructor() {}

  /** Shows a disc at each of these markers, as large on screen at any scale. */
  show(
    markers: readonly PlacedMarker[],
    scale: number,
    theme: Pick<CanvasTheme, 'highlight' | 'background'>,
  ): void {
    const disc = this.discFor(theme);
    let at = 0;
    for (const { line, along } of markers) {
      const point = pointAlong(line.route, along);
      let each = this.discs[at];
      if (!each) {
        each = new Graphics(disc);
        this.discs.push(each);
        this.container.addChild(each);
      } else if (each.context !== disc) each.context = disc;
      each.position.set(point.x, point.y);
      if (each.scale.x !== 1 / scale) each.scale.set(1 / scale);
      each.visible = true;
      at += 1;
    }
    for (let left = at; left < this.shown; left++) {
      (this.discs[left] as Graphics).visible = false;
    }
    this.shown = at;
  }

  /** Where the discs shown are, in world units: for tests and for whoever reads them. */
  get points(): Point[] {
    return this.discs.slice(0, this.shown).map((each) => ({ x: each.x, y: each.y }));
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.disc?.destroy();
  }

  private discFor(theme: Pick<CanvasTheme, 'highlight' | 'background'>): GraphicsContext {
    const colors = this.colors;
    if (
      this.disc &&
      colors?.highlight === theme.highlight &&
      colors.background === theme.background
    ) {
      return this.disc;
    }
    const before = this.disc;
    const disc = new GraphicsContext()
      .circle(0, 0, MARKER_RADIUS)
      .fill(theme.highlight)
      .stroke({ color: theme.background, width: 2.5 });
    for (const each of this.discs) each.context = disc;
    before?.destroy();
    this.disc = disc;
    this.colors = { highlight: theme.highlight, background: theme.background };
    return disc;
  }
}

/** Whether two lists of highlighted shapes draw the same marks: the same shapes where they were. */
export function sameLitShapes(a: readonly ElementShape[], b: readonly ElementShape[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) {
    if (!sameLitShape(a[at] as ElementShape, b[at] as ElementShape)) return false;
  }
  return true;
}

/** Whether two lists of highlighted lines draw the same marks: the same lines along the same routes. */
export function sameLitLines(a: readonly RelationLine[], b: readonly RelationLine[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) {
    if (!sameLitLine(a[at] as RelationLine, b[at] as RelationLine)) return false;
  }
  return true;
}

/** Whether two lists are the same items in the same order. */
export function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((item, at) => item === b[at]));
}

/**
 * Whether a shape's highlight is drawn as another's: a shape whose fill or values changed, as each
 * of a simulation's ticks changes them, keeps the highlight it had.
 */
function sameLitShape(a: ElementShape, b: ElementShape): boolean {
  if (a === b) return true;
  return (
    a.key === b.key &&
    a.outline === b.outline &&
    sameRect(a.rect, b.rect) &&
    isAnchoredSolidPart(a) === isAnchoredSolidPart(b) &&
    sameTag(nameTagOf(a), nameTagOf(b))
  );
}

/** Whether a line's highlight, or a marker along it, is drawn as along another. */
export function sameLitLine(a: RelationLine, b: RelationLine): boolean {
  if (a === b) return true;
  return (
    a.relation === b.relation &&
    a.width === b.width &&
    (a.arrowhead === undefined) === (b.arrowhead === undefined) &&
    sameRoute(a.route, b.route)
  );
}

function sameRoute(a: readonly Point[], b: readonly Point[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) {
    const p = a[at] as Point;
    const q = b[at] as Point;
    if (p.x !== q.x || p.y !== q.y) return false;
  }
  return true;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function sameTag(a: NameTag | undefined, b: NameTag | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
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

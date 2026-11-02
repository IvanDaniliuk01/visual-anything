/**
 * Curves that degrade beyond a few lines (ADR 0080, section 3): while a container holds at most
 * `MOST_CURVES` automatic curved lines, they are drawn curved (ADR 0069); beyond, the scene draws
 * them orthogonal, routed as every automatic orthogonal line is, and drawn with rounded corners of
 * radius `CORNER_RADIUS`. Nothing in the file changes, and a route by hand keeps its own style.
 *
 * A line drawn so keeps its orthogonal route, which routing, the channel pass, hit testing and labels
 * read, and carries the spans the renderer and the exports draw: each straight run a span of its own,
 * each corner a quarter of a circle, smaller where the runs beside it are short.
 */
import { BASE_DRAWING } from '../drawing';
import type { Point, Rect } from '../geometry';
import type { ElementShape, RelationLine } from '../scene';
import type { CurveSpan } from './hand';

/** Why a curved line is drawn with rounded corners: its container's many curves, or a shape in its way. */
export type RoundedBecause = 'many' | 'crossing';

/** The most automatic curved lines a container holds and still draws curved. */
export const MOST_CURVES = 24;
/**
 * The radius of the corners of a line drawn with rounded corners, in canvas units, where the drawing
 * defaults say nothing else (their `lines.cornerRadius`, ADR 0086).
 */
export const CORNER_RADIUS = BASE_DRAWING.lines.cornerRadius;
/** How far along a quarter circle's tangents a cubic span puts its control points, over its radius. */
const KAPPA = 0.5523;

/** The spans of an orthogonal route drawn with rounded corners. */
export function roundedCurve(route: readonly Point[], radius = CORNER_RADIUS): CurveSpan[] {
  const points = withoutRepeats(route);
  if (points.length < 2) return [];
  const spans: CurveSpan[] = [];
  let from = points[0] as Point;
  for (let at = 1; at < points.length; at++) {
    const corner = points[at] as Point;
    const next = points[at + 1];
    if (!next) {
      spans.push(straight(from, corner));
      break;
    }
    const before = points[at - 1] as Point;
    const inLength = distance(before, corner);
    const outLength = distance(corner, next);
    // A corner rounds at most half of each run beside it, so that two corners never overlap.
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const enter = toward(corner, before, r);
    const leave = toward(corner, next, r);
    if (distance(from, enter) > 0) spans.push(straight(from, enter));
    if (r > 0) {
      spans.push({
        from: enter,
        c1: toward(enter, corner, r * KAPPA),
        c2: toward(leave, corner, r * KAPPA),
        to: leave,
      });
    }
    from = leave;
  }
  return spans;
}

/**
 * The line with the spans of its route, when it is drawn with rounded corners; the line itself
 * otherwise, its corners `radius` round: the drawing defaults'. Called wherever a line's route is replaced.
 */
export function withRoundedCorners(line: RelationLine, radius = CORNER_RADIUS): RelationLine {
  if (line.rounded) line.curve = roundedCurve(line.route, radius);
  if (radius !== CORNER_RADIUS) radii.set(line, radius);
  return line;
}

/** The radius each line was given its rounded corners with, where it is not `CORNER_RADIUS`. */
const radii = new WeakMap<RelationLine, number>();

/** The radius a line's rounded corners were drawn with: what a copy of it on a new route keeps. */
export function cornerRadiusOf(line: RelationLine): number {
  return radii.get(line) ?? CORNER_RADIUS;
}

function straight(from: Point, to: Point): CurveSpan {
  return {
    from,
    c1: { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 },
    c2: { x: from.x + ((to.x - from.x) * 2) / 3, y: from.y + ((to.y - from.y) * 2) / 3 },
    to,
  };
}

/** The point `by` from `from` toward `to`. */
function toward(from: Point, to: Point, by: number): Point {
  const length = distance(from, to);
  if (length === 0) return from;
  return {
    x: from.x + ((to.x - from.x) * by) / length,
    y: from.y + ((to.y - from.y) * by) / length,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function withoutRepeats(route: readonly Point[]): Point[] {
  const points: Point[] = [];
  for (const point of route) {
    const last = points.at(-1);
    if (!last || last.x !== point.x || last.y !== point.y) points.push(point);
  }
  return points;
}

/** The shapes drawn as one block in a list, by the cells of a grid, to find those a curve crosses. */
class Blocks {
  private readonly cells = new Map<number, ElementShape[]>();
  private readonly large: ElementShape[] = [];

  constructor(shapes: readonly ElementShape[]) {
    for (const shape of shapes) {
      if (shape.row !== undefined || shape.part?.inDrawing === true) continue;
      if (shape.holdsContents && shape.rowCount === undefined && shape.collapsed === undefined)
        continue;
      const rect = shape.plate ?? shape.rect;
      const x0 = Math.floor(rect.x / CELL);
      const x1 = Math.floor((rect.x + rect.width) / CELL);
      const y0 = Math.floor(rect.y / CELL);
      const y1 = Math.floor((rect.y + rect.height) / CELL);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 1024) {
        this.large.push(shape);
        continue;
      }
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const key = (x + 0x8000) * 0x10000 + (y + 0x8000);
          const list = this.cells.get(key);
          if (list) list.push(shape);
          else this.cells.set(key, [shape]);
        }
      }
    }
  }

  /** The blocks in the cell of a point; the large ones are `large`, read for every point. */
  near(point: Point): readonly ElementShape[] {
    const key =
      (Math.floor(point.x / CELL) + 0x8000) * 0x10000 + (Math.floor(point.y / CELL) + 0x8000);
    return this.cells.get(key) ?? NONE;
  }

  /** The blocks too large to file by cell. */
  get largeOnes(): readonly ElementShape[] {
    return this.large;
  }
}

const NONE: readonly ElementShape[] = [];

const CELL = 256;
/** How far apart the points a piece of a curve is looked along lie: half a cell, so none is missed. */
const STEP = CELL / 2;
const blockIndexes = new WeakMap<readonly ElementShape[], Blocks>();

/**
 * Whether a curved route crosses a shape drawn as one block that is neither one of its ends nor
 * holds one, 2 units in from its sides (ADR 0080, section 3): such a curve is drawn with rounded
 * corners, routed around what it would cross.
 */
export function curveCrosses(
  route: readonly Point[],
  ends: readonly string[],
  shapes: readonly ElementShape[],
): boolean {
  let blocks = blockIndexes.get(shapes);
  if (!blocks) {
    blocks = new Blocks(shapes);
    blockIndexes.set(shapes, blocks);
  }
  const holds = (key: string) =>
    ends.some((end) => end === key || end.startsWith(`${key}/`) || key.startsWith(`${end}/`));
  const crosses = (a: Point, b: Point, shapes: readonly ElementShape[]) => {
    for (const shape of shapes) {
      if (pieceThrough(a, b, shape.plate ?? shape.rect) && !holds(shape.key)) return true;
    }
    return false;
  };
  // Each piece of the flattened curve, against the blocks of the cells it passes, found from points
  // along it less than a cell apart: a block standing between two of the curve's points, which a
  // check of the points alone missed, counts too (A4).
  for (let at = 0; at < route.length; at++) {
    const b = route[at] as Point;
    const a = route[at - 1] ?? b;
    if (crosses(a, b, blocks.largeOnes)) return true;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP));
    let last: readonly ElementShape[] | undefined;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const near = blocks.near({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (near === last) continue;
      last = near;
      if (crosses(a, b, near)) return true;
    }
  }
  return false;
}

/**
 * Whether the piece from `a` to `b` runs through a rectangle, 2 units in from its sides: the piece
 * clipped to it (Liang and Barsky) keeps some length, or a point of it lies inside.
 */
function pieceThrough(a: Point, b: Point, rect: Rect): boolean {
  const left = rect.x + 2;
  const top = rect.y + 2;
  const right = rect.x + rect.width - 2;
  const bottom = rect.y + rect.height - 2;
  if (right <= left || bottom <= top) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enter = 0;
  let leave = 1;
  const edges: [number, number][] = [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  // A point alone, as the first piece of a route is, counts when it lies inside.
  return dx === 0 && dy === 0 ? true : leave > enter;
}

/**
 * The key of the shape that holds both ends of a line, from their keys: their longest common run of
 * containers, '' for World. A line between a container and what it holds counts in that container.
 */
export function holderKeyOf(from: string, to: string): string {
  const a = from.split('/');
  const b = to.split('/');
  let common = 0;
  while (common < a.length - 1 && common < b.length - 1 && a[common] === b[common]) common++;
  if (a.length !== b.length) {
    // One end may hold the other.
    const [outer, inner] = a.length < b.length ? [a, b] : [b, a];
    if (outer.every((part, at) => inner[at] === part)) return outer.join('/');
  }
  return a.slice(0, common).join('/');
}

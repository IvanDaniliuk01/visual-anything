/**
 * An outline fitted to a shape's rectangle, and what the canvas, layout's input, the exports and the
 * checks ask of it (ADR 0066): its flattening to within a quarter of a canvas unit, whether it holds a
 * point, where a line from inside it last leaves it, where a place on a side of its box meets it, a
 * point well inside it, the label area around that point, and its simplified form for drawing far
 * out. Fitted outlines are in the rectangle's own coordinates, its top left at 0, 0, and each is made
 * once for an outline and a size, as is everything asked of it.
 */
import type { Point } from '@visual-anything/schema';
import { cubicAt, evenOddHolds, type Box, type Outline, type OutlineContour } from './outline';
import type { Segment } from './path';

/** How far a flattening may stray from the curve, in canvas units. */
export const FLATTENING_TOLERANCE = 0.25;
/** The most pieces one segment is flattened into. */
const MAX_PIECES = 24;
/** The most points a contour keeps, simplified for drawing far out. */
const SIMPLIFIED_POINTS = 32;
/** The most fitted sizes kept for one outline; shapes come in few sizes. */
const SIZES_KEPT = 256;

/** A contour flattened, as x, y pairs, with its bounds and role. */
export interface FlatContour {
  role: OutlineContour['role'];
  points: Float64Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** An outline fitted to a rectangle, in the rectangle's coordinates. */
export interface FittedOutline {
  readonly outline: Outline;
  readonly width: number;
  readonly height: number;
  readonly contours: readonly OutlineContour[];
  /** Where the outline's box lands in the rectangle. */
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** The outline's own bounds, fitted. */
  readonly bounds: Box;
}

interface Readings {
  flat?: readonly FlatContour[];
  inner?: Point;
  label?: Box;
  simplified?: readonly Float64Array[];
}

const fittedBySize = new WeakMap<Outline, Map<string, FittedOutline>>();
const readings = new WeakMap<FittedOutline, Readings>();

/** An outline fitted to a rectangle of this size: stretched to it, or, keeping proportions, centred in it. */
export function fitOutline(outline: Outline, width: number, height: number): FittedOutline {
  let sizes = fittedBySize.get(outline);
  if (!sizes) {
    sizes = new Map();
    fittedBySize.set(outline, sizes);
  }
  const key = `${width}x${height}`;
  const known = sizes.get(key);
  if (known) return known;
  let scaleX = width / outline.width;
  let scaleY = height / outline.height;
  let offsetX = 0;
  let offsetY = 0;
  if (outline.keepProportions) {
    const scale = Math.min(scaleX, scaleY);
    scaleX = scale;
    scaleY = scale;
    offsetX = (width - outline.width * scale) / 2;
    offsetY = (height - outline.height * scale) / 2;
  }
  const map = (point: Point): Point => ({
    x: point.x * scaleX + offsetX,
    y: point.y * scaleY + offsetY,
  });
  const contours = outline.contours.map((contour) => ({
    role: contour.role,
    start: map(contour.start),
    segments: contour.segments.map((segment): Segment =>
      segment.kind === 'line'
        ? { kind: 'line', to: map(segment.to) }
        : { kind: 'cubic', c1: map(segment.c1), c2: map(segment.c2), to: map(segment.to) },
    ),
  }));
  const fitted: FittedOutline = {
    outline,
    width,
    height,
    contours,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    bounds: {
      x: outline.bounds.x * scaleX + offsetX,
      y: outline.bounds.y * scaleY + offsetY,
      width: outline.bounds.width * scaleX,
      height: outline.bounds.height * scaleY,
    },
  };
  if (sizes.size >= SIZES_KEPT) sizes.delete(sizes.keys().next().value as string);
  sizes.set(key, fitted);
  return fitted;
}

function readingsOf(fitted: FittedOutline): Readings {
  let found = readings.get(fitted);
  if (!found) {
    found = {};
    readings.set(fitted, found);
  }
  return found;
}

/** The fitted outline flattened to within a quarter of a canvas unit, at most 24 pieces a segment. */
export function flattenOutline(fitted: FittedOutline): readonly FlatContour[] {
  const kept = readingsOf(fitted);
  if (kept.flat) return kept.flat;
  kept.flat = fitted.contours.map((contour) => flatten(contour, FLATTENING_TOLERANCE));
  return kept.flat;
}

/** A contour flattened to within `tolerance`, by Wang's bound on how far a cubic strays from its chords. */
export function flatten(
  contour: OutlineContour,
  tolerance: number,
  maxPieces = MAX_PIECES,
): FlatContour {
  const points: number[] = [contour.start.x, contour.start.y];
  let from = contour.start;
  for (const segment of contour.segments) {
    if (segment.kind === 'line') points.push(segment.to.x, segment.to.y);
    else {
      const pieces = piecesFor(from, segment.c1, segment.c2, segment.to, tolerance, maxPieces);
      for (let piece = 1; piece <= pieces; piece += 1) {
        const point = cubicAt(from, segment.c1, segment.c2, segment.to, piece / pieces);
        points.push(point.x, point.y);
      }
    }
    from = segment.to;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let at = 0; at < points.length; at += 2) {
    const x = points[at] as number;
    const y = points[at + 1] as number;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { role: contour.role, points: Float64Array.from(points), minX, minY, maxX, maxY };
}

function piecesFor(
  p0: Point,
  c1: Point,
  c2: Point,
  p3: Point,
  tolerance: number,
  cap: number,
): number {
  const ddx = Math.max(Math.abs(p0.x - 2 * c1.x + c2.x), Math.abs(c1.x - 2 * c2.x + p3.x));
  const ddy = Math.max(Math.abs(p0.y - 2 * c1.y + c2.y), Math.abs(c1.y - 2 * c2.y + p3.y));
  const bend = Math.hypot(ddx, ddy);
  const pieces = Math.ceil(Math.sqrt((0.75 * bend) / tolerance));
  return Math.max(1, Math.min(cap, pieces));
}

/**
 * Whether the fitted outline holds a point, in the rectangle's coordinates: inside its fills and
 * outside their holes, by the even-odd rule, or within `margin` of its edges, as half a stroke's width
 * reaches. A line holds what lies within `margin` of it.
 */
export function outlineHolds(fitted: FittedOutline, point: Point, margin = 0): boolean {
  const flat = flattenOutline(fitted);
  const { x, y } = point;
  let inside = false;
  for (const contour of flat) {
    if (contour.role === 'line') continue;
    if (x < contour.minX || x > contour.maxX || y < contour.minY || y > contour.maxY) continue;
    if (evenOddHolds(contour.points, x, y)) inside = !inside;
  }
  if (inside) return true;
  if (margin <= 0) return false;
  return distanceToEdges(flat, point, margin) <= margin;
}

/** How far a point is from the nearest edge of the flattened outline, up to `limit` (further reads as `limit`). */
export function distanceToEdges(
  flat: readonly FlatContour[],
  point: Point,
  limit = Infinity,
): number {
  let best = limit;
  for (const contour of flat) {
    if (
      point.x < contour.minX - best ||
      point.x > contour.maxX + best ||
      point.y < contour.minY - best ||
      point.y > contour.maxY + best
    ) {
      continue;
    }
    const points = contour.points;
    const closed = contour.role !== 'line';
    const count = points.length / 2;
    const last = closed ? count : count - 1;
    for (let i = 0; i < last; i += 1) {
      const j = (i + 1) % count;
      const d = segmentDistance(
        point.x,
        point.y,
        points[2 * i] as number,
        points[2 * i + 1] as number,
        points[2 * j] as number,
        points[2 * j + 1] as number,
      );
      if (d < best) best = d;
    }
  }
  return best;
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  let t = length === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / length;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Every place a ray from `from` along `direction` crosses the outline's edges, by how far along it is,
 * from `minT` on: past 0 for a ray from inside, from 0 for one that may start on the outline itself.
 */
function crossings(
  flat: readonly FlatContour[],
  from: Point,
  direction: Point,
  minT = 1e-9,
): number[] {
  const found: number[] = [];
  for (const contour of flat) {
    const points = contour.points;
    const count = points.length / 2;
    const last = contour.role === 'line' ? count - 1 : count;
    for (let i = 0; i < last; i += 1) {
      const j = (i + 1) % count;
      const ax = points[2 * i] as number;
      const ay = points[2 * i + 1] as number;
      const ex = (points[2 * j] as number) - ax;
      const ey = (points[2 * j + 1] as number) - ay;
      const denominator = direction.x * ey - direction.y * ex;
      if (Math.abs(denominator) < 1e-12) continue;
      const wx = ax - from.x;
      const wy = ay - from.y;
      const t = (wx * ey - wy * ex) / denominator;
      const u = (wx * direction.y - wy * direction.x) / denominator;
      if (t >= minT && u >= 0 && u <= 1) found.push(t);
    }
  }
  return found;
}

/**
 * Where a line from `from`, inside the outline, toward `toward` last leaves it: the furthest
 * crossing along the ray, so that no later point of the ray is inside. `undefined` when the ray
 * crosses nothing, as from a point outside that looks away.
 */
export function outlineExit(fitted: FittedOutline, from: Point, toward: Point): Point | undefined {
  const direction = { x: toward.x - from.x, y: toward.y - from.y };
  if (direction.x === 0 && direction.y === 0) return undefined;
  const found = crossings(flattenOutline(fitted), from, direction);
  if (found.length === 0) return undefined;
  const t = Math.max(...found);
  return { x: from.x + t * direction.x, y: from.y + t * direction.y };
}

/** A side of a shape's box, as connection points name them. */
export type BoxSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Where a place on a side of the rectangle, carried straight in from that side, first meets the
 * outline, and the side's outward direction: how a connection point or a border attachment finds the
 * outline. When the line misses it, the outline's point nearest that place.
 */
export function outlinePlace(
  fitted: FittedOutline,
  side: BoxSide,
  at: number,
): { point: Point; outward: Point } {
  const { width, height } = fitted;
  const place = Math.max(0, Math.min(1, at));
  const from =
    side === 'top'
      ? { x: place * width, y: 0 }
      : side === 'bottom'
        ? { x: place * width, y: height }
        : side === 'left'
          ? { x: 0, y: place * height }
          : { x: width, y: place * height };
  const inward =
    side === 'top'
      ? { x: 0, y: 1 }
      : side === 'bottom'
        ? { x: 0, y: -1 }
        : side === 'left'
          ? { x: 1, y: 0 }
          : { x: -1, y: 0 };
  const outward = { x: -inward.x, y: -inward.y };
  const flat = flattenOutline(fitted);
  const found = crossings(flat, from, inward, -1e-9);
  if (found.length > 0) {
    const t = Math.min(...found);
    return { point: { x: from.x + t * inward.x, y: from.y + t * inward.y }, outward };
  }
  return { point: nearestOnEdges(flat, from), outward };
}

/** The point of the flattened outline's edges nearest a point. */
export function nearestOnEdges(flat: readonly FlatContour[], point: Point): Point {
  let best = Number.POSITIVE_INFINITY;
  let nearest = point;
  for (const contour of flat) {
    const points = contour.points;
    const count = points.length / 2;
    const last = contour.role === 'line' ? count - 1 : count;
    for (let i = 0; i < last; i += 1) {
      const j = (i + 1) % count;
      const ax = points[2 * i] as number;
      const ay = points[2 * i + 1] as number;
      const bx = points[2 * j] as number;
      const by = points[2 * j + 1] as number;
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      let t = length === 0 ? 0 : ((point.x - ax) * dx + (point.y - ay) * dy) / length;
      t = Math.max(0, Math.min(1, t));
      const x = ax + t * dx;
      const y = ay + t * dy;
      const d = Math.hypot(point.x - x, point.y - y);
      if (d < best) {
        best = d;
        nearest = { x, y };
      }
    }
  }
  return nearest;
}

/**
 * A point well inside the outline: the centre of the largest circle it holds, found to within a
 * canvas unit by refining cells, as the pole of inaccessibility is. Where the outline holds nothing
 * wide enough, the middle of its bounds.
 */
export function outlineInnerPoint(fitted: FittedOutline): Point {
  const kept = readingsOf(fitted);
  if (kept.inner) return kept.inner;
  kept.inner = innerPoint(fitted);
  return kept.inner;
}

function innerPoint(fitted: FittedOutline): Point {
  const flat = flattenOutline(fitted).filter((contour) => contour.role !== 'line');
  const { bounds } = fitted;
  const middle = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  if (flat.length === 0 || bounds.width <= 0 || bounds.height <= 0) return middle;
  const signed = (x: number, y: number) => {
    const d = distanceToEdges(flat, { x, y });
    return outlineHolds(fitted, { x, y }) ? d : -d;
  };
  const size = Math.min(bounds.width, bounds.height);
  const precision = Math.max(1, size / 200);
  let half = size / 2;
  // Cells as [x, y, half, distance, best possible], searched best possible first.
  const cells: [number, number, number, number, number][] = [];
  const push = (x: number, y: number, h: number) => {
    const d = signed(x, y);
    cells.push([x, y, h, d, d + h * Math.SQRT2]);
  };
  for (let x = bounds.x; x < bounds.x + bounds.width; x += size) {
    for (let y = bounds.y; y < bounds.y + bounds.height; y += size) push(x + half, y + half, half);
  }
  let best: [number, number, number] = [middle.x, middle.y, signed(middle.x, middle.y)];
  let rounds = 0;
  while (cells.length > 0 && rounds < 4000) {
    rounds += 1;
    let at = 0;
    for (let i = 1; i < cells.length; i += 1) {
      if (((cells[i] as number[])[4] as number) > ((cells[at] as number[])[4] as number)) at = i;
    }
    const [x, y, h, d, potential] = cells.splice(at, 1)[0] as [
      number,
      number,
      number,
      number,
      number,
    ];
    if (d > best[2]) best = [x, y, d];
    if (potential - best[2] <= precision) continue;
    half = h / 2;
    push(x - half, y - half, half);
    push(x + half, y - half, half);
    push(x - half, y + half, half);
    push(x + half, y + half, half);
  }
  return best[2] > 0 ? { x: best[0], y: best[1] } : middle;
}

/**
 * Where a shape writes its name and detail: the geometry's own label area, fitted, or the largest
 * rectangle at most four times as wide as it is tall, centred on the point well inside the outline,
 * that the outline holds whole.
 */
export function outlineLabelArea(fitted: FittedOutline): Box {
  const kept = readingsOf(fitted);
  if (kept.label) return kept.label;
  const { label } = fitted.outline;
  kept.label =
    label === undefined
      ? largestLabel(fitted)
      : {
          x: label.x * fitted.scaleX + fitted.offsetX,
          y: label.y * fitted.scaleY + fitted.offsetY,
          width: label.width * fitted.scaleX,
          height: label.height * fitted.scaleY,
        };
  return kept.label;
}

function largestLabel(fitted: FittedOutline): Box {
  const centre = outlineInnerPoint(fitted);
  const flat = flattenOutline(fitted);
  let best: Box = { x: centre.x, y: centre.y, width: 0, height: 0 };
  for (const aspect of [4, 3, 2, 1.5, 1]) {
    let low = 0;
    let high = Math.max(fitted.width, fitted.height);
    for (let step = 0; step < 24; step += 1) {
      const halfHeight = (low + high) / 2;
      if (rectangleInside(fitted, flat, centre, halfHeight * aspect, halfHeight)) low = halfHeight;
      else high = halfHeight;
    }
    const area = low * low * aspect * 4;
    if (area > best.width * best.height) {
      best = {
        x: centre.x - low * aspect,
        y: centre.y - low,
        width: 2 * low * aspect,
        height: 2 * low,
      };
    }
  }
  return best;
}

/** Whether the outline holds a rectangle whole: its corners inside, and no edge crossing it. */
function rectangleInside(
  fitted: FittedOutline,
  flat: readonly FlatContour[],
  centre: Point,
  halfWidth: number,
  halfHeight: number,
): boolean {
  const left = centre.x - halfWidth;
  const right = centre.x + halfWidth;
  const top = centre.y - halfHeight;
  const bottom = centre.y + halfHeight;
  for (const corner of [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
  ]) {
    if (!outlineHolds(fitted, corner)) return false;
  }
  for (const contour of flat) {
    if (
      contour.maxX < left ||
      contour.minX > right ||
      contour.maxY < top ||
      contour.minY > bottom
    ) {
      continue;
    }
    const points = contour.points;
    const count = points.length / 2;
    for (let i = 0; i < count; i += 1) {
      const x = points[2 * i] as number;
      const y = points[2 * i + 1] as number;
      // A vertex strictly inside the rectangle means an edge reaches into it.
      if (x > left && x < right && y > top && y < bottom) return false;
    }
  }
  return true;
}

/**
 * The outline simplified for drawing far out: each fill at most 32 points, its holes left out, as
 * the canvas's plain blocks and silhouettes draw it.
 */
export function simplifyOutline(fitted: FittedOutline): readonly Float64Array[] {
  const kept = readingsOf(fitted);
  if (kept.simplified) return kept.simplified;
  kept.simplified = flattenOutline(fitted)
    .filter((contour) => contour.role === 'fill')
    .map((contour) => simplified(contour.points, SIMPLIFIED_POINTS));
  return kept.simplified;
}

/** A closed polygon reduced to at most `most` points by Ramer, Douglas and Peucker, widening its tolerance until it fits. */
function simplified(points: Float64Array, most: number): Float64Array {
  const count = points.length / 2;
  if (count <= most) return points;
  const size = Math.hypot(
    Math.max(...evens(points)) - Math.min(...evens(points)),
    Math.max(...odds(points)) - Math.min(...odds(points)),
  );
  let tolerance = Math.max(size / 1000, 1e-6);
  for (let round = 0; round < 40; round += 1) {
    const kept = douglasPeucker(points, tolerance);
    if (kept.length / 2 <= most) return kept;
    tolerance *= 1.5;
  }
  // Past every tolerance tried, evenly spaced points.
  const out: number[] = [];
  for (let i = 0; i < most; i += 1) {
    const at = Math.floor((i * count) / most);
    out.push(points[2 * at] as number, points[2 * at + 1] as number);
  }
  return Float64Array.from(out);
}

function evens(points: Float64Array): number[] {
  return Array.from({ length: points.length / 2 }, (_, i) => points[2 * i] as number);
}

function odds(points: Float64Array): number[] {
  return Array.from({ length: points.length / 2 }, (_, i) => points[2 * i + 1] as number);
}

function douglasPeucker(points: Float64Array, tolerance: number): Float64Array {
  const count = points.length / 2;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let worst = -1;
    let at = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = segmentDistance(
        points[2 * i] as number,
        points[2 * i + 1] as number,
        points[2 * first] as number,
        points[2 * first + 1] as number,
        points[2 * last] as number,
        points[2 * last + 1] as number,
      );
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([first, at], [at, last]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i]) out.push(points[2 * i] as number, points[2 * i + 1] as number);
  }
  return Float64Array.from(out);
}

/**
 * An outline as SVG path data: absolute moves, lines and cubics, each closed contour ending with Z,
 * its numbers written so that reading them again gives the same outline.
 */
export function outlinePathData(contours: readonly OutlineContour[]): string {
  const parts: string[] = [];
  for (const contour of contours) {
    parts.push(`M${n(contour.start.x)} ${n(contour.start.y)}`);
    for (const segment of contour.segments) {
      parts.push(
        segment.kind === 'line'
          ? `L${n(segment.to.x)} ${n(segment.to.y)}`
          : `C${n(segment.c1.x)} ${n(segment.c1.y)} ${n(segment.c2.x)} ${n(segment.c2.y)} ${n(segment.to.x)} ${n(segment.to.y)}`,
      );
    }
    if (contour.role !== 'line') parts.push('Z');
  }
  return parts.join(' ');
}

/** A number as JavaScript writes it shortest, which reads back to the same number. */
function n(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}

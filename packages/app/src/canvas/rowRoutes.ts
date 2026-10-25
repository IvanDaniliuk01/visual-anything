/**
 * Routes for relations that end on rows, or on shapes that draw their contents as rows (ADR 0023): such
 * an end leaves its container's left or right side at the row's middle, or at the header's, runs a
 * short stub out to its lane, and goes on from there. Relations that end on one row on one side share
 * its stub, as one trunk; each row with relations on a side has a lane of its own, so their vertical
 * runs stay apart.
 *
 * - Two side ends on the same side join in a C, at the lane further out.
 * - Two stubs facing each other join in a Z, through the middle of the gap between the two sides.
 * - Toward a shape within the container's span, above or below it, the route turns vertical first,
 *   at its lane; toward one beside it, it enters it from the side facing the lane.
 * - Toward a point, the middle of another relation, it turns once into the point.
 *
 * Every other pair of ends keeps `routeBetweenEnds`. Relations between the same two ends are drawn
 * apart: each turns `offset / 3` further out, so that each keeps a segment of its own.
 */
import { centerOf, type Point, type Rect } from './geometry';
import { routeBetweenEnds, type Route, type RouteEnd } from './route';
import { laneX, type RowSide } from './rows';

/** A row, or the header of a shape that draws rows: routes leave only through its container's left or right side, at `y`, along `lane`. */
export interface SideEnd {
  kind: 'side';
  /** The rectangle of the shape that draws the rows. */
  container: Rect;
  /** Where the route leaves its side: the middle of the row, or of the header. */
  y: number;
  /** Its row's lane on that side, from 0. */
  lane: number;
  side: RowSide;
}

/** One end of a route: a shape, a point, or a side end. */
export type AnyEnd = RouteEnd | SideEnd;

/** How close to a corner a route may enter a shape. */
const INSET = 6;
/** How far clear of a container a route that goes around it runs. */
const CLEAR = 12;
/** How much less than the scene's offset between relations with the same ends a sibling turns away. */
const SIBLING_SHARE = 1 / 3;
/** How close to its own side a lane moved by a sibling may come. */
const NEAREST_LANE = 4;

export function isSideEnd(end: AnyEnd): end is SideEnd {
  return 'kind' in end && end.kind === 'side';
}

/**
 * The side a side end leaves from: the right when the other end's middle is at or beyond the middle
 * of its container, the left otherwise.
 */
export function sideToward(container: Rect, other: Point): RowSide {
  return other.x >= container.x + container.width / 2 ? 'right' : 'left';
}

/** Whether two containers overlap horizontally, when two side ends on them both leave on the right. */
export function overlapHorizontally(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width;
}

/** Routes between two ends, any of them a side end; `routeBetweenEnds` when neither is. */
export function routeWithSides(from: AnyEnd, to: AnyEnd, offset = 0): Route {
  if (isSideEnd(from)) {
    if (isSideEnd(to)) return simplify(betweenSides(from, to, offset));
    if ('rect' in to) return simplify(sideToRect(from, to.rect, offset));
    return simplify(sideToPoint(from, to.point, offset));
  }
  if (isSideEnd(to)) return routeWithSides(to, from, offset).reverse();
  return routeBetweenEnds(from, to, offset);
}

/** Where a side end leaves its container. */
export function sideStart(end: SideEnd): Point {
  const { container, side, y } = end;
  return { x: side === 'right' ? container.x + container.width : container.x, y };
}

/** Which way a side points: +1 to the right, -1 to the left. */
function outward(side: RowSide): number {
  return side === 'right' ? 1 : -1;
}

/** Where a side end's lane runs, moved by a sibling's share of `offset`, never back onto its side. */
function laneOf(end: SideEnd, offset: number): number {
  const sign = outward(end.side);
  const x = laneX(end.container, end.side, end.lane) + sign * offset * SIBLING_SHARE;
  const edge = sideStart(end).x + sign * NEAREST_LANE;
  return sign > 0 ? Math.max(x, edge) : Math.min(x, edge);
}

function betweenSides(a: SideEnd, b: SideEnd, offset: number): Route {
  const start = sideStart(a);
  const end = sideStart(b);
  if (a.side === b.side) {
    // A C at the lane further out.
    const sign = outward(a.side);
    const x =
      sign > 0
        ? Math.max(laneOf(a, offset), laneOf(b, offset))
        : Math.min(laneOf(a, offset), laneOf(b, offset));
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  const facing =
    (a.side === 'right' && end.x >= start.x) || (a.side === 'left' && end.x <= start.x);
  if (facing) {
    if (start.y === end.y) return [start, end];
    const low = Math.min(start.x, end.x);
    const high = Math.max(start.x, end.x);
    if (high - low >= 2) {
      // A Z through the middle of the gap; each stub runs at most half of it.
      const x = clamp((low + high) / 2 + offset * SIBLING_SHARE, low + 1, high - 1);
      return [start, { x, y: start.y }, { x, y: end.y }, end];
    }
    // No room between the two sides, as when one container stands over the other with their sides in
    // line: out to each lane, and across through the gap between them.
    const across = gapBetween(a.container, b.container);
    if (across !== undefined) {
      const ax = laneOf(a, offset);
      const bx = laneOf(b, offset);
      return [
        start,
        { x: ax, y: start.y },
        { x: ax, y: across },
        { x: bx, y: across },
        { x: bx, y: end.y },
        end,
      ];
    }
    // Side by side with no gap: along the seam they share.
    const x = (low + high) / 2;
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  // Facing away: around both containers, above or below them, whichever is nearer.
  const ax = laneOf(a, offset);
  const bx = laneOf(b, offset);
  const top = Math.min(a.container.y, b.container.y) - CLEAR;
  const bottom = Math.max(bottomOf(a.container), bottomOf(b.container)) + CLEAR;
  const y =
    Math.abs(start.y - top) + Math.abs(end.y - top) <=
    Math.abs(start.y - bottom) + Math.abs(end.y - bottom)
      ? top
      : bottom;
  return [start, { x: ax, y: start.y }, { x: ax, y }, { x: bx, y }, { x: bx, y: end.y }, end];
}

function sideToRect(from: SideEnd, rect: Rect, offset: number): Route {
  const { container } = from;
  const start = sideStart(from);
  const sign = outward(from.side);
  const x = laneOf(from, offset);
  const lane = { x, y: start.y };
  const target = centerOf(rect);
  const targetY = alongSide(rect.y, rect.height, target.y + offset);
  const targetX = alongSide(rect.x, rect.width, target.x + offset);
  const withinX = x >= rect.x && x <= rightOf(rect);
  const nearEdgeY = (fromY: number) => (target.y < fromY ? bottomOf(rect) : rect.y);
  // The side of the shape that faces the lane.
  const facingX = x < rect.x ? rect.x : rightOf(rect);

  if (overlapHorizontally(container, rect)) {
    // Above or below the container: down or up its lane first.
    if (withinX) return [start, lane, { x, y: nearEdgeY(start.y) }];
    return [start, lane, { x, y: targetY }, { x: facingX, y: targetY }];
  }
  const ahead = sign > 0 ? rect.x >= start.x : rightOf(rect) <= start.x;
  if (ahead) {
    // Beside it, on the side the route leaves from.
    if (start.y >= rect.y + INSET && start.y <= bottomOf(rect) - INSET) {
      return [start, { x: sign > 0 ? rect.x : rightOf(rect), y: start.y }];
    }
    if (withinX) return [start, lane, { x, y: nearEdgeY(start.y) }];
    return [start, lane, { x, y: targetY }, { x: facingX, y: targetY }];
  }
  // Behind the container: around it, above or below, toward the shape.
  const y = target.y < centerOf(container).y ? container.y - CLEAR : bottomOf(container) + CLEAR;
  if (y >= rect.y + INSET && y <= bottomOf(rect) - INSET) {
    const sideX = target.x < x ? rightOf(rect) : rect.x;
    return [start, lane, { x, y }, { x: sideX, y }];
  }
  return [start, lane, { x, y }, { x: targetX, y }, { x: targetX, y: nearEdgeY(y) }];
}

function sideToPoint(from: SideEnd, point: Point, offset: number): Route {
  const start = sideStart(from);
  const sign = outward(from.side);
  const x = laneOf(from, offset);
  if (point.y === start.y) return [start, point];
  // Beyond the lane: out to the point's x, then one turn into it.
  if ((point.x - x) * sign >= 0) return [start, { x: point.x, y: start.y }, point];
  return [start, { x, y: start.y }, { x, y: point.y }, point];
}

/**
 * The route without repeated points, and without points in the middle of a straight run; a point
 * where the route turns back on itself is kept.
 */
function simplify(route: Point[]): Route {
  const kept: Point[] = [];
  for (const point of route) {
    const last = kept.at(-1);
    if (last && last.x === point.x && last.y === point.y) continue;
    const before = kept.at(-2);
    if (before && last && straightThrough(before, last, point)) kept[kept.length - 1] = point;
    else kept.push(point);
  }
  return kept.length >= 2 ? kept : [route[0] as Point, route.at(-1) as Point];
}

/** Whether `middle` lies on the straight run from `a` to `b`, between them. */
function straightThrough(a: Point, middle: Point, b: Point): boolean {
  if (a.x === middle.x && middle.x === b.x) {
    return (middle.y - a.y) * (b.y - middle.y) > 0;
  }
  if (a.y === middle.y && middle.y === b.y) {
    return (middle.x - a.x) * (b.x - middle.x) > 0;
  }
  return false;
}

/** A coordinate along a side of a shape, kept away from its corners. */
function alongSide(start: number, length: number, wanted: number): number {
  const inset = Math.min(INSET, length / 2);
  return clamp(wanted, start + inset, start + length - inset);
}

/** The middle of the gap between two containers when one stands above the other; `undefined` when none does. */
function gapBetween(a: Rect, b: Rect): number | undefined {
  if (bottomOf(a) <= b.y) return (bottomOf(a) + b.y) / 2;
  if (bottomOf(b) <= a.y) return (bottomOf(b) + a.y) / 2;
  return undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function rightOf(rect: Rect): number {
  return rect.x + rect.width;
}

function bottomOf(rect: Rect): number {
  return rect.y + rect.height;
}

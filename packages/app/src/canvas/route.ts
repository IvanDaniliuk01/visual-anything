/**
 * Orthogonal routes for relations: horizontal and vertical segments that leave a shape and enter the
 * other on the sides facing each other, or, when one shape overlaps the other, that leave the inner one
 * by its side nearest the other's outline. This stands in until ELK routes relations, in M3.
 */
import { centerOf, distance, type Point, type Rect } from './geometry';

/** A route from its start to its end, through its bends; at least two points. */
export type Route = Point[];

/** How close to a corner a route may leave or enter a shape. */
const CORNER_INSET = 6;

/** One end of a route: a shape, by its rectangle, or a point, such as the middle of another relation. */
export type RouteEnd = { rect: Rect } | { point: Point };

/** Routes between two ends, each a shape or a point, as a relation between them is drawn. */
export function routeBetweenEnds(from: RouteEnd, to: RouteEnd, offset = 0): Route {
  if ('rect' in from) {
    return 'rect' in to
      ? routeBetween(from.rect, to.rect, offset)
      : routeToPoint(from.rect, to.point, offset);
  }
  return 'rect' in to
    ? routeFromPoint(from.point, to.rect, offset)
    : routeBetweenPoints(from.point, to.point);
}

/**
 * Routes from one shape to another. `offset` moves both ends along their sides, so that relations
 * between the same two shapes run side by side.
 */
export function routeBetween(from: Rect, to: Rect, offset = 0): Route {
  const gapX = Math.max(to.x - right(from), from.x - right(to));
  const gapY = Math.max(to.y - bottom(from), from.y - bottom(to));
  if (gapX <= 0 && gapY <= 0) return routeAcross(from, to, offset);

  if (gapX >= gapY) {
    const goesRight = to.x >= right(from);
    const startX = goesRight ? right(from) : from.x;
    const endX = goesRight ? to.x : right(to);
    const shared = overlap(from.y, bottom(from), to.y, bottom(to));
    if (shared) {
      const y = clamp((shared[0] + shared[1]) / 2 + offset, shared[0], shared[1]);
      return [
        { x: startX, y },
        { x: endX, y },
      ];
    }
    const startY = alongSide(from.y, from.height, centerOf(from).y + offset);
    const endY = alongSide(to.y, to.height, centerOf(to).y + offset);
    const middleX = (startX + endX) / 2;
    return [
      { x: startX, y: startY },
      { x: middleX, y: startY },
      { x: middleX, y: endY },
      { x: endX, y: endY },
    ];
  }

  const goesDown = to.y >= bottom(from);
  const startY = goesDown ? bottom(from) : from.y;
  const endY = goesDown ? to.y : bottom(to);
  const shared = overlap(from.x, right(from), to.x, right(to));
  if (shared) {
    const x = clamp((shared[0] + shared[1]) / 2 + offset, shared[0], shared[1]);
    return [
      { x, y: startY },
      { x, y: endY },
    ];
  }
  const startX = alongSide(from.x, from.width, centerOf(from).x + offset);
  const endX = alongSide(to.x, to.width, centerOf(to).x + offset);
  const middleY = (startY + endY) / 2;
  return [
    { x: startX, y: startY },
    { x: startX, y: middleY },
    { x: endX, y: middleY },
    { x: endX, y: endY },
  ];
}

/**
 * Routes from a shape to a point, such as the middle of another relation: out of the side facing the
 * point, then one turn into it.
 */
export function routeToPoint(from: Rect, point: Point, offset = 0): Route {
  const center = centerOf(from);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const startX = dx >= 0 ? right(from) : from.x;
    const startY = alongSide(from.y, from.height, center.y + offset);
    return turnFrom({ x: startX, y: startY }, point, 'horizontal');
  }
  const startY = dy >= 0 ? bottom(from) : from.y;
  const startX = alongSide(from.x, from.width, center.x + offset);
  return turnFrom({ x: startX, y: startY }, point, 'vertical');
}

/** Routes from a point to a shape: the reverse of the route from the shape to the point. */
export function routeFromPoint(point: Point, to: Rect, offset = 0): Route {
  return routeToPoint(to, point, offset).reverse();
}

/** Routes between two points: along one axis, then the other. */
export function routeBetweenPoints(from: Point, to: Point): Route {
  return turnFrom(
    from,
    to,
    Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'horizontal' : 'vertical',
  );
}

/** The point halfway along a route, measured along its segments. */
export function midpointOf(route: Route): Point {
  const total = lengthOf(route);
  let left = total / 2;
  for (let each = 1; each < route.length; each++) {
    const a = route[each - 1] as Point;
    const b = route[each] as Point;
    const segment = distance(a, b);
    if (segment >= left && segment > 0) {
      const t = left / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= segment;
  }
  return route[0] ?? { x: 0, y: 0 };
}

/** The length of a route along its segments. */
export function lengthOf(route: Route): number {
  let total = 0;
  for (let each = 1; each < route.length; each++) {
    total += distance(route[each - 1] as Point, route[each] as Point);
  }
  return total;
}

/** How far a point is from the nearest point of a route. */
export function distanceToRoute(point: Point, route: Route): number {
  let nearest = Infinity;
  for (let each = 1; each < route.length; each++) {
    nearest = Math.min(
      nearest,
      distanceToSegment(point, route[each - 1] as Point, route[each] as Point),
    );
  }
  return route.length === 1 ? distance(point, route[0] as Point) : nearest;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * The route between two shapes that overlap or touch, such as an element and its container: one
 * straight segment, horizontal or vertical, from a side of one to a side of the other. It leaves the
 * inner shape by its side nearest the other's outline, crossing as few of the two shapes as it can,
 * and runs where both shapes span, so that it starts and ends on their outlines.
 */
function routeAcross(from: Rect, to: Rect, offset: number): Route {
  let best: { route: Route; score: number[] } | undefined;
  for (const axis of ['x', 'y'] as const) {
    const across = axis === 'x' ? 'y' : 'x';
    const span = (rect: Rect) => (axis === 'x' ? rect.width : rect.height);
    const spanAcross = (rect: Rect) => (axis === 'x' ? rect.height : rect.width);
    // Where both shapes span across the segment; it is never empty, as the shapes meet.
    const low = Math.max(from[across], to[across]);
    const high = Math.min(from[across] + spanAcross(from), to[across] + spanAcross(to));
    const shared = overlap(low, high, low, high) ?? [low, high];
    const along = clamp((low + high) / 2 + offset, shared[0], Math.max(shared[0], shared[1]));
    for (const start of [from[axis], from[axis] + span(from)]) {
      for (const end of [to[axis], to[axis] + span(to)]) {
        const length = Math.abs(end - start);
        if (length === 0) continue;
        // Whether the segment runs through the inside of each shape, rather than away from it.
        const throughFrom = start === from[axis] ? end > start : end < start;
        const throughTo = end === to[axis] ? start > end : start < end;
        // Fewest shapes run through, then the shortest, then one that leaves `from` rather than `to`.
        const score = [(throughFrom ? 1 : 0) + (throughTo ? 1 : 0), length, throughFrom ? 1 : 0];
        if (best && !before(score, best.score)) continue;
        const point = (at: number): Point =>
          axis === 'x' ? { x: at, y: along } : { x: along, y: at };
        best = { route: [point(start), point(end)], score };
      }
    }
  }
  // Two shapes that are one point have no side to leave by.
  return best?.route ?? [centerOf(from), centerOf(to)];
}

/** Whether one score comes strictly before another, comparing them part by part. */
function before(score: readonly number[], other: readonly number[]): boolean {
  for (let at = 0; at < score.length; at++) {
    const a = score[at] as number;
    const b = other[at] as number;
    if (a !== b) return a < b;
  }
  return false;
}

function turnFrom(start: Point, end: Point, first: 'horizontal' | 'vertical'): Route {
  if (start.x === end.x || start.y === end.y) return [start, end];
  const bend = first === 'horizontal' ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
  return [start, bend, end];
}

/** A coordinate along a side of a shape, kept away from its corners. */
function alongSide(start: number, length: number, wanted: number): number {
  const inset = Math.min(CORNER_INSET, length / 2);
  return clamp(wanted, start + inset, start + length - inset);
}

function overlap(a1: number, a2: number, b1: number, b2: number): [number, number] | undefined {
  const start = Math.max(a1, b1) + CORNER_INSET;
  const end = Math.min(a2, b2) - CORNER_INSET;
  return start <= end ? [start, end] : undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function right(rect: Rect): number {
  return rect.x + rect.width;
}

function bottom(rect: Rect): number {
  return rect.y + rect.height;
}

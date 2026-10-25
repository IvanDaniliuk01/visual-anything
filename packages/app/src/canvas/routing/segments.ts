/**
 * Dragging a segment of an orthogonal route (`relation-routing.md` §7.2): it moves perpendicular to
 * itself and the segments on either side stretch; where it touches an end, a corner is added so that
 * the end keeps leaving its side, or an automatic end slides along its side while it can. On release,
 * the drawn route's corners, end stubs excepted, become the bend points.
 */
import type { Point, Rect } from '../geometry';
import { CORNER_INSET, STUB, normalOf, type Side } from './hand';

/** How one end of a route takes a move of the segment that touches it. */
export type SegmentEnd =
  /** Attached where it was chosen, along its side's stub: it stays, and a corner is added past its stub. */
  | { kind: 'stub'; side: Side }
  /** An automatic end on a shape: it slides along its side while the move keeps it there. */
  | { kind: 'slides'; rect: Rect; side: Side }
  /** The middle of another relation: it stays, and a corner is added there. */
  | { kind: 'fixed' };

/** The route with its segment from `route[at]` to `route[at + 1]` moved perpendicular to itself to `value`. */
export function moveSegment(
  route: readonly Point[],
  at: number,
  value: number,
  ends: { from: SegmentEnd; to: SegmentEnd },
): Point[] {
  const a = route[at];
  const b = route[at + 1];
  if (!a || !b) return [...route];
  const horizontal = a.y === b.y;
  const moved = (point: Point): Point => (horizontal ? { x: point.x, y: value } : { x: value, y: point.y });
  const last = route.length - 1;
  const points: Point[] = [];
  if (at === 0) points.push(...endMove(route[0] as Point, ends.from, moved));
  else points.push(...route.slice(0, at), moved(a));
  if (at + 1 === last) points.push(...endMove(route[last] as Point, ends.to, moved).reverse());
  else points.push(moved(b), ...route.slice(at + 2));
  return simplified(points);
}

/** How an end takes a move of the segment that touches it, from the end outward. */
function endMove(end: Point, how: SegmentEnd, moved: (point: Point) => Point): Point[] {
  const to = moved(end);
  if (how.kind === 'slides' && onSide(how.rect, how.side, to)) return [to];
  if (how.kind === 'fixed') return [end, to];
  // The stub stays, out of its side, and the route turns past it.
  const normal = normalOf(how.side);
  const out = { x: end.x + normal.x * STUB, y: end.y + normal.y * STUB };
  return [end, out, moved(out)];
}

/** Whether a point lies on a side of a rectangle, kept from its corners. */
function onSide(rect: Rect, side: Side, point: Point): boolean {
  const horizontal = side === 'top' || side === 'bottom';
  const start = horizontal ? rect.x : rect.y;
  const length = horizontal ? rect.width : rect.height;
  const inset = Math.min(CORNER_INSET, length / 2);
  const along = horizontal ? point.x : point.y;
  return along >= start + inset && along <= start + length - inset;
}

/**
 * The bend points that draw a route as it is: its corners, but its ends and the points where a stub
 * of an end attached by hand turns.
 */
export function cornersOf(
  route: readonly Point[],
  stubs: { from?: Side; to?: Side },
): Point[] {
  const corners = simplified(route).slice(1, -1);
  const first = route[0];
  const last = route.at(-1);
  const isStub = (point: Point | undefined, end: Point | undefined, side: Side | undefined) => {
    if (!point || !end || side === undefined) return false;
    const normal = normalOf(side);
    return point.x === end.x + normal.x * STUB && point.y === end.y + normal.y * STUB;
  };
  if (isStub(corners[0], first, stubs.from)) corners.shift();
  if (isStub(corners.at(-1), last, stubs.to)) corners.pop();
  return corners;
}

/** The points without repeats, and without points in the middle of a straight run. */
export function simplified(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const previous = kept.at(-1);
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    kept.push(point);
  }
  const result: Point[] = [];
  for (let at = 0; at < kept.length; at++) {
    const point = kept[at] as Point;
    const before = result.at(-1);
    const after = kept[at + 1];
    if (before && after) {
      const straight =
        (before.x === point.x && point.x === after.x && between(before.y, point.y, after.y)) ||
        (before.y === point.y && point.y === after.y && between(before.x, point.x, after.x));
      if (straight) continue;
    }
    result.push(point);
  }
  return result;
}

function between(a: number, b: number, c: number): boolean {
  return (a <= b && b <= c) || (a >= b && b >= c);
}

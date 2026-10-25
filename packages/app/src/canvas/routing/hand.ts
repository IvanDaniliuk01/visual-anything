/**
 * Relations routed by hand on the canvas (ADR 0039, `docs/designs/relation-routing.md` §6.1): the
 * route of a line through where its ends attach and through its bend points, orthogonal, straight or
 * curved; and where relations attach to the connection points of a shape (`components.md` §3.5).
 * Pure, so that the scene, the renderer while shapes are dragged and the route editor's previews all
 * route a line alike.
 */
import type { RouteStyle, Side } from '@visual-anything/core';
import type { Point, Rect } from '../geometry';

export type { RouteStyle, Side } from '@visual-anything/core';

/** How far a route runs out of a side it attaches to, perpendicular to it, before it turns. */
export const STUB = 12;
/** How close to a corner an automatic end may leave a side. */
export const CORNER_INSET = 6;
/** How far a route that goes round its own shape keeps clear of it. */
export const CLEAR = 12;
/** How far apart siblings attach along a side, at a connection point. */
export const SIBLING_STEP = 12;
/** About how long each flattened segment of a curve is, in canvas units. */
export const CURVE_STEP = 12;
const FEWEST_SEGMENTS = 4;
const MOST_SEGMENTS = 24;
/** How far out of its side a row's stub runs to its first lane, and between lanes; lanes stop at 6. */
const LANE_FIRST = 16;
const LANE_STEP = 8;
const MOST_LANES = 6;

/** A place on a shape's border: a side, and from 0 at its left or top end to 1 at the other. */
export interface Attach {
  side: Side;
  at: number;
}

/** One end of a route drawn by hand. */
export type HandEnd =
  /**
   * A shape, by its rectangle: attached where `attach` says, or automatically without it, at the
   * connection point of `points` that faces its neighbour when it has any.
   */
  | { kind: 'shape'; rect: Rect; attach?: Attach; points?: readonly Attach[] }
  /** A row, or the header of a shape that draws rows: beside its container, on one side, at `y`. */
  | { kind: 'side'; container: Rect; y: number; lane: number; side: 'left' | 'right' }
  /** The middle of another relation's line. */
  | { kind: 'point'; point: Point };

/** One span of a curved route: a cubic Bézier curve. */
export interface CurveSpan {
  from: Point;
  c1: Point;
  c2: Point;
  to: Point;
}

/** A route drawn by hand: the points it runs through, and for a curve its spans. */
export interface HandRoute {
  /** From start to end; on a curve, its spans flattened, which hit testing and labels read. */
  route: Point[];
  curve?: CurveSpan[];
}

type Axis = 'h' | 'v';

const NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** The unit vector out of a side. */
export function normalOf(side: Side): Point {
  return NORMALS[side];
}

/** The point at a side and a place along it, on a rectangle, as connection points are placed. */
export function attachPoint(rect: Rect, { side, at }: Attach): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + at * rect.width, y: rect.y };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + at * rect.height };
    case 'bottom':
      return { x: rect.x + at * rect.width, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: rect.y + at * rect.height };
  }
}

/**
 * The place on a rectangle's border nearest a point, on one of `sides`: its side, and the place along
 * it rounded to three decimals.
 */
export function nearestBorderAttach(
  rect: Rect,
  point: Point,
  sides: readonly Side[] = ['top', 'right', 'bottom', 'left'],
): Attach {
  let best: { attach: Attach; distance: number } | undefined;
  for (const side of sides) {
    const horizontal = side === 'top' || side === 'bottom';
    const length = horizontal ? rect.width : rect.height;
    const along = horizontal ? point.x - rect.x : point.y - rect.y;
    const at = length > 0 ? round3(clamp(along / length, 0, 1)) : 0.5;
    const place = attachPoint(rect, { side, at });
    const distance = Math.hypot(point.x - place.x, point.y - place.y);
    if (!best || distance < best.distance) best = { attach: { side, at }, distance };
  }
  return best?.attach ?? { side: 'right', at: 0.5 };
}

/** The side a ray from a rectangle's middle towards a point leaves it by. */
export function sideFacing(rect: Rect, toward: Point): Side {
  const dx = toward.x - (rect.x + rect.width / 2);
  const dy = toward.y - (rect.y + rect.height / 2);
  if (Math.abs(dx) * rect.height >= Math.abs(dy) * rect.width) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/**
 * The connection point a line attaches to when it attaches automatically to a shape that has some:
 * the one on the side facing the other end, nearest the line between the shape's middle and it; with
 * none on that side, the nearest overall. A sibling, the `sibling`th of the lines between the same
 * two ends counted from the middle one, attaches 12 units further along the side, kept on it.
 */
export function facingPoint(
  rect: Rect,
  points: readonly Attach[],
  toward: Point,
  sibling = 0,
): Attach | undefined {
  if (points.length === 0) return undefined;
  const side = sideFacing(rect, toward);
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const onSide = points.filter((point) => point.side === side);
  const best = (candidates: readonly Attach[], score: (place: Point) => number) => {
    let found: Attach | undefined;
    let lowest = Infinity;
    for (const candidate of candidates) {
      const value = score(attachPoint(rect, candidate));
      if (value < lowest) {
        lowest = value;
        found = candidate;
      }
    }
    return found as Attach;
  };
  const chosen =
    onSide.length > 0
      ? best(onSide, (place) => distanceToLine(place, middle, toward))
      : best(points, (place) => Math.hypot(place.x - toward.x, place.y - toward.y));
  if (sibling === 0) return { side: chosen.side, at: chosen.at };
  const length = chosen.side === 'top' || chosen.side === 'bottom' ? rect.width : rect.height;
  const at = length > 0 ? clamp(chosen.at + (sibling * SIBLING_STEP) / length, 0, 1) : chosen.at;
  return { side: chosen.side, at: round3(at) };
}

/** How many segments a curve's span of chord `length` is flattened into. */
export function flattenedSegments(length: number): number {
  return clamp(Math.ceil(length / CURVE_STEP), FEWEST_SEGMENTS, MOST_SEGMENTS);
}

/**
 * Routes a line by hand between two ends through bend points, in a style:
 * - orthogonal: out of a chosen end perpendicular to its side, with a stub; out of an automatic end
 *   on the side facing its neighbour, straight at it when it can; then through each bend point, each
 *   a corner, along the current axis to the next point's coordinate and a turn; never back over a
 *   stub nor through its own end's shape;
 * - straight: straight segments through each bend point;
 * - curved: one cubic span between each two points, leaving and entering shapes along the normals of
 *   their sides, and smooth through each bend point.
 * `sibling` places a line among others between the same two ends, at connection points.
 */
export function routeByHand(
  from: HandEnd,
  to: HandEnd,
  bendPoints: readonly Point[],
  style: RouteStyle,
  sibling = 0,
): HandRoute {
  const toward = {
    from: bendPoints[0] ?? anchorOf(to),
    to: bendPoints.at(-1) ?? anchorOf(from),
  };
  switch (style) {
    case 'orthogonal':
      return { route: orthogonalRoute(from, to, bendPoints, toward, sibling) };
    case 'straight': {
      const start = startOf(from, toward.from, 'straight', sibling).point;
      const end = startOf(to, toward.to, 'straight', sibling).point;
      return { route: withoutRepeats([start, ...bendPoints, end]) };
    }
    case 'curved':
      return curvedRoute(from, to, bendPoints, toward, sibling);
  }
}

/** The point an end is aimed at from elsewhere: where it attaches, or its middle. */
export function anchorOf(end: HandEnd): Point {
  switch (end.kind) {
    case 'point':
      return end.point;
    case 'side':
      return { x: sideX(end), y: end.y };
    case 'shape':
      return end.attach
        ? attachPoint(end.rect, end.attach)
        : { x: end.rect.x + end.rect.width / 2, y: end.rect.y + end.rect.height / 2 };
  }
}

/** Where an end starts: its point, and the side it leaves by and how far its stub runs, if any. */
interface Start {
  point: Point;
  side?: Side;
  /** The rectangle the route must not run through, around which it turns. */
  rect?: Rect;
  stub: number;
}

/**
 * Where a line starts at an end, aimed at `toward`: a chosen place, or the connection point facing
 * it; for an automatic end in an orthogonal route, the side facing it at its coordinate when that lies
 * within the side; in a straight or curved route, where the line from the middle to it crosses the
 * border.
 */
function startOf(end: HandEnd, toward: Point, style: RouteStyle, sibling: number): Start {
  switch (end.kind) {
    case 'point':
      return { point: end.point, stub: 0 };
    case 'side': {
      const lane = Math.min(MOST_LANES, Math.max(0, end.lane));
      return {
        point: { x: sideX(end), y: end.y },
        side: end.side,
        rect: end.container,
        stub: LANE_FIRST + LANE_STEP * lane,
      };
    }
    case 'shape': {
      const { rect } = end;
      const attach = end.attach ?? facingPoint(rect, end.points ?? [], toward, sibling);
      if (attach) return { point: attachPoint(rect, attach), side: attach.side, rect, stub: STUB };
      if (style === 'orthogonal') {
        const side = sideFacing(rect, toward);
        return { point: automaticOnSide(rect, side, toward), side, rect, stub: 0 };
      }
      const crossing = borderCrossing(rect, toward);
      return { ...crossing, rect, stub: 0 };
    }
  }
}

function sideX(end: Extract<HandEnd, { kind: 'side' }>): number {
  return end.side === 'left' ? end.container.x : end.container.x + end.container.width;
}

/** On a side, at a point's coordinate along it when that lies within it, kept from its corners; else its middle. */
function automaticOnSide(rect: Rect, side: Side, toward: Point): Point {
  const horizontal = side === 'top' || side === 'bottom';
  const start = horizontal ? rect.x : rect.y;
  const length = horizontal ? rect.width : rect.height;
  const inset = Math.min(CORNER_INSET, length / 2);
  const wanted = horizontal ? toward.x : toward.y;
  const along =
    wanted >= start + inset && wanted <= start + length - inset ? wanted : start + length / 2;
  return attachPoint(rect, { side, at: length > 0 ? (along - start) / length : 0.5 });
}

/** Where the segment from a rectangle's middle towards a point crosses its border, and on which side. */
function borderCrossing(rect: Rect, toward: Point): { point: Point; side: Side } {
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const dx = toward.x - middle.x;
  const dy = toward.y - middle.y;
  const side = sideFacing(rect, toward);
  if (dx === 0 && dy === 0) return { point: attachPoint(rect, { side, at: 0.5 }), side };
  const alongX = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const alongY = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const travel = Math.min(alongX, alongY);
  return { point: { x: middle.x + dx * travel, y: middle.y + dy * travel }, side };
}

/** The points an end's route leaves by, and the axis it goes on along towards its neighbour. */
interface Exit {
  points: Point[];
  axis: Axis;
}

/**
 * How an orthogonal route leaves an end towards `toward`: from its start, out along its stub, and
 * round its own shape when `toward` lies behind the side it leaves; then along the axis it goes on.
 */
function exitOf(start: Start, toward: Point): Exit {
  const { point, side, rect, stub } = start;
  if (side === undefined || rect === undefined) {
    const dx = Math.abs(toward.x - point.x);
    const dy = Math.abs(toward.y - point.y);
    return { points: [point], axis: dx >= dy ? 'h' : 'v' };
  }
  const normal = normalOf(side);
  const normalAxis: Axis = normal.x !== 0 ? 'h' : 'v';
  const tangentAxis: Axis = normalAxis === 'h' ? 'v' : 'h';
  if (stub === 0) return { points: [point], axis: normalAxis };
  const out = { x: point.x + normal.x * stub, y: point.y + normal.y * stub };
  const along = (toward.x - point.x) * normal.x + (toward.y - point.y) * normal.y;
  if (along >= stub) return { points: [point, out], axis: normalAxis };
  if (along >= 0) return { points: [point, out], axis: tangentAxis };
  // Behind the side: round the corner of that side nearer the neighbour, clear of the shape.
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const key = tangentAxis === 'h' ? 'x' : 'y';
  const low = tangentAxis === 'h' ? rect.x : rect.y;
  const high = low + (tangentAxis === 'h' ? rect.width : rect.height);
  const offset = toward[key] - middle[key];
  const goesHigh = offset > 0 || (offset === 0 && point[key] > middle[key]);
  const corner = { ...out, [key]: goesHigh ? high + CLEAR : low - CLEAR };
  return { points: [point, out, corner], axis: normalAxis };
}

function orthogonalRoute(
  from: HandEnd,
  to: HandEnd,
  bendPoints: readonly Point[],
  toward: { from: Point; to: Point },
  sibling: number,
): Point[] {
  const fromExit = exitOf(startOf(from, toward.from, 'orthogonal', sibling), toward.from);
  const toExit = exitOf(startOf(to, toward.to, 'orthogonal', sibling), toward.to);
  const points: Point[] = [...fromExit.points];
  let axis: Axis = fromExit.axis;
  let current = points.at(-1) as Point;
  for (const bend of bendPoints) {
    const arrived = connect(points, current, axis, bend, undefined);
    current = bend;
    // A bend point is a corner: the route turns there.
    axis = arrived === 'h' ? 'v' : arrived === 'v' ? 'h' : axis;
  }
  const entry = [...toExit.points].reverse();
  connect(points, current, axis, entry[0] as Point, toExit.axis);
  points.push(...entry.slice(1));
  return simplified(points);
}

/**
 * Adds the points from `from`, leaving along `axis`, to `target`, arriving along `arrive` when given:
 * one segment when they share a coordinate, an L when it can, otherwise a Z. Says the axis of the
 * last segment, or undefined when `target` is `from`.
 */
function connect(
  points: Point[],
  from: Point,
  axis: Axis,
  target: Point,
  arrive: Axis | undefined,
): Axis | undefined {
  if (from.x === target.x && from.y === target.y) return undefined;
  if (from.y === target.y) {
    points.push(target);
    return 'h';
  }
  if (from.x === target.x) {
    points.push(target);
    return 'v';
  }
  if (arrive === undefined || arrive !== axis) {
    points.push(axis === 'h' ? { x: target.x, y: from.y } : { x: from.x, y: target.y }, target);
    return axis === 'h' ? 'v' : 'h';
  }
  if (axis === 'h') {
    const middle = (from.x + target.x) / 2;
    points.push({ x: middle, y: from.y }, { x: middle, y: target.y }, target);
    return 'h';
  }
  const middle = (from.y + target.y) / 2;
  points.push({ x: from.x, y: middle }, { x: target.x, y: middle }, target);
  return 'v';
}

function curvedRoute(
  from: HandEnd,
  to: HandEnd,
  bendPoints: readonly Point[],
  toward: { from: Point; to: Point },
  sibling: number,
): HandRoute {
  const start = startOf(from, toward.from, 'curved', sibling);
  const end = startOf(to, toward.to, 'curved', sibling);
  const waypoints = withoutRepeats([start.point, ...bendPoints, end.point]);
  if (waypoints.length < 2) return { route: [start.point, end.point] };
  const last = waypoints.length - 1;
  const tangents = waypoints.map((point, at): Point => {
    if (at === 0) {
      return start.side === undefined
        ? unit(waypoints[1] as Point, point)
        : normalOf(start.side);
    }
    if (at === last) {
      if (end.side === undefined) return unit(point, waypoints[at - 1] as Point);
      const out = normalOf(end.side);
      return { x: -out.x, y: -out.y };
    }
    const across = unit(waypoints[at + 1] as Point, waypoints[at - 1] as Point);
    return across.x === 0 && across.y === 0 ? unit(waypoints[at + 1] as Point, point) : across;
  });
  const curve: CurveSpan[] = [];
  const route: Point[] = [waypoints[0] as Point];
  for (let at = 0; at < last; at++) {
    const a = waypoints[at] as Point;
    const b = waypoints[at + 1] as Point;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ta = tangents[at] as Point;
    const tb = tangents[at + 1] as Point;
    const span: CurveSpan = {
      from: a,
      c1: { x: a.x + (ta.x * length) / 3, y: a.y + (ta.y * length) / 3 },
      c2: { x: b.x - (tb.x * length) / 3, y: b.y - (tb.y * length) / 3 },
      to: b,
    };
    curve.push(span);
    const segments = flattenedSegments(length);
    for (let step = 1; step < segments; step++) route.push(pointOnSpan(span, step / segments));
    route.push(b);
  }
  return { route, curve };
}

/** The point at `t`, from 0 to 1, along a cubic span. */
export function pointOnSpan(span: CurveSpan, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * span.from.x + b * span.c1.x + c * span.c2.x + d * span.to.x,
    y: a * span.from.y + b * span.c1.y + c * span.c2.y + d * span.to.y,
  };
}

/** The two halves of a span split at `t`. */
export function splitSpan(span: CurveSpan, t: number): [CurveSpan, CurveSpan] {
  const mix = (p: Point, q: Point): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const ab = mix(span.from, span.c1);
  const bc = mix(span.c1, span.c2);
  const cd = mix(span.c2, span.to);
  const abc = mix(ab, bc);
  const bcd = mix(bc, cd);
  const middle = mix(abc, bcd);
  return [
    { from: span.from, c1: ab, c2: abc, to: middle },
    { from: middle, c1: bcd, c2: cd, to: span.to },
  ];
}

/** The unit vector from `b` to `a`; zero when they coincide. */
function unit(a: Point, b: Point): Point {
  const length = Math.hypot(a.x - b.x, a.y - b.y);
  return length === 0 ? { x: 0, y: 0 } : { x: (a.x - b.x) / length, y: (a.y - b.y) / length };
}

/** The points without zero-length segments, and without points in the middle of a straight run. */
function simplified(points: readonly Point[]): Point[] {
  const kept = withoutRepeats(points);
  if (kept.length <= 2) return kept.length === 1 ? [kept[0] as Point, kept[0] as Point] : kept;
  const result: Point[] = [kept[0] as Point];
  for (let at = 1; at < kept.length - 1; at++) {
    const before = result.at(-1) as Point;
    const point = kept[at] as Point;
    const after = kept[at + 1] as Point;
    const straight =
      (before.x === point.x && point.x === after.x && between(before.y, point.y, after.y)) ||
      (before.y === point.y && point.y === after.y && between(before.x, point.x, after.x));
    if (!straight) result.push(point);
  }
  result.push(kept.at(-1) as Point);
  return result;
}

function between(a: number, b: number, c: number): boolean {
  return (a <= b && b <= c) || (a >= b && b >= c);
}

function withoutRepeats(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (!last || last.x !== point.x || last.y !== point.y) kept.push(point);
  }
  if (kept.length === 1) kept.push(kept[0] as Point);
  return kept;
}

/** How far a point is from the line through two points, or from the first when they coincide. */
function distanceToLine(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  return Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / length;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

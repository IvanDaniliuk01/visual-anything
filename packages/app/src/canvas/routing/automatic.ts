/**
 * Automatic routes in their style (ADR 0069), between ends that may lie on outlines (ADR 0066,
 * ADR 0067): what the scene draws for a line the view does not route by hand.
 *
 * - **Orthogonal**: the stand-in route of `rowRoutes.ts` between the boxes, or the route to the
 *   connection points facing each other end, with each end on an outline carried on until it meets
 *   it, so that the route stays orthogonal.
 * - **Straight**: from where the line toward the other end leaves its `from` end's shape to where it
 *   enters the other's: their borders, from their middles, or their outlines, from their inner
 *   points. Lines between the same two ends run 24 units apart, each moved across the line between
 *   them by its offset.
 * - **Curved**: the curve ADR 0039 draws for a route with no bend points, one cubic span, between
 *   the places the orthogonal route attaches at, leaving its `from` end along its side's outward
 *   direction and entering the other along its side's inward one. As the orthogonal routes do, lines
 *   between the same two ends attach 24 units apart, so their curves fan apart.
 *
 * A part of lines alone, such as a nerve, attaches at its lines' point nearest the other end, as an
 * end on a point does. Between two shapes drawn by their outlines that touch, as the chambers and
 * valves of a heart do, a line from outline to outline would have no length to read: whatever its
 * style, it runs from inner point to inner point, over both, so that it reads as a flow from one into
 * the other (ADR 0067's clarification). Pure, so that the scene, the renderer while shapes are dragged and the route
 * editor route a line alike.
 */
import { centerOf, type Point, type Rect } from '../geometry';
import type { PlacedOutline } from '../outlines';
import { isSideEnd, routeWithSides, sideStart, type AnyEnd } from '../rowRoutes';
import { routeByHand, type Attach, type HandEnd, type HandRoute, type RouteStyle } from './hand';
import {
  carriedIn,
  carriedOrthogonal,
  innerPointOf,
  lastExit,
  leavesFromInside,
  nearestOnOutline,
  onlyStrokes,
  placeOfEnd,
  strokeEnd,
  tagBoxOf,
  type OutlinedEnd,
} from './outline-ends';

/** How far apart the scene draws lines between the same two ends, as it offsets them. */
export const PARALLEL_GAP = 24;

/** The shortest line between two outlines that is drawn from one to the other; shorter, it runs over them. */
export const SHORTEST_BETWEEN_OUTLINES = 24;

/** One end of an automatic route, as the scene knows it. */
export interface AutomaticEnd {
  end: AnyEnd;
  /** The connection points of its shape, where it has some. */
  points?: readonly Attach[];
  /** Its shape's own outline, placed where the end is drawn (ADR 0066, ADR 0067). */
  outline?: PlacedOutline;
}

/**
 * The automatic route of a line in a style, `offset` placing it among the lines between the same two
 * ends: see the file's comment.
 */
export function automaticRoute(
  from: AutomaticEnd,
  to: AutomaticEnd,
  style: RouteStyle,
  offset: number,
): HandRoute {
  const a = byStroke(from, to);
  const b = byStroke(to, from);
  const flow = flowRoute(a, b, offset);
  if (flow) return flow;
  const sibling = offset / PARALLEL_GAP;
  const pointed = a.points !== undefined || b.points !== undefined;
  switch (style) {
    case 'orthogonal':
      if (pointed) return routeByHand(handOf(a), handOf(b), [], 'orthogonal', sibling);
      return {
        route: carriedOrthogonal(
          routeWithSides(a.end, b.end, offset),
          outlinedOf(a),
          outlinedOf(b),
        ),
      };
    case 'straight':
      return straightRoute(a, b, offset, sibling);
    case 'curved':
      return curvedRoute(a, b, offset, sibling);
  }
}

/**
 * The line between two shapes drawn by outlines that touch: from inner point to inner point, moved
 * across by `offset` as lines between the same ends are; none for any other two ends.
 */
function flowRoute(a: AutomaticEnd, b: AutomaticEnd, offset: number): HandRoute | undefined {
  if (!a.outline || !b.outline || a.points || b.points) return undefined;
  if (!('rect' in a.end) || !('rect' in b.end)) return undefined;
  const aimA = innerPointOf(a.outline);
  const aimB = innerPointOf(b.outline);
  const leaves = lastExit(a.outline, aimA, aimB);
  const enters = lastExit(b.outline, aimB, aimA);
  if (
    leaves &&
    enters &&
    Math.hypot(enters.x - leaves.x, enters.y - leaves.y) >= SHORTEST_BETWEEN_OUTLINES
  ) {
    return undefined;
  }
  const shift = across(aimA, aimB, offset);
  // Each end stops short of its inner point, so that pressing a part's middle still finds the part.
  const dx = aimB.x - aimA.x;
  const dy = aimB.y - aimA.y;
  const span = Math.hypot(dx, dy);
  const trim = span === 0 ? 0 : Math.min(FLOW_CLEARANCE, span / 4) / span;
  const start = { x: aimA.x + dx * trim + shift.x, y: aimA.y + dy * trim + shift.y };
  const end = { x: aimB.x - dx * trim + shift.x, y: aimB.y - dy * trim + shift.y };
  // Never across a name: the line leaves its first shape's name tag, and stops at the other's
  // (ADR 0066's clarification of 2026-10-27).
  const from = clipAlong(start, end, tagBoxOf(a.outline), 'after');
  const to = clipAlong(start, end, tagBoxOf(b.outline), 'before');
  if (!(to > from)) return undefined;
  return { route: [pointAlong(start, end, from), pointAlong(start, end, to)] };
}

/**
 * How far along the segment from `start` to `end`, from 0 to 1, it runs clear of a box: after where
 * it last leaves the box, or before where it first enters it; 0 and 1 for a box it does not cross.
 */
function clipAlong(
  start: Point,
  end: Point,
  box: Rect | undefined,
  keep: 'after' | 'before',
): number {
  const all = keep === 'after' ? 0 : 1;
  if (!box) return all;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let enter = 0;
  let leave = 1;
  for (const [d, from, low, high] of [
    [dx, start.x, box.x, box.x + box.width],
    [dy, start.y, box.y, box.y + box.height],
  ] as const) {
    if (d === 0) {
      if (from <= low || from >= high) return all;
      continue;
    }
    const a = (low - from) / d;
    const b = (high - from) / d;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  if (!(leave > enter)) return all;
  return keep === 'after' ? leave : enter;
}

function pointAlong(start: Point, end: Point, t: number): Point {
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

/** How far short of each inner point a line between touching outlines stops. */
const FLOW_CLEARANCE = 12;

/** An end on a part of lines alone, as a point: its lines' point nearest the other end. */
function byStroke(end: AutomaticEnd, other: AutomaticEnd): AutomaticEnd {
  const { outline } = end;
  if (!outline || end.points || !('rect' in end.end) || !onlyStrokes(outline)) return end;
  return { end: { point: strokeEnd(outline, aimOf(other)) } };
}

/** The point an end is aimed at from elsewhere: its inner point, its middle, or its point. */
function aimOf(end: AutomaticEnd): Point {
  const { end: at, outline } = end;
  if (isSideEnd(at)) return sideStart(at);
  if ('point' in at) return at.point;
  return outline ? innerPointOf(outline) : centerOf(at.rect);
}

/** An end as the hand router takes it, attached at `attach` when given. */
function handOf(end: AutomaticEnd, attach?: Attach, onOutline = true): HandEnd {
  const at = end.end;
  if (isSideEnd(at)) return at;
  if ('point' in at) return { kind: 'point', point: at.point };
  return {
    kind: 'shape',
    rect: at.rect,
    ...(attach ? { attach } : {}),
    ...(end.points ? { points: end.points } : {}),
    ...(onOutline && end.outline ? { outline: end.outline } : {}),
  };
}

function outlinedOf(end: AutomaticEnd): OutlinedEnd | undefined {
  return end.outline && 'rect' in end.end
    ? { rect: end.end.rect, outline: end.outline }
    : undefined;
}

/** A curve between the places the orthogonal route attaches at, along their sides' directions. */
function curvedRoute(a: AutomaticEnd, b: AutomaticEnd, offset: number, sibling: number): HandRoute {
  const pointed = a.points !== undefined || b.points !== undefined;
  // Where the orthogonal route attaches on the boxes, before it is carried on to any outline.
  const box = pointed
    ? routeByHand(
        handOf(a, undefined, false),
        handOf(b, undefined, false),
        [],
        'orthogonal',
        sibling,
      ).route
    : routeWithSides(a.end, b.end, offset);
  const start = curveEnd(a, box[0] as Point, box[1] as Point);
  const end = curveEnd(b, box.at(-1) as Point, box.at(-2) as Point);
  return routeByHand(start, end, [], 'curved', 0);
}

/**
 * One end of an automatic curve, where the orthogonal route attaches, `place` and `next` its end
 * and the point after it: on a shape, its side and place there, carried in to its outline; on a
 * shape the route leaves from inside, as for a container to what it holds, that point alone, which
 * the curve leaves straight at the other end.
 */
function curveEnd(end: AutomaticEnd, place: Point, next: Point): HandEnd {
  const at = end.end;
  if (!('rect' in at)) return handOf(end);
  const side = placeOfEnd(at.rect, place, next);
  if (!side) return { kind: 'point', point: place };
  if (leavesFromInside(at.rect, next)) {
    const point = end.outline ? carriedIn(end.outline, at.rect, side.side, side.at).point : place;
    return { kind: 'point', point };
  }
  return handOf(end, side);
}

/** A straight line between two ends, moved across the line between them by `offset`. */
function straightRoute(
  a: AutomaticEnd,
  b: AutomaticEnd,
  offset: number,
  sibling: number,
): HandRoute {
  const pointed = a.points !== undefined || b.points !== undefined;
  if (isSideEnd(a.end) || isSideEnd(b.end) || pointed) {
    return routeByHand(handOf(a), handOf(b), [], 'straight', sibling);
  }
  // Shapes that meet, as a container and what it holds: the straight segment the orthogonal route
  // runs between them.
  if ('rect' in a.end && 'rect' in b.end && meet(a.end.rect, b.end.rect)) {
    return {
      route: carriedOrthogonal(routeWithSides(a.end, b.end, offset), outlinedOf(a), outlinedOf(b)),
    };
  }
  const aimA = aimOf(a);
  const aimB = aimOf(b);
  const shift = across(aimA, aimB, offset);
  const start = straightEnd(a, aimA, aimB, shift, 'rect' in b.end);
  const end = straightEnd(b, aimB, aimA, shift, 'rect' in a.end);
  return { route: [start, end] };
}

/**
 * Where a straight line leaves an end: its point, or where the line from its aim moved by `shift`,
 * toward the other end's aim, moved too when that end is a shape, leaves its border or its outline.
 */
function straightEnd(
  end: AutomaticEnd,
  aim: Point,
  other: Point,
  shift: Point,
  otherShifts: boolean,
): Point {
  const at = end.end;
  if (!('rect' in at)) return aim;
  const from = { x: aim.x + shift.x, y: aim.y + shift.y };
  const toward = otherShifts ? { x: other.x + shift.x, y: other.y + shift.y } : other;
  const { outline } = end;
  if (outline) {
    return (
      lastExit(outline, from, toward) ??
      lastExit(outline, aim, other) ??
      nearestOnOutline(outline, other).point
    );
  }
  return rectExit(at.rect, within(at.rect, from), toward);
}

/**
 * The move across the line from `a` to `b` that places a line `offset` from it, the same way across
 * whichever way the line runs, so that lines between the same two ends either way run apart.
 */
function across(a: Point, b: Point, offset: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (offset === 0 || length === 0) return { x: 0, y: 0 };
  let nx = -dy / length;
  let ny = dx / length;
  if (ny < 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx * offset, y: ny * offset };
}

/** Where a ray from `from`, a point in a rectangle, toward `toward` leaves the rectangle. */
function rectExit(rect: Rect, from: Point, toward: Point): Point {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const alongX =
    dx > 0 ? (rect.x + rect.width - from.x) / dx : dx < 0 ? (rect.x - from.x) / dx : Infinity;
  const alongY =
    dy > 0 ? (rect.y + rect.height - from.y) / dy : dy < 0 ? (rect.y - from.y) / dy : Infinity;
  const t = Math.max(0, Math.min(alongX, alongY));
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/** The point, moved into the rectangle when it lies outside it. */
function within(rect: Rect, point: Point): Point {
  return {
    x: Math.min(rect.x + rect.width, Math.max(rect.x, point.x)),
    y: Math.min(rect.y + rect.height, Math.max(rect.y, point.y)),
  };
}

/** Whether two rectangles overlap or touch, as the orthogonal router reads them. */
function meet(a: Rect, b: Rect): boolean {
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
  return gapX <= 0 && gapY <= 0;
}

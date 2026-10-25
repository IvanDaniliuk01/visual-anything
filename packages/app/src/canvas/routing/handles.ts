/**
 * The handles a selected relation's line shows while its route can be edited (`relation-routing.md`
 * §6.2): one at each end, one at each bend point, and one at the middle of each segment; and which
 * of them, or which segment, lies under the pointer.
 */
import { distance, type Point } from '../geometry';
import type { RelationLine } from '../scene';
import { STUB, pointOnSpan } from './hand';

/** One handle of a route. */
export type Handle =
  /** An end: filled when it is attached by hand, hollow when automatically. */
  | { kind: 'end'; end: 'from' | 'to'; at: Point; byHand: boolean }
  /** A bend point that applies, by its place in the route's list. */
  | { kind: 'bend'; index: number; at: Point }
  /**
   * The middle of a segment. On a straight or curved route, `segment` is the span between two
   * consecutive points, where a bend point is added at `segment`; on an orthogonal one, it is the
   * drawn segment from `route[segment]` to `route[segment + 1]`, which moves perpendicular to itself.
   */
  | { kind: 'middle'; segment: number; at: Point };

/** How long an orthogonal segment must be on screen, in pixels, to show its middle handle. */
const SHORTEST_SEGMENT = 24;

/** The handles of a line, in route order: start, bend points and segment middles, end. */
export function handlesOf(line: RelationLine, scale: number): Handle[] {
  const bends = line.hand?.bendPoints ?? [];
  const handles: Handle[] = [
    { kind: 'end', end: 'from', at: line.from, byHand: attachedByHand(line, 'from') },
  ];
  if (line.style === 'straight' || line.style === 'curved') {
    const points = [line.from, ...bends, line.to];
    for (let at = 0; at < points.length - 1; at++) {
      const span = line.curve?.[at];
      const a = points[at] as Point;
      const b = points[at + 1] as Point;
      handles.push({
        kind: 'middle',
        segment: at,
        at: span ? pointOnSpan(span, 0.5) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      });
      if (at < bends.length) handles.push({ kind: 'bend', index: at, at: bends[at] as Point });
    }
  } else {
    const { route } = line;
    const stubs = stubsOf(line);
    // Bend points and segment middles in the order the route passes them.
    const middles: Handle[] = [];
    for (let at = 0; at < route.length - 1; at++) {
      const a = route[at] as Point;
      const b = route[at + 1] as Point;
      const length = distance(a, b);
      if (length * scale <= SHORTEST_SEGMENT) continue;
      if (
        (at === 0 && stubs.from && length <= STUB + 1e-6) ||
        (at === route.length - 2 && stubs.to && length <= STUB + 1e-6)
      ) {
        continue;
      }
      middles.push({ kind: 'middle', segment: at, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
    }
    const placed: { handle: Handle; along: number }[] = [
      ...middles.map((handle) => ({ handle, along: alongRoute(route, handle.at) })),
      ...bends.map((at, index) => ({
        handle: { kind: 'bend' as const, index, at },
        along: alongRoute(route, at) + 1e-9,
      })),
    ];
    placed.sort((a, b) => a.along - b.along);
    handles.push(...placed.map((each) => each.handle));
  }
  handles.push({ kind: 'end', end: 'to', at: line.to, byHand: attachedByHand(line, 'to') });
  return handles;
}

/** Whether a line's end attaches where it was chosen by hand: at a border place or a connection point. */
export function attachedByHand(line: RelationLine, end: 'from' | 'to'): boolean {
  const attachment = line.hand?.route[end];
  return attachment !== undefined && attachment.kind !== 'automatic';
}

/** Whether each end of an orthogonal line leaves its side along a stub: one attached at a chosen place. */
export function stubsOf(line: RelationLine): { from: boolean; to: boolean } {
  return { from: attachedByHand(line, 'from'), to: attachedByHand(line, 'to') };
}

/**
 * The handle under a point, within `reach`: the nearest; on a tie, an end or a bend point before the
 * middle of a segment.
 */
export function handleAt(
  handles: readonly Handle[],
  point: Point,
  reach: number,
): Handle | undefined {
  let found: Handle | undefined;
  let nearest = Infinity;
  for (const handle of handles) {
    const away = distance(handle.at, point) + (handle.kind === 'middle' ? 1e-6 : 0);
    if (away <= reach && away < nearest) {
      found = handle;
      nearest = away;
    }
  }
  return found;
}

/** The drawn segment of a route under a point, within `reach`, by the index of its first point. */
export function segmentAt(
  route: readonly Point[],
  point: Point,
  reach: number,
): number | undefined {
  let found: number | undefined;
  let nearest = Infinity;
  for (let at = 0; at < route.length - 1; at++) {
    const away = distanceToSegment(point, route[at] as Point, route[at + 1] as Point);
    if (away <= reach && away < nearest) {
      found = at;
      nearest = away;
    }
  }
  return found;
}

/** How far along a route its nearest point to `point` lies. */
function alongRoute(route: readonly Point[], point: Point): number {
  let best = { away: Infinity, along: 0 };
  let travelled = 0;
  for (let at = 0; at < route.length - 1; at++) {
    const a = route[at] as Point;
    const b = route[at + 1] as Point;
    const length = distance(a, b);
    const t =
      length === 0
        ? 0
        : clamp(
            ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (length * length),
            0,
            1,
          );
    const away = Math.hypot(point.x - (a.x + t * (b.x - a.x)), point.y - (a.y + t * (b.y - a.y)));
    if (away < best.away) best = { away, along: travelled + t * length };
    travelled += length;
  }
  return best.along;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t =
    length2 === 0
      ? 0
      : clamp(((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length2, 0, 1);
  return Math.hypot(point.x - (a.x + t * (b.x - a.x)), point.y - (a.y + t * (b.y - a.y)));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

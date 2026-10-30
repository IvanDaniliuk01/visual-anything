/**
 * A line drawn from where it starts (ADR 0084): a relation a tour's step marks, or a reveal brings in,
 * is drawn from its `from` end to its `to` end over {@link LINE_DRAW_TIME} milliseconds, so that its
 * direction reads; an undirected one from both ends toward its middle. Pure: the renderer traces what
 * this gives each frame while a line draws.
 */
import type { Point } from './geometry';
import { lengthOf } from './route';

/** How long a line takes to draw from its start, in milliseconds. */
export const LINE_DRAW_TIME = 400;

/**
 * The parts of a route shown a part of the way through its drawing, from 0 to 1: one piece from its
 * start for a directed line, two pieces from its ends toward its middle for an undirected one. The
 * whole route at 1, nothing at 0.
 */
export function drawnPieces(route: readonly Point[], part: number, directed: boolean): Point[][] {
  if (route.length < 2 || !(part > 0)) return [];
  if (part >= 1) return [[...route]];
  if (directed) return [prefix([...route], part)];
  const half = part / 2;
  return [prefix([...route], half), prefix([...route].reverse(), half)];
}

/** The route from its start to a fraction of its length. */
function prefix(route: Point[], fraction: number): Point[] {
  const first = route[0] as Point;
  let left = lengthOf(route) * fraction;
  const out: Point[] = [first];
  for (let at = 1; at < route.length; at++) {
    const a = route[at - 1] as Point;
    const b = route[at] as Point;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (segment >= left) {
      const t = segment > 0 ? left / segment : 0;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      return out;
    }
    out.push(b);
    left -= segment;
  }
  return out;
}

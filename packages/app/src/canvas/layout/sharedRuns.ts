/**
 * ELK's routes that run together (A4, from the user's notes on a real data model; ADR 0080's
 * clarification of 2026-10-31). In a hierarchical run ELK draws a relation that leaves a container
 * along a port on the container's border, so routes between different pairs of shapes come back
 * lying on one another, along a container's side or in one channel between layers. The canvas keeps
 * ELK's routes untouched by the channel pass, so such routes would be drawn as one thick line that
 * the eye cannot follow. So a route is kept only while none of its runs lies on a run of a route kept
 * before it, unless the two share an end, as the lines of a trunk do; a route left out goes through
 * the program's router and the channel pass, which keep it apart.
 */
import type { Point } from '../geometry';

/** How much two runs on one line must overlap to count as running together, as `quality.ts` counts. */
const OVERLAP = 4;
/** How far apart two parallel runs may lie and still count as on one line. */
const SAME_LINE = 0.5;
/** The cells runs are filed by, so that each is compared only with those near it. */
const CELL = 256;

/** A route to keep or leave out, with the ends it runs between, as any keys that name them. */
export interface RouteWithEnds {
  points: readonly Point[];
  ends: readonly (string | number)[];
}

interface Run {
  route: number;
  vertical: boolean;
  /** Its x when vertical, its y when horizontal. */
  at: number;
  from: number;
  to: number;
}

/**
 * Which of `routes` to keep, in their order: true for each that runs together with no route kept
 * before it but those it shares an end with. The first `staying` are lines that stay whatever they
 * meet, and are always kept.
 */
export function keptApart(routes: readonly RouteWithEnds[], staying = 0): boolean[] {
  const cells = new Map<string, Run[]>();
  const keep: boolean[] = [];
  routes.forEach((route, index) => {
    const own = runsOf(route.points, index);
    const clash =
      index >= staying &&
      own.some((run) =>
        cellsOf(run).some((cell) =>
          (cells.get(cell) ?? []).some(
            (other) =>
              together(run, other) &&
              !(routes[other.route] as RouteWithEnds).ends.some((end) => route.ends.includes(end)),
          ),
        ),
      );
    keep.push(!clash);
    if (clash) return;
    for (const run of own) {
      for (const cell of cellsOf(run)) {
        const list = cells.get(cell);
        if (list) list.push(run);
        else cells.set(cell, [run]);
      }
    }
  });
  return keep;
}

/** The horizontal and vertical runs of a route; a slanted one is neither, and shares with nothing. */
function runsOf(points: readonly Point[], route: number): Run[] {
  const runs: Run[] = [];
  for (let at = 1; at < points.length; at++) {
    const a = points[at - 1] as Point;
    const b = points[at] as Point;
    if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) >= 0.01) {
      runs.push({
        route,
        vertical: true,
        at: a.x,
        from: Math.min(a.y, b.y),
        to: Math.max(a.y, b.y),
      });
    } else if (Math.abs(a.y - b.y) < 0.01 && Math.abs(a.x - b.x) >= 0.01) {
      runs.push({
        route,
        vertical: false,
        at: a.y,
        from: Math.min(a.x, b.x),
        to: Math.max(a.x, b.x),
      });
    }
  }
  return runs;
}

function together(one: Run, other: Run): boolean {
  if (one.vertical !== other.vertical || Math.abs(one.at - other.at) > SAME_LINE) return false;
  return Math.min(one.to, other.to) - Math.max(one.from, other.from) > OVERLAP;
}

/** The cells a run lies in, by its line and its extent along it. */
function cellsOf(run: Run): string[] {
  const first = Math.floor(run.from / CELL);
  const last = Math.floor(run.to / CELL);
  const cells: string[] = [];
  // A run near a cell's edge is filed beside it too, so that one half a unit across still meets it.
  const low = Math.floor((run.at - SAME_LINE) / CELL);
  const high = Math.floor((run.at + SAME_LINE) / CELL);
  for (let each = low; each <= high; each++) {
    for (let along = first; along <= last; along++) {
      cells.push(`${run.vertical ? 'v' : 'h'}${each},${along}`);
    }
  }
  return cells;
}

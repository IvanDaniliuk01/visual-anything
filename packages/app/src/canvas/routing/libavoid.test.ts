/**
 * libavoid as a router, measured against the program's own in the quality tests only: it ships
 * nowhere (ADR 0080, section 2, and its clarifications of 2026-10-30).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Rect } from '../geometry';
import { segmentCrosses, type AvoidLine, type AvoidShapes } from './avoid';
import {
  LIBAVOID_BUDGET,
  LibavoidRouter,
  loadLibavoid,
  routeLines,
  type Libavoid,
} from './libavoid';

let lib: Libavoid | undefined;

beforeAll(async () => {
  lib = await loadLibavoid();
});

function loaded(): Libavoid {
  if (!lib) throw new Error('libavoid did not load');
  return lib;
}

/**
 * Two tables, each with two rows, and a wall between them: shapes 0 (table A), 1 and 2 (its rows),
 * 3 (table B), 4 and 5 (its rows), 6 (the wall). Rows lie inside their tables.
 */
function scene(wallAt = 300): { shapes: AvoidShapes; rects: Rect[] } {
  const rects: Rect[] = [
    { x: 0, y: 0, width: 200, height: 200 },
    { x: 0, y: 32, width: 200, height: 24 },
    { x: 0, y: 56, width: 200, height: 24 },
    { x: 600, y: 0, width: 200, height: 200 },
    { x: 600, y: 32, width: 200, height: 24 },
    { x: 600, y: 56, width: 200, height: 24 },
    { x: wallAt, y: -100, width: 100, height: 400 },
  ];
  return {
    rects,
    shapes: {
      rects: Float64Array.from(rects.flatMap((r) => [r.x, r.y, r.width, r.height])),
      parents: Int32Array.from([-1, 0, 0, -1, 3, 3, -1]),
      plates: new Float64Array(rects.length),
      inside: Uint8Array.from([0, 1, 1, 0, 1, 1, 0]),
      open: new Uint8Array(rects.length),
    },
  };
}

/** A line from a row of table A to a row of table B, as the scene gives it: a lane route. */
function rowLine(fromRow: 1 | 2, toRow: 4 | 5, rects: Rect[]): AvoidLine {
  const y0 = (rects[fromRow] as Rect).y + 12;
  const y1 = (rects[toRow] as Rect).y + 12;
  return {
    from: fromRow,
    to: toRow,
    offset: 0,
    route: Float64Array.from([200, y0, 400, y0, 400, y1, 600, y1]),
    fromSide: { shape: 0, way: 1, y: y0 },
    toSide: { shape: 3, way: -1, y: y1 },
  };
}

function pointsOf(route: Float64Array): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let at = 0; at + 1 < route.length; at += 2) {
    points.push({ x: route[at] as number, y: route[at + 1] as number });
  }
  return points;
}

function through(route: Float64Array, rect: Rect): boolean {
  const points = pointsOf(route);
  return points.some((p, at) => at > 0 && segmentCrosses(points[at - 1] as typeof p, p, rect));
}

describe('libavoid (ADR 0080, section 2)', () => {
  it('loads in Node from beside its module', () => {
    expect(loaded()).toBeDefined();
  });

  it('routes a line between rows around the shape in its way, its ends at the rows', () => {
    const { shapes, rects } = scene();
    const router = new LibavoidRouter(loaded());
    const routed = router.route(shapes, [rowLine(1, 4, rects)]);
    router.dispose();
    const route = routed.results[0]?.route;
    expect(route).toBeDefined();
    if (!route) return;
    expect(through(route, rects[6] as Rect)).toBe(false);
    const points = pointsOf(route);
    const first = points[0] as { x: number; y: number };
    const last = points.at(-1) as { x: number; y: number };
    // At the rows' middles, on a side of each table: libavoid takes the cheaper of the two.
    expect(first.y).toBe(44);
    expect([0, 200]).toContain(first.x);
    expect(last.y).toBe(44);
    expect([600, 800]).toContain(last.x);
    // Every run straight.
    for (let at = 1; at < points.length; at++) {
      const p = points[at - 1] as { x: number; y: number };
      const q = points[at] as { x: number; y: number };
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
    expect(routed.containers).toEqual([
      expect.objectContaining({ holder: -1, lines: 1, by: 'libavoid' }),
    ]);
  });

  it('keeps the lines of one row together as a trunk as they leave it', () => {
    const { shapes, rects } = scene();
    const router = new LibavoidRouter(loaded());
    const routed = router.route(shapes, [rowLine(1, 4, rects), rowLine(1, 5, rects)]);
    router.dispose();
    const [a, b] = routed.results.map((each) => pointsOf(each?.route ?? new Float64Array()));
    // Both leave the same point the same way, and share the first run.
    expect(a?.[0]).toEqual(b?.[0]);
    expect(a?.[1]?.y).toBe(b?.[1]?.y);
  });

  it('routes again only what moved, in the router it kept', () => {
    const first = scene(300);
    const router = new LibavoidRouter(loaded());
    const before = router.route(first.shapes, [rowLine(2, 5, first.rects)]).results[0]?.route;
    // The wall moves down out of the way: the same router routes the line straight.
    const moved = scene(300);
    moved.shapes.rects[6 * 4 + 1] = 400;
    const after = router.route(moved.shapes, [rowLine(2, 5, moved.rects)]).results[0]?.route;
    router.dispose();
    expect(before && pointsOf(before).length).toBeGreaterThan(2);
    expect(after && pointsOf(after)).toEqual([
      { x: 200, y: 68 },
      { x: 600, y: 68 },
    ]);
  });

  it('leaves a container over its budget to the program’s router', () => {
    const { shapes, rects } = scene();
    const router = new LibavoidRouter(loaded(), { ...LIBAVOID_BUDGET, lines: 1 });
    const lines = [rowLine(1, 4, rects), rowLine(2, 5, rects)];
    const routed = router.route(shapes, lines);
    expect(routed.results).toEqual([undefined, undefined]);
    expect(routed.containers).toEqual([
      expect.objectContaining({ holder: -1, by: 'fallback', why: 'budget' }),
    ]);
    // routeLines routes them with the program's router instead, around the wall.
    const all = routeLines(shapes, lines, [], router);
    router.dispose();
    for (const result of all.results) {
      expect(result.route && through(result.route, rects[6] as Rect)).toBe(false);
    }
  });

  it('leaves the rest to the program’s router once its time runs out', () => {
    const { shapes, rects } = scene();
    let clock = 0;
    const router = new LibavoidRouter(loaded(), { ...LIBAVOID_BUDGET, time: 10 }, () => {
      clock += 20;
      return clock;
    });
    const routed = router.route(shapes, [rowLine(1, 4, rects)]);
    router.dispose();
    expect(routed.results).toEqual([undefined]);
    expect(routed.containers[0]).toMatchObject({ by: 'fallback', why: 'time' });
  });
});

describe('routing lines with libavoid first', () => {
  it('routes what is asked for, and gives new routes for lines drawn already in the container', () => {
    const { shapes, rects } = scene();
    const router = new LibavoidRouter(loaded());
    const routed = routeLines(shapes, [rowLine(1, 4, rects)], [rowLine(2, 5, rects)], router);
    router.dispose();
    expect(routed.results.filter((each) => each.route).length).toBe(1);
    expect(
      routed.others.map((each, line) => (each ? line : -1)).filter((line) => line >= 0),
    ).toEqual([0]);
  });
});

/** The source files under `dir` that are not tests nor test helpers. */
function shippedSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'test') found.push(...shippedSources(path));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

describe('libavoid ships nowhere (ADR 0080, clarification of 2026-10-30)', () => {
  it('is imported by no module but its own, which only tests import', () => {
    const src = resolve(import.meta.dirname, '../..');
    const importing = shippedSources(src).filter((path) => {
      if (/[\\/]routing[\\/]libavoid\.ts$/.test(path)) return false;
      const text = readFileSync(path, 'utf8');
      return /from '[^']*\/libavoid'|import\('[^']*\/libavoid'\)|'libavoid-js'/.test(text);
    });
    expect(importing).toEqual([]);
  });
});

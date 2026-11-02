/** ELK's kept routes that lie on one another go to the router (A4; ADR 0080's clarification of 2026-10-31). */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Point } from '../geometry';
import { keptApart, type RouteWithEnds } from './sharedRuns';

const route = (ends: string[], ...points: [number, number][]): RouteWithEnds => ({
  ends,
  points: points.map(([x, y]) => ({ x, y })),
});

describe('keptApart', () => {
  it('keeps routes that run apart, and those that share a run only with a common end', () => {
    const keep = keptApart([
      route(['a', 'b'], [0, 0], [100, 0], [100, 200]),
      // On the first one's vertical run, but from the same shape: a trunk.
      route(['a', 'c'], [0, 0], [100, 0], [100, 300]),
      // Parallel, 12 apart.
      route(['d', 'e'], [0, 12], [88, 12], [88, 200]),
    ]);
    expect(keep).toEqual([true, true, true]);
  });

  it('leaves out a route that lies on one kept before it, with no common end', () => {
    const keep = keptApart([
      route(['a', 'b'], [0, 0], [100, 0], [100, 200]),
      // Its vertical run lies on the first one's, from 100 to 160.
      route(['c', 'd'], [100, 100], [100, 160], [300, 160]),
      // Along the second one's horizontal run, which is left out: so this one stays.
      route(['e', 'f'], [150, 160], [250, 160]),
    ]);
    expect(keep).toEqual([true, false, true]);
  });

  it('does not count runs that only touch, or overlap by 4 or less', () => {
    const keep = keptApart([
      route(['a', 'b'], [0, 0], [100, 0]),
      route(['c', 'd'], [100, 0], [200, 0]),
      route(['e', 'f'], [196, 0], [300, 0]),
    ]);
    expect(keep).toEqual([true, true, true]);
  });

  it('finds runs half a unit apart across the edge of its cells', () => {
    const keep = keptApart([
      route(['a', 'b'], [255.8, 0], [255.8, 400]),
      route(['c', 'd'], [256.2, 100], [256.2, 300]),
    ]);
    expect(keep).toEqual([true, false]);
  });

  it('always keeps the staying lines given first, and leaves out what lies on them', () => {
    const keep = keptApart(
      [
        route(['a', 'b'], [0, 0], [0, 100]),
        route(['c', 'd'], [0, 50], [0, 150]),
        route(['e', 'f'], [0, 120], [0, 400]),
      ],
      2,
    );
    expect(keep).toEqual([true, true, false]);
  });

  it('never keeps two routes without a common end that run together', () => {
    const point = fc.record({
      x: fc.integer({ min: 0, max: 40 }).map((n) => n * 16),
      y: fc.integer({ min: 0, max: 40 }).map((n) => n * 16),
    });
    // Orthogonal routes on a coarse grid, so that many lie on one another.
    const orthogonal = fc.array(point, { minLength: 2, maxLength: 5 }).map((points) => {
      const out: Point[] = [points[0] as Point];
      for (const next of points.slice(1)) {
        const last = out.at(-1) as Point;
        out.push({ x: next.x, y: last.y }, next);
      }
      return out;
    });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            points: orthogonal,
            ends: fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 2, maxLength: 2 }),
          }),
          { maxLength: 12 },
        ),
        (routes) => {
          const keep = keptApart(routes);
          const kept = routes.filter((_, at) => keep[at]);
          for (let i = 0; i < kept.length; i++) {
            for (let j = i + 1; j < kept.length; j++) {
              const a = kept[i] as RouteWithEnds;
              const b = kept[j] as RouteWithEnds;
              if (a.ends.some((end) => b.ends.includes(end))) continue;
              expect(sharedRun(a.points, b.points)).toBeLessThanOrEqual(4);
            }
          }
        },
      ),
    );
  });
});

/** The longest run two routes share on one line, worked out pair by pair. */
function sharedRun(a: readonly Point[], b: readonly Point[]): number {
  let most = 0;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1] as Point;
      const q = a[i] as Point;
      const r = b[j - 1] as Point;
      const s = b[j] as Point;
      const vertical = (u: Point, v: Point) => u.x === v.x && u.y !== v.y;
      const horizontal = (u: Point, v: Point) => u.y === v.y && u.x !== v.x;
      if (vertical(p, q) && vertical(r, s) && p.x === r.x) {
        most = Math.max(most, overlap(p.y, q.y, r.y, s.y));
      } else if (horizontal(p, q) && horizontal(r, s) && p.y === r.y) {
        most = Math.max(most, overlap(p.x, q.x, r.x, s.x));
      }
    }
  }
  return most;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return (
    Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1))
  );
}

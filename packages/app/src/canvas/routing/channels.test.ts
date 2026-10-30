import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../geometry';
import { CLEAR, IDEAL, LEAST, spreadChannels, type ChannelInput } from './channels';

/** A line for the pass: its route, its two ends, whether it moves, and its stubs. */
interface TestLine {
  route: Point[];
  ends: [number, number];
  movable?: boolean;
  stubs?: [number, number];
}

function inputOf(lines: TestLine[], obstacles: Rect[] = []): ChannelInput {
  const points: number[] = [];
  const starts: number[] = [];
  for (const line of lines) {
    starts.push(points.length / 2);
    for (const { x, y } of line.route) points.push(x, y);
  }
  starts.push(points.length / 2);
  return {
    obstacles: Float64Array.from(obstacles.flatMap((r) => [r.x, r.y, r.width, r.height])),
    points: Float64Array.from(points),
    starts: Int32Array.from(starts),
    ends: Int32Array.from(lines.flatMap((line) => line.ends)),
    movable: Uint8Array.from(lines.map((line) => (line.movable === false ? 0 : 1))),
    stubs: Float64Array.from(lines.flatMap((line) => line.stubs ?? [16, 16])),
  };
}

function routesOf(input: ChannelInput): Point[][] {
  const { points, starts } = spreadChannels(input);
  const routes: Point[][] = [];
  for (let line = 0; line + 1 < starts.length; line++) {
    const route: Point[] = [];
    for (let at = starts[line] as number; at < (starts[line + 1] as number); at++) {
      route.push({ x: points[2 * at] as number, y: points[2 * at + 1] as number });
    }
    routes.push(route);
  }
  return routes;
}

/** The x of the vertical run of a Z route. */
const middleOf = (route: Point[]) => (route[1] as Point).x;

/** Whether two orthogonal routes cross each other properly anywhere. */
function cross(a: Point[], b: Point[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1] as Point;
      const q = a[i] as Point;
      const r = b[j - 1] as Point;
      const s = b[j] as Point;
      const pv = p.x === q.x;
      const rv = r.x === s.x;
      if (pv === rv) continue;
      const [v0, v1, h0, h1] = pv ? [p, q, r, s] : [r, s, p, q];
      const x = v0.x;
      const y = h0.y;
      const inV = y > Math.min(v0.y, v1.y) && y < Math.max(v0.y, v1.y);
      const inH = x > Math.min(h0.x, h1.x) && x < Math.max(h0.x, h1.x);
      if (inV && inH) return true;
    }
  }
  return false;
}

describe('spreadChannels', () => {
  it('spreads the shared middle runs of Zs between the same gap, in an order that does not cross', () => {
    // Four lines from the right side of a table at x 0 to the left side of one at x 200, each from a
    // row lower than the last to a row lower than the last: all through the middle of the gap.
    const lines: TestLine[] = [0, 1, 2, 3].map((at) => ({
      route: [
        { x: 0, y: 100 + at * 24 },
        { x: 100, y: 100 + at * 24 },
        { x: 100, y: 400 + at * 24 },
        { x: 200, y: 400 + at * 24 },
      ],
      ends: [at, 10 + at],
    }));
    const routes = routesOf(inputOf(lines));
    const xs = routes.map(middleOf);
    expect(new Set(xs).size).toBe(4);
    const sorted = [...xs].sort((p, q) => p - q);
    for (let at = 1; at < sorted.length; at++) {
      expect((sorted[at] as number) - (sorted[at - 1] as number)).toBeGreaterThanOrEqual(IDEAL);
    }
    // Each line turns down before the one below it, so the uppermost runs furthest right.
    expect(xs).toEqual([...xs].sort((p, q) => q - p));
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        expect(cross(routes[i] as Point[], routes[j] as Point[])).toBe(false);
      }
    }
    // The ends stay where they were, at their rows.
    routes.forEach((route, at) => {
      expect(route[0]).toEqual(lines[at]?.route[0]);
      expect(route.at(-1)).toEqual(lines[at]?.route.at(-1));
    });
  });

  it('keeps the lines of one row together as a trunk', () => {
    // Two lines from the same row, end 0, down the same run to two rows below.
    const trunk: TestLine[] = [400, 448].map((y, at) => ({
      route: [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y },
        { x: 200, y },
      ],
      ends: [0, 20 + at],
    }));
    const other: TestLine = {
      route: [
        { x: 0, y: 160 },
        { x: 100, y: 160 },
        { x: 100, y: 500 },
        { x: 200, y: 500 },
      ],
      ends: [5, 30],
    };
    const routes = routesOf(inputOf([...trunk, other]));
    expect(middleOf(routes[0] as Point[])).toBe(middleOf(routes[1] as Point[]));
    expect(
      Math.abs(middleOf(routes[0] as Point[]) - middleOf(routes[2] as Point[])),
    ).toBeGreaterThanOrEqual(LEAST);
  });

  it('keeps clear of the shapes beside the corridor, and squeezes rather than cross them', () => {
    // A narrow gap: two tables 40 apart, the middle runs between them.
    const left = { x: -100, y: 0, width: 100, height: 600 };
    const right = { x: 40, y: 0, width: 100, height: 600 };
    const lines: TestLine[] = [0, 1].map((at) => ({
      route: [
        { x: 0, y: 100 + at * 24 },
        { x: 20, y: 100 + at * 24 },
        { x: 20, y: 400 + at * 24 },
        { x: 40, y: 400 + at * 24 },
      ],
      ends: [at, 10 + at],
      stubs: [4, 4],
    }));
    const routes = routesOf(inputOf(lines, [left, right]));
    const xs = routes.map(middleOf);
    expect(xs[0]).not.toBe(xs[1]);
    for (const x of xs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(40);
    }
  });

  it('moves a run off a fixed line, and never moves a fixed line', () => {
    const fixed: TestLine = {
      route: [
        { x: 100, y: 0 },
        { x: 100, y: 600 },
      ],
      ends: [40, 41],
      movable: false,
    };
    const moving: TestLine = {
      route: [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 400 },
        { x: 200, y: 400 },
      ],
      ends: [1, 2],
    };
    const [still, moved] = routesOf(inputOf([fixed, moving]));
    expect(still).toEqual(fixed.route);
    expect(Math.abs(middleOf(moved as Point[]) - 100)).toBeGreaterThanOrEqual(LEAST);
  });

  it('keeps a stub of its least length', () => {
    // The middle run may not come nearer its ends' sides than the stub of 16.
    const lines: TestLine[] = [0, 1, 2].map((at) => ({
      route: [
        { x: 0, y: 100 + at * 24 },
        { x: 16, y: 100 + at * 24 },
        { x: 16, y: 400 + at * 24 },
        { x: 200, y: 400 + at * 24 },
      ],
      ends: [at, 10 + at],
    }));
    for (const route of routesOf(inputOf(lines))) {
      expect(middleOf(route)).toBeGreaterThanOrEqual(16);
      expect(middleOf(route)).toBeLessThanOrEqual(184);
    }
  });

  it('straightens a short jog, unless it would cross a shape', () => {
    const jog: TestLine = {
      route: [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 250 },
        { x: 106, y: 250 },
        { x: 106, y: 400 },
        { x: 200, y: 400 },
      ],
      ends: [0, 1],
    };
    const [straight] = routesOf(inputOf([jog]));
    expect(straight).toHaveLength(4);
    // A shape between the two runs, where either straightened run would go, keeps the jog.
    const shape = { x: 102, y: 200, width: 2, height: 120 };
    const [kept] = routesOf(inputOf([jog], [shape]));
    expect(kept).toHaveLength(6);
  });

  it('keeps every moved run clear of shapes by CLEAR where there is room', () => {
    const shape = { x: 130, y: 0, width: 50, height: 600 };
    const lines: TestLine[] = [0, 1, 2].map((at) => ({
      route: [
        { x: 0, y: 100 + at * 24 },
        { x: 112, y: 100 + at * 24 },
        { x: 112, y: 400 + at * 24 },
        { x: 0, y: 400 + at * 24 },
      ],
      ends: [at, 10 + at],
    }));
    for (const route of routesOf(inputOf(lines, [shape]))) {
      expect(middleOf(route)).toBeLessThanOrEqual(130 - CLEAR);
    }
  });
});

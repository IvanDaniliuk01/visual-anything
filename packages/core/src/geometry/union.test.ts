/**
 * The boundary of what fills cover together (ADR 0066, ADR 0067): it joins what overlaps, keeps the
 * curves of what crosses nothing, and stays within its caps on polygons built to make it slow, giving
 * up within a time bound rather than growing with the square of their edges.
 */
import { describe, expect, it } from 'vitest';
import { evenOddHolds } from './outline';
import { UNION_CAPS, fillBoundary, type FillPolygon } from './union';
import { cpuNow } from '../test/cpu';

function square(x: number, y: number, size: number, group = 0, nonzero = false): FillPolygon {
  return {
    points: Float64Array.from([x, y, x + size, y, x + size, y + size, x, y + size]),
    group,
    nonzero,
  };
}

function rectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  group: number,
): FillPolygon {
  return {
    points: Float64Array.from([x, y, x + width, y, x + width, y + height, x, y + height]),
    group,
    nonzero: false,
  };
}

/** Whether loops hold a point by the even-odd rule over all of them, as free geometry reads them. */
function loopsHold(loops: readonly Float64Array[], x: number, y: number): boolean {
  let inside = false;
  for (const loop of loops) if (evenOddHolds(loop, x, y)) inside = !inside;
  return inside;
}

/** How long a call takes, in milliseconds: the least of three runs, so a busy machine does not fail it. */
function timed<T>(run: () => T): { value: T; ms: number } {
  let ms = Number.POSITIVE_INFINITY;
  let value = run();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = cpuNow();
    value = run();
    ms = Math.min(ms, cpuNow() - start);
  }
  return { value, ms };
}

const BOUND_MS = 1000;

describe('fillBoundary', () => {
  it('joins fills that overlap into loops whose even-odd reading is what they cover', () => {
    const boundary = fillBoundary([square(0, 0, 60, 0), square(40, 40, 60, 1)]);
    expect(boundary?.crossing).toBe(true);
    if (!boundary?.crossing) return;
    expect(loopsHold(boundary.loops, 50, 50)).toBe(true);
    expect(loopsHold(boundary.loops, 10, 10)).toBe(true);
    expect(loopsHold(boundary.loops, 90, 90)).toBe(true);
    expect(loopsHold(boundary.loops, 90, 10)).toBe(false);
  });

  it('keeps whole polygons that cross nothing, once each, and leaves out what lies wholly inside', () => {
    const boundary = fillBoundary([
      square(0, 0, 100, 0),
      square(20, 20, 10, 1),
      square(200, 0, 10, 2),
      square(200, 0, 10, 3),
    ]);
    expect(boundary).toEqual({ crossing: false, bounding: [true, false, true, false] });
  });

  it('gives up at once on more edges than its cap, before building anything', () => {
    const many = Array.from({ length: UNION_CAPS.edges / 4 + 1 }, (_, at) =>
      square((at % 100) * 3, Math.floor(at / 100) * 3, 2, at),
    );
    const { value, ms } = timed(() => fillBoundary(many));
    expect(value).toBeUndefined();
    expect(ms).toBeLessThan(50);
  });

  it('keeps a long edge only in the cells it crosses, and gives up on edges crowded into one cell', () => {
    // A long thin triangle across the whole field, and thousands of tiny squares in one corner of it.
    const sliver: FillPolygon = {
      points: Float64Array.from([0, 0, 10_000, 10_000, 0, 10]),
      group: 0,
      nonzero: false,
    };
    const crowd = Array.from({ length: 3_500 }, (_, at) =>
      square(9_990 + (at % 60) * 0.1, 9_990 + Math.floor(at / 60) * 0.1, 0.05, at + 1),
    );
    const polygons = [sliver, ...crowd];
    expect(
      polygons.reduce((sum, polygon) => sum + polygon.points.length / 2, 0),
    ).toBeLessThanOrEqual(UNION_CAPS.edges);
    const { ms } = timed(() => fillBoundary(polygons));
    expect(ms).toBeLessThan(BOUND_MS);
  });

  it('gives up on more crossings than its cap, as a comb of strips laid across another does', () => {
    const across = Array.from({ length: 120 }, (_, at) => rectangle(0, at * 10, 1_200, 2, at));
    const down = Array.from({ length: 120 }, (_, at) => rectangle(at * 10, 0, 2, 1_200, 120 + at));
    const { value, ms } = timed(() => fillBoundary([...across, ...down]));
    expect(value).toBeUndefined();
    expect(ms).toBeLessThan(BOUND_MS);
  });

  it('stays within its budget on fills nested deep, where every ray meets every edge', () => {
    const nested = Array.from({ length: 2_000 }, (_, at) => square(at, at, 10_000 - 2 * at, at));
    const { ms } = timed(() => fillBoundary(nested));
    expect(ms).toBeLessThan(BOUND_MS);
  });
});

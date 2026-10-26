/** The strict reader of SVG path data (ADR 0066): what it reads, what it refuses, and how it counts. */
import { describe, expect, it } from 'vitest';
import { cubicAt } from './outline';
import { readPathData, readPolygonPoints, type Segment } from './path';

function read(d: string) {
  const result = readPathData(d);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const ends = (segments: readonly Segment[]) =>
  segments.map((segment) => [segment.to.x, segment.to.y]);

describe('readPathData', () => {
  it('reads moves, lines, horizontal and vertical lines and closes, absolute and relative', () => {
    const { subpaths, commands } = read('M10 10 L20 10 h5 v5 H10 V10 Z m5 5 l1 0 l0 1 z');
    expect(commands).toBe(11);
    expect(subpaths).toHaveLength(2);
    expect(subpaths[0]?.closed).toBe(true);
    expect(ends(subpaths[0]?.segments ?? [])).toEqual([
      [20, 10],
      [25, 10],
      [25, 15],
      [10, 15],
      [10, 10],
    ]);
    // The second move is from where the first subpath started, after its close.
    expect(subpaths[1]?.start).toEqual({ x: 15, y: 15 });
    expect(ends(subpaths[1]?.segments ?? [])).toEqual([
      [16, 15],
      [16, 16],
    ]);
  });

  it('reads the pairs after a move as lines, and counts each repeat as a command', () => {
    const { subpaths, commands } = read('M0 0 10 0 10 10');
    expect(commands).toBe(3);
    expect(ends(subpaths[0]?.segments ?? [])).toEqual([
      [10, 0],
      [10, 10],
    ]);
    expect(read('m1 1 2 2').subpaths[0]?.segments[0]?.to).toEqual({ x: 3, y: 3 });
  });

  it('reads numbers written tightly, with signs, decimals and exponents', () => {
    const { subpaths } = read('M1.5.5L2-3l1e1-1E-1');
    expect(subpaths[0]?.start).toEqual({ x: 1.5, y: 0.5 });
    expect(ends(subpaths[0]?.segments ?? [])).toEqual([
      [2, -3],
      [12, -3.1],
    ]);
  });

  it('raises quadratics to cubics that draw the same curve', () => {
    const { subpaths } = read('M0 0 Q50 100 100 0');
    const cubic = subpaths[0]?.segments[0];
    expect(cubic?.kind).toBe('cubic');
    if (cubic?.kind !== 'cubic') return;
    for (const t of [0.25, 0.5, 0.75]) {
      const point = cubicAt({ x: 0, y: 0 }, cubic.c1, cubic.c2, cubic.to, t);
      const u = 1 - t;
      expect(point.x).toBeCloseTo(2 * u * t * 50 + t * t * 100, 9);
      expect(point.y).toBeCloseTo(2 * u * t * 100, 9);
    }
  });

  it('mirrors the last control point for smooth curves, and only after a curve of their kind', () => {
    const smooth = read('M0 0 C0 10 10 10 10 0 S20 -10 20 0').subpaths[0]?.segments[1];
    expect(smooth?.kind === 'cubic' && smooth.c1).toEqual({ x: 10, y: -10 });
    const afterLine = read('M0 0 L10 0 S20 -10 20 0').subpaths[0]?.segments[1];
    expect(afterLine?.kind === 'cubic' && afterLine.c1).toEqual({ x: 10, y: 0 });
    const smoothQuadratic = read('M0 0 Q5 10 10 0 T20 0').subpaths[0]?.segments[1];
    // T reflects Q's control point (5, 10) through (10, 0): (15, -10), raised.
    expect(smoothQuadratic?.kind === 'cubic' && smoothQuadratic.c1.y).toBeCloseTo(-20 / 3, 9);
  });

  it('reads arcs, their flags written without separators, into at most a cubic a quarter turn', () => {
    const { subpaths } = read('M0 0a50 50 0 1050 0');
    const arc = subpaths[0]?.segments ?? [];
    expect(arc.length).toBeGreaterThan(0);
    expect(arc.length).toBeLessThanOrEqual(4);
    expect(arc.at(-1)?.to).toEqual({ x: 50, y: 0 });
    // Every piece ends on the circle of radius 50 the arc lies on (radii too small are scaled up).
    const semicircle = read('M0 0 A25 25 0 0 1 50 0').subpaths[0]?.segments ?? [];
    expect(semicircle).toHaveLength(2);
    let from = { x: 0, y: 0 };
    for (const piece of semicircle) {
      if (piece.kind !== 'cubic') throw new Error('An arc is cubics.');
      const middle = cubicAt(from, piece.c1, piece.c2, piece.to, 0.5);
      expect(Math.hypot(middle.x - 25, middle.y)).toBeCloseTo(25, 1);
      from = piece.to;
    }
    expect(read('M0 0 A0 5 0 0 1 10 0').subpaths[0]?.segments).toEqual([
      { kind: 'line', to: { x: 10, y: 0 } },
    ]);
    expect(read('M5 5 A5 5 0 0 1 5 5').subpaths[0]?.segments).toEqual([]);
  });

  it.each([
    ['', 'empty'],
    ['L0 0', 'must start with a move'],
    ['M0 0 L1', 'needs 2 numbers'],
    ['M0 0 Z 1 1', 'takes no numbers'],
    ['M0 0 Lx 1', 'needs 2 numbers'],
    ['M0,0,L1,1', 'a comma is followed by no number'],
    ['M0 0 L1e999 0', 'needs 2 numbers'],
    ['M0 0 A5 5 0 2 0 10 0', 'its flags each 0 or 1'],
    ['M0 0 L1 1 #', 'needs 2 numbers'],
    ['M 1 2 3', 'needs 2 numbers'],
  ])('refuses %j', (d, why) => {
    const result = readPathData(d);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(why);
  });

  it('stops at the cap on commands, implicit repeats included, before reading further', () => {
    expect(readPathData('M0 0 1 1 2 2 3 3', 3)).toEqual({ ok: false, reason: 'too many commands' });
    expect(readPathData('M0 0 1 1 2 2', 3).ok).toBe(true);
  });
});

describe('readPolygonPoints', () => {
  it('reads x,y pairs apart by spaces or commas', () => {
    expect(readPolygonPoints('0,0 10,0 10 10').ok && readPolygonPoints('0,0 10,0 10 10')).toEqual({
      ok: true,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });
  });

  it('refuses an odd number, and stops at its cap', () => {
    expect(readPolygonPoints('0,0 10').ok).toBe(false);
    expect(readPolygonPoints('0,0 1,1 2,2', 2)).toEqual({ ok: false, reason: 'too many points' });
  });
});

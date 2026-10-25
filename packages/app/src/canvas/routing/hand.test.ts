import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../geometry';
import {
  CURVE_STEP,
  STUB,
  attachPoint,
  facingPoint,
  flattenedSegments,
  nearestBorderAttach,
  routeByHand,
  sideFacing,
  type Attach,
  type HandEnd,
} from './hand';

const A: Rect = { x: 0, y: 0, width: 100, height: 60 };
const B: Rect = { x: 300, y: 0, width: 100, height: 60 };
const shape = (rect: Rect, attach?: Attach): HandEnd =>
  attach ? { kind: 'shape', rect, attach } : { kind: 'shape', rect };

/** Whether every segment of a route is horizontal or vertical. */
function orthogonal(route: readonly Point[]): boolean {
  return route.every((point, at) => {
    const next = route[at + 1];
    return !next || point.x === next.x || point.y === next.y;
  });
}

/** Whether a point lies on a route, within a small distance. */
function onRoute(route: readonly Point[], point: Point): boolean {
  for (let at = 1; at < route.length; at++) {
    const a = route[at - 1] as Point;
    const b = route[at] as Point;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const t =
      length === 0
        ? 0
        : ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length ** 2;
    const clamped = Math.min(1, Math.max(0, t));
    const x = a.x + (b.x - a.x) * clamped;
    const y = a.y + (b.y - a.y) * clamped;
    if (Math.hypot(point.x - x, point.y - y) < 1e-6) return true;
  }
  return false;
}

/** Whether a segment runs through the inside of a rectangle, not only along its border. */
function crossesInside(route: readonly Point[], rect: Rect): boolean {
  for (let at = 1; at < route.length; at++) {
    const a = route[at - 1] as Point;
    const b = route[at] as Point;
    for (let step = 1; step < 20; step++) {
      const x = a.x + ((b.x - a.x) * step) / 20;
      const y = a.y + ((b.y - a.y) * step) / 20;
      if (
        x > rect.x + 0.01 &&
        x < rect.x + rect.width - 0.01 &&
        y > rect.y + 0.01 &&
        y < rect.y + rect.height - 0.01
      ) {
        return true;
      }
    }
  }
  return false;
}

describe('attachPoint', () => {
  it('places a side and a place along it on the rectangle', () => {
    expect(attachPoint(A, { side: 'top', at: 0.25 })).toEqual({ x: 25, y: 0 });
    expect(attachPoint(A, { side: 'right', at: 0.5 })).toEqual({ x: 100, y: 30 });
    expect(attachPoint(A, { side: 'bottom', at: 1 })).toEqual({ x: 100, y: 60 });
    expect(attachPoint(A, { side: 'left', at: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('nearestBorderAttach', () => {
  it('finds the nearest side and the place along it, to three decimals', () => {
    expect(nearestBorderAttach(A, { x: 50, y: 2 })).toEqual({ side: 'top', at: 0.5 });
    expect(nearestBorderAttach(A, { x: 99, y: 20 })).toEqual({ side: 'right', at: 0.333 });
    expect(nearestBorderAttach(A, { x: 140, y: 80 })).toEqual({ side: 'right', at: 1 });
    expect(nearestBorderAttach(A, { x: -10, y: 45 })).toEqual({ side: 'left', at: 0.75 });
  });

  it('keeps to the sides it is given', () => {
    expect(nearestBorderAttach(A, { x: 50, y: 1 }, ['left', 'right'])).toEqual({
      side: 'left',
      at: 0.017,
    });
  });
});

describe('sideFacing', () => {
  it('is the side a ray from the middle towards the point leaves by', () => {
    expect(sideFacing(A, { x: 500, y: 30 })).toBe('right');
    expect(sideFacing(A, { x: -500, y: 30 })).toBe('left');
    expect(sideFacing(A, { x: 50, y: 400 })).toBe('bottom');
    expect(sideFacing(A, { x: 50, y: -400 })).toBe('top');
  });
});

describe('facingPoint', () => {
  const points = [
    { side: 'left', at: 0.5 },
    { side: 'right', at: 0.25 },
    { side: 'right', at: 0.75 },
    { side: 'bottom', at: 0.5 },
  ] as const;

  it('takes the point on the side facing the other end, nearest the line between them', () => {
    expect(facingPoint(A, points, { x: 500, y: 0 })).toEqual({ side: 'right', at: 0.25 });
    expect(facingPoint(A, points, { x: 500, y: 60 })).toEqual({ side: 'right', at: 0.75 });
    expect(facingPoint(A, points, { x: 50, y: 500 })).toEqual({ side: 'bottom', at: 0.5 });
  });

  it('takes the nearest point overall when no point is on that side', () => {
    expect(facingPoint(A, points, { x: 90, y: -400 })).toEqual({ side: 'right', at: 0.25 });
  });

  it('moves siblings along the side, 12 units apart, kept on the side', () => {
    expect(facingPoint(A, points, { x: 500, y: 0 }, 1)).toEqual({ side: 'right', at: 0.45 });
    expect(facingPoint(A, points, { x: 500, y: 60 }, 3)).toEqual({ side: 'right', at: 1 });
  });
});

describe('routeByHand, straight', () => {
  it('runs from each chosen point through every bend point', () => {
    const { route, curve } = routeByHand(
      shape(A, { side: 'right', at: 0.5 }),
      shape(B, { side: 'left', at: 0.5 }),
      [{ x: 200, y: 100 }],
      'straight',
    );
    expect(route).toEqual([
      { x: 100, y: 30 },
      { x: 200, y: 100 },
      { x: 300, y: 30 },
    ]);
    expect(curve).toBeUndefined();
  });

  it('attaches an automatic end where the line from its middle to its neighbour crosses its border', () => {
    const { route } = routeByHand(shape(A), shape(B), [{ x: 50, y: 200 }], 'straight');
    expect(route[0]).toEqual({ x: 50, y: 60 });
    expect(route.at(-1)?.x).toBeCloseTo(300);
    expect(onRoute(route, { x: 50, y: 200 })).toBe(true);
  });

  it('runs to the middle of another relation', () => {
    const { route } = routeByHand(
      shape(A),
      { kind: 'point', point: { x: 200, y: 200 } },
      [],
      'straight',
    );
    expect(route.at(-1)).toEqual({ x: 200, y: 200 });
  });
});

describe('routeByHand, orthogonal', () => {
  it('leaves a chosen end perpendicular to its side with a stub', () => {
    const { route } = routeByHand(
      shape(A, { side: 'top', at: 0.5 }),
      shape(B, { side: 'top', at: 0.5 }),
      [],
      'orthogonal',
    );
    expect(route[0]).toEqual({ x: 50, y: 0 });
    expect(route[1]).toEqual({ x: 50, y: -STUB });
    expect(route.at(-2)).toEqual({ x: 350, y: -STUB });
    expect(route.at(-1)).toEqual({ x: 350, y: 0 });
    expect(orthogonal(route)).toBe(true);
  });

  it('passes through every bend point, each a corner', () => {
    const bends = [
      { x: 150, y: 150 },
      { x: 250, y: -80 },
    ];
    const { route } = routeByHand(
      shape(A, { side: 'right', at: 0.5 }),
      shape(B, { side: 'left', at: 0.5 }),
      bends,
      'orthogonal',
    );
    expect(orthogonal(route)).toBe(true);
    for (const bend of bends) expect(route).toContainEqual(bend);
  });

  it('runs an automatic end straight at a neighbour within its side', () => {
    const { route } = routeByHand(
      shape(A),
      shape(B, { side: 'top', at: 0.5 }),
      [{ x: 200, y: 20 }],
      'orthogonal',
    );
    expect(route[0]).toEqual({ x: 100, y: 20 });
    expect(route[1]).toEqual({ x: 200, y: 20 });
    expect(orthogonal(route)).toBe(true);
  });

  it('leaves an automatic end from the middle of its side when the neighbour is beyond it', () => {
    const { route } = routeByHand(
      shape(A),
      shape(B, { side: 'left', at: 0.5 }),
      [{ x: 200, y: 300 }],
      'orthogonal',
    );
    expect(route[0]).toEqual({ x: 50, y: 60 });
    expect(orthogonal(route)).toBe(true);
  });

  it('goes round its own shape when the next point lies behind the side it leaves', () => {
    const { route } = routeByHand(
      shape(A, { side: 'right', at: 0.5 }),
      shape({ x: -300, y: 0, width: 100, height: 60 }, { side: 'right', at: 0.5 }),
      [],
      'orthogonal',
    );
    expect(route[1]).toEqual({ x: 100 + STUB, y: 30 });
    expect(orthogonal(route)).toBe(true);
    expect(crossesInside(route, A)).toBe(false);
  });

  it('never runs back over a stub, nor through its own shapes', () => {
    const ends: [HandEnd, HandEnd][] = [
      [shape(A, { side: 'bottom', at: 0.5 }), shape(B, { side: 'top', at: 0.5 })],
      [shape(A, { side: 'left', at: 0.5 }), shape(B, { side: 'right', at: 0.5 })],
      [shape(A, { side: 'top', at: 0.2 }), shape(B, { side: 'bottom', at: 0.8 })],
    ];
    for (const [from, to] of ends) {
      const { route } = routeByHand(from, to, [], 'orthogonal');
      expect(orthogonal(route)).toBe(true);
      expect(crossesInside(route, A)).toBe(false);
      expect(crossesInside(route, B)).toBe(false);
    }
  });

  it('drops zero-length segments and points in the middle of a straight run', () => {
    const { route } = routeByHand(
      shape(A, { side: 'right', at: 0.5 }),
      shape(B, { side: 'left', at: 0.5 }),
      [{ x: 200, y: 30 }],
      'orthogonal',
    );
    expect(route).toEqual([
      { x: 100, y: 30 },
      { x: 300, y: 30 },
    ]);
  });

  it('routes a row beside its table, out to its lane first', () => {
    const table: Rect = { x: 0, y: 0, width: 160, height: 200 };
    const { route } = routeByHand(
      { kind: 'side', container: table, y: 90, lane: 1, side: 'right' },
      shape(B, { side: 'left', at: 0.5 }),
      [],
      'orthogonal',
    );
    expect(route[0]).toEqual({ x: 160, y: 90 });
    // Straight out to the lane at least, before the first turn.
    expect(route[1]?.y).toBe(90);
    expect(route[1]?.x).toBeGreaterThanOrEqual(160 + 16 + 8);
    expect(orthogonal(route)).toBe(true);
    const behind = routeByHand(
      { kind: 'side', container: table, y: 90, lane: 1, side: 'right' },
      shape({ x: -300, y: 0, width: 100, height: 60 }, { side: 'left', at: 0.5 }),
      [],
      'orthogonal',
    ).route;
    expect(behind[1]).toEqual({ x: 160 + 16 + 8, y: 90 });
    expect(crossesInside(behind, table)).toBe(false);
  });
});

describe('routeByHand, curved', () => {
  it('is an S-curve between two sides, leaving and entering along their normals', () => {
    const { route, curve } = routeByHand(
      shape(A, { side: 'right', at: 0.5 }),
      shape(B, { side: 'left', at: 0.5 }),
      [],
      'curved',
    );
    expect(curve).toHaveLength(1);
    const [span] = curve ?? [];
    expect(span?.from).toEqual({ x: 100, y: 30 });
    expect(span?.to).toEqual({ x: 300, y: 30 });
    // Out of the right side, into the left side: both control points straight across.
    expect(span?.c1.y).toBeCloseTo(30);
    expect(span?.c1.x).toBeGreaterThan(100);
    expect(span?.c2.y).toBeCloseTo(30);
    expect(span?.c2.x).toBeLessThan(300);
    expect(route[0]).toEqual({ x: 100, y: 30 });
    expect(route.at(-1)).toEqual({ x: 300, y: 30 });
  });

  it('passes through each bend point, smoothly', () => {
    const bend = { x: 200, y: 150 };
    const { route, curve } = routeByHand(
      shape(A, { side: 'bottom', at: 0.5 }),
      shape(B, { side: 'bottom', at: 0.5 }),
      [bend],
      'curved',
    );
    expect(curve).toHaveLength(2);
    expect(route).toContainEqual(bend);
    const [first, second] = curve ?? [];
    // The tangent at the bend point runs from the previous point to the next one: here, across.
    expect(first?.c2.y).toBeCloseTo(150);
    expect(second?.c1.y).toBeCloseTo(150);
    // Out of the bottom side, downward; back into the other bottom side, upward.
    expect(first?.c1.x).toBeCloseTo(50);
    expect(first?.c1.y).toBeGreaterThan(60);
    expect(second?.c2.x).toBeCloseTo(350);
    expect(second?.c2.y).toBeGreaterThan(60);
  });

  it('flattens each span into a bounded number of segments', () => {
    expect(flattenedSegments(10)).toBe(4);
    expect(flattenedSegments(CURVE_STEP * 10)).toBe(10);
    expect(flattenedSegments(100_000)).toBe(24);
    const { route, curve } = routeByHand(
      shape(A, { side: 'right', at: 0.5 }),
      shape(B, { side: 'left', at: 0.5 }),
      [],
      'curved',
    );
    expect(curve).toHaveLength(1);
    expect(route).toHaveLength(flattenedSegments(200) + 1);
  });

  it('flattens within half a unit of the curve', () => {
    const { route, curve } = routeByHand(
      shape(A, { side: 'top', at: 0.1 }),
      shape(B, { side: 'left', at: 0.9 }),
      [{ x: 200, y: -100 }],
      'curved',
    );
    for (const span of curve ?? []) {
      for (let step = 0; step <= 50; step++) {
        const t = step / 50;
        const u = 1 - t;
        const point = {
          x:
            u ** 3 * span.from.x +
            3 * u * u * t * span.c1.x +
            3 * u * t * t * span.c2.x +
            t ** 3 * span.to.x,
          y:
            u ** 3 * span.from.y +
            3 * u * u * t * span.c1.y +
            3 * u * t * t * span.c2.y +
            t ** 3 * span.to.y,
        };
        let nearest = Infinity;
        for (let at = 1; at < route.length; at++) {
          const a = route[at - 1] as Point;
          const b = route[at] as Point;
          const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
          const s =
            length2 === 0
              ? 0
              : Math.min(
                  1,
                  Math.max(
                    0,
                    ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length2,
                  ),
                );
          nearest = Math.min(
            nearest,
            Math.hypot(point.x - (a.x + s * (b.x - a.x)), point.y - (a.y + s * (b.y - a.y))),
          );
        }
        expect(nearest).toBeLessThan(0.5);
      }
    }
  });

  it('runs along the chord at the middle of another relation', () => {
    const { curve } = routeByHand(
      { kind: 'point', point: { x: 0, y: 0 } },
      shape(B, { side: 'left', at: 0.5 }),
      [],
      'curved',
    );
    const [span] = curve ?? [];
    const chord = { x: 300, y: 30 };
    const length = Math.hypot(chord.x, chord.y);
    expect(span?.c1.x).toBeCloseTo((chord.x / length) * (length / 3));
    expect(span?.c1.y).toBeCloseTo((chord.y / length) * (length / 3));
  });
});

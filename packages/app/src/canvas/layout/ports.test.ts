import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { connectionPointsOf, pointOnBorder, pointToward } from './ports';
import type { LayoutConnectionPoint } from './types';

const size = { width: 200, height: 80 };

describe('connectionPointsOf', () => {
  it('reads the connection points a resolved appearance sets', () => {
    expect(
      connectionPointsOf({
        shape: 'rectangle',
        connectionPoints: [
          { name: 'in', side: 'left', at: 0.5 },
          { name: 'out', side: 'right', at: 0.25 },
        ],
      }),
    ).toEqual([
      { name: 'in', side: 'left', at: 0.5 },
      { name: 'out', side: 'right', at: 0.25 },
    ]);
  });

  it('gives none for an appearance without them, so that relations attach to the border', () => {
    expect(connectionPointsOf({ shape: 'rectangle', width: 160 })).toBeUndefined();
    expect(connectionPointsOf({ connectionPoints: [] })).toBeUndefined();
    expect(connectionPointsOf(undefined)).toBeUndefined();
  });

  it('leaves out what is not a connection point', () => {
    expect(
      connectionPointsOf({
        connectionPoints: [
          { name: 'a', side: 'middle', at: 0.5 },
          { name: 'b', side: 'top', at: 2 },
          { name: '', side: 'top', at: 0.5 },
          { name: 'c', side: 'bottom', at: Number.NaN },
          'd',
          { name: 'e', side: 'bottom', at: 1 },
        ],
      }),
    ).toEqual([{ name: 'e', side: 'bottom', at: 1 }]);
  });
});

describe('pointOnBorder', () => {
  it('puts each point on its side, from the left or top end', () => {
    expect(pointOnBorder({ name: 'l', side: 'left', at: 0.5 }, size)).toEqual({ x: 0, y: 40 });
    expect(pointOnBorder({ name: 'r', side: 'right', at: 0 }, size)).toEqual({ x: 200, y: 0 });
    expect(pointOnBorder({ name: 't', side: 'top', at: 0.25 }, size)).toEqual({ x: 50, y: 0 });
    expect(pointOnBorder({ name: 'b', side: 'bottom', at: 1 }, size)).toEqual({ x: 200, y: 80 });
  });
});

describe('pointToward', () => {
  const points: LayoutConnectionPoint[] = [
    { name: 'in', side: 'left', at: 0.5 },
    { name: 'up', side: 'top', at: 0.5 },
    { name: 'out', side: 'right', at: 0.5 },
  ];

  it('takes the point on the side the relation leaves by: east for its start, west for its end', () => {
    expect(pointToward(points, size, 'east')).toBe(2);
    expect(pointToward(points, size, 'west')).toBe(0);
  });

  it('takes the nearest point when none sits on that side', () => {
    const upAndDown: LayoutConnectionPoint[] = [
      { name: 'up', side: 'top', at: 0.1 },
      { name: 'down', side: 'bottom', at: 0.9 },
    ];
    expect(pointToward(upAndDown, size, 'east')).toBe(1);
    expect(pointToward(upAndDown, size, 'west')).toBe(0);
  });

  it('always names one of the points', () => {
    const point = fc.record({
      name: fc.string({ minLength: 1 }),
      side: fc.constantFrom('top', 'right', 'bottom', 'left' as const),
      at: fc.double({ min: 0, max: 1, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 8 }), fc.boolean(), (all, east) => {
        const at = pointToward(all, size, east ? 'east' : 'west');
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(all.length);
      }),
    );
  });
});

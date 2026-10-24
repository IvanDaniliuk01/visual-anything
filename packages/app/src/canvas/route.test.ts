import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from './geometry';
import {
  distanceToRoute,
  lengthOf,
  midpointOf,
  routeBetween,
  routeBetweenPoints,
  routeToPoint,
  type Route,
} from './route';

const box = (x: number, y: number, width = 100, height = 60): Rect => ({ x, y, width, height });

/** Whether every segment of a route is horizontal or vertical. */
function orthogonal(route: Route): boolean {
  return route.every((point, each) => {
    const previous = route[each - 1];
    return !previous || previous.x === point.x || previous.y === point.y;
  });
}

describe('routeBetween', () => {
  it('runs straight across when the shapes face each other', () => {
    expect(routeBetween(box(0, 0), box(300, 20))).toEqual([
      { x: 100, y: 40 },
      { x: 300, y: 40 },
    ]);
    expect(routeBetween(box(0, 0), box(10, 200))).toEqual([
      { x: 55, y: 60 },
      { x: 55, y: 200 },
    ]);
  });

  it('turns twice, halfway, when the shapes do not face each other', () => {
    expect(routeBetween(box(0, 0), box(300, 200))).toEqual([
      { x: 100, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 230 },
      { x: 300, y: 230 },
    ]);
  });

  it('leaves from the side facing the other shape, in every direction', () => {
    expect(routeBetween(box(300, 0), box(0, 0))[0]).toEqual({ x: 300, y: 30 });
    expect(routeBetween(box(0, 300), box(0, 0))[0]).toEqual({ x: 50, y: 300 });
  });

  it('spreads relations between the same shapes side by side', () => {
    const one = routeBetween(box(0, 0), box(300, 0), -12);
    const other = routeBetween(box(0, 0), box(300, 0), 12);
    expect(one[0]?.y).toBe(18);
    expect(other[0]?.y).toBe(42);
  });

  it('always routes along the axes, from the border of one shape to the border of the other', () => {
    const rect = fc.record({
      x: fc.integer({ min: -1000, max: 1000 }),
      y: fc.integer({ min: -1000, max: 1000 }),
      width: fc.integer({ min: 20, max: 300 }),
      height: fc.integer({ min: 20, max: 300 }),
    });
    fc.assert(
      fc.property(rect, rect, fc.integer({ min: -20, max: 20 }), (from, to, offset) => {
        const route = routeBetween(from, to, offset);
        const separate =
          to.x > from.x + from.width ||
          from.x > to.x + to.width ||
          to.y > from.y + from.height ||
          from.y > to.y + to.height;
        if (!separate) return;
        expect(orthogonal(route)).toBe(true);
        expect(onBorder(route[0] as Point, from)).toBe(true);
        expect(onBorder(route.at(-1) as Point, to)).toBe(true);
      }),
    );
  });
});

function onBorder(point: Point, rect: Rect): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const withinX = point.x >= rect.x - 1e-9 && point.x <= rect.x + rect.width + 1e-9;
  const withinY = point.y >= rect.y - 1e-9 && point.y <= rect.y + rect.height + 1e-9;
  return (
    ((close(point.x, rect.x) || close(point.x, rect.x + rect.width)) && withinY) ||
    ((close(point.y, rect.y) || close(point.y, rect.y + rect.height)) && withinX)
  );
}

describe('routes to and between points', () => {
  it('turns once into the point', () => {
    expect(routeToPoint(box(0, 0), { x: 300, y: 200 })).toEqual([
      { x: 100, y: 30 },
      { x: 300, y: 30 },
      { x: 300, y: 200 },
    ]);
    expect(routeBetweenPoints({ x: 0, y: 0 }, { x: 10, y: 50 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 10, y: 50 },
    ]);
  });
});

describe('measuring routes', () => {
  const route: Route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('finds the length, the midpoint and the distance to a point', () => {
    expect(lengthOf(route)).toBe(200);
    expect(midpointOf(route)).toEqual({ x: 100, y: 0 });
    expect(distanceToRoute({ x: 50, y: 10 }, route)).toBe(10);
    expect(distanceToRoute({ x: 110, y: 50 }, route)).toBe(10);
  });
});

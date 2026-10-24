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

  it('leaves an element inside its container by the element’s nearest side, along an axis', () => {
    const container = box(0, 0, 600, 400);
    // 40 from the left side, 100 from the top, 360 from the right and 240 from the bottom.
    const inside = box(40, 100, 200, 60);
    expect(routeBetween(inside, container)).toEqual([
      { x: 40, y: 130 },
      { x: 0, y: 130 },
    ]);
    expect(routeBetween(container, inside)).toEqual([
      { x: 0, y: 130 },
      { x: 40, y: 130 },
    ]);
    // Nearest the bottom: the route goes down.
    expect(routeBetween(box(200, 320, 100, 60), container)).toEqual([
      { x: 250, y: 380 },
      { x: 250, y: 400 },
    ]);
  });

  it('routes between siblings that overlap along an axis, out of the side that leaves the other', () => {
    const route = routeBetween(box(0, 0, 100, 60), box(50, 30, 100, 60));
    expect(orthogonal(route)).toBe(true);
    expect(route).toEqual([
      { x: 75, y: 60 },
      { x: 75, y: 90 },
    ]);
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
        expect(orthogonal(route)).toBe(true);
        expect(onBorder(route[0] as Point, from)).toBe(true);
        expect(onBorder(route.at(-1) as Point, to)).toBe(true);
      }),
    );
  });

  it('never runs through a shape that lies inside the other, nor diagonally', () => {
    const rect = fc.record({
      x: fc.integer({ min: 0, max: 400 }),
      y: fc.integer({ min: 0, max: 400 }),
      width: fc.integer({ min: 20, max: 200 }),
      height: fc.integer({ min: 20, max: 200 }),
    });
    const container = box(-100, -100, 800, 800);
    fc.assert(
      fc.property(rect, fc.boolean(), fc.integer({ min: -20, max: 20 }), (inner, out, offset) => {
        const route = out
          ? routeBetween(inner, container, offset)
          : routeBetween(container, inner, offset);
        expect(route).toHaveLength(2);
        expect(orthogonal(route)).toBe(true);
        const [a, b] = route as [Point, Point];
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const strictlyInside =
          middle.x > inner.x &&
          middle.x < inner.x + inner.width &&
          middle.y > inner.y &&
          middle.y < inner.y + inner.height;
        expect(strictlyInside).toBe(false);
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

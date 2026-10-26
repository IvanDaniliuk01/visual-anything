import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../geometry';
import { routeBetween } from '../route';
import {
  CLEARANCE,
  MAX_OBSTACLES,
  PLATE_HEIGHT,
  avoidRoutes,
  routeAround,
  segmentCrosses,
  type AvoidLine,
  type AvoidShapes,
} from './avoid';

/** Shapes as the avoider reads them: rectangles, the index of each one's container, name plates. */
function shapesOf(list: { rect: Rect; parent?: number; plate?: number }[]): AvoidShapes {
  return {
    rects: Float64Array.from(list.flatMap(({ rect }) => [rect.x, rect.y, rect.width, rect.height])),
    parents: Int32Array.from(list.map(({ parent }) => parent ?? -1)),
    plates: Float64Array.from(list.map(({ plate }) => plate ?? 0)),
  };
}

function lineOf(shapes: AvoidShapes, from: number, to: number, offset = 0): AvoidLine {
  const rect = (at: number): Rect => ({
    x: shapes.rects[at * 4] as number,
    y: shapes.rects[at * 4 + 1] as number,
    width: shapes.rects[at * 4 + 2] as number,
    height: shapes.rects[at * 4 + 3] as number,
  });
  const route = routeBetween(rect(from), rect(to), offset);
  return { from, to, offset, route: Float64Array.from(route.flatMap(({ x, y }) => [x, y])) };
}

function pointsOf(route: Float64Array | undefined): Point[] {
  const points: Point[] = [];
  for (let at = 0; route && at + 1 < route.length; at += 2) {
    points.push({ x: route[at] as number, y: route[at + 1] as number });
  }
  return points;
}

function crossesAny(route: Point[], rects: Rect[]): boolean {
  for (let each = 1; each < route.length; each++) {
    const p = route[each - 1] as Point;
    const q = route[each] as Point;
    if (rects.some((rect) => segmentCrosses(p, q, rect))) return true;
  }
  return false;
}

function orthogonal(route: Point[]): boolean {
  return route.every(
    (point, at) =>
      at === 0 || point.x === (route[at - 1] as Point).x || point.y === (route[at - 1] as Point).y,
  );
}

function onBorder(point: Point, rect: Rect): boolean {
  const onX = point.x === rect.x || point.x === rect.x + rect.width;
  const onY = point.y === rect.y || point.y === rect.y + rect.height;
  const withinX = point.x >= rect.x && point.x <= rect.x + rect.width;
  const withinY = point.y >= rect.y && point.y <= rect.y + rect.height;
  return (onX && withinY) || (onY && withinX);
}

describe('avoidRoutes', () => {
  const a = { x: 0, y: 0, width: 120, height: 60 };
  const middle = { x: 260, y: -20, width: 120, height: 100 };
  const b = { x: 520, y: 0, width: 120, height: 60 };

  it('keeps a stand-in route that crosses nothing', () => {
    const shapes = shapesOf([{ rect: a }, { rect: b }]);
    const [result] = avoidRoutes(shapes, [lineOf(shapes, 0, 1)]);
    expect(result?.route).toBeUndefined();
  });

  it('goes around a shape between its ends, a clearance away, from border to border', () => {
    const shapes = shapesOf([{ rect: a }, { rect: middle }, { rect: b }]);
    const [result] = avoidRoutes(shapes, [lineOf(shapes, 0, 2)]);
    const route = pointsOf(result?.route);
    expect(route.length).toBeGreaterThan(2);
    expect(orthogonal(route)).toBe(true);
    const grown = {
      x: middle.x - CLEARANCE + 1,
      y: middle.y - CLEARANCE + 1,
      width: middle.width + 2 * CLEARANCE - 2,
      height: middle.height + 2 * CLEARANCE - 2,
    };
    expect(crossesAny(route, [grown])).toBe(false);
    expect(onBorder(route[0] as Point, a)).toBe(true);
    expect(onBorder(route.at(-1) as Point, b)).toBe(true);
    // Its region holds what it went around.
    expect(result?.region.x).toBeLessThanOrEqual(middle.x);
  });

  it('does not count its ends, the containers holding them, or what they hold', () => {
    const container = { x: -100, y: -100, width: 900, height: 300 };
    const inA = { x: 10, y: 10, width: 40, height: 30 };
    const shapes = shapesOf([
      { rect: container },
      { rect: a, parent: 0 },
      { rect: inA, parent: 1 },
      { rect: b, parent: 0 },
    ]);
    const [result] = avoidRoutes(shapes, [lineOf(shapes, 1, 3)]);
    expect(result?.route).toBeUndefined();
  });

  it('goes around the name plate of a container it leaves, rather than through its name', () => {
    const container = { x: 0, y: 0, width: 800, height: 400 };
    // A shape inside it, low down, and one above it, outside: the stand-in runs up through the plate.
    const inside = { x: 40, y: 300, width: 120, height: 60 };
    const above = { x: 40, y: -200, width: 120, height: 60 };
    const shapes = shapesOf([
      { rect: container, plate: 300 },
      { rect: inside, parent: 0 },
      { rect: above },
    ]);
    const line = lineOf(shapes, 1, 2);
    const plate = { x: 0, y: 0, width: 300, height: PLATE_HEIGHT };
    expect(crossesAny(pointsOf(line.route), [plate])).toBe(true);
    const [result] = avoidRoutes(shapes, [line]);
    const route = pointsOf(result?.route);
    expect(route.length).toBeGreaterThan(2);
    expect(crossesAny(route, [plate])).toBe(false);
    expect(onBorder(route[0] as Point, inside)).toBe(true);
    expect(onBorder(route.at(-1) as Point, above)).toBe(true);
  });

  it('stays inside the container that holds both its ends', () => {
    const container = { x: 0, y: 0, width: 640, height: 260 };
    const one = { x: 24, y: 120, width: 120, height: 60 };
    const between = { x: 260, y: 60, width: 120, height: 180 };
    const two = { x: 500, y: 120, width: 120, height: 60 };
    const shapes = shapesOf([
      { rect: container, plate: 200 },
      { rect: one, parent: 0 },
      { rect: between, parent: 0 },
      { rect: two, parent: 0 },
    ]);
    const [result] = avoidRoutes(shapes, [lineOf(shapes, 1, 3)]);
    const route = pointsOf(result?.route);
    expect(route.length).toBeGreaterThan(2);
    for (const point of route) {
      expect(point.x).toBeGreaterThanOrEqual(container.x);
      expect(point.y).toBeGreaterThanOrEqual(container.y);
      expect(point.x).toBeLessThanOrEqual(container.x + container.width);
      expect(point.y).toBeLessThanOrEqual(container.y + container.height);
    }
    expect(crossesAny(route, [between, { x: 0, y: 0, width: 200, height: PLATE_HEIGHT }])).toBe(
      false,
    );
  });

  it('keeps its stand-in route when a container and what it holds are its ends', () => {
    const container = { x: 0, y: 0, width: 800, height: 400 };
    const shapes = shapesOf([
      { rect: container },
      { rect: middle, parent: 0 },
      { rect: { x: 600, y: 300, width: 100, height: 50 }, parent: 0 },
    ]);
    const [result] = avoidRoutes(shapes, [lineOf(shapes, 0, 2)]);
    expect(result?.route).toBeUndefined();
  });

  it('keeps its stand-in route with more shapes around it than it goes around', () => {
    const crowd = Array.from({ length: MAX_OBSTACLES + 5 }, (_, at) => ({
      rect: { x: 140 + (at % 13) * 28, y: -200 + Math.floor(at / 13) * 90, width: 20, height: 60 },
    }));
    const shapes = shapesOf([{ rect: a }, ...crowd, { rect: b }]);
    const [result] = avoidRoutes(shapes, [lineOf(shapes, 0, crowd.length + 1)]);
    expect(result?.route).toBeUndefined();
  });

  it('runs siblings in lanes of their own', () => {
    const shapes = shapesOf([{ rect: a }, { rect: middle }, { rect: b }]);
    const [one, two] = avoidRoutes(shapes, [lineOf(shapes, 0, 2, -12), lineOf(shapes, 0, 2, 12)]);
    expect(pointsOf(one?.route)).not.toEqual(pointsOf(two?.route));
  });

  it('never runs through a shape in its way, wherever the shapes are', () => {
    const box = fc.record({
      x: fc.integer({ min: -600, max: 600 }),
      y: fc.integer({ min: -600, max: 600 }),
      width: fc.integer({ min: 20, max: 200 }),
      height: fc.integer({ min: 20, max: 160 }),
    });
    fc.assert(
      fc.property(box, box, fc.array(box, { maxLength: 8 }), (from, to, others) => {
        const all = [from, to, ...others];
        // Shapes side by side, as layout places them: none overlaps another.
        const overlapping = all.some((rect, at) =>
          all.some(
            (other, at2) =>
              at2 > at &&
              rect.x < other.x + other.width + 2 * CLEARANCE &&
              other.x < rect.x + rect.width + 2 * CLEARANCE &&
              rect.y < other.y + other.height + 2 * CLEARANCE &&
              other.y < rect.y + rect.height + 2 * CLEARANCE,
          ),
        );
        fc.pre(!overlapping);
        const shapes = shapesOf(all.map((rect) => ({ rect })));
        const [result] = avoidRoutes(shapes, [lineOf(shapes, 0, 1)]);
        if (!result?.route) return;
        const route = pointsOf(result.route);
        expect(orthogonal(route)).toBe(true);
        expect(crossesAny(route, others)).toBe(false);
        expect(onBorder(route[0] as Point, from)).toBe(true);
        expect(onBorder(route.at(-1) as Point, to)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe('routeAround', () => {
  it('finds no route when what is in the way closes the region', () => {
    const a = { x: 0, y: 0, width: 60, height: 40 };
    const b = { x: 300, y: 0, width: 60, height: 40 };
    const wall = { x: 120, y: -1000, width: 60, height: 2000 };
    const region = { x: -50, y: -100, width: 460, height: 240 };
    expect(routeAround(a, b, 0, [wall], region)).toBeUndefined();
  });
});

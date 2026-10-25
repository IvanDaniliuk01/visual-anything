import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { centerOf, type Point, type Rect } from './geometry';
import type { Route } from './route';
import {
  overlapHorizontally,
  routeWithSides,
  sideStart,
  sideToward,
  type SideEnd,
} from './rowRoutes';
import { ROWS_FOOT, ROWS_HEADER, ROW_HEIGHT, laneX, rowMiddle } from './rows';

/** The stand-in row's gap between shapes, which no stub may cross into a third shape. */
const STAND_IN_GAP = 40;

function orthogonal(route: Route): boolean {
  return route.every((point, at) => {
    const before = route[at - 1];
    return !before || before.x === point.x || before.y === point.y;
  });
}

/** Whether a segment runs through the inside of a rectangle, not just along its border. */
function crossesInside(a: Point, b: Point, rect: Rect): boolean {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  if (a.y === b.y) {
    const low = Math.min(a.x, b.x);
    const high = Math.max(a.x, b.x);
    return a.y > rect.y && a.y < bottom && Math.min(high, right) - Math.max(low, rect.x) > 1e-9;
  }
  const low = Math.min(a.y, b.y);
  const high = Math.max(a.y, b.y);
  return a.x > rect.x && a.x < right && Math.min(high, bottom) - Math.max(low, rect.y) > 1e-9;
}

function segments(route: Route): [Point, Point][] {
  return route.slice(1).map((point, at) => [route[at] as Point, point]);
}

function onBorder(point: Point, rect: Rect): boolean {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const inX = point.x >= rect.x - 1e-9 && point.x <= right + 1e-9;
  const inY = point.y >= rect.y - 1e-9 && point.y <= bottom + 1e-9;
  return (
    inX &&
    inY &&
    [point.x - rect.x, point.x - right, point.y - rect.y, point.y - bottom].some(
      (gap) => Math.abs(gap) < 1e-9,
    )
  );
}

function distinctPoints(route: Route): boolean {
  const seen = new Set(route.map((point) => `${point.x} ${point.y}`));
  return seen.size === route.length;
}

const table = (x: number, y: number, rows: number, width = 240): Rect => ({
  x,
  y,
  width,
  height: ROWS_HEADER + rows * ROW_HEIGHT + ROWS_FOOT,
});

function sideEnd(container: Rect, row: number, lane: number, toward: Point): SideEnd {
  return {
    kind: 'side',
    container,
    y: rowMiddle(container, row),
    lane,
    side: sideToward(container, toward),
  };
}

/** A table with some rows somewhere around the origin. */
const tableArbitrary = fc
  .record({
    x: fc.integer({ min: -2000, max: 2000 }),
    y: fc.integer({ min: -2000, max: 2000 }),
    rows: fc.integer({ min: 1, max: 30 }),
    width: fc.integer({ min: 120, max: 400 }),
  })
  .map(({ x, y, rows, width }) => ({ rect: table(x, y, rows, width), rows }));

/** Whether two shapes stand at least the stand-in gap apart. */
function apart(a: Rect, b: Rect): boolean {
  return (
    a.x + a.width + STAND_IN_GAP <= b.x ||
    b.x + b.width + STAND_IN_GAP <= a.x ||
    a.y + a.height + STAND_IN_GAP <= b.y ||
    b.y + b.height + STAND_IN_GAP <= a.y
  );
}

describe('routeWithSides between two rows', () => {
  it('joins two rows of one table in a C, at the lane further out', () => {
    const users = table(0, 0, 10);
    const from: SideEnd = {
      kind: 'side',
      container: users,
      y: rowMiddle(users, 1),
      lane: 0,
      side: 'right',
    };
    const to: SideEnd = {
      kind: 'side',
      container: users,
      y: rowMiddle(users, 5),
      lane: 2,
      side: 'right',
    };
    const route = routeWithSides(from, to);
    const x = laneX(users, 'right', 2);
    expect(route).toEqual([
      { x: 240, y: rowMiddle(users, 1) },
      { x, y: rowMiddle(users, 1) },
      { x, y: rowMiddle(users, 5) },
      { x: 240, y: rowMiddle(users, 5) },
    ]);
  });

  it('joins rows of stacked tables in a C on the right', () => {
    const above = table(0, 0, 4);
    const below = table(20, 400, 4, 300);
    const from = { ...sideEnd(above, 0, 1, centerOf(below)), side: 'right' as const };
    const to = { ...sideEnd(below, 2, 0, centerOf(above)), side: 'right' as const };
    expect(overlapHorizontally(above, below)).toBe(true);
    const route = routeWithSides(from, to);
    const x = Math.max(laneX(above, 'right', 1), laneX(below, 'right', 0));
    expect(route[1]?.x).toBe(x);
    expect(route[2]?.x).toBe(x);
  });

  it('joins facing rows in a Z through the middle of the gap', () => {
    const left = table(0, 0, 4);
    const right = table(400, 100, 4);
    const route = routeWithSides(
      sideEnd(left, 1, 0, centerOf(right)),
      sideEnd(right, 2, 0, centerOf(left)),
    );
    expect(route).toEqual([
      { x: 240, y: rowMiddle(left, 1) },
      { x: 320, y: rowMiddle(left, 1) },
      { x: 320, y: rowMiddle(right, 2) },
      { x: 400, y: rowMiddle(right, 2) },
    ]);
  });

  it('gives relations between the same two rows segments of their own', () => {
    const left = table(0, 0, 4);
    const right = table(400, 100, 4);
    const from = sideEnd(left, 1, 0, centerOf(right));
    const to = sideEnd(right, 2, 0, centerOf(left));
    const one = routeWithSides(from, to, -12);
    const two = routeWithSides(from, to, 12);
    expect(one[1]?.x).not.toBe(two[1]?.x);
  });

  it('leaves and enters each row beside it, orthogonally, crossing neither table', () => {
    fc.assert(
      fc.property(
        tableArbitrary,
        tableArbitrary,
        fc.nat(40),
        fc.nat(40),
        fc.nat(8),
        fc.nat(8),
        fc.integer({ min: -2, max: 2 }),
        (a, b, rowA, rowB, laneA, laneB, sibling) => {
          fc.pre(apart(a.rect, b.rect));
          const bothRight = overlapHorizontally(a.rect, b.rect);
          const from = sideEnd(a.rect, rowA % a.rows, laneA, centerOf(b.rect));
          const to = sideEnd(b.rect, rowB % b.rows, laneB, centerOf(a.rect));
          if (bothRight) {
            from.side = 'right';
            to.side = 'right';
          }
          const route = routeWithSides(from, to, sibling * 24);
          expect(orthogonal(route)).toBe(true);
          expect(route[0]).toEqual(sideStart(from));
          expect(route.at(-1)).toEqual(sideStart(to));
          expect(distinctPoints(route)).toBe(true);
          for (const [p, q] of segments(route)) {
            expect(crossesInside(p, q, a.rect)).toBe(false);
            expect(crossesInside(p, q, b.rect)).toBe(false);
          }
        },
      ),
    );
  });

  it('goes around both tables when the sides chosen face away from each other', () => {
    fc.assert(
      fc.property(
        tableArbitrary,
        tableArbitrary,
        fc.nat(40),
        fc.nat(40),
        fc.nat(8),
        fc.nat(8),
        fc.constantFrom('left' as const, 'right' as const),
        fc.constantFrom('left' as const, 'right' as const),
        (a, b, rowA, rowB, laneA, laneB, sideA, sideB) => {
          fc.pre(apart(a.rect, b.rect));
          const from = { ...sideEnd(a.rect, rowA % a.rows, laneA, centerOf(b.rect)), side: sideA };
          const to = { ...sideEnd(b.rect, rowB % b.rows, laneB, centerOf(a.rect)), side: sideB };
          const route = routeWithSides(from, to);
          expect(orthogonal(route)).toBe(true);
          expect(route[0]).toEqual(sideStart(from));
          expect(route.at(-1)).toEqual(sideStart(to));
          expect(distinctPoints(route)).toBe(true);
        },
      ),
    );
  });

  it('keeps the stubs of two rows of one table off the table', () => {
    fc.assert(
      fc.property(
        tableArbitrary,
        fc.nat(40),
        fc.nat(40),
        fc.nat(8),
        fc.nat(8),
        (a, one, two, laneA, laneB) => {
          fc.pre(one % a.rows !== two % a.rows);
          const toward = { x: a.rect.x + a.rect.width, y: 0 };
          const from = sideEnd(a.rect, one % a.rows, laneA, toward);
          const to = sideEnd(a.rect, two % a.rows, laneB, toward);
          const route = routeWithSides(from, to);
          expect(orthogonal(route)).toBe(true);
          expect(distinctPoints(route)).toBe(true);
          for (const [p, q] of segments(route)) expect(crossesInside(p, q, a.rect)).toBe(false);
        },
      ),
    );
  });
});

describe('routeWithSides between a row and a shape', () => {
  const shapeArbitrary = fc
    .record({
      x: fc.integer({ min: -2000, max: 2000 }),
      y: fc.integer({ min: -2000, max: 2000 }),
      width: fc.integer({ min: 40, max: 400 }),
      height: fc.integer({ min: 40, max: 300 }),
    })
    .map((rect): Rect => rect);

  it('enters a shape beside the table straight across when it faces the row', () => {
    const users = table(0, 0, 4);
    const service = { x: 400, y: 0, width: 160, height: 160 };
    const from = sideEnd(users, 1, 3, centerOf(service));
    expect(routeWithSides(from, { rect: service })).toEqual([
      { x: 240, y: rowMiddle(users, 1) },
      { x: 400, y: rowMiddle(users, 1) },
    ]);
  });

  it('turns vertical first toward a shape above or below the table', () => {
    const users = table(0, 0, 4);
    const service = { x: 100, y: 400, width: 300, height: 80 };
    const from = sideEnd(users, 1, 0, centerOf(service));
    const route = routeWithSides(from, { rect: service });
    expect(route[1]).toEqual({ x: laneX(users, 'right', 0), y: rowMiddle(users, 1) });
    expect(route[2]).toEqual({ x: laneX(users, 'right', 0), y: 400 });
  });

  it('runs from the row, orthogonally, to the shape’s border, crossing neither', () => {
    fc.assert(
      fc.property(
        tableArbitrary,
        shapeArbitrary,
        fc.nat(40),
        fc.nat(8),
        fc.integer({ min: -2, max: 2 }),
        fc.boolean(),
        (a, shape, row, lane, sibling, reversed) => {
          fc.pre(apart(a.rect, shape));
          const side = sideEnd(a.rect, row % a.rows, lane, centerOf(shape));
          const route = reversed
            ? routeWithSides({ rect: shape }, side, sibling * 24)
            : routeWithSides(side, { rect: shape }, sibling * 24);
          const [start, end] = reversed ? [route.at(-1), route[0]] : [route[0], route.at(-1)];
          expect(orthogonal(route)).toBe(true);
          expect(start).toEqual(sideStart(side));
          expect(onBorder(end as Point, shape)).toBe(true);
          expect(distinctPoints(route)).toBe(true);
          for (const [p, q] of segments(route)) {
            expect(crossesInside(p, q, a.rect)).toBe(false);
            expect(crossesInside(p, q, shape)).toBe(false);
          }
        },
      ),
    );
  });
});

describe('routeWithSides toward a point', () => {
  it('turns once into a point beyond the lane', () => {
    const users = table(0, 0, 4);
    const point = { x: 500, y: 300 };
    const route = routeWithSides(sideEnd(users, 0, 0, point), { point });
    expect(route).toEqual([
      { x: 240, y: rowMiddle(users, 0) },
      { x: 500, y: rowMiddle(users, 0) },
      point,
    ]);
  });

  it('is orthogonal and starts beside the row', () => {
    fc.assert(
      fc.property(
        tableArbitrary,
        fc.integer({ min: -3000, max: 3000 }),
        fc.integer({ min: -3000, max: 3000 }),
        fc.nat(40),
        (a, x, y, row) => {
          const point = { x, y };
          const side = sideEnd(a.rect, row % a.rows, 0, point);
          const route = routeWithSides(side, { point });
          expect(orthogonal(route)).toBe(true);
          expect(route[0]).toEqual(sideStart(side));
          expect(route.at(-1)).toEqual(point);
        },
      ),
    );
  });
});

describe('routeWithSides without side ends', () => {
  it('routes as routeBetweenEnds does', () => {
    const route = routeWithSides(
      { rect: { x: 0, y: 0, width: 100, height: 60 } },
      { rect: { x: 300, y: 20, width: 100, height: 60 } },
    );
    expect(route).toEqual([
      { x: 100, y: 40 },
      { x: 300, y: 40 },
    ]);
  });
});

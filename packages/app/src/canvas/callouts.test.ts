import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CALLOUT_GAP,
  CALLOUT_SPACING,
  calloutRoute,
  calloutSideOf,
  placeCallouts,
  type CalloutToPlace,
} from './callouts';
import type { Rect } from './geometry';

const square = { width: 320, height: 320 };

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('calloutSideOf', () => {
  it('sends a point to the side the ray from the middle through it leaves by', () => {
    expect(calloutSideOf(square, { x: 10, y: 160 })).toEqual({ side: 'left', along: 160 });
    expect(calloutSideOf(square, { x: 300, y: 160 }).side).toBe('right');
    expect(calloutSideOf(square, { x: 160, y: 10 })).toEqual({ side: 'top', along: 160 });
    expect(calloutSideOf(square, { x: 160, y: 300 }).side).toBe('bottom');
  });

  it('says where along the side the ray leaves', () => {
    // From (160, 160) through (80, 120): leaves the left side at y = 160 - 40 * 2 = 80.
    expect(calloutSideOf(square, { x: 80, y: 120 })).toEqual({ side: 'left', along: 80 });
  });

  it('sends the middle itself right', () => {
    expect(calloutSideOf(square, { x: 160, y: 160 }).side).toBe('right');
  });
});

describe('placeCallouts', () => {
  it('puts a callout just outside the picture, centered where its ray leaves', () => {
    const [placed] = placeCallouts(square, [{ width: 160, height: 56, point: { x: 40, y: 160 } }]);
    expect(placed).toEqual({ side: 'left', x: -CALLOUT_GAP - 160, y: 160 - 28 });
  });

  it('keeps the parts order along a side and spaces the callouts apart', () => {
    const callouts: CalloutToPlace[] = [
      { width: 120, height: 56, point: { x: 300, y: 170 } },
      { width: 120, height: 56, point: { x: 300, y: 150 } },
      { width: 120, height: 56, point: { x: 300, y: 160 } },
    ];
    const placed = placeCallouts(square, callouts);
    expect(placed.every((each) => each.side === 'right')).toBe(true);
    const ys = placed.map((each) => each.y);
    // Second (150) above the third (160) above the first (170).
    expect(ys[1]).toBeLessThan(ys[2] as number);
    expect(ys[2]).toBeLessThan(ys[0] as number);
    expect((ys[2] as number) - (ys[1] as number)).toBeGreaterThanOrEqual(56 + CALLOUT_SPACING);
  });

  it('stays within the picture span while the callouts fit, and runs past both ends otherwise', () => {
    const near = (y: number) => ({ width: 100, height: 56, point: { x: 310, y } });
    const fit = placeCallouts(square, [near(250), near(260), near(270)]);
    for (const each of fit) {
      expect(each.y).toBeGreaterThanOrEqual(0);
      expect(each.y + 56).toBeLessThanOrEqual(320);
    }
    // A tall picture's side holds two; its narrow top and bottom take none of these wide ones.
    const tall = { width: 40, height: 200 };
    const crowd = (y: number) => ({ width: 300, height: 56, point: { x: 39, y } });
    const many = placeCallouts(tall, [crowd(100), crowd(101), crowd(102), crowd(103)]);
    expect(many.every((each) => each.side === 'right')).toBe(true);
    const ys = many.map((each) => each.y).sort((a, b) => a - b);
    expect(ys[0]).toBeLessThan(0);
    expect((ys.at(-1) as number) + 56).toBeGreaterThan(200);
    expect(-(ys[0] as number)).toBeCloseTo((ys.at(-1) as number) + 56 - 200, 6);
  });

  it('spreads a crowded side onto the sides beside it, nearest their corners first', () => {
    const near = (y: number) => ({ width: 100, height: 56, point: { x: 310, y } });
    const placed = placeCallouts(
      square,
      Array.from({ length: 8 }, (_, at) => near(20 + at * 40)),
    );
    const sides = placed.map((each) => each.side);
    expect(sides.filter((side) => side === 'right').length).toBeLessThan(8);
    // The first, highest, moves to the top; the last, lowest, to the bottom.
    expect(sides[0]).toBe('top');
    expect(sides[7]).toBe('bottom');
  });

  it('places none over another, nor over the picture, whatever the points (property)', () => {
    const callout = fc.record({
      width: fc.integer({ min: 40, max: 240 }),
      height: fc.integer({ min: 24, max: 120 }),
      point: fc.record({
        x: fc.integer({ min: 0, max: 320 }),
        y: fc.integer({ min: 0, max: 320 }),
      }),
    });
    fc.assert(
      fc.property(
        fc.array(callout, { maxLength: 24 }),
        fc.integer({ min: 80, max: 640 }),
        fc.integer({ min: 80, max: 640 }),
        (callouts, width, height) => {
          const picture = { x: 0, y: 0, width, height };
          const inside = callouts.map((each) => ({
            ...each,
            point: { x: (each.point.x * width) / 320, y: (each.point.y * height) / 320 },
          }));
          const rects = placeCallouts(picture, inside).map((place, at) => ({
            x: place.x,
            y: place.y,
            width: (inside[at] as CalloutToPlace).width,
            height: (inside[at] as CalloutToPlace).height,
          }));
          for (const [at, rect] of rects.entries()) {
            expect(overlap(rect, picture)).toBe(false);
            for (const other of rects.slice(at + 1)) expect(overlap(rect, other)).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('calloutRoute', () => {
  const picture = { x: 200, y: 0, width: 320, height: 320 };

  it('runs straight in when the callout side reaches the point', () => {
    const route = calloutRoute(
      { x: 0, y: 100, width: 160, height: 56 },
      'left',
      { x: 300, y: 120 },
      picture,
    );
    expect(route).toEqual([
      { x: 160, y: 120 },
      { x: 300, y: 120 },
    ]);
  });

  it('turns outside the picture, entering it only in its last segment', () => {
    const route = calloutRoute(
      { x: 0, y: 0, width: 160, height: 56 },
      'left',
      { x: 300, y: 200 },
      picture,
    );
    expect(route).toHaveLength(4);
    const [start, turn, down, end] = route;
    expect(start).toEqual({ x: 160, y: 28 });
    expect(turn?.y).toBe(28);
    expect(down).toEqual({ x: turn?.x, y: 200 });
    expect(end).toEqual({ x: 300, y: 200 });
    for (const point of route.slice(0, -1)) expect(point.x).toBeLessThan(picture.x);
    for (const point of route.slice(0, -1)) expect(point.x).toBeGreaterThanOrEqual(160);
  });

  it('turns nearer the picture the farther it runs along the gap', () => {
    const turnOf = (y: number) =>
      calloutRoute({ x: 0, y, width: 160, height: 56 }, 'left', { x: 300, y: 300 }, picture)[1]
        ?.x ?? 0;
    // Two callouts above one point: the farther one turns nearer the picture, so they do not cross.
    expect(turnOf(0)).toBeGreaterThan(turnOf(150));
    expect(turnOf(0)).toBeLessThan(picture.x);
    expect(turnOf(150)).toBeGreaterThan(160);
  });

  it('works from above and below too', () => {
    const top = calloutRoute(
      { x: 300, y: -100, width: 120, height: 56 },
      'top',
      { x: 250, y: 40 },
      picture,
    );
    expect(top).toHaveLength(4);
    expect(top[0]).toEqual({ x: 360, y: -44 });
    expect(top[1]?.x).toBe(360);
    expect(top[1]?.y).toBeGreaterThan(-44);
    expect(top[1]?.y).toBeLessThan(0);
    expect(top[2]).toEqual({ x: 250, y: top[1]?.y });
    expect(top[3]).toEqual({ x: 250, y: 40 });
    const bottom = calloutRoute(
      { x: 300, y: 360, width: 120, height: 56 },
      'bottom',
      { x: 330, y: 300 },
      picture,
    );
    expect(bottom).toEqual([
      { x: 330, y: 360 },
      { x: 330, y: 300 },
    ]);
  });
});

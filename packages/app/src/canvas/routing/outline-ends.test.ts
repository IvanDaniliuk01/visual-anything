/** Where lines meet shapes beyond boxes: on their outlines (ADR 0066, ADR 0067, ADR 0039). */
import { fitOutline, readGeometry, type Outline } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { FRAME, TRIANGLE } from '../../test/beyond';
import type { Point, Rect } from '../geometry';
import type { PlacedOutline } from '../outlines';
import {
  carriedIn,
  carriedOrthogonal,
  innerPointOf,
  lastExit,
  nearestOnOutline,
  onlyStrokes,
  outlineEnd,
  placeCarriedTo,
  strokeEnd,
} from './outline-ends';

function outlineOf(geometry: Parameters<typeof readGeometry>[0]): Outline {
  const read = readGeometry(geometry);
  if (!read.ok) throw new Error('The geometry does not read.');
  return read.outline;
}

/** A geometry's outline fitted to a rectangle and placed there. */
function placed(outline: Outline, rect: Rect): PlacedOutline {
  return { fitted: fitOutline(outline, rect.width, rect.height), x: rect.x, y: rect.y };
}

const BOX: Rect = { x: 0, y: 0, width: 200, height: 100 };
/** The triangle, keeping its proportions in a box of 200 by 100: 125 wide, from x = 37.5. */
const triangle = () => placed(outlineOf(TRIANGLE), BOX);

/** A nerve drawn as a line across the box, 4 wide. */
function nerve(rect: Rect = BOX): PlacedOutline {
  const outline: Outline = {
    width: 200,
    height: 100,
    contours: [
      {
        start: { x: 0, y: 50 },
        segments: [{ kind: 'line', to: { x: 200, y: 50 } }],
        role: 'line',
        width: 4,
      },
    ],
    bounds: { x: 0, y: 48, width: 200, height: 4 },
    keepProportions: false,
  };
  return placed(outline, rect);
}

function near(a: Point, b: Point, within = 1e-6): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= within;
}

describe('a place on a side, carried in to the outline', () => {
  it('meets the outline where the line from the side first reaches it', () => {
    const outline = triangle();
    expect(carriedIn(outline, BOX, 'top', 0.5)).toEqual({ point: { x: 100, y: 0 }, met: true });
    const left = carriedIn(outline, BOX, 'left', 0.5);
    expect(left.met).toBe(true);
    expect(near(left.point, { x: 68.75, y: 50 })).toBe(true);
    // The bottom of the triangle lies on the bottom of its box.
    expect(carriedIn(outline, BOX, 'bottom', 0.5)).toEqual({
      point: { x: 100, y: 100 },
      met: true,
    });
  });

  it('meets a frame at its box, its hole further in', () => {
    const outline = placed(outlineOf(FRAME), { x: 10, y: 20, width: 100, height: 100 });
    expect(carriedIn(outline, { x: 10, y: 20, width: 100, height: 100 }, 'left', 0.5)).toEqual({
      point: { x: 10, y: 70 },
      met: true,
    });
  });

  it('sits at the outline’s point nearest the place when the line misses it', () => {
    const outline = triangle();
    const missed = carriedIn(outline, BOX, 'top', 0.1);
    expect(missed.met).toBe(false);
    expect(nearestOnOutline(outline, missed.point).distance).toBeLessThan(1e-6);
    // On the triangle's left side, nearer the place than its apex is.
    expect(Math.hypot(missed.point.x - 20, missed.point.y)).toBeLessThan(Math.hypot(80, 0));
  });

  it('meets a stroked line at the edge of its stroke', () => {
    const line = nerve();
    const carried = carriedIn(line, BOX, 'top', 0.25);
    expect(carried.met).toBe(true);
    expect(near(carried.point, { x: 50, y: 48 })).toBe(true);
  });
});

describe('an automatic end of a straight or curved line on an outline', () => {
  it('attaches where the line from the inner point toward the other end last leaves it', () => {
    const outline = triangle();
    const inner = innerPointOf(outline);
    const exit = lastExit(outline, inner, { x: 1000, y: inner.y });
    expect(exit).toBeDefined();
    // On the triangle's right side: x = 100 + 62.5 × y / 100.
    expect(exit?.x).toBeCloseTo(100 + 0.625 * inner.y, 6);
    expect(outlineEnd(outline, { x: 1000, y: inner.y })).toEqual(exit);
  });

  it('leaves a frame by its outer side, never by its hole', () => {
    const outline = placed(outlineOf(FRAME), { x: 0, y: 0, width: 100, height: 100 });
    const end = outlineEnd(outline, { x: 50, y: 500 });
    expect(end.y).toBeCloseTo(100, 6);
  });

  it('attaches to a part of lines alone at its point nearest the other end, on its stroke', () => {
    const line = nerve();
    expect(onlyStrokes(line)).toBe(true);
    expect(onlyStrokes(triangle())).toBe(false);
    expect(near(strokeEnd(line, { x: 120, y: 300 }), { x: 120, y: 52 })).toBe(true);
    expect(near(outlineEnd(line, { x: -50, y: 50 }), { x: -2, y: 50 })).toBe(true);
  });
});

describe('an orthogonal route carried on to outlines', () => {
  it('runs its end segments on until they meet the outline, so that it stays orthogonal', () => {
    const outline = triangle();
    const from = { rect: BOX, outline };
    const route = carriedOrthogonal(
      [
        { x: 200, y: 50 },
        { x: 400, y: 50 },
      ],
      from,
      undefined,
    );
    expect(route[1]).toEqual({ x: 400, y: 50 });
    expect(route[0]?.y).toBe(50);
    expect(route[0]?.x).toBeCloseTo(131.25, 6);
    const back = carriedOrthogonal(
      [
        { x: 400, y: 50 },
        { x: 200, y: 50 },
      ],
      undefined,
      from,
    );
    expect(back[0]).toEqual({ x: 400, y: 50 });
    expect(back[1]?.x).toBeCloseTo(131.25, 6);
  });

  it('goes on from the box to the outline’s nearest point when its segment misses it', () => {
    const outline = triangle();
    const route = carriedOrthogonal(
      [
        { x: 300, y: -100 },
        { x: 20, y: -100 },
        { x: 20, y: 0 },
      ],
      undefined,
      { rect: BOX, outline },
    );
    expect(route.slice(0, 3)).toEqual([
      { x: 300, y: -100 },
      { x: 20, y: -100 },
      { x: 20, y: 0 },
    ]);
    expect(route).toHaveLength(4);
    expect(nearestOnOutline(outline, route[3] as Point).distance).toBeLessThan(1e-6);
  });

  it('keeps the box’s place where the outline lies past the route’s next point', () => {
    const outline = triangle();
    const route: Point[] = [
      { x: 170, y: 50 },
      { x: 200, y: 50 },
    ];
    // From a content near the container's right side, which the triangle does not reach there.
    expect(carriedOrthogonal(route, undefined, { rect: BOX, outline })).toEqual(route);
    const inner: Point[] = [
      { x: 30, y: 50 },
      { x: 200, y: 50 },
    ];
    expect(carriedOrthogonal(inner, undefined, { rect: BOX, outline })[1]?.x).toBeCloseTo(
      131.25,
      6,
    );
  });
});

describe('the side and place an end let go on an outline is stored as', () => {
  it('carries in to the point it was let go at, from the side nearest it', () => {
    const outline = triangle();
    expect(placeCarriedTo(outline, BOX, { x: 100, y: 100 })).toEqual({
      side: 'bottom',
      at: 0.5,
    });
    const onLeft = { x: 68.75, y: 50 };
    const place = placeCarriedTo(outline, BOX, onLeft);
    // Both the top and the left side reach it first; the top is nearer.
    expect(place).toEqual({ side: 'top', at: 0.344 });
    expect(near(carriedIn(outline, BOX, place.side, place.at).point, onLeft, 0.2)).toBe(true);
  });

  it('comes as near as any side can for a point that no side reaches first', () => {
    const outline = placed(outlineOf(FRAME), { x: 0, y: 0, width: 100, height: 100 });
    // A point on the hole's edge: every side meets the frame's outer edge first.
    const place = placeCarriedTo(
      outline,
      { x: 0, y: 0, width: 100, height: 100 },
      {
        x: 25,
        y: 50,
      },
    );
    expect(place).toEqual({ side: 'left', at: 0.5 });
  });
});

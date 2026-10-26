/**
 * Automatic routes between shapes drawn by their outlines (ADR 0066, ADR 0067, ADR 0069): two that
 * touch, as a heart's chambers and valves do, are joined from inner point to inner point, over both,
 * so that the line has a length to read; two apart are joined from outline to outline.
 */
import { fitOutline, readGeometry, type Outline } from '@visual-anything/core';
import type { FreeGeometry } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { Rect } from '../geometry';
import type { PlacedOutline } from '../outlines';
import { SHORTEST_BETWEEN_OUTLINES, automaticRoute, type AutomaticEnd } from './automatic';
import { innerPointOf } from './outline-ends';

const SQUARE: FreeGeometry = {
  width: 100,
  height: 100,
  outline: [{ kind: 'polygon', points: '0,0 100,0 100,100 0,100' }],
};

function placed(rect: Rect): PlacedOutline {
  const read = readGeometry(SQUARE);
  if (!read.ok) throw new Error('The square does not read.');
  const outline: Outline = read.outline;
  return { fitted: fitOutline(outline, rect.width, rect.height), x: rect.x, y: rect.y };
}

const end = (rect: Rect): AutomaticEnd => ({ end: { rect }, outline: placed(rect) });
const length = (route: readonly { x: number; y: number }[]) =>
  route.slice(1).reduce((sum, point, at) => {
    const before = route[at] as { x: number; y: number };
    return sum + Math.hypot(point.x - before.x, point.y - before.y);
  }, 0);

describe('automatic routes between outlines', () => {
  it('join two outlines that touch from near inner point to near inner point, in every style', () => {
    const left = end({ x: 0, y: 0, width: 100, height: 100 });
    const right = end({ x: 100, y: 0, width: 100, height: 100 });
    for (const style of ['orthogonal', 'straight', 'curved'] as const) {
      const { route } = automaticRoute(left, right, style, 0);
      const from = innerPointOf(left.outline as PlacedOutline);
      const to = innerPointOf(right.outline as PlacedOutline);
      // It stops 12 short of each middle, so that pressing a part's middle finds the part.
      expect(route[0]?.x).toBeCloseTo(from.x + 12, 6);
      expect(route[0]?.y).toBeCloseTo(from.y, 6);
      expect(route.at(-1)?.x).toBeCloseTo(to.x - 12, 6);
      expect(length(route)).toBeGreaterThanOrEqual(SHORTEST_BETWEEN_OUTLINES);
    }
  });

  it('move lines between the same touching outlines apart, as lines between the same ends are', () => {
    const left = end({ x: 0, y: 0, width: 100, height: 100 });
    const right = end({ x: 100, y: 0, width: 100, height: 100 });
    const first = automaticRoute(left, right, 'straight', 0).route;
    const second = automaticRoute(left, right, 'straight', 24).route;
    expect(Math.abs((second[0]?.y ?? 0) - (first[0]?.y ?? 0))).toBeCloseTo(24, 6);
  });

  it('join two outlines apart from outline to outline', () => {
    const left = end({ x: 0, y: 0, width: 100, height: 100 });
    const right = end({ x: 300, y: 0, width: 100, height: 100 });
    const { route } = automaticRoute(left, right, 'straight', 0);
    expect(route[0]?.x).toBeCloseTo(100, 6);
    expect(route.at(-1)?.x).toBeCloseTo(300, 6);
  });
});

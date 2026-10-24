import { describe, expect, it } from 'vitest';
import {
  arrowheadAt,
  borderPoint,
  cylinderCap,
  distance,
  fitTransform,
  grow,
  holdsPoint,
  personHead,
  type Rect,
  type ShapeKind,
} from './geometry';

describe('fitTransform', () => {
  const bounds: Rect = { x: 40, y: 40, width: 1180, height: 592 };

  it('scales the scene into the area, leaving the margin on the tighter side', () => {
    const fit = fitTransform(bounds, { width: 1000, height: 600 }, 24);
    expect(fit.scale).toBeCloseTo(952 / 1180);
    expect(bounds.x * fit.scale + fit.x).toBeCloseTo(24);
    expect((bounds.x + bounds.width) * fit.scale + fit.x).toBeCloseTo(1000 - 24);
  });

  it('centers the scene on the looser side', () => {
    const fit = fitTransform(bounds, { width: 1000, height: 600 }, 24);
    const top = bounds.y * fit.scale + fit.y;
    const bottom = (bounds.y + bounds.height) * fit.scale + fit.y;
    expect(top).toBeCloseTo(600 - bottom);
  });

  it('does not blow a small scene up beyond the maximum scale', () => {
    const fit = fitTransform(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 800, height: 600 },
      24,
    );
    expect(fit.scale).toBe(2);
    expect(fit.x).toBeCloseTo((800 - 20) / 2);
  });

  it('leaves an empty scene where it is', () => {
    expect(fitTransform(undefined, { width: 800, height: 600 }, 24)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });
});

describe('borderPoint', () => {
  const rect: Rect = { x: 0, y: 0, width: 200, height: 100 };

  it('finds where a line from inside a rectangle crosses its border', () => {
    expect(borderPoint('rectangle', rect, { x: 100, y: 50 }, { x: 400, y: 50 })).toEqual({
      x: 200,
      y: 50,
    });
    expect(borderPoint('rounded-rectangle', rect, { x: 100, y: 50 }, { x: 100, y: -300 })).toEqual({
      x: 100,
      y: 0,
    });
  });

  it('finds where a line from inside an ellipse crosses its outline', () => {
    const point = borderPoint('ellipse', rect, { x: 100, y: 50 }, { x: 400, y: 350 });
    const onOutline = ((point.x - 100) / 100) ** 2 + ((point.y - 50) / 50) ** 2;
    expect(onOutline).toBeCloseTo(1);
    expect(point.x).toBeGreaterThan(100);
    expect(point.y).toBeGreaterThan(50);
  });
});

describe('arrowheadAt', () => {
  it('points along the line, with its tip at the end', () => {
    const head = arrowheadAt({ x: 0, y: 0 }, { x: 100, y: 0 }, 2);
    expect(head.tip).toEqual({ x: 100, y: 0 });
    expect(head.left.x).toBeLessThan(100);
    expect(head.right.x).toBe(head.left.x);
    expect(head.left.y).toBe(-head.right.y);
  });
});

describe('distance', () => {
  it('measures the straight distance between two points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('holdsPoint', () => {
  const rect: Rect = { x: 0, y: 0, width: 200, height: 100 };
  const kinds: ShapeKind[] = ['rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person'];

  it('holds the whole rectangle of rectangles, rounded ones included', () => {
    for (const kind of ['rectangle', 'rounded-rectangle'] as const) {
      expect(holdsPoint(kind, rect, { x: 1, y: 1 })).toBe(true);
      expect(holdsPoint(kind, rect, { x: 200, y: 100 })).toBe(true);
    }
  });

  it('holds an ellipse by its ellipse, not its corners', () => {
    expect(holdsPoint('ellipse', rect, { x: 100, y: 50 })).toBe(true);
    expect(holdsPoint('ellipse', rect, { x: 100, y: 1 })).toBe(true);
    expect(holdsPoint('ellipse', rect, { x: 5, y: 5 })).toBe(false);
    expect(holdsPoint('ellipse', rect, { x: 195, y: 95 })).toBe(false);
  });

  it('holds a cylinder by its body and its two caps', () => {
    expect(cylinderCap(rect)).toBe(12);
    expect(holdsPoint('cylinder', rect, { x: 2, y: 50 })).toBe(true);
    expect(holdsPoint('cylinder', rect, { x: 100, y: 2 })).toBe(true);
    expect(holdsPoint('cylinder', rect, { x: 100, y: 98 })).toBe(true);
    expect(holdsPoint('cylinder', rect, { x: 2, y: 2 })).toBe(false);
    expect(holdsPoint('cylinder', rect, { x: 198, y: 98 })).toBe(false);
  });

  it('holds a person by its body and its head', () => {
    const head = personHead(rect);
    expect(head).toBe(22);
    expect(holdsPoint('person', rect, { x: 100, y: head })).toBe(true);
    expect(holdsPoint('person', rect, { x: 5, y: 50 })).toBe(true);
    expect(holdsPoint('person', rect, { x: 5, y: 5 })).toBe(false);
    expect(holdsPoint('person', rect, { x: 100 + head + 2, y: head })).toBe(false);
  });

  it('holds nothing outside the rectangle', () => {
    for (const kind of kinds) {
      expect(holdsPoint(kind, rect, { x: -1, y: 50 })).toBe(false);
      expect(holdsPoint(kind, rect, { x: 100, y: 101 })).toBe(false);
    }
  });
});

describe('grow', () => {
  it('grows a rectangle on every side', () => {
    expect(grow({ x: 10, y: 20, width: 30, height: 40 }, 5)).toEqual({
      x: 5,
      y: 15,
      width: 40,
      height: 50,
    });
  });
});

/**
 * What the canvas asks of a shape with its own outline (M8b, ADR 0066): its label area, whether it
 * writes its name inside, its header's stretch, its simplified outline far out, its marks and its
 * tiles' signature.
 */
import { distanceToEdges, flattenOutline, outlineHolds } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { TRIANGLE, beyondBoxes } from '../test/beyond';
import { APEX_DOWN, APEX_UP, OVAL, outlinedShape } from '../test/outlined';
import {
  LEAST_LABEL_HEIGHT,
  NAME_BELOW_GAP,
  NAME_BELOW_WIDTH,
  PART_NAME_LINE,
  drawnBoundsOf,
  headerStretch,
  labelAreaOn,
  markContours,
  nameBelowOf,
  outlineBoundsOn,
  outlineSignature,
  simplifiedHolds,
  writesNameBelow,
  writesNameInside,
} from './outlined';
import type { ShapeOutline } from './outlines';
import { buildScene, type ElementShape } from './scene';

const scene = buildScene(beyondBoxes('anatomy'), 'anatomy');
const framed = scene.shapes.find((shape) => shape.key === 'framed') as ElementShape & {
  outline: ShapeOutline;
};

/** The corners of a rectangle, in the coordinates of a shape's outline. */
function cornersIn(
  shape: ElementShape & { outline: ShapeOutline },
  area: { x: number; y: number; width: number; height: number },
) {
  const x = area.x - shape.rect.x - shape.outline.x;
  const y = area.y - shape.rect.y - shape.outline.y;
  return [
    { x, y },
    { x: x + area.width, y },
    { x, y: y + area.height },
    { x: x + area.width, y: y + area.height },
  ];
}

describe('labelAreaOn', () => {
  it('places the largest label rectangle the outline holds where the shape is, clear of its hole', () => {
    const area = labelAreaOn(framed);
    expect(area.height).toBeGreaterThanOrEqual(LEAST_LABEL_HEIGHT);
    for (const corner of cornersIn(framed, area)) {
      expect(outlineHolds(framed.outline.fitted, corner)).toBe(true);
    }
    // The hole spans the middle of the frame: 50 to 150 across and 25 to 75 down, at 200 by 100.
    const hole = { x: framed.rect.x + 50, y: framed.rect.y + 25, width: 100, height: 50 };
    const clear =
      area.x + area.width <= hole.x + 0.5 ||
      area.x >= hole.x + hole.width - 0.5 ||
      area.y + area.height <= hole.y + 0.5 ||
      area.y >= hole.y + hole.height - 0.5;
    expect(clear).toBe(true);
  });

  it('takes the geometry’s own label area, fitted to the shape', () => {
    const shape = outlinedShape(
      'labelled',
      { ...OVAL, label: { x: 20, y: 40, width: 60, height: 20 } },
      { x: 100, y: 50, width: 200, height: 100 },
    );
    expect(labelAreaOn(shape as ElementShape & { outline: ShapeOutline })).toEqual({
      x: 140,
      y: 90,
      width: 120,
      height: 20,
    });
  });
});

describe('writesNameInside', () => {
  it('writes a name inside a shape where it fits whole, and under the shape otherwise', () => {
    const large = outlinedShape('large', TRIANGLE, { x: 0, y: 0, width: 200, height: 160 });
    expect(writesNameInside(large)).toBe(true);
    expect(writesNameBelow(large)).toBe(false);
    // A name too long for the label area is never cut there: it goes under the shape.
    const long = { ...large, name: 'Pulmonary artery and its branches to both lungs' };
    expect(writesNameInside(long)).toBe(false);
    expect(writesNameBelow(long)).toBe(true);
    const small = outlinedShape('small', TRIANGLE, { x: 0, y: 0, width: 30, height: 24 });
    expect(labelAreaOn(small as ElementShape & { outline: ShapeOutline }).height).toBeLessThan(
      LEAST_LABEL_HEIGHT,
    );
    expect(writesNameInside(small)).toBe(false);
    expect(writesNameBelow(small)).toBe(true);
    // Shapes without an outline of their own always write their names inside.
    const boxed: ElementShape = { ...small };
    delete boxed.outline;
    expect(writesNameInside(boxed)).toBe(true);
    expect(writesNameBelow(boxed)).toBe(false);
  });

  it('writes a name under its shape centred below the outline, on whole words, and covers it', () => {
    const small = outlinedShape('small', TRIANGLE, { x: 100, y: 50, width: 30, height: 24 });
    const long = { ...small, name: 'Pulmonary artery and its branches to both lungs' };
    const bounds = outlineBoundsOn(long as ElementShape & { outline: ShapeOutline });
    const below = nameBelowOf(long as ElementShape & { outline: ShapeOutline });
    expect(below.x).toBeCloseTo(bounds.x + bounds.width / 2);
    expect(below.y).toBeCloseTo(bounds.y + bounds.height + NAME_BELOW_GAP);
    expect(below.width).toBe(NAME_BELOW_WIDTH);
    expect(below.lines.length).toBeGreaterThan(1);
    expect(below.lines.join(' ')).toBe(long.name);
    const covered = drawnBoundsOf(long);
    expect(covered.y + covered.height).toBeGreaterThanOrEqual(
      below.y + below.lines.length * PART_NAME_LINE,
    );
    expect(covered.x).toBeLessThanOrEqual(below.x - NAME_BELOW_WIDTH / 2);
    // A shape that writes its name inside covers its rectangle.
    const large = outlinedShape('large', TRIANGLE, { x: 0, y: 0, width: 200, height: 160 });
    expect(drawnBoundsOf(large)).toBe(large.rect);
  });

  it('writes an expanded container’s name in its header only where its outline holds a stretch of it', () => {
    const rect = { x: 0, y: 0, width: 300, height: 200 };
    const wide = outlinedShape('wide', APEX_DOWN, rect, { holdsContents: true });
    const stretch = headerStretch(wide as ElementShape & { outline: ShapeOutline });
    expect(stretch?.width).toBeGreaterThan(200);
    expect(writesNameInside(wide)).toBe(true);
    const apex = outlinedShape('apex', APEX_UP, rect, { holdsContents: true });
    expect(
      headerStretch(apex as ElementShape & { outline: ShapeOutline })?.width ?? 0,
    ).toBeLessThan(40);
    expect(writesNameInside(apex)).toBe(false);
    // Collapsed, it writes its name in its label area as any shape does.
    expect(writesNameInside({ ...apex, holdsContents: false, collapsed: { contents: 2 } })).toBe(
      true,
    );
  });

  it('places the header’s stretch where the shape is, left of its toggle', () => {
    const shape = outlinedShape(
      'moved',
      APEX_DOWN,
      { x: 500, y: 300, width: 300, height: 200 },
      {
        holdsContents: true,
      },
    ) as ElementShape & { outline: ShapeOutline };
    const stretch = headerStretch(shape) as { x: number; width: number };
    expect(stretch.x).toBeGreaterThanOrEqual(500);
    // The toggle sits 6 units in from the right, 18 wide: the stretch ends 4 units left of it.
    expect(stretch.x + stretch.width).toBeLessThanOrEqual(800 - 6 - 18 - 4 + 0.01);
  });
});

describe('simplifiedHolds', () => {
  it('holds a point in a hole far out, where the simplified outline is filled without its holes', () => {
    const middle = { x: framed.rect.x + 100, y: framed.rect.y + 50 };
    expect(simplifiedHolds(framed, middle)).toBe(true);
    expect(simplifiedHolds(framed, { x: framed.rect.x + 10, y: framed.rect.y + 10 })).toBe(true);
    expect(simplifiedHolds(framed, { x: framed.rect.x - 5, y: framed.rect.y + 50 })).toBe(false);
    const triangle = outlinedShape('t', APEX_UP, { x: 0, y: 0, width: 100, height: 100 });
    // Beside the outline, inside the box.
    expect(
      simplifiedHolds(triangle as ElementShape & { outline: ShapeOutline }, { x: 5, y: 10 }),
    ).toBe(false);
  });
});

describe('outlineBoundsOn', () => {
  it('is the fitted outline’s bounds where the shape is: a triangle that keeps its proportions sits in its middle', () => {
    const shape = outlinedShape('t', TRIANGLE, { x: 10, y: 20, width: 300, height: 80 });
    expect(outlineBoundsOn(shape as ElementShape & { outline: ShapeOutline })).toEqual({
      x: 110,
      y: 20,
      width: 100,
      height: 80,
    });
  });
});

describe('markContours', () => {
  it('grows each fill and shrinks each hole by the gap', () => {
    const contours = markContours(framed.outline.fitted, 3);
    expect(contours).toHaveLength(2);
    const bounds = contours.map((points) => {
      const xs = Array.from(points).filter((_, at) => at % 2 === 0);
      const ys = Array.from(points).filter((_, at) => at % 2 === 1);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    });
    expect(bounds[0]).toEqual([-3, -3, 203, 103]);
    expect(bounds[1]).toEqual([53, 28, 147, 72]);
  });

  it('runs the gap away from a curved outline, to within a sixth of it', () => {
    const shape = outlinedShape('oval', OVAL, { x: 0, y: 0, width: 240, height: 120 });
    const fitted = (shape.outline as ShapeOutline).fitted;
    const gap = 6;
    const [mark] = markContours(fitted, gap);
    const flat = flattenOutline(fitted);
    expect(mark?.length).toBeGreaterThan(16);
    for (let at = 0; at < (mark?.length ?? 0); at += 2) {
      const point = { x: mark?.[at] as number, y: mark?.[at + 1] as number };
      expect(outlineHolds(fitted, point)).toBe(false);
      const away = distanceToEdges(flat, point);
      expect(away).toBeGreaterThan(gap - gap / 6 - 0.3);
      expect(away).toBeLessThan(gap + gap / 6 + 0.3);
    }
  });

  it('leaves out a hole too small to shrink, and is the same for the same gap', () => {
    expect(markContours(framed.outline.fitted, 30)).toHaveLength(1);
    expect(markContours(framed.outline.fitted, 3)).toBe(markContours(framed.outline.fitted, 3));
  });
});

describe('outlineSignature', () => {
  it('says what the outline and the part draw, and nothing for a shape with neither', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const a = outlinedShape('a', APEX_UP, rect);
    expect(outlineSignature(a)).toBe(
      outlineSignature(outlinedShape('b', APEX_UP, { ...rect, x: 50 })),
    );
    expect(outlineSignature(a)).not.toBe(outlineSignature(outlinedShape('c', APEX_DOWN, rect)));
    expect(outlineSignature(a)).not.toBe(
      outlineSignature(outlinedShape('d', APEX_UP, { ...rect, width: 90 })),
    );
    const part = { image: 'i', part: 'p', color: '#C0392B', inDrawing: true };
    expect(outlineSignature({ ...a, part })).not.toBe(
      outlineSignature({ ...a, part: { ...part, color: '#000000' } }),
    );
    expect(outlineSignature({})).toBe('');
  });
});

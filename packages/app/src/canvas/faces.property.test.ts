/**
 * A face's drawing stays inside its shape (ADR 0083, F2): whatever the shape's kind, size, name and
 * attributes, and whatever the face's sizes, every box, band and run the canvas draws lies inside the
 * rectangle it draws the face in, and that rectangle inside the shape.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Face } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { withFaces } from '../test/faces';
import { VIEW, tablesProject } from '../test/tables';
import { faceRect, shapeFaceDrawing } from './faces';
import type { Rect } from './geometry';
import { buildScene, type ElementShape } from './scene';

const EPSILON = 0.01;

function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
  );
}

const KINDS = ['rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person'] as const;

const faceOf: fc.Arbitrary<MadeFace> = fc.record({
  size: fc.constantFrom('shape' as const, 'content' as const),
  nameSize: fc.integer({ min: 8, max: 32 }),
  padding: fc.integer({ min: 0, max: 24 }),
  clamp: fc.integer({ min: 1, max: 4 }),
  badge: fc.boolean(),
});

/** What a face is built from. */
interface MadeFace {
  size: 'shape' | 'content';
  nameSize: number;
  padding: number;
  clamp: number;
  badge: boolean;
}

/** A face built from the arbitrary's numbers: a name, a badge in a corner, and a clamped text. */
function faceFrom(made: MadeFace): Face {
  return {
    size: made.size,
    markup: [
      '<div class="head"><b>{{name}}</b>',
      made.badge ? '<span class="badge">{{component}}</span>' : '',
      '</div>',
      '<p if="description">{{description}}</p>',
    ],
    style: [
      `face { padding: ${made.padding}px; }`,
      `.head { display: flex; gap: 4px; }`,
      `b { font-size: ${made.nameSize}px; flex: 1; }`,
      '.badge { padding: 2px 6px; border: 1px solid var(--stroke); border-radius: 4px; }',
      `p { line-clamp: ${made.clamp}; }`,
    ],
  };
}

function project(
  face: Face,
  kind: (typeof KINDS)[number],
  name: string,
  description: string,
  size: { width: number; height: number },
): ProjectSnapshot {
  const base = tablesProject({
    tables: [],
    elements: [
      {
        id: 'it',
        component: 'systems.service',
        name,
        attributes: { description },
        appearance: { shape: kind },
      },
    ],
    positions: [{ element: 'it', x: 0, y: 0, ...size }],
  });
  return withFaces(base, { 'systems.service': face });
}

describe('a face on the canvas (ADR 0083)', () => {
  it('draws inside its shape, whatever its shape, size and values', () => {
    fc.assert(
      fc.property(
        faceOf,
        fc.constantFrom(...KINDS),
        fc.string({ minLength: 1, maxLength: 60 }),
        fc.lorem({ maxCount: 40 }),
        fc.record({
          width: fc.integer({ min: 40, max: 400 }),
          height: fc.integer({ min: 30, max: 300 }),
        }),
        (made, kind, name, description, size) => {
          const scene = buildScene(project(faceFrom(made), kind, name, description, size), VIEW);
          const shape = scene.shapes.find((each) => each.element === 'it') as ElementShape;
          expect(shape.face).toBeDefined();
          const rect = faceRect(shape);
          expect(inside(rect, shape.rect)).toBe(true);
          const drawing = shapeFaceDrawing(shape)!;
          const at = (each: Rect): Rect => ({ ...each, x: rect.x + each.x, y: rect.y + each.y });
          for (const box of drawing.boxes) expect(inside(at(box), rect)).toBe(true);
          for (const band of drawing.bands) expect(inside(at(band), rect)).toBe(true);
          for (const run of drawing.runs) {
            // A run's letters stand on its baseline and reach about an em above it.
            const letters = { x: run.x, y: run.y - run.size * 0.8, width: run.width, height: 0 };
            expect(inside(at(letters), rect)).toBe(true);
            expect(run.y).toBeLessThanOrEqual(rect.height + EPSILON);
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});

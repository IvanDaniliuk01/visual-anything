/**
 * Pointing, box selection and drops by a shape's own outline (M8b, ADR 0066): a point in a hole, or
 * beside the outline inside its box, finds what lies behind, exactly to within a quarter of a canvas
 * unit; far out, by the simplified outline the canvas draws; and the budget for a pointer over
 * outlines, 1 ms at the 95th percentile, measured on 2,000 shapes with free geometry.
 */
import { GEOMETRY_CAPS, flattenOutline, readGeometry } from '@visual-anything/core';
import type { FreeGeometry } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { cpuNow } from '../test/cpu';
import { FRAME, TRIANGLE, beyondBoxes } from '../test/beyond';
import { APEX_UP, OVAL, outlinedShape } from '../test/outlined';
import { takesDropAt } from './drop';
import type { Point, Rect } from './geometry';
import { enclosedBy, hitAt, holdsAsDrawn, indexScene, shapesAt, type IndexedScene } from './hit';
import { drawnBoundsOf } from './nameTags';
import type { ShapeOutline } from './outlines';
import { buildScene, type ElementShape, type Scene } from './scene';

function sceneOf(shapes: ElementShape[]): Scene {
  return { shapes, relations: [], notes: [], arrows: [], bounds: undefined };
}

function boxShape(key: string, rect: Rect, extra: Partial<ElementShape> = {}): ElementShape {
  return {
    key,
    element: key,
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: key,
    componentName: 'Box',
    kind: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#000000',
    rect,
    extent: rect,
    holdsContents: false,
    ...extra,
  };
}

const keysAt = (indexed: IndexedScene, point: Point, exact = true) =>
  shapesAt(indexed, point, () => exact).map((shape) => shape.key);

describe('pointing by the outline', () => {
  const indexed = indexScene(buildScene(beyondBoxes('anatomy'), 'anatomy'));
  const framed = indexed.byKey.get('framed') as ElementShape;

  it('finds nothing of a shape in its hole, and the shape on its ring', () => {
    const { x, y } = framed.rect;
    expect(keysAt(indexed, { x: x + 100, y: y + 50 })).toEqual([]);
    expect(keysAt(indexed, { x: x + 10, y: y + 50 })).toEqual(['framed']);
    expect(hitAt(indexed, { x: x + 10, y: y + 50 }, 4)).toMatchObject({
      kind: 'shape',
      shape: { key: 'framed' },
    });
  });

  it('finds a shape just outside its rectangle, where its outline’s stroke reaches', () => {
    const { x, y } = framed.rect;
    expect(keysAt(indexed, { x: x - 0.5, y: y + 50 })).toEqual(['framed']);
    expect(keysAt(indexed, { x: x - 1, y: y + 50 })).toEqual([]);
    // A box drawn as its kind, or as a plain block, holds only its rectangle, as before.
    const boxes = indexScene(sceneOf([boxShape('box', { x: 0, y: 0, width: 100, height: 100 })]));
    expect(keysAt(boxes, { x: -0.5, y: 50 })).toEqual([]);
    expect(keysAt(boxes, { x: -0.5, y: 50 }, false)).toEqual([]);
    expect(keysAt(boxes, { x: 0.5, y: 50 }, false)).toEqual(['box']);
  });

  it('finds what lies behind a point beside the outline, inside its box', () => {
    const scene = indexScene(
      sceneOf([
        boxShape('back', { x: 0, y: 0, width: 300, height: 300 }),
        outlinedShape('front', APEX_UP, { x: 50, y: 50, width: 200, height: 200 }),
      ]),
    );
    expect(keysAt(scene, { x: 60, y: 60 })).toEqual(['back']);
    expect(keysAt(scene, { x: 150, y: 200 })).toEqual(['front', 'back']);
  });

  it('holds what lies within half the stroke’s width of the outline, exactly to a quarter of a unit', () => {
    const circle = outlinedShape('circle', OVAL, { x: 0, y: 0, width: 200, height: 200 });
    for (let step = 0; step < 72; step += 1) {
      const angle = (step / 72) * 2 * Math.PI + 0.01;
      const at = (radius: number) => ({
        x: 100 + radius * Math.cos(angle),
        y: 100 + radius * Math.sin(angle),
      });
      // The stroke is 1.5 units wide: its half reaches 0.75 out, give or take a quarter.
      expect(holdsAsDrawn(circle, at(100.5), true)).toBe(true);
      expect(holdsAsDrawn(circle, at(101), true)).toBe(false);
      expect(holdsAsDrawn(circle, at(99), true)).toBe(true);
    }
  });

  it('holds by the simplified outline, its holes filled, where the shape is drawn as a plain block', () => {
    const { x, y } = framed.rect;
    expect(keysAt(indexed, { x: x + 100, y: y + 50 }, false)).toEqual(['framed']);
    const scene = indexScene(
      sceneOf([
        boxShape('back', { x: 0, y: 0, width: 300, height: 300 }),
        outlinedShape('front', APEX_UP, { x: 50, y: 50, width: 200, height: 200 }),
      ]),
    );
    expect(keysAt(scene, { x: 60, y: 60 }, false)).toEqual(['back']);
  });
});

describe('box selection by the outline’s bounds', () => {
  it('takes a shape whose outline lies in the box, even when its rectangle does not', () => {
    // Keeping its proportions, the triangle sits in the middle of its wide rectangle: 100 to 200.
    const triangle = outlinedShape('triangle', TRIANGLE, { x: 0, y: 0, width: 300, height: 80 });
    const scene = indexScene(sceneOf([triangle]));
    // Down far enough to hold the name tag the triangle hangs under itself too.
    const height = drawnBoundsOf(triangle).height + 10;
    expect(enclosedBy(scene, { x: 95, y: -5, width: 110, height }).shapes).toEqual([triangle]);
    expect(enclosedBy(scene, { x: 105, y: -5, width: 110, height }).shapes).toEqual([]);
  });
});

describe('drop targets by the outline', () => {
  const rect = { x: 0, y: 0, width: 200, height: 100 };

  it('takes a drop in a container’s outline, not in its hole nor beside it', () => {
    const ring = outlinedShape('ring', FRAME, rect, { holdsContents: true });
    expect(takesDropAt(ring, { x: 10, y: 50 }, true)).toBe(true);
    expect(takesDropAt(ring, { x: 100, y: 50 }, true)).toBe(false);
    const apex = outlinedShape('apex', APEX_UP, rect, { holdsContents: true });
    expect(takesDropAt(apex, { x: 5, y: 5 }, true)).toBe(false);
    // A container drawn as its kind takes one anywhere in its rectangle, where its contents lie.
    expect(
      takesDropAt(
        boxShape('box', rect, { holdsContents: true, kind: 'ellipse' }),
        { x: 2, y: 2 },
        true,
      ),
    ).toBe(true);
  });

  it('takes a drop on a leaf by its outline, or by its simplified outline far out', () => {
    const leaf = outlinedShape('leaf', FRAME, rect);
    expect(takesDropAt(leaf, { x: 100, y: 50 }, true)).toBe(false);
    expect(takesDropAt(leaf, { x: 100, y: 50 }, false)).toBe(true);
    expect(takesDropAt(leaf, { x: 10, y: 50 }, true)).toBe(true);
  });
});

// The budget ----------------------------------------------------------------------------------------

/** A wavy closed path of `count` straight segments around (cx, cy). */
function wavyPath(count: number, cx: number, cy: number, radius: number, waves: number): string {
  const parts: string[] = [];
  for (let at = 0; at < count; at += 1) {
    const angle = (at / count) * 2 * Math.PI;
    const r = radius * (1 + 0.08 * Math.sin(angle * waves));
    const x = (cx + r * Math.cos(angle)).toFixed(1);
    const y = (cy + r * Math.sin(angle)).toFixed(1);
    parts.push(`${at === 0 ? 'M' : 'L'}${x} ${y}`);
  }
  return `${parts.join('')}Z`;
}

/** Twenty geometries, four of them at the caps, as the beyond-boxes benchmark has. */
function twentyGeometries(): FreeGeometry[] {
  const box = { width: 120, height: 110 };
  const geometries: FreeGeometry[] = [
    // At the cap on segments: one contour of 1,999 lines and its close.
    {
      ...box,
      outline: [{ kind: 'path', d: wavyPath(GEOMETRY_CAPS.segments - 1, 60, 55, 50, 37) }],
    },
    // At the cap on contours: 64 polygons of 31 points, rings inside one another.
    {
      ...box,
      outline: Array.from({ length: GEOMETRY_CAPS.contours }, (_, at) => ({
        kind: 'polygon' as const,
        points: Array.from({ length: 31 }, (_, step) => {
          const angle = (step / 31) * 2 * Math.PI;
          const r = 54 - at * 0.8;
          return `${(60 + r * Math.cos(angle)).toFixed(1)},${(55 + r * Math.sin(angle)).toFixed(1)}`;
        }).join(' '),
      })),
    },
    // Arcs, each read as up to four cubics: as many as the text allows.
    {
      ...box,
      outline: [
        {
          kind: 'path',
          d: `M10 55${'a1 1 0 0 1 .05 0'.repeat(1800)}V100H10Z`,
        },
      ],
    },
    // Cubics up to the cap on text.
    {
      ...box,
      outline: [
        {
          kind: 'path',
          d: `M10 10${Array.from({ length: 1550 }, (_, at) => `c1 2 3 -2 ${(100 / 1550).toFixed(3)} ${at % 2 ? 0.05 : -0.05}`).join('')}V100H10Z`,
        },
      ],
    },
  ];
  for (let at = 0; geometries.length < 20; at += 1) {
    geometries.push(
      at % 2 === 0
        ? { ...box, outline: [{ kind: 'path', d: wavyPath(24 + at * 8, 60, 55, 50, 3 + at) }] }
        : {
            ...box,
            outline: [
              { kind: 'path', d: wavyPath(40 + at * 4, 60, 55, 48, 2 + at) },
              { kind: 'ellipse', cx: 60, cy: 55, rx: 18, ry: 12 },
            ],
          },
    );
  }
  for (const geometry of geometries) {
    const read = readGeometry(geometry);
    if (!read.ok) throw new Error(`Not geometry: ${read.message}`);
  }
  return geometries;
}

/** 2,000 shapes with free geometry in 20 containers of 100, each outlined shape 120 by 110. */
function outlinedScene(): { indexed: IndexedScene; outlined: ElementShape[] } {
  const geometries = twentyGeometries();
  const shapes: ElementShape[] = [];
  const outlined: ElementShape[] = [];
  for (let group = 0; group < 20; group += 1) {
    const gx = (group % 5) * 1500;
    const gy = Math.floor(group / 5) * 1400;
    const container = boxShape(
      `c${group}`,
      { x: gx, y: gy, width: 1440, height: 1340 },
      { holdsContents: true },
    );
    shapes.push(container);
    for (let at = 0; at < 100; at += 1) {
      const rect = {
        x: gx + 20 + (at % 10) * 140,
        y: gy + 40 + Math.floor(at / 10) * 128,
        width: 120,
        height: 110,
      };
      const shape = outlinedShape(
        `c${group}/s${at}`,
        geometries[(group + at) % 20] as FreeGeometry,
        rect,
      );
      shapes.push(shape);
      outlined.push(shape);
    }
  }
  return { indexed: indexScene(sceneOf(shapes)), outlined };
}

/** Points along the outlines, on and just off their edges, and anywhere in their boxes. */
function pointerPath(outlined: readonly ElementShape[], count: number): Point[] {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const points: Point[] = [];
  for (let at = 0; at < count; at += 1) {
    const shape = outlined[Math.floor(random() * outlined.length)] as ElementShape;
    const { rect } = shape;
    if (at % 2 === 0) {
      points.push({ x: rect.x + random() * rect.width, y: rect.y + random() * rect.height });
      continue;
    }
    const outline = shape.outline as ShapeOutline;
    const flat = flattenOutline(outline.fitted);
    const contour = flat[Math.floor(random() * flat.length)];
    const edges = (contour?.points.length ?? 0) / 2;
    const edge = Math.floor(random() * edges);
    const x = (contour?.points[2 * edge] as number) + rect.x + outline.x;
    const y = (contour?.points[2 * edge + 1] as number) + rect.y + outline.y;
    points.push({ x: x + (random() - 0.5) * 3, y: y + (random() - 0.5) * 3 });
  }
  return points;
}

describe('the budget for pointing along outlines', () => {
  it('finds what is under the pointer within 1 ms at the 95th percentile, on 2,000 outlined shapes', () => {
    const { indexed, outlined } = outlinedScene();
    const exact = () => true;
    const points = pointerPath(outlined, 1000);
    // Warmed up, as a pointer that has moved over the canvas is: every outline read once.
    for (const point of points) hitAt(indexed, point, 4, exact);
    // Each point ranked by the least of three readings of the clock, which is fine enough for one.
    const costs = points.map((point) => {
      let least = Infinity;
      for (let round = 0; round < 3; round += 1) {
        const start = performance.now();
        hitAt(indexed, point, 4, exact);
        least = Math.min(least, performance.now() - start);
      }
      return { point, least };
    });
    costs.sort((a, b) => b.least - a.least);
    // The slowest 5%, whose least cost is the 95th percentile: their mean, in CPU time, bounds it.
    // CPU time moves in ticks (about 15.6 ms on Windows), so they are measured over many rounds.
    const slowest = costs.slice(0, Math.ceil(points.length * 0.05)).map((each) => each.point);
    let rounds = 0;
    const start = cpuNow();
    while (cpuNow() - start < 250 && rounds < 2000) {
      for (const point of slowest) hitAt(indexed, point, 4, exact);
      rounds += 1;
    }
    const mean = (cpuNow() - start) / (rounds * slowest.length);
    expect(mean).toBeLessThan(1);
  });
});

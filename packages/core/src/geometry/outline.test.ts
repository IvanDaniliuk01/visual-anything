/**
 * Free geometry read into its outline (ADR 0066), and what is asked of it fitted to a shape: the
 * checks and caps, fills and holes by nesting, and the property tests the spec names for holding a
 * point, the last exit of a line and reading normalized path data again.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  distanceToEdges,
  fitOutline,
  flatten,
  outlineExit,
  outlineHolds,
  outlineInnerPoint,
  outlineLabelArea,
  outlinePathData,
  outlinePlace,
  simplifyOutline,
  type FittedOutline,
  type FlatContour,
} from './fit';
import {
  GEOMETRY_CAPS,
  evenOddHolds,
  readGeometry,
  type GeometryInput,
  type Outline,
} from './outline';

const HEART: GeometryInput = {
  width: 120,
  height: 110,
  keepProportions: true,
  outline: [
    {
      kind: 'path',
      d: 'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z',
    },
  ],
  label: { x: 24, y: 30, width: 72, height: 36 },
};

function outlineOf(geometry: GeometryInput): Outline {
  const read = readGeometry(geometry);
  if (!read.ok) throw new Error(read.message);
  return read.outline;
}

describe('readGeometry', () => {
  it('reads paths, polygons and ellipses into closed contours, with the bounds of their curves', () => {
    const heart = outlineOf(HEART);
    expect(heart.contours).toHaveLength(1);
    expect(heart.contours[0]?.role).toBe('fill');
    expect(heart.bounds.x).toBeCloseTo(0, 6);
    expect(heart.bounds.y).toBeCloseTo(0, 6);
    expect(heart.bounds.width).toBeCloseTo(120, 6);
    // The lowest point is the tip at 104; the control points are not the bounds.
    expect(heart.bounds.height).toBeCloseTo(104, 6);
    const shapes = outlineOf({
      width: 100,
      height: 100,
      outline: [
        { kind: 'polygon', points: '0,0 100,0 100,100' },
        { kind: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 20 },
      ],
    });
    expect(shapes.contours.map((contour) => contour.segments.length)).toEqual([3, 4]);
    // A path's subpath closes whether or not it ends with Z.
    const open = outlineOf({
      width: 10,
      height: 10,
      outline: [{ kind: 'path', d: 'M0 0 L10 0 L10 10' }],
    });
    expect(open.contours[0]?.segments.at(-1)?.to).toEqual({ x: 0, y: 0 });
  });

  it('makes a contour inside an odd number of others a hole, whichever way either runs', () => {
    const ring = outlineOf({
      width: 100,
      height: 100,
      outline: [
        { kind: 'path', d: 'M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z M40 40 V60 H60 V40 Z' },
      ],
    });
    expect(ring.contours.map((contour) => contour.role)).toEqual(['fill', 'hole', 'fill']);
    const fitted = fitOutline(ring, 100, 100);
    expect(outlineHolds(fitted, { x: 10, y: 10 })).toBe(true);
    expect(outlineHolds(fitted, { x: 30, y: 30 })).toBe(false);
    expect(outlineHolds(fitted, { x: 50, y: 50 })).toBe(true);
  });

  it.each<[string, GeometryInput, string, string]>([
    [
      'a box of no size',
      { width: 0, height: 10, outline: [{ kind: 'ellipse', cx: 0, cy: 0, rx: 1, ry: 1 }] },
      'invalid-geometry',
      'width',
    ],
    [
      'a box past the cap',
      { width: 200_000, height: 10, outline: [{ kind: 'ellipse', cx: 0, cy: 5, rx: 1, ry: 1 }] },
      'geometry-too-large',
      'at most',
    ],
    ['no contours', { width: 10, height: 10, outline: [] }, 'invalid-geometry', '1 to 64'],
    [
      'path data outside the grammar',
      { width: 10, height: 10, outline: [{ kind: 'path', d: 'M0 0 X5 5' }] },
      'invalid-geometry',
      'Contour 1',
    ],
    [
      'a contour that draws nothing',
      { width: 10, height: 10, outline: [{ kind: 'path', d: 'M0 0 L10 0' }] },
      'invalid-geometry',
      'draws nothing',
    ],
    [
      'an outline that leaves its box',
      { width: 10, height: 10, outline: [{ kind: 'polygon', points: '0,0 20,0 0,10' }] },
      'invalid-geometry',
      'leaves its box',
    ],
    [
      'a curve that leaves its box though its ends do not',
      { width: 10, height: 10, outline: [{ kind: 'path', d: 'M0 5 C0 -10 10 -10 10 5 Z' }] },
      'invalid-geometry',
      'leaves its box',
    ],
    [
      'a polygon of two points',
      { width: 10, height: 10, outline: [{ kind: 'polygon', points: '0,0 10,10' }] },
      'invalid-geometry',
      'three points',
    ],
    [
      'an ellipse of no radius',
      { width: 10, height: 10, outline: [{ kind: 'ellipse', cx: 5, cy: 5, rx: 0, ry: 1 }] },
      'invalid-geometry',
      'above 0',
    ],
    [
      'a label outside the box',
      {
        width: 10,
        height: 10,
        outline: [{ kind: 'ellipse', cx: 5, cy: 5, rx: 5, ry: 5 }],
        label: { x: 5, y: 5, width: 10, height: 1 },
      },
      'invalid-geometry',
      'label area',
    ],
  ])('refuses %s', (_what, geometry, code, words) => {
    const read = readGeometry(geometry);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.code).toBe(code);
    expect(!read.ok && read.message).toContain(words);
  });

  it('refuses past each cap, before reading further', () => {
    const ellipse = { kind: 'ellipse', cx: 5, cy: 5, rx: 1, ry: 1 } as const;
    const contours = readGeometry({
      width: 10,
      height: 10,
      outline: Array.from({ length: 65 }, () => ellipse),
    });
    expect(!contours.ok && contours.code).toBe('geometry-too-large');
    const points = Array.from({ length: GEOMETRY_CAPS.segments + 1 }, (_, at) => {
      const angle = (2 * Math.PI * at) / (GEOMETRY_CAPS.segments + 1);
      return `${5 + 4 * Math.cos(angle)},${5 + 4 * Math.sin(angle)}`;
    }).join(' ');
    const segments = readGeometry({
      width: 10,
      height: 10,
      outline: [{ kind: 'polygon', points }],
    });
    expect(!segments.ok && segments.code).toBe('geometry-too-large');
    const text = readGeometry({
      width: 10,
      height: 10,
      outline: [{ kind: 'path', d: `M0 0 L10 0 L10 10 Z${' '.repeat(GEOMETRY_CAPS.text)}` }],
    });
    expect(!text.ok && text.code).toBe('geometry-too-large');
  });
});

describe('a fitted outline', () => {
  it('stretches to its rectangle, or keeps its proportions centred in it', () => {
    const heart = outlineOf(HEART);
    const kept = fitOutline(heart, 240, 110);
    expect(kept.scaleX).toBe(1);
    expect(kept.offsetX).toBe(60);
    const stretched = fitOutline(outlineOf({ ...HEART, keepProportions: false }), 240, 110);
    expect(stretched.scaleX).toBe(2);
    expect(stretched.offsetX).toBe(0);
    expect(fitOutline(heart, 240, 110)).toBe(kept);
  });

  it('places a connection point where its side, carried straight in, meets the outline', () => {
    const circle = outlineOf({
      width: 100,
      height: 100,
      outline: [{ kind: 'ellipse', cx: 50, cy: 50, rx: 50, ry: 50 }],
    });
    const fitted = fitOutline(circle, 100, 100);
    const top = outlinePlace(fitted, 'top', 0.5);
    expect(top.point.x).toBeCloseTo(50, 6);
    expect(top.point.y).toBeCloseTo(0, 0);
    expect(top.outward).toEqual({ x: -0, y: -1 });
    const left = outlinePlace(fitted, 'left', 0.3);
    // At 30% down the left side, the circle is reached at x = 50 − √(50² − 20²).
    expect(left.point.x).toBeCloseTo(50 - Math.sqrt(2500 - 400), 0);
    // A place whose line misses the outline takes the outline's point nearest it.
    const corner = outlinePlace(fitted, 'top', 0);
    expect(Math.hypot(corner.point.x - 50, corner.point.y - 50)).toBeCloseTo(50, 0);
  });

  it('writes its name in its own label area, or in a rectangle it holds around a point well inside it', () => {
    const heart = fitOutline(outlineOf(HEART), 120, 110);
    expect(outlineLabelArea(heart)).toEqual({ x: 24, y: 30, width: 72, height: 36 });
    const unlabelled = fitOutline(outlineOf({ ...HEART, label: undefined }), 120, 110);
    const area = outlineLabelArea(unlabelled);
    expect(area.width).toBeGreaterThan(20);
    expect(area.width / area.height).toBeLessThanOrEqual(4 + 1e-9);
    for (const corner of [
      { x: area.x, y: area.y },
      { x: area.x + area.width, y: area.y + area.height },
    ]) {
      expect(outlineHolds(unlabelled, corner)).toBe(true);
    }
    expect(outlineHolds(unlabelled, outlineInnerPoint(unlabelled))).toBe(true);
  });

  it('simplifies each fill to at most 32 points for drawing far out, leaving holes out', () => {
    const ring = fitOutline(
      outlineOf({
        width: 100,
        height: 100,
        outline: [
          { kind: 'ellipse', cx: 50, cy: 50, rx: 50, ry: 50 },
          { kind: 'ellipse', cx: 50, cy: 50, rx: 20, ry: 20 },
        ],
      }),
      1000,
      1000,
    );
    const simplified = simplifyOutline(ring);
    expect(simplified).toHaveLength(1);
    expect((simplified[0] as Float64Array).length / 2).toBeLessThanOrEqual(32);
  });
});

/** Free geometry made at random: star polygons, ellipses and cubic paths in a box of 100 by 100, a hole sometimes. */
const geometry: fc.Arbitrary<GeometryInput> = fc
  .tuple(
    fc.array(fc.double({ min: 8, max: 48, noNaN: true }), { minLength: 3, maxLength: 12 }),
    fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
    fc.boolean(),
    fc.boolean(),
    fc.double({ min: 0.5, max: 1.5, noNaN: true }),
  )
  .map(([radii, turn, curved, hole, bulge]) => {
    const points = radii.map((radius, at) => {
      const angle = turn + (2 * Math.PI * at) / radii.length;
      return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
    });
    let d = `M${points[0]?.x} ${points[0]?.y}`;
    for (let at = 1; at <= points.length; at += 1) {
      const to = points[at % points.length] as { x: number; y: number };
      const from = points[at - 1] as { x: number; y: number };
      if (curved) {
        // Control points pulled toward the centre keep the curve inside the box.
        const pull = (p: { x: number; y: number }) => ({
          x: 50 + (p.x - 50) * bulge * 0.6,
          y: 50 + (p.y - 50) * bulge * 0.6,
        });
        const c1 = pull(from);
        const c2 = pull(to);
        d += ` C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
      } else d += ` L${to.x} ${to.y}`;
    }
    d += ' Z';
    return {
      width: 100,
      height: 100,
      outline: [
        { kind: 'path', d },
        ...(hole ? [{ kind: 'ellipse' as const, cx: 50, cy: 50, rx: 4, ry: 6 }] : []),
      ],
    };
  });

/** A reference reading of a fitted outline, flattened far finer than the canvas's quarter unit. */
function fine(fitted: FittedOutline): FlatContour[] {
  return fitted.contours.map((contour) => flatten(contour, 0.002, 4096));
}

function fineHolds(flat: readonly FlatContour[], x: number, y: number): boolean {
  let inside = false;
  for (const contour of flat) if (evenOddHolds(contour.points, x, y)) inside = !inside;
  return inside;
}

const size = fc.tuple(fc.integer({ min: 20, max: 400 }), fc.integer({ min: 20, max: 400 }));

describe('the outline maths, under random geometry', () => {
  it('holds a point exactly when a much finer flattening holds it, but within a quarter unit of the edge', () => {
    fc.assert(
      fc.property(
        geometry,
        size,
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 1, noNaN: true }),
            fc.double({ min: 0, max: 1, noNaN: true }),
          ),
          {
            minLength: 20,
            maxLength: 40,
          },
        ),
        (input, [width, height], places) => {
          const fitted = fitOutline(outlineOf(input), width, height);
          const reference = fine(fitted);
          for (const [u, v] of places) {
            const point = { x: u * width, y: v * height };
            if (distanceToEdges(reference, point, 1) <= 0.25) continue;
            expect(outlineHolds(fitted, point)).toBe(fineHolds(reference, point.x, point.y));
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('finds a last exit on the outline, after which no point of its ray is inside', () => {
    fc.assert(
      fc.property(
        geometry,
        size,
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        (input, [width, height], angle) => {
          const fitted = fitOutline(outlineOf(input), width, height);
          const from = outlineInnerPoint(fitted);
          const toward = {
            x: from.x + Math.cos(angle) * (width + height),
            y: from.y + Math.sin(angle) * (width + height),
          };
          const exit = outlineExit(fitted, from, toward);
          expect(exit).toBeDefined();
          if (!exit) return;
          const reference = fine(fitted);
          expect(distanceToEdges(reference, exit, 1)).toBeLessThanOrEqual(0.3);
          const length = Math.hypot(toward.x - from.x, toward.y - from.y);
          const unit = { x: (toward.x - from.x) / length, y: (toward.y - from.y) / length };
          for (const beyond of [0.5, 1, 5, 20, width + height]) {
            const point = { x: exit.x + unit.x * beyond, y: exit.y + unit.y * beyond };
            if (distanceToEdges(reference, point, 1) <= 0.25) continue;
            expect(fineHolds(reference, point.x, point.y)).toBe(false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('reads its normalized path data again into the same outline', () => {
    fc.assert(
      fc.property(geometry, (input) => {
        const outline = outlineOf(input);
        const again = outlineOf({
          width: outline.width,
          height: outline.height,
          outline: [{ kind: 'path', d: outlinePathData(outline.contours) }],
        });
        expect(again.contours).toEqual(outline.contours);
      }),
      { numRuns: 150 },
    );
  });
});

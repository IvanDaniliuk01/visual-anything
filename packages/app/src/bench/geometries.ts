/**
 * The free geometry of the benchmark's "geometry" variant (ADR 0066): 20 distinct geometries, one for
 * each of 20 components, 4 of them at the core's caps, each in its own way:
 * 0. 2,000 segments, in one jagged closed contour;
 * 1. 64 contours: a rounded box with 63 holes;
 * 2. 32 KiB of path data, in one contour of cubic Bézier segments written with many decimals;
 * 3. all three caps at once: 64 contours, 2,000 segments and nearly 32 KiB.
 * The other 16 are what people draw: hearts, stars, rings, blobs, clouds, arrows and frames, some
 * keeping their proportions and some writing their names in a label area.
 *
 * Every number is the same every time.
 */
import { GEOMETRY_CAPS } from '@visual-anything/core';
import type { FreeGeometry, GeometryContour } from '@visual-anything/schema';

/** How many geometries there are, how many sit at the caps, and the size of their box. */
export const BENCH_GEOMETRY = { count: 20, atCaps: 4, width: 160, height: 80 } as const;

const { width: W, height: H } = BENCH_GEOMETRY;

let made: FreeGeometry[] | undefined;

/** The 20 geometries, made once: they are the same every time. */
export function benchGeometries(): readonly FreeGeometry[] {
  made ??= makeGeometries();
  return made;
}

function makeGeometries(): FreeGeometry[] {
  const geometries = [manySegments(), manyContours(), muchText(), everyCap()];
  for (let at = BENCH_GEOMETRY.atCaps; at < BENCH_GEOMETRY.count; at++) {
    geometries.push(drawn(at));
  }
  return geometries;
}

/** A number written with at most `digits` decimals, as path data holds it. */
function n(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

/** Points around an ellipse in the box's middle, their distance from it waving `waves` times. */
function wavy(count: number, rx: number, ry: number, waves: number, depth: number) {
  return Array.from({ length: count }, (_, at) => {
    const angle = (at / count) * Math.PI * 2;
    const swell = 1 - depth + depth * Math.cos(angle * waves);
    return { x: W / 2 + Math.cos(angle) * rx * swell, y: H / 2 + Math.sin(angle) * ry * swell };
  });
}

/** Path data through points, a move and lines, closed: as many commands as points, and one more. */
function linesThrough(points: readonly { x: number; y: number }[], digits = 2): string {
  const [first, ...rest] = points as [{ x: number; y: number }, ...{ x: number; y: number }[]];
  return `M${n(first.x, digits)} ${n(first.y, digits)}${rest.map((point) => `L${n(point.x, digits)} ${n(point.y, digits)}`).join('')}Z`;
}

/** At the cap on segments: a gear of 1,999 corners, written as a move, 1,998 lines and a close. */
function manySegments(): FreeGeometry {
  const corners = GEOMETRY_CAPS.segments - 1;
  const points = Array.from({ length: corners }, (_, at) => {
    const angle = (at / corners) * Math.PI * 2;
    const tooth = at % 2 === 0 ? 1 : 0.94;
    return { x: W / 2 + Math.cos(angle) * 78 * tooth, y: H / 2 + Math.sin(angle) * 38 * tooth };
  });
  return { width: W, height: H, outline: [{ kind: 'path', d: linesThrough(points) }] };
}

/** At the cap on contours: a rounded box with 63 holes, nine by seven. */
function manyContours(): FreeGeometry {
  const outline: GeometryContour[] = [
    {
      kind: 'path',
      d: 'M8 0H152A8 8 0 0 1 160 8V72A8 8 0 0 1 152 80H8A8 8 0 0 1 0 72V8A8 8 0 0 1 8 0Z',
    },
  ];
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 9; column++) {
      outline.push({ kind: 'ellipse', cx: 16 + column * 16, cy: 10 + row * 10, rx: 5, ry: 3.5 });
    }
  }
  return { width: W, height: H, outline };
}

/**
 * At the cap on text: one contour of cubic Bézier segments through points around a wavy ellipse,
 * their numbers written with four decimals: the most pieces whose path data fits in 32 KiB.
 */
function muchText(): FreeGeometry {
  for (let pieces = 720; pieces > 0; pieces--) {
    const d = curvesThrough(pieces);
    if (d.length <= GEOMETRY_CAPS.text) {
      return {
        width: W,
        height: H,
        label: { x: 40, y: 24, width: 80, height: 32 },
        outline: [{ kind: 'path', d }],
      };
    }
  }
  throw new Error('The benchmark geometry at the cap on text does not fit it.');
}

/** A closed contour of `pieces` cubic Bézier segments around a wavy ellipse, with four decimals. */
function curvesThrough(pieces: number): string {
  const points = wavy(pieces, 70, 32, 7, 0.08);
  const at = (index: number) => points[(index + pieces) % pieces] as { x: number; y: number };
  // Control points along the tangent, as Catmull and Rom's spline places them.
  const control = (index: number, sign: 1 | -1) => {
    const here = at(index);
    const before = at(index - 1);
    const after = at(index + 1);
    return {
      x: here.x + (sign * (after.x - before.x)) / 6,
      y: here.y + (sign * (after.y - before.y)) / 6,
    };
  };
  const first = at(0);
  let d = `M${n(first.x, 4)} ${n(first.y, 4)}`;
  for (let index = 0; index < pieces; index++) {
    const c1 = control(index, 1);
    const c2 = control(index + 1, -1);
    const to = at(index + 1);
    d += `C${n(c1.x, 4)} ${n(c1.y, 4)} ${n(c2.x, 4)} ${n(c2.y, 4)} ${n(to.x, 4)} ${n(to.y, 4)}`;
  }
  return `${d}Z`;
}

/**
 * At every cap at once: a wavy outline of 488 commands and 63 holes of 24 points each, 64 contours
 * and 2,000 segments in all, their numbers written with as many decimals as fit in 32 KiB.
 */
function everyCap(): FreeGeometry {
  const holes = GEOMETRY_CAPS.contours - 1;
  const holePoints = 24;
  const outer = GEOMETRY_CAPS.segments - holes * holePoints - 1;
  for (let digits = 4; digits >= 1; digits--) {
    const outline: GeometryContour[] = [
      { kind: 'path', d: linesThrough(wavy(outer, 79, 39, 9, 0.03), digits) },
    ];
    for (let hole = 0; hole < holes; hole++) {
      const cx = 36 + (hole % 9) * 11;
      const cy = 19 + Math.floor(hole / 9) * 7;
      const points = Array.from({ length: holePoints }, (_, at) => {
        const angle = (at / holePoints) * Math.PI * 2 + hole;
        return `${n(cx + Math.cos(angle) * 2.5, digits)},${n(cy + Math.sin(angle) * 2.5, digits)}`;
      });
      outline.push({ kind: 'polygon', points: points.join(' ') });
    }
    const geometry: FreeGeometry = { width: W, height: H, outline };
    if (textOf(geometry) <= GEOMETRY_CAPS.text) return geometry;
  }
  throw new Error('The benchmark geometry at every cap does not fit its text.');
}

/** The characters of path data and points a geometry holds, as the core counts them. */
function textOf(geometry: FreeGeometry): number {
  return geometry.outline.reduce(
    (sum, contour) =>
      sum +
      (contour.kind === 'path'
        ? contour.d.length
        : contour.kind === 'polygon'
          ? contour.points.length
          : 0),
    0,
  );
}

/** The heart of ADR 0066's example, in its own box, keeping its proportions. */
const HEART =
  'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z';

/** One of the 16 ordinary geometries, each of its own. */
function drawn(at: number): FreeGeometry {
  const kind = at % 8;
  const variant = Math.floor(at / 8);
  switch (kind) {
    case 0:
      return {
        width: 120,
        height: 110 + variant * 6,
        keepProportions: true,
        label: { x: 24, y: 30 + variant * 2, width: 72, height: 36 },
        outline: [{ kind: 'path', d: HEART }],
      };
    case 1: {
      // A star of 5 to 7 points.
      const tips = 5 + variant;
      const points = Array.from({ length: tips * 2 }, (_, index) => {
        const angle = (index / (tips * 2)) * Math.PI * 2 - Math.PI / 2;
        const reach = index % 2 === 0 ? 1 : 0.5;
        return `${n(W / 2 + Math.cos(angle) * 78 * reach)},${n(H / 2 + Math.sin(angle) * 39 * reach)}`;
      });
      return { width: W, height: H, outline: [{ kind: 'polygon', points: points.join(' ') }] };
    }
    case 2:
      // A ring: an ellipse with a hole off its middle.
      return {
        width: W,
        height: H,
        label: { x: 20, y: 30, width: 50, height: 20 },
        outline: [
          { kind: 'ellipse', cx: 80, cy: 40, rx: 79, ry: 39 },
          { kind: 'ellipse', cx: 104 + variant * 4, cy: 40, rx: 30, ry: 22 },
        ],
      };
    case 3:
      // A blob of cubic lobes.
      return {
        width: W,
        height: H,
        outline: [{ kind: 'path', d: lobes(6 + variant * 2) }],
      };
    case 4:
      // A cloud of arcs, each bulging out from the chord between two of its points.
      return {
        width: W,
        height: H,
        outline: [
          {
            kind: 'path',
            d: cloud([
              { x: 20, y: 70 },
              { x: 24, y: 38 },
              { x: 64, y: 20 },
              { x: 110 - variant * 6, y: 24 },
              { x: 140, y: 46 },
              { x: 132, y: 70 },
            ]),
          },
        ],
      };
    case 5:
      // An arrow pointing right, with relative commands.
      return {
        width: W,
        height: H,
        outline: [
          {
            kind: 'path',
            d: `m0 ${24 - variant * 4}h${100 + variant * 8}V0l${60 - variant * 8} 40-${60 - variant * 8} 40V${56 + variant * 4}H0z`,
          },
        ],
      };
    case 6:
      // A frame: a hexagon with a hexagon hole.
      return {
        width: W,
        height: H,
        keepProportions: variant === 1,
        outline: [
          { kind: 'polygon', points: '40,0 120,0 160,40 120,80 40,80 0,40' },
          { kind: 'polygon', points: '56,20 104,20 124,40 104,60 56,60 36,40' },
        ],
      };
    default:
      // A rounded shape of quadratic curves.
      return {
        width: W,
        height: H,
        outline: [
          {
            kind: 'path',
            d: `M20 0H140Q160 0 160 ${20 + variant * 6}V60Q160 80 140 80H20Q0 80 0 60V20Q0 0 20 0Z`,
          },
        ],
      };
  }
}

/**
 * Arcs from each point to the next, running clockwise, each of a radius 0.6 times its chord, so that
 * it bulges out by about a quarter of its chord; closed by a line back to the first point.
 */
function cloud(points: readonly { x: number; y: number }[]): string {
  const [first, ...rest] = points as [{ x: number; y: number }, ...{ x: number; y: number }[]];
  let from = first;
  let d = `M${n(from.x)} ${n(from.y)}`;
  for (const to of rest) {
    const radius = n(Math.hypot(to.x - from.x, to.y - from.y) * 0.6);
    d += `A${radius} ${radius} 0 0 1 ${n(to.x)} ${n(to.y)}`;
    from = to;
  }
  return `${d}Z`;
}

/** A closed blob of `count` cubic lobes around the box's middle. */
function lobes(count: number): string {
  const points = wavy(count * 2, 74, 34, count, 0.12);
  const [first] = points as [{ x: number; y: number }];
  let d = `M${n(first.x)} ${n(first.y)}`;
  for (let index = 0; index < points.length; index++) {
    const to = points[(index + 1) % points.length] as { x: number; y: number };
    const from = points[index] as { x: number; y: number };
    const bulge = index % 2 === 0 ? 1.06 : 0.98;
    const mid = (value: number, centre: number) => centre + (value - centre) * bulge;
    d += `C${n(mid(from.x, W / 2))} ${n(mid(from.y, H / 2))} ${n(mid(to.x, W / 2))} ${n(mid(to.y, H / 2))} ${n(to.x)} ${n(to.y)}`;
  }
  return `${d}Z`;
}

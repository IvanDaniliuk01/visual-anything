/**
 * A named part's outline, or a whole picture's, written as free geometry (ADR 0066, ADR 0067), as the
 * component editor and Claude copy an outline: path contours in a box of the part's bounds, keeping
 * proportions, within free geometry's caps and simplified to fit. Free geometry is read by the even-odd
 * rule over all its contours, so what is written is the boundary of what the part covers:
 *
 * - its contours as they are, curves and all, when no two of them cross, without those that bound
 *   nothing, such as a shape drawn wholly over another;
 * - otherwise, and for strokes, whose bands become polygons, the loops around what its fills and bands
 *   cover together, flattened.
 */
import { flatten } from '../geometry/fit';
import {
  GEOMETRY_CAPS,
  readGeometry,
  type Box,
  type GeometryInput,
  type Outline,
  type OutlineContour,
} from '../geometry/outline';
import { rankPolyline, simplifyToBudget } from '../geometry/simplify';
import { fillBoundary, type FillPolygon } from '../geometry/union';

/** Free geometry for an outline whose bounds are given; `undefined` when nothing of it can be written. */
export function geometryFromOutline(outline: Outline, bounds: Box): GeometryInput | undefined {
  const largest = Math.max(bounds.width, bounds.height);
  if (!(largest > 0) || !Number.isFinite(largest)) return undefined;
  // In the part's own units, unless those are past free geometry's box or too small to write well.
  const scale =
    largest > GEOMETRY_CAPS.box ? GEOMETRY_CAPS.box / largest : largest < 1 ? 100 / largest : 1;
  const writer = new Writer(bounds, scale);
  const tolerance = largest / 2000;
  const closed = outline.contours.filter((contour) => contour.role !== 'line');
  const lines = outline.contours.filter(
    (contour) => contour.role === 'line' && (contour.width ?? 0) > 0,
  );
  const polygons: FillPolygon[] = closed.map((contour) => ({
    points: ring(flatten(contour, tolerance).points),
    group: contour.group ?? 0,
    nonzero: contour.nonzero === true,
  }));
  if (lines.length === 0) {
    const boundary = fillBoundary(polygons);
    if (!boundary.crossing) {
      const kept = closed.filter((_, at) => boundary.bounding[at]);
      return (
        writer.curves(kept) ??
        writer.polylines(kept.map((contour) => flatten(contour, tolerance).points))
      );
    }
    return writer.polylines(boundary.loops.map(closedRing));
  }
  const group = Math.max(-1, ...polygons.map((polygon) => polygon.group)) + 1;
  for (const line of lines) polygons.push(...band(line, tolerance, group));
  const boundary = fillBoundary(polygons);
  const loops = boundary.crossing
    ? boundary.loops
    : polygons.filter((_, at) => boundary.bounding[at]).map((polygon) => polygon.points);
  return writer.polylines(loops.map(closedRing));
}

/** A closed contour's flattened points without its first point repeated at its end. */
function ring(points: Float64Array): Float64Array {
  const count = points.length / 2;
  if (count > 1 && points[0] === points[2 * count - 2] && points[1] === points[2 * count - 1]) {
    return points.slice(0, 2 * count - 2);
  }
  return points;
}

/** A ring with its first point repeated at its end, as simplification takes a closed polyline. */
function closedRing(points: Float64Array): Float64Array {
  const out = new Float64Array(points.length + 2);
  out.set(points);
  out[points.length] = points[0] as number;
  out[points.length + 1] = points[1] as number;
  return out;
}

/**
 * The band a line holds, as polygons of one fill read by the nonzero rule, all run the same way so
 * that they join: a rectangle along each piece of the line and an octagon around each of its points,
 * for its round ends and joins.
 */
function band(line: OutlineContour, tolerance: number, group: number): FillPolygon[] {
  const half = (line.width ?? 0) / 2;
  const points = flatten({ ...line, width: undefined }, tolerance).points;
  const count = points.length / 2;
  const polygons: FillPolygon[] = [];
  const radius = half / Math.cos(Math.PI / 8);
  for (let i = 0; i < count; i += 1) {
    const x = points[2 * i] as number;
    const y = points[2 * i + 1] as number;
    const octagon = new Float64Array(16);
    for (let k = 0; k < 8; k += 1) {
      const angle = Math.PI / 8 - (k * Math.PI) / 4;
      octagon[2 * k] = x + radius * Math.cos(angle);
      octagon[2 * k + 1] = y + radius * Math.sin(angle);
    }
    polygons.push({ points: octagon, group, nonzero: true });
    if (i + 1 === count) continue;
    const nx0 = points[2 * i + 2] as number;
    const ny0 = points[2 * i + 3] as number;
    const length = Math.hypot(nx0 - x, ny0 - y);
    if (!(length > 0)) continue;
    const nx = (-(ny0 - y) / length) * half;
    const ny = ((nx0 - x) / length) * half;
    polygons.push({
      points: Float64Array.from([
        x + nx,
        y + ny,
        nx0 + nx,
        ny0 + ny,
        nx0 - nx,
        ny0 - ny,
        x - nx,
        y - ny,
      ]),
      group,
      nonzero: true,
    });
  }
  return polygons;
}

/** Writes contours as path data in the geometry's box, in whole steps of its precision. */
class Writer {
  readonly unit: number;
  readonly decimals: number;
  /** The box, in steps. */
  readonly width: number;
  readonly height: number;

  constructor(
    readonly bounds: Box,
    readonly scale: number,
  ) {
    const largest = Math.max(bounds.width, bounds.height) * scale;
    // About 1/20,000 of the box, well within the 1/1,000 of its diagonal free geometry allows.
    this.decimals = Math.max(0, Math.min(6, Math.ceil(Math.log10(20_000 / largest))));
    this.unit = 10 ** this.decimals;
    this.width = Math.max(1, Math.ceil(bounds.width * scale * this.unit - 1e-6));
    this.height = Math.max(1, Math.ceil(bounds.height * scale * this.unit - 1e-6));
  }

  x(value: number, clamp: boolean): number {
    const steps = Math.round((value - this.bounds.x) * this.scale * this.unit);
    return clamp ? Math.max(0, Math.min(this.width, steps)) : steps;
  }

  y(value: number, clamp: boolean): number {
    const steps = Math.round((value - this.bounds.y) * this.scale * this.unit);
    return clamp ? Math.max(0, Math.min(this.height, steps)) : steps;
  }

  /** A number of steps as a decimal, written shortest. */
  text(steps: number): string {
    if (this.decimals === 0) return String(steps);
    const sign = steps < 0 ? '-' : '';
    const digits = String(Math.abs(steps)).padStart(this.decimals + 1, '0');
    const whole = digits.slice(0, digits.length - this.decimals);
    const fraction = digits.slice(digits.length - this.decimals).replace(/0+$/, '');
    return `${sign}${whole}${fraction === '' ? '' : `.${fraction}`}`;
  }

  geometry(paths: readonly string[]): GeometryInput | undefined {
    if (paths.length === 0) return undefined;
    const geometry: GeometryInput = {
      width: this.width / this.unit,
      height: this.height / this.unit,
      keepProportions: true,
      outline: paths.map((d) => ({ kind: 'path', d })),
    };
    return readGeometry(geometry).ok ? geometry : undefined;
  }

  /** The contours with their curves, when they fit free geometry's caps as they are. */
  curves(contours: readonly OutlineContour[]): GeometryInput | undefined {
    if (contours.length === 0 || contours.length > GEOMETRY_CAPS.contours) return undefined;
    let commands = 0;
    let characters = 0;
    const paths: string[] = [];
    const at = (point: { x: number; y: number }) =>
      `${this.text(this.x(point.x, false))} ${this.text(this.y(point.y, false))}`;
    for (const contour of contours) {
      commands += contour.segments.length + 2;
      if (commands > GEOMETRY_CAPS.segments) return undefined;
      const parts = [`M${at(contour.start)}`];
      for (const segment of contour.segments) {
        parts.push(
          segment.kind === 'line'
            ? `L${at(segment.to)}`
            : `C${at(segment.c1)} ${at(segment.c2)} ${at(segment.to)}`,
        );
      }
      parts.push('Z');
      const d = parts.join('');
      characters += d.length;
      if (characters > GEOMETRY_CAPS.text) return undefined;
      paths.push(d);
    }
    return this.geometry(paths);
  }

  /**
   * Closed polylines, each its first point repeated at its end: the 64 largest, simplified together
   * until their segments and their text fit free geometry's caps.
   */
  polylines(rings: readonly Float64Array[]): GeometryInput | undefined {
    const largest = rings
      .map((points) => ({ points, area: Math.abs(area(points)) }))
      .filter((each) => each.area > 0)
      .sort((a, b) => b.area - a.area)
      .slice(0, GEOMETRY_CAPS.contours)
      .map((each) => rankPolyline(each.points, true));
    // A ring of k points with its first repeated is k + 1 commands: its move, k - 1 lines and its close.
    let budget: number = GEOMETRY_CAPS.segments;
    for (let attempt = 0; attempt < 16 && budget >= 4; attempt += 1) {
      const kept = simplifyToBudget(largest, budget);
      const paths = kept.flatMap((points) => {
        const d = points === undefined ? undefined : this.ring(points);
        return d === undefined ? [] : [d];
      });
      const characters = paths.reduce((sum, d) => sum + d.length, 0);
      if (characters <= GEOMETRY_CAPS.text) {
        const geometry = this.geometry(paths);
        if (geometry) return geometry;
      }
      budget = Math.floor(
        budget * Math.min(0.9, (0.95 * GEOMETRY_CAPS.text) / Math.max(1, characters)),
      );
    }
    return undefined;
  }

  /** A closed polyline as path data: a move, relative lines and a close; none when it collapses. */
  ring(points: Float64Array): string | undefined {
    const count = points.length / 2 - 1;
    if (count < 3) return undefined;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < count; i += 1) {
      xs.push(this.x(points[2 * i] as number, true));
      ys.push(this.y(points[2 * i + 1] as number, true));
    }
    if (Math.max(...xs) === Math.min(...xs) || Math.max(...ys) === Math.min(...ys))
      return undefined;
    const steps: string[] = [];
    for (let i = 1; i < count; i += 1) {
      steps.push(
        `${this.text((xs[i] as number) - (xs[i - 1] as number))} ${this.text((ys[i] as number) - (ys[i - 1] as number))}`,
      );
    }
    return `M${this.text(xs[0] as number)} ${this.text(ys[0] as number)}l${steps.join(' ')}z`;
  }
}

/** The signed area of a polyline closed on itself, as x, y pairs. */
function area(points: Float64Array): number {
  let sum = 0;
  const count = points.length / 2;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    sum +=
      (points[2 * i] as number) * (points[2 * j + 1] as number) -
      (points[2 * j] as number) * (points[2 * i + 1] as number);
  }
  return sum / 2;
}

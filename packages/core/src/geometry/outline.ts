/**
 * Free geometry read into a normalized outline (ADR 0066): contours of absolute moves, lines and
 * cubics, each a fill, a hole cut from what holds it, or a line drawn with a stroke only, with the
 * bounds of the curves themselves. Reading checks the grammar, the caps and the box, and stops at a
 * cap before the work grows past it.
 */
import type { Point } from '@visual-anything/schema';
import { readPathData, readPolygonPoints, type Segment } from './path';

/** A rectangle, in the units of what it is measured on. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One contour of free geometry, as an appearance writes it. */
export type GeometryContour =
  | { kind: 'path'; d: string }
  | { kind: 'polygon'; points: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

/** Free geometry, as an appearance writes it: the box its coordinates are written in, and its contours. */
export interface GeometryInput {
  width: number;
  height: number;
  outline: readonly GeometryContour[];
  keepProportions?: boolean;
  label?: Box;
}

/** One contour of an outline: where it starts, its pieces, and what it is. */
export interface OutlineContour {
  start: Point;
  segments: readonly Segment[];
  /** A fill, a hole cut from the fill around it, or a line drawn with a stroke only. */
  role: 'fill' | 'hole' | 'line';
}

/** Free geometry read once, which every reading of a shape's outline starts from. */
export interface Outline {
  /** The box its coordinates are written in. */
  width: number;
  height: number;
  contours: readonly OutlineContour[];
  /** The bounds of its curves, in the box's coordinates. */
  bounds: Box;
  keepProportions: boolean;
  /** Where its shapes write their name and detail, in the box's coordinates. */
  label?: Box;
}

/** The caps on one geometry (ADR 0066). */
export const GEOMETRY_CAPS = {
  contours: 64,
  /** Path commands, implicit repeats included, a polygon's points, and four for an ellipse. */
  segments: 2000,
  /** Characters of path data and points together. */
  text: 32 * 1024,
  /** The largest width or height of a geometry's box. */
  box: 100_000,
} as const;

/** The caps on files: geometry text in one package, and in a model's elements' own appearances. */
export const GEOMETRY_FILE_CAPS = {
  package: 1024 * 1024,
  packageWarning: 512 * 1024,
  model: 2 * 1024 * 1024,
  modelWarning: 1024 * 1024,
} as const;

/** What reading a geometry gives, or why it is not one. */
export type GeometryRead =
  | { ok: true; outline: Outline }
  | { ok: false; code: 'invalid-geometry' | 'geometry-too-large'; message: string };

const cache = new WeakMap<object, GeometryRead>();

/** Reads free geometry into its outline, once for each geometry object. */
export function readGeometry(geometry: GeometryInput): GeometryRead {
  const cached = cache.get(geometry);
  if (cached) return cached;
  const read = readUncached(geometry);
  cache.set(geometry, read);
  return read;
}

/** The characters of path data and points a geometry holds, as the caps on files count them. */
export function geometryText(geometry: GeometryInput): number {
  let total = 0;
  for (const contour of contoursOf(geometry.outline)) {
    if (contour?.kind === 'path' && typeof contour.d === 'string') total += contour.d.length;
    if (contour?.kind === 'polygon' && typeof contour.points === 'string') {
      total += contour.points.length;
    }
  }
  return total;
}

/** A contour as a file may hold it: any of its parts may be missing or of the wrong kind. */
type LooseContour = Partial<
  Record<'kind' | 'd' | 'points' | 'cx' | 'cy' | 'rx' | 'ry', unknown>
> | null;

/** An outline's contours as they may be, whatever the outline holds. */
function contoursOf(outline: unknown): readonly LooseContour[] {
  if (!Array.isArray(outline)) return [];
  return (outline as readonly unknown[]).map((contour) =>
    typeof contour === 'object' && contour !== null ? (contour as LooseContour) : null,
  );
}

function invalid(message: string): GeometryRead {
  return { ok: false, code: 'invalid-geometry', message };
}

function tooLarge(message: string): GeometryRead {
  return { ok: false, code: 'geometry-too-large', message };
}

function readUncached(geometry: GeometryInput): GeometryRead {
  if (typeof geometry !== 'object' || geometry === null) {
    return invalid('Free geometry is an object with a width, a height and an outline.');
  }
  const { width, height, outline, keepProportions, label } = geometry;
  for (const [name, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return invalid(`The ${name} of free geometry is a number above 0.`);
    }
    if (value > GEOMETRY_CAPS.box) {
      return tooLarge(
        `The ${name} of free geometry is at most ${GEOMETRY_CAPS.box.toLocaleString('en')}.`,
      );
    }
  }
  if (!Array.isArray(outline) || outline.length === 0) {
    return invalid('The outline of free geometry holds 1 to 64 contours.');
  }
  if (outline.length > GEOMETRY_CAPS.contours) {
    return tooLarge(
      `The outline of free geometry holds at most ${GEOMETRY_CAPS.contours} contours, not ${outline.length}.`,
    );
  }
  if (keepProportions !== undefined && typeof keepProportions !== 'boolean') {
    return invalid('Keep proportions is true or false.');
  }
  const text = geometryText(geometry);
  if (text > GEOMETRY_CAPS.text) {
    return tooLarge(
      `Free geometry holds at most ${GEOMETRY_CAPS.text.toLocaleString('en')} characters of path data and points, not ${text.toLocaleString('en')}.`,
    );
  }
  const contours: { start: Point; segments: Segment[]; role: 'fill' | 'line' }[] = [];
  let segments = 0;
  for (const [at, contour] of contoursOf(outline).entries()) {
    const which = `Contour ${at + 1}`;
    const left = GEOMETRY_CAPS.segments - segments;
    if (contour === null) {
      return invalid(`${which} of free geometry is a path, a polygon or an ellipse.`);
    }
    if (contour.kind === 'path') {
      if (typeof contour.d !== 'string') return invalid(`${which} has no path data, d.`);
      const read = readPathData(contour.d, left);
      if (!read.ok) {
        if (read.reason === 'too many commands') return tooManySegments();
        return invalid(`${which}: ${read.reason}`);
      }
      segments += read.commands;
      for (const subpath of read.subpaths) {
        // Every subpath closes, whether or not it was written with Z.
        contours.push({
          start: subpath.start,
          segments: closed(subpath.start, subpath.segments),
          role: 'fill',
        });
      }
    } else if (contour.kind === 'polygon') {
      if (typeof contour.points !== 'string') return invalid(`${which} has no points.`);
      const read = readPolygonPoints(contour.points, left);
      if (!read.ok) {
        if (read.reason === 'too many points') return tooManySegments();
        return invalid(`${which}: ${read.reason}`);
      }
      if (read.points.length < 3) return invalid(`${which}: a polygon has three points or more.`);
      segments += read.points.length;
      const [first, ...rest] = read.points as [Point, ...Point[]];
      contours.push({
        start: first,
        segments: closed(
          first,
          rest.map((to) => ({ kind: 'line', to })),
        ),
        role: 'fill',
      });
    } else if (contour.kind === 'ellipse') {
      const [cx, cy, rx, ry] = [contour.cx, contour.cy, contour.rx, contour.ry];
      if (
        !isFiniteNumber(cx) ||
        !isFiniteNumber(cy) ||
        !isFiniteNumber(rx) ||
        !isFiniteNumber(ry)
      ) {
        return invalid(`${which}: an ellipse has a finite cx, cy, rx and ry.`);
      }
      if (rx <= 0 || ry <= 0) return invalid(`${which}: an ellipse's rx and ry are above 0.`);
      segments += 4;
      if (segments > GEOMETRY_CAPS.segments) return tooManySegments();
      contours.push(ellipseContour(cx, cy, rx, ry));
    } else {
      return invalid(`${which} of free geometry is a path, a polygon or an ellipse.`);
    }
    if (segments > GEOMETRY_CAPS.segments) return tooManySegments();
  }
  for (const [at, contour] of contours.entries()) {
    const box = boundsOf([contour]);
    if (contour.segments.length === 0 || box.width === 0 || box.height === 0) {
      return invalid(`Contour ${at + 1} of free geometry draws nothing.`);
    }
  }
  const bounds = boundsOf(contours);
  const slack = Math.hypot(width, height) / 1000;
  if (!within(bounds, { x: 0, y: 0, width, height }, slack)) {
    return invalid(
      `The outline of free geometry leaves its box of ${number(width)} by ${number(height)}.`,
    );
  }
  if (label !== undefined) {
    const valid =
      typeof label === 'object' &&
      label !== null &&
      [label.x, label.y, label.width, label.height].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ) &&
      label.width > 0 &&
      label.height > 0;
    if (!valid)
      return invalid(
        'The label area of free geometry is a rectangle with a width and a height above 0.',
      );
    if (!within(label, { x: 0, y: 0, width, height }, slack)) {
      return invalid('The label area of free geometry leaves its box.');
    }
  }
  return {
    ok: true,
    outline: {
      width,
      height,
      contours: withRoles(contours),
      bounds,
      keepProportions: keepProportions === true,
      ...(label === undefined
        ? {}
        : { label: { x: label.x, y: label.y, width: label.width, height: label.height } }),
    },
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function tooManySegments(): GeometryRead {
  return tooLarge(
    `Free geometry holds at most ${GEOMETRY_CAPS.segments.toLocaleString('en')} segments, path commands and points.`,
  );
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** A contour's pieces, closed by a line back to its start when it does not end there. */
function closed(start: Point, segments: readonly Segment[]): Segment[] {
  const last = segments.at(-1)?.to ?? start;
  return last.x === start.x && last.y === start.y
    ? [...segments]
    : [...segments, { kind: 'line', to: start }];
}

/** An ellipse as four cubics, one for each quarter, starting at its right. */
export function ellipseContour(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { start: Point; segments: Segment[]; role: 'fill' } {
  const k = 0.5522847498307936;
  const ox = rx * k;
  const oy = ry * k;
  return {
    start: { x: cx + rx, y: cy },
    segments: [
      {
        kind: 'cubic',
        c1: { x: cx + rx, y: cy + oy },
        c2: { x: cx + ox, y: cy + ry },
        to: { x: cx, y: cy + ry },
      },
      {
        kind: 'cubic',
        c1: { x: cx - ox, y: cy + ry },
        c2: { x: cx - rx, y: cy + oy },
        to: { x: cx - rx, y: cy },
      },
      {
        kind: 'cubic',
        c1: { x: cx - rx, y: cy - oy },
        c2: { x: cx - ox, y: cy - ry },
        to: { x: cx, y: cy - ry },
      },
      {
        kind: 'cubic',
        c1: { x: cx + ox, y: cy - ry },
        c2: { x: cx + rx, y: cy - oy },
        to: { x: cx + rx, y: cy },
      },
    ],
    role: 'fill',
  };
}

function within(box: Box, around: Box, slack: number): boolean {
  return (
    box.x >= around.x - slack &&
    box.y >= around.y - slack &&
    box.x + box.width <= around.x + around.width + slack &&
    box.y + box.height <= around.y + around.height + slack
  );
}

/**
 * Each closed contour is a fill or a hole by how many others hold it: an odd number makes it a hole,
 * which is SVG's even-odd rule, whichever way it runs. Lines stay lines.
 */
function withRoles(
  contours: readonly { start: Point; segments: Segment[]; role: 'fill' | 'line' }[],
): OutlineContour[] {
  const closedOnes = contours.filter((contour) => contour.role !== 'line');
  const polygons = closedOnes.map((contour) => coarse(contour.start, contour.segments));
  return contours.map((contour) => {
    if (contour.role === 'line') return contour;
    const own = closedOnes.indexOf(contour);
    const probe = probePoint(polygons[own] as number[]);
    let holders = 0;
    for (const [at, polygon] of polygons.entries()) {
      if (at !== own && evenOddHolds(polygon, probe.x, probe.y)) holders += 1;
    }
    return { ...contour, role: holders % 2 === 1 ? 'hole' : 'fill' };
  });
}

/** A point on a contour away from its corners: the middle of its first piece. */
function probePoint(polygon: readonly number[]): Point {
  const x0 = polygon[0] as number;
  const y0 = polygon[1] as number;
  const x1 = polygon[2] ?? x0;
  const y1 = polygon[3] ?? y0;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

/** A contour flattened coarsely, as x, y pairs, for telling fills from holes. */
function coarse(start: Point, segments: readonly Segment[]): number[] {
  const points: number[] = [start.x, start.y];
  let from = start;
  for (const segment of segments) {
    if (segment.kind === 'line') points.push(segment.to.x, segment.to.y);
    else {
      for (let piece = 1; piece <= 8; piece += 1) {
        const t = piece / 8;
        const point = cubicAt(from, segment.c1, segment.c2, segment.to, t);
        points.push(point.x, point.y);
      }
    }
    from = segment.to;
  }
  return points;
}

/** Whether a closed polygon, as x, y pairs, holds a point by the even-odd rule. */
export function evenOddHolds(polygon: ArrayLike<number>, x: number, y: number): boolean {
  let inside = false;
  const count = polygon.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = polygon[2 * i] as number;
    const yi = polygon[2 * i + 1] as number;
    const xj = polygon[2 * j] as number;
    const yj = polygon[2 * j + 1] as number;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The point at `t` of a cubic Bézier. */
export function cubicAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/** The bounds of contours' curves: their ends and the extremes of each cubic, not its control points. */
export function boundsOf(contours: readonly { start: Point; segments: readonly Segment[] }[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const take = (point: Point) => {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  };
  for (const contour of contours) {
    take(contour.start);
    let from = contour.start;
    for (const segment of contour.segments) {
      take(segment.to);
      if (segment.kind === 'cubic') {
        for (const t of extremes(from.x, segment.c1.x, segment.c2.x, segment.to.x)) {
          take(cubicAt(from, segment.c1, segment.c2, segment.to, t));
        }
        for (const t of extremes(from.y, segment.c1.y, segment.c2.y, segment.to.y)) {
          take(cubicAt(from, segment.c1, segment.c2, segment.to, t));
        }
      }
      from = segment.to;
    }
  }
  if (minX > maxX) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Where a cubic's coordinate has its extremes, strictly between its ends. */
function extremes(p0: number, p1: number, p2: number, p3: number): number[] {
  // The derivative, divided by 3, is a t² + b t + c.
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const found: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) found.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      found.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }
  return found.filter((t) => t > 0 && t < 1);
}

/**
 * Affine transforms, as SVG writes them: `[a, b, c, d, e, f]` maps a point to
 * `(a x + c y + e, b x + d y + f)`. They carry outlines from where an element draws them into the
 * coordinates of the picture it sits in; an affine map takes a cubic Bézier to the cubic of the mapped
 * control points, so outlines keep their curves.
 */
import type { Point } from '@visual-anything/schema';
import type { OutlineContour } from './outline';
import type { Segment } from './path';

/** An affine transform: `[a, b, c, d, e, f]`. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** The transform that applies `inner` first, then `outer`. */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function translation(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

export function scaling(x: number, y = x): Matrix {
  return [x, 0, 0, y, 0, 0];
}

/** A rotation by `degrees`, clockwise on a screen whose y grows downward, about `cx`, `cy`. */
export function rotation(degrees: number, cx = 0, cy = 0): Matrix {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const turn: Matrix = [cos, sin, -sin, cos, 0, 0];
  if (cx === 0 && cy === 0) return turn;
  return multiply(translation(cx, cy), multiply(turn, translation(-cx, -cy)));
}

export function skewingX(degrees: number): Matrix {
  return [1, 0, Math.tan((degrees * Math.PI) / 180), 1, 0, 0];
}

export function skewingY(degrees: number): Matrix {
  return [1, Math.tan((degrees * Math.PI) / 180), 0, 1, 0, 0];
}

export function applyMatrix(m: Matrix, point: Point): Point {
  return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
}

/** How much a transform scales lengths, on average over directions: the root of its area's scale. */
export function lengthScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/** A contour carried by a transform: its points mapped, a line's width scaled by {@link lengthScale}. */
export function transformContour(contour: OutlineContour, m: Matrix): OutlineContour {
  const map = (point: Point) => applyMatrix(m, point);
  return {
    ...contour,
    start: map(contour.start),
    segments: contour.segments.map((segment): Segment =>
      segment.kind === 'line'
        ? { kind: 'line', to: map(segment.to) }
        : { kind: 'cubic', c1: map(segment.c1), c2: map(segment.c2), to: map(segment.to) },
    ),
    ...(contour.width === undefined ? {} : { width: contour.width * lengthScale(m) }),
  };
}

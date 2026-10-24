/** Plane geometry for the canvas, in canvas units with y growing downwards. */
import type { Point } from '@visual-anything/schema';
import type { Appearance, RelationAppearance } from '@visual-anything/schema';

/** The kinds of shape an element can have. */
export type ShapeKind = NonNullable<Appearance['shape']>;

/** The ways a relation's line can be drawn. */
export type Dash = NonNullable<RelationAppearance['dash']>;

export type { Point };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The triangle drawn at the end of a directed relation or an arrow. */
export interface Arrowhead {
  tip: Point;
  left: Point;
  right: Point;
}

/** A uniform scale followed by a translation. */
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

/** How far fitting may enlarge a scene, so that a view with a single shape is not blown up. */
export const MAX_FIT_SCALE = 2;

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function middle(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** The unit vector from `from` towards `to`, or undefined when they coincide. */
export function directionOf(from: Point, to: Point): Point | undefined {
  const length = distance(from, to);
  return length === 0 ? undefined : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

/** The smallest rectangle holding every given rectangle and point; undefined when given none. */
export function boundsOf(rects: readonly Rect[], points: readonly Point[] = []): Rect | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return left > right ? undefined : { x: left, y: top, width: right - left, height: bottom - top };
}

/** The point inside `rect` nearest to `point`, keeping `inset` away from its border when it can. */
export function clampInto(rect: Rect, point: Point, inset = 0): Point {
  const insetX = Math.min(inset, rect.width / 2);
  const insetY = Math.min(inset, rect.height / 2);
  return {
    x: Math.min(Math.max(point.x, rect.x + insetX), rect.x + rect.width - insetX),
    y: Math.min(Math.max(point.y, rect.y + insetY), rect.y + rect.height - insetY),
  };
}

/**
 * Where a line that starts at `inside`, a point within a shape, and heads towards `toward` crosses the
 * shape's outline. Ellipses use their outline; every other kind of shape uses its rectangle.
 */
export function borderPoint(kind: ShapeKind, rect: Rect, inside: Point, toward: Point): Point {
  const direction = directionOf(inside, toward);
  if (!direction) return inside;
  const travel =
    kind === 'ellipse'
      ? ellipseExit(rect, inside, direction)
      : rectangleExit(rect, inside, direction);
  return { x: inside.x + direction.x * travel, y: inside.y + direction.y * travel };
}

/** How far a ray from a point within a rectangle travels before it leaves the rectangle. */
function rectangleExit(rect: Rect, from: Point, direction: Point): number {
  const alongX =
    direction.x > 0
      ? (rect.x + rect.width - from.x) / direction.x
      : direction.x < 0
        ? (rect.x - from.x) / direction.x
        : Infinity;
  const alongY =
    direction.y > 0
      ? (rect.y + rect.height - from.y) / direction.y
      : direction.y < 0
        ? (rect.y - from.y) / direction.y
        : Infinity;
  return Math.max(0, Math.min(alongX, alongY));
}

/** How far a ray from a point within the ellipse inscribed in `rect` travels before it leaves it. */
function ellipseExit(rect: Rect, from: Point, direction: Point): number {
  const radiusX = rect.width / 2;
  const radiusY = rect.height / 2;
  if (radiusX <= 0 || radiusY <= 0) return 0;
  // Scale the ellipse to the unit circle and solve |u + t·d| = 1 for the positive t.
  const u = (from.x - (rect.x + radiusX)) / radiusX;
  const v = (from.y - (rect.y + radiusY)) / radiusY;
  const dx = direction.x / radiusX;
  const dy = direction.y / radiusY;
  const a = dx * dx + dy * dy;
  const b = 2 * (u * dx + v * dy);
  const c = u * u + v * v - 1;
  const discriminant = b * b - 4 * a * c;
  if (a === 0 || discriminant < 0) return 0;
  return Math.max(0, (-b + Math.sqrt(discriminant)) / (2 * a));
}

/** The arrowhead for a line from `from` whose end is `tip`, sized for the line's width. */
export function arrowheadAt(from: Point, tip: Point, lineWidth: number): Arrowhead {
  const direction = directionOf(from, tip) ?? { x: 1, y: 0 };
  const length = Math.max(10, lineWidth * 5);
  const halfWidth = Math.max(4, lineWidth * 2.5);
  const base = { x: tip.x - direction.x * length, y: tip.y - direction.y * length };
  return {
    tip,
    left: { x: base.x + direction.y * halfWidth, y: base.y - direction.x * halfWidth },
    right: { x: base.x - direction.y * halfWidth, y: base.y + direction.x * halfWidth },
  };
}

/**
 * The transform that fits `bounds` into an area, keeping `margin` free around it on the tighter side,
 * centering it on the other, and never enlarging beyond `maxScale`.
 */
export function fitTransform(
  bounds: Rect | undefined,
  area: Size,
  margin: number,
  maxScale = MAX_FIT_SCALE,
): Transform {
  if (!bounds) return { scale: 1, x: 0, y: 0 };
  const availableWidth = Math.max(1, area.width - 2 * margin);
  const availableHeight = Math.max(1, area.height - 2 * margin);
  const scale = Math.min(
    bounds.width > 0 ? availableWidth / bounds.width : Infinity,
    bounds.height > 0 ? availableHeight / bounds.height : Infinity,
    maxScale,
  );
  return {
    scale,
    x: (area.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (area.height - bounds.height * scale) / 2 - bounds.y * scale,
  };
}

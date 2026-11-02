/** Plane geometry for the canvas, in canvas units with y growing downwards. */
import type { Point } from '@visual-anything/schema';
import type { Appearance, RelationAppearance } from '@visual-anything/schema';
import { arrowheadOf, type ResolvedDrawing } from '@visual-anything/core';
import { BASE_DRAWING } from './drawing';

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
  /**
   * Drawn as two strokes from its tip rather than filled, the line running on to the tip, as the
   * drawing defaults' `open` arrowhead is (ADR 0086); absent for a filled one.
   */
  open?: true;
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

/** The rectangle grown by `by` on every side, or shrunk when `by` is negative. */
export function grow(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

/** How large the toggle that collapses or expands a container is, in scene units. */
export const TOGGLE_SIZE = 18;
/** How far the toggle sits from its container's top and right sides. */
const TOGGLE_INSET = 6;
/** How far behind a collapsed container the sheet under it shows, which says that it holds more. */
export const SHEET = 5;

/**
 * Where a collapsed container's own outline is drawn: its rectangle without the sheet that shows
 * behind it, on the right and at the bottom.
 */
export function bodyOf(shape: { rect: Rect; collapsed?: unknown }): Rect {
  const { rect } = shape;
  if (!showsSheet(shape.collapsed) || rect.width <= 2 * SHEET || rect.height <= 2 * SHEET) {
    return rect;
  }
  return { ...rect, width: rect.width - SHEET, height: rect.height - SHEET };
}

/**
 * Whether a container collapsed so shows a sheet behind it: unless the drawing defaults count what it
 * holds instead (`look: 'count'`, ADR 0086), which draws a second border inside it.
 */
export function showsSheet(collapsed: unknown): boolean {
  if (collapsed === undefined || collapsed === false) return false;
  return !(
    typeof collapsed === 'object' &&
    collapsed !== null &&
    (collapsed as { look?: unknown }).look === 'count'
  );
}

/** Whether a container collapsed so draws a second border inside it (ADR 0086). */
export function showsInnerBorder(collapsed: unknown): boolean {
  const look =
    typeof collapsed === 'object' && collapsed !== null
      ? (collapsed as { look?: unknown }).look
      : undefined;
  return look === 'count' || look === 'stack-and-count';
}

/** How far inside a collapsed container its second border runs (ADR 0086). */
export const INNER_BORDER = 3;

/**
 * Where the toggle that collapses or expands a container sits: in the top right corner of its body.
 * None for a shape that is not a container, or too small to hold the toggle beside its name.
 */
export function toggleRect(shape: {
  rect: Rect;
  holdsContents: boolean;
  collapsed?: unknown;
}): Rect | undefined {
  if (!shape.holdsContents && shape.collapsed === undefined) return undefined;
  const body = bodyOf(shape);
  if (body.width < 3 * TOGGLE_SIZE || body.height < 2 * TOGGLE_SIZE) return undefined;
  return {
    x: body.x + body.width - TOGGLE_INSET - TOGGLE_SIZE,
    y: body.y + TOGGLE_INSET,
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
  };
}

/**
 * How tall the ellipse is that closes a cylinder at the top and at the bottom, halved: at most 10, at
 * any width (ADR 0086), so that a wide cylinder never curves across the view.
 */
export function cylinderCap(rect: Rect): number {
  return Math.min(10, rect.height * 0.15);
}

/** The radius of a person's head, at the middle of its top; its shoulders start below it. */
export function personHead(rect: Rect): number {
  return Math.min(rect.height * 0.16, rect.width * 0.2);
}

/**
 * A person drawn as common diagram sets draw one (ADR 0086): a head's circle, and under it a body
 * whose top corners are rounded by `shoulder` into one arc, the shoulders.
 */
export interface PersonFigure {
  head: { x: number; y: number; radius: number };
  body: Rect;
  shoulder: number;
}

/** A person's figure in its rectangle. */
export function personFigure(rect: Rect): PersonFigure {
  const radius = personHead(rect);
  const top = rect.y + radius * 2.15;
  const body = {
    x: rect.x,
    y: top,
    width: rect.width,
    height: Math.max(0, rect.y + rect.height - top),
  };
  const shoulder = Math.max(0, Math.min(body.width / 2, body.height / 2, radius * 1.6));
  return { head: { x: rect.x + rect.width / 2, y: rect.y + radius, radius }, body, shoulder };
}

/** How far below a person's top its label area starts: under the curve of its shoulders. */
export function personLabelTop(rect: Rect): number {
  const { body, shoulder } = personFigure(rect);
  return body.y + shoulder * 0.15 - rect.y;
}

/**
 * A person's body as a polygon, flat numbers: its shoulders' arc at the top corners, and corners of
 * `bottom` at its foot, each arc in `steps` straight pieces.
 */
export function personBodyPoints(figure: PersonFigure, bottom: number, steps = 8): number[] {
  const { body, shoulder } = figure;
  const { x, y, width, height } = body;
  const low = Math.max(0, Math.min(bottom, width / 2, height - shoulder));
  const points: number[] = [];
  const arc = (cx: number, cy: number, radius: number, from: number, to: number) => {
    for (let at = 0; at <= steps; at++) {
      const angle = from + ((to - from) * at) / steps;
      points.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
  };
  arc(x + shoulder, y + shoulder, shoulder, Math.PI, 1.5 * Math.PI);
  arc(x + width - shoulder, y + shoulder, shoulder, 1.5 * Math.PI, 2 * Math.PI);
  arc(x + width - low, y + height - low, low, 0, 0.5 * Math.PI);
  arc(x + low, y + height - low, low, 0.5 * Math.PI, Math.PI);
  return points;
}

/**
 * Whether a shape of this kind drawn in `rect` holds a point, by its drawn outline: an ellipse by its
 * ellipse, a cylinder by its body and its two caps, a person by its body and its head. Rectangles,
 * rounded ones included, hold their whole rectangle.
 */
export function holdsPoint(kind: ShapeKind, rect: Rect, point: Point): boolean {
  const inRect = (box: Rect) =>
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height;
  if (!inRect(rect)) return false;
  const centerX = rect.x + rect.width / 2;
  switch (kind) {
    case 'rectangle':
    case 'rounded-rectangle':
      return true;
    case 'ellipse':
      return inEllipse(point, centerX, rect.y + rect.height / 2, rect.width / 2, rect.height / 2);
    case 'cylinder': {
      const cap = cylinderCap(rect);
      const body = { x: rect.x, y: rect.y + cap, width: rect.width, height: rect.height - 2 * cap };
      return (
        inRect(body) ||
        inEllipse(point, centerX, rect.y + cap, rect.width / 2, cap) ||
        inEllipse(point, centerX, rect.y + rect.height - cap, rect.width / 2, cap)
      );
    }
    case 'person': {
      const { head, body, shoulder } = personFigure(rect);
      if (inEllipse(point, head.x, head.y, head.radius, head.radius)) return true;
      if (!inRect(body)) return false;
      // Above the shoulders' arc, at either top corner, lies outside.
      const top = body.y + shoulder;
      if (point.y >= top || shoulder <= 0) return true;
      const left = body.x + shoulder;
      const right = body.x + body.width - shoulder;
      if (point.x < left) return inEllipse(point, left, top, shoulder, shoulder);
      if (point.x > right) return inEllipse(point, right, top, shoulder, shoulder);
      return true;
    }
  }
}

function inEllipse(
  point: Point,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): boolean {
  if (radiusX <= 0 || radiusY <= 0) return point.x === centerX && point.y === centerY;
  const dx = (point.x - centerX) / radiusX;
  const dy = (point.y - centerY) / radiusY;
  return dx * dx + dy * dy <= 1;
}

/**
 * The arrowhead for a line from `from` whose end is `tip`, sized for the line's width as the drawing
 * defaults size it (`arrowheadOf`), and open where they draw it open. Where they draw none, the scene
 * gives lines none (`drawsArrowheads`).
 */
export function arrowheadAt(
  from: Point,
  tip: Point,
  lineWidth: number,
  drawing: ResolvedDrawing = BASE_DRAWING,
): Arrowhead {
  const direction = directionOf(from, tip) ?? { x: 1, y: 0 };
  const { length, halfWidth } = arrowheadOf(drawing, lineWidth);
  const base = { x: tip.x - direction.x * length, y: tip.y - direction.y * length };
  const arrowhead: Arrowhead = {
    tip,
    left: { x: base.x + direction.y * halfWidth, y: base.y - direction.x * halfWidth },
    right: { x: base.x - direction.y * halfWidth, y: base.y + direction.x * halfWidth },
  };
  if (drawing.lines.arrowhead === 'open') arrowhead.open = true;
  if (drawing !== BASE_DRAWING) madeWith.set(arrowhead, drawing);
  return arrowhead;
}

/** The drawing defaults each arrowhead was made with, where they are not the base. */
const madeWith = new WeakMap<Arrowhead, ResolvedDrawing>();

/**
 * The arrowhead a line whose end moved to `tip` takes, coming from `from`: made as `was` was made,
 * with the same drawing defaults, for a line `lineWidth` wide. What routes a line again, a drag, a
 * route around shapes or an edit, gives it so.
 */
export function arrowheadAgain(
  was: Arrowhead,
  from: Point,
  tip: Point,
  lineWidth: number,
): Arrowhead {
  return arrowheadAt(from, tip, lineWidth, madeWith.get(was) ?? BASE_DRAWING);
}

/** Whether a drawing gives directed lines and arrows an arrowhead: unless it draws them with none. */
export function drawsArrowheads(drawing: ResolvedDrawing): boolean {
  return drawing.lines.arrowhead !== 'none';
}

/**
 * A line's points up to the base of its arrowhead, which covers the rest, so that the line never
 * shows past the tip: the last point moves to the base, or goes when the base lies before it.
 */
export function untilArrowhead(
  points: readonly Point[],
  arrowhead: Arrowhead | undefined,
): Point[] {
  const until = [...points];
  // An open arrowhead covers nothing: the line runs on to its tip.
  if (!arrowhead || arrowhead.open || until.length < 2) return until;
  const tip = until.at(-1) as Point;
  const before = until.at(-2) as Point;
  const base = middle(arrowhead.left, arrowhead.right);
  if (distance(before, tip) > distance(base, tip)) until[until.length - 1] = base;
  else until.pop();
  return until;
}

/**
 * The transform that fits `bounds` into an area, keeping `margin` free around it on the tighter side,
 * centering it on the other, never enlarging beyond `maxScale` and never shrinking below `minScale`.
 * The scene is centered at the scale it gets, so a scene too large to fit shows its middle.
 */
export function fitTransform(
  bounds: Rect | undefined,
  area: Size,
  margin: number,
  maxScale = MAX_FIT_SCALE,
  minScale = 0,
): Transform {
  if (!bounds) return { scale: 1, x: 0, y: 0 };
  const availableWidth = Math.max(1, area.width - 2 * margin);
  const availableHeight = Math.max(1, area.height - 2 * margin);
  const scale = Math.max(
    minScale,
    Math.min(
      bounds.width > 0 ? availableWidth / bounds.width : Infinity,
      bounds.height > 0 ? availableHeight / bounds.height : Infinity,
      maxScale,
    ),
  );
  return {
    scale,
    x: (area.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (area.height - bounds.height * scale) / 2 - bounds.y * scale,
  };
}

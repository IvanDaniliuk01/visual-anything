/**
 * A shape turned or mirrored in a view (ADR 0088): its position's `rotation`, in degrees clockwise
 * about its middle, and `flip`, which mirrors it in its own axes before it turns. What a turned shape
 * draws of its body, its outline, its fill, its picture and its shadow, is drawn through `turnMatrix`;
 * its name stays level and is never mirrored, written in its level box (`levelBoxOf`). Pointing, marks,
 * name tags, layout and routing read its turned bounds (`turnedBounds`), and lines attach to its turned
 * outline (`turnedOutlineOf`).
 *
 * A shape without a turn or a mirror is never asked for anything here but `isTurned`, so that what it
 * draws, and every number read of it, is exactly as before.
 *
 * Pure, with no PixiJS, as the scene is: `withTurn` takes anything that keeps a transform as a PixiJS
 * `Graphics` does.
 */
import {
  ellipseContour,
  fitOutline,
  type Outline,
  type OutlineContour,
  type Segment,
} from '@visual-anything/core';
import type { ShapePosition } from '@visual-anything/schema';
import type { Point, Rect, ShapeKind } from './geometry';
import type { ShapeOutline } from './outlines';

/** How a shape is mirrored. */
export type Flip = NonNullable<ShapePosition['flip']>;

/** What a shape is turned and mirrored by; both absent on a shape that is neither. */
export interface Turn {
  /** Degrees clockwise about its middle, above 0 and below 360. */
  rotation?: number;
  flip?: Flip;
}

/** A turned shape as what follows reads it. */
export interface Turned extends Turn {
  rect: Rect;
}

/** An affine map, as SVG writes it: `[a, b, c, d, e, f]` takes (x, y) to (a x + c y + e, b x + d y + f). */
export type TurnMatrix = readonly [number, number, number, number, number, number];

/** Whether a shape is turned or mirrored at all. */
export function isTurned(shape: Turn): boolean {
  return shape.rotation !== undefined || shape.flip !== undefined;
}

/** Whether two shapes are turned and mirrored alike. */
export function sameTurn(a: Turn, b: Turn): boolean {
  return a.rotation === b.rotation && a.flip === b.flip;
}

/** A key that tells turns apart, '' for none. */
export function turnKey(shape: Turn): string {
  return isTurned(shape) ? `${shape.rotation ?? 0}${shape.flip ?? ''}` : '';
}

const matrices = new WeakMap<object, { rect: Rect; matrix: TurnMatrix }>();

/**
 * The map from where a shape's body would be drawn level to where it is drawn: mirrored in its own
 * axes, then turned, both about the middle of its rectangle.
 */
export function turnMatrix(shape: Turned): TurnMatrix {
  const known = matrices.get(shape);
  if (known && known.rect === shape.rect) return known.matrix;
  const { rect } = shape;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radians = ((shape.rotation ?? 0) * Math.PI) / 180;
  // Whole quarter turns are exact, so that a shape turned by 90° lands on whole units.
  const cos = snap(Math.cos(radians));
  const sin = snap(Math.sin(radians));
  const sx = shape.flip === 'horizontal' || shape.flip === 'both' ? -1 : 1;
  const sy = shape.flip === 'vertical' || shape.flip === 'both' ? -1 : 1;
  // Turn · Mirror, about the middle.
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const matrix: TurnMatrix = [a, b, c, d, cx - a * cx - c * cy, cy - b * cx - d * cy];
  matrices.set(shape, { rect, matrix });
  return matrix;
}

function snap(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-12 ? rounded : value;
}

/** Where a point of a shape's level body is drawn. */
export function turnPoint(shape: Turned, point: Point): Point {
  return apply(turnMatrix(shape), point);
}

/** Where a point drawn on the canvas lies on a shape's level body: `turnPoint` undone. */
export function unturnPoint(shape: Turned, point: Point): Point {
  const [a, b, c, d, e, f] = turnMatrix(shape);
  // The matrix turns and mirrors only: its inverse is its transpose.
  const x = point.x - e;
  const y = point.y - f;
  const det = a * d - b * c;
  return { x: (d * x - c * y) / det, y: (-b * x + a * y) / det };
}

function apply(m: TurnMatrix, point: Point): Point {
  return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
}

/**
 * The rectangle holding a box of a shape, its rectangle unless given, as the shape draws it turned:
 * the box itself for a shape neither turned nor mirrored.
 */
export function turnedBounds(shape: Turned, box: Rect = shape.rect): Rect {
  if (!isTurned(shape)) return box;
  const m = turnMatrix(shape);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x, y] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ] as const) {
    const at = apply(m, { x, y });
    left = Math.min(left, at.x);
    top = Math.min(top, at.y);
    right = Math.max(right, at.x);
    bottom = Math.max(bottom, at.y);
  }
  return tidy({ x: left, y: top, width: right - left, height: bottom - top });
}

/** A rectangle with what floating point left of whole quarter turns rounded away. */
function tidy(rect: Rect): Rect {
  const round = (value: number) => {
    const near = Math.round(value * 1e6) / 1e6;
    return Math.abs(near - value) < 1e-6 ? near : value;
  };
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  };
}

/**
 * The box a turned shape writes its name in, level: its rectangle, or for a shape turned nearer a
 * quarter turn than a half, its rectangle with its width and height swapped about its middle, so that
 * a tall shape turned on its side writes its name across.
 */
export function levelBoxOf(shape: Turned): Rect {
  const { rect } = shape;
  const turned = (((shape.rotation ?? 0) % 180) + 180) % 180;
  if (turned < 45 || turned > 135) return rect;
  return {
    x: rect.x + rect.width / 2 - rect.height / 2,
    y: rect.y + rect.height / 2 - rect.width / 2,
    width: rect.height,
    height: rect.width,
  };
}

const levelShapes = new WeakMap<object, object>();

/**
 * A turned shape as what writes its name level reads it: the same shape at its level box, neither
 * turned nor mirrored, made once for each shape object so that what caches by shape keeps working. A
 * shape with its own outline writes in its outline's label area, so it keeps its rectangle.
 */
export function levelShapeOf<S extends Turned & { outline?: unknown }>(shape: S): S {
  if (!isTurned(shape)) return shape;
  const known = levelShapes.get(shape) as S | undefined;
  if (known) return known;
  const level = { ...shape, rect: shape.outline ? shape.rect : levelBoxOf(shape) };
  delete level.rotation;
  delete level.flip;
  if ('extent' in level) (level as { extent: Rect }).extent = level.rect;
  levelShapes.set(shape, level);
  return level;
}

/** What keeps a transform for what is drawn next, as a PixiJS `Graphics` does. */
export interface Transformable {
  save(): unknown;
  restore(): unknown;
  setTransform(a: number, b: number, c: number, d: number, dx: number, dy: number): unknown;
}

/** Draws with `draw` through a shape's turn and mirroring, or as it is for a shape with neither. */
export function withTurn<G extends Transformable>(
  graphics: G,
  shape: Turned,
  draw: (graphics: G) => void,
): void {
  if (!isTurned(shape)) {
    draw(graphics);
    return;
  }
  const [a, b, c, d, e, f] = turnMatrix(shape);
  graphics.save();
  graphics.setTransform(a, b, c, d, e, f);
  try {
    draw(graphics);
  } finally {
    graphics.restore();
  }
}

/** The SVG `transform` of a turned shape's group. */
export function svgTransformOf(shape: Turned): string {
  const m = turnMatrix(shape).map((value) => {
    const rounded = Math.round(value * 1e4) / 1e4;
    return Object.is(rounded, -0) ? 0 : rounded;
  });
  return `matrix(${m.join(' ')})`;
}

/** A shape as its turned outline reads it. */
export interface Outlinable extends Turned {
  kind: ShapeKind;
  outline?: ShapeOutline;
  plate?: Rect;
}

const turnedOutlines = new WeakMap<object, { rect: Rect; outline: ShapeOutline }>();

/**
 * The outline lines attach to on a turned shape, and its marks follow: its own outline, its plate,
 * its ellipse or its box, turned and mirrored as it is drawn, placed from the top left of its
 * rectangle as an own outline is (ADR 0066). A cylinder and a person attach on their box, as they do
 * level.
 */
export function turnedOutlineOf(shape: Outlinable): ShapeOutline {
  const known = turnedOutlines.get(shape);
  if (known && known.rect === shape.rect) return known.outline;
  const { rect } = shape;
  const m = turnMatrix(shape);
  const own = shape.plate === undefined ? shape.outline : undefined;
  const level: OutlineContour[] = own
    ? own.fitted.contours.map((contour) => moved(contour, rect.x + own.x, rect.y + own.y))
    : [kindContour(shape.plate === undefined ? shape.kind : 'rectangle', shape.plate ?? rect)];
  const bounds = turnedBounds(
    shape,
    own
      ? {
          x: rect.x + own.x + own.fitted.bounds.x,
          y: rect.y + own.y + own.fitted.bounds.y,
          width: own.fitted.bounds.width,
          height: own.fitted.bounds.height,
        }
      : (shape.plate ?? rect),
  );
  // In the coordinates of the turned bounds' top left.
  const contours = level.map((contour) => moved(mapped(contour, m), -bounds.x, -bounds.y));
  const width = Math.max(bounds.width, 1e-6);
  const height = Math.max(bounds.height, 1e-6);
  const turned: Outline = {
    width,
    height,
    contours,
    bounds: { x: 0, y: 0, width, height },
    keepProportions: false,
  };
  const outline: ShapeOutline = {
    source: { outline: turned },
    fitted: fitOutline(turned, width, height),
    x: bounds.x - rect.x,
    y: bounds.y - rect.y,
  };
  turnedOutlines.set(shape, { rect, outline });
  return outline;
}

/** The contour of a kind's outline in a box: an ellipse's curve, and a box for every other kind. */
function kindContour(kind: ShapeKind, box: Rect): OutlineContour {
  if (kind === 'ellipse') {
    return ellipseContour(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2,
      box.height / 2,
    );
  }
  const { x, y, width, height } = box;
  return {
    start: { x, y },
    segments: [
      { kind: 'line', to: { x: x + width, y } },
      { kind: 'line', to: { x: x + width, y: y + height } },
      { kind: 'line', to: { x, y: y + height } },
      { kind: 'line', to: { x, y } },
    ],
    role: 'fill',
  };
}

function moved(contour: OutlineContour, dx: number, dy: number): OutlineContour {
  return mapped(contour, [1, 0, 0, 1, dx, dy]);
}

function mapped(contour: OutlineContour, m: TurnMatrix): OutlineContour {
  const map = (point: Point) => apply(m, point);
  return {
    ...contour,
    start: map(contour.start),
    segments: contour.segments.map((segment): Segment =>
      segment.kind === 'line'
        ? { kind: 'line', to: map(segment.to) }
        : { kind: 'cubic', c1: map(segment.c1), c2: map(segment.c2), to: map(segment.to) },
    ),
  };
}

/**
 * Where lines meet shapes beyond boxes (ADR 0066, ADR 0067, and ADR 0039's and ADR 0069's
 * clarifications): a shape with free geometry, or drawn as a named part, is attached on its outline
 * rather than on its box.
 *
 * - An automatic end of a straight or curved line attaches where the line from the outline's inner
 *   point toward the other end last leaves the outline (`lastExit`).
 * - An orthogonal route's end is its last segment carried on from the box until it meets the outline,
 *   so that the route stays orthogonal (`carriedOrthogonal`).
 * - A connection point or a border attachment, a side and a place on the box, is carried straight in
 *   from that side until it meets the outline (`carriedIn`); where that line misses the outline, it
 *   sits at the outline's point nearest the place.
 * - A part that only strokes, such as a nerve drawn as a line, attaches at the point of its line
 *   nearest the other end, on the edge of its stroke (`strokeEnd`).
 * - A dragged end let go on an outline is stored as the side and place that carry in to the point it
 *   was let go at (`placeCarriedTo`).
 *
 * A shape that writes its name in a name tag (ADR 0066's clarification of 2026-10-27) is attached on
 * its outline, or its box, and its tag together (`endOutline`): the tag is one more fill of the
 * outline lines attach to, so that every rule above treats it as part of the shape and no line
 * crosses the name. Its inner point stays its own outline's, and a place on a side is carried in from
 * past the tag where the tag reaches past that side, so that it meets the tag where the tag lies in
 * the way. Automatic routes attach to the box that holds the shape and its tag (`routeBoxOf`).
 *
 * Pure, over the core's outline maths, with no PixiJS; the layout worker never loads it.
 */
import {
  fitOutline,
  flattenOutline,
  outlineExit,
  outlineInnerPoint,
  type Box,
  type FittedOutline,
  type FlatContour,
  type Outline,
  type OutlineContour,
  type Side,
} from '@visual-anything/core';
import type { Point, Rect } from '../geometry';
import { boundsWithTag, tagOfShape, type NameTag } from '../nameTags';
import type { PlacedOutline, ShapeOutline } from '../outlines';
import { isTurned, turnedBounds, turnedOutlineOf, type Outlinable } from '../turn';

/** A side and a place along it, from 0 at its left or top end to 1 at the other. */
export interface SidePlace {
  side: Side;
  at: number;
}

/** One end of a line on a shape with an outline: the box it is drawn at, and its outline there. */
export interface OutlinedEnd {
  rect: Rect;
  outline: PlacedOutline;
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
const INWARD: Record<Side, Point> = {
  top: { x: 0, y: 1 },
  right: { x: -1, y: 0 },
  bottom: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
};
/** How far a point carried in may lie from the point a side and place were chosen for, to count. */
const CARRIED_TOLERANCE = 0.5;

/**
 * The outline a line attaches to on a shape, placed for the rectangle its end is drawn at, which a
 * drag may have moved from the shape's own; none for a shape without one, or one drawn by its
 * picture's plate, which lines attach to by the plate. A shape with a name tag is attached on its
 * outline, or its box, and its tag together (`taggedOutline`).
 */
export function endOutline(
  shape: { outline?: ShapeOutline; plate?: Rect } | undefined,
  rect: Rect,
): PlacedOutline | undefined {
  if (!shape) return undefined;
  // A turned or mirrored shape is attached on its outline as drawn (ADR 0088), its plate's too.
  const turned =
    'rect' in shape && isTurned(shape as Outlinable)
      ? turnedOutlineOf(shape as Outlinable)
      : undefined;
  if (!turned && shape.plate) return undefined;
  const own = turned ?? shape.outline;
  const tag = tagOfShape(shape);
  const outline = tag ? taggedOutline(own, rect, tag) : own;
  if (!outline) return undefined;
  return { fitted: outline.fitted, x: rect.x + outline.x, y: rect.y + outline.y };
}

/**
 * The box an automatic route attaches to on a shape drawn at `rect`: its rectangle, with its name tag
 * when it writes its name in one, so that the route reaches the shape past its tag, never across it
 * (ADR 0066's clarification of 2026-10-27).
 */
export function routeBoxOf(shape: { plate?: Rect } | undefined, rect: Rect): Rect {
  if (shape && 'rect' in shape && isTurned(shape as Outlinable)) {
    // A turned shape is reached by the box it is drawn in, moved as `rect` is (ADR 0088).
    const turned = shape as Outlinable;
    const box = turnedBounds(turned);
    const at = {
      x: box.x + rect.x - turned.rect.x,
      y: box.y + rect.y - turned.rect.y,
      width: box.width,
      height: box.height,
    };
    const tag = tagOfShape(shape);
    return tag ? boundsWithTag(at, tag, rect) : at;
  }
  const tag = shape?.plate ? undefined : tagOfShape(shape);
  return tag ? boundsWithTag(rect, tag, rect) : rect;
}

/** What an outline with a name tag keeps of the shape's own: its inner point, and its tag's box. */
interface TaggedFit {
  /** The shape's own inner point, in the outline's coordinates. */
  inner: Point;
  /** Whether the shape's own outline is made of stroked lines alone. */
  strokes: boolean;
  /** The tag's box, in the outline's coordinates. */
  tag: Box;
}

const taggedFits = new WeakMap<FittedOutline, TaggedFit>();
const taggedOutlines = new WeakMap<NameTag, { fitted: FittedOutline; x: number; y: number }>();

/**
 * A shape's outline, or its box for a shape drawn as its kind, with its name tag as one more fill of
 * it, placed from the top left of its rectangle as its outline is: made once for each tag, which is
 * made once for each outline and texts.
 */
function taggedOutline(
  outline: ShapeOutline | undefined,
  rect: Rect,
  tag: NameTag,
): { fitted: FittedOutline; x: number; y: number } {
  const known = taggedOutlines.get(tag);
  if (known) return known;
  const fitted = outline?.fitted;
  const x = outline?.x ?? 0;
  const y = outline?.y ?? 0;
  const width = fitted?.width ?? rect.width;
  const height = fitted?.height ?? rect.height;
  const own: readonly OutlineContour[] = fitted
    ? fitted.contours
    : [rectangleContour({ x: 0, y: 0, width, height }, 0)];
  const groups = own.reduce((most, contour) => Math.max(most, contour.group ?? 0), 0);
  const box = { x: tag.x - x, y: tag.y - y, width: tag.width, height: tag.height };
  const bounds = fitted?.bounds ?? { x: 0, y: 0, width, height };
  const left = Math.min(bounds.x, box.x);
  const top = Math.min(bounds.y, box.y);
  const joined: Outline = {
    width,
    height,
    contours: [...own, rectangleContour(box, groups + 1)],
    bounds: {
      x: left,
      y: top,
      width: Math.max(bounds.x + bounds.width, box.x + box.width) - left,
      height: Math.max(bounds.y + bounds.height, box.y + box.height) - top,
    },
    keepProportions: false,
  };
  const made = { fitted: fitOutline(joined, width, height), x, y };
  const inner = fitted ? outlineInnerPoint(fitted) : { x: width / 2, y: height / 2 };
  const strokes =
    fitted !== undefined &&
    fitted.contours.length > 0 &&
    fitted.contours.every((contour) => contour.role === 'line');
  taggedFits.set(made.fitted, { inner, strokes, tag: box });
  taggedOutlines.set(tag, made);
  return made;
}

/** A rectangle as a closed contour of a fill of its own. */
function rectangleContour(box: Box, group: number): OutlineContour {
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
    ...(group === 0 ? {} : { group }),
  };
}

const strokesOnly = new WeakMap<FittedOutline, boolean>();

/**
 * Whether an outline is made of stroked lines alone, as a part that draws a nerve or a vessel; for an
 * outline with a name tag, whether the shape's own outline is.
 */
export function onlyStrokes(outline: PlacedOutline): boolean {
  const { fitted } = outline;
  let known = strokesOnly.get(fitted);
  if (known === undefined) {
    known =
      taggedFits.get(fitted)?.strokes ??
      (fitted.contours.length > 0 && fitted.contours.every((contour) => contour.role === 'line'));
    strokesOnly.set(fitted, known);
  }
  return known;
}

/** The name tag an outline lines attach to holds, placed on the canvas; none for an outline without one. */
export function tagBoxOf(outline: PlacedOutline): Rect | undefined {
  const box = taggedFits.get(outline.fitted)?.tag;
  return (
    box && { x: box.x + outline.x, y: box.y + outline.y, width: box.width, height: box.height }
  );
}

/**
 * The outline's point well inside it, on the canvas; the middle of its bounds for lines alone. For
 * an outline with a name tag, the shape's own outline's, or its box's middle, never the tag's.
 */
export function innerPointOf(outline: PlacedOutline): Point {
  const inner = taggedFits.get(outline.fitted)?.inner ?? outlineInnerPoint(outline.fitted);
  return { x: inner.x + outline.x, y: inner.y + outline.y };
}

/**
 * Where a line from `from`, a point within the outline, toward `toward` last leaves it, on the canvas,
 * so that the line never crosses its own shape after it attaches; undefined when it crosses nothing.
 */
export function lastExit(outline: PlacedOutline, from: Point, toward: Point): Point | undefined {
  const exit = outlineExit(
    outline.fitted,
    { x: from.x - outline.x, y: from.y - outline.y },
    { x: toward.x - outline.x, y: toward.y - outline.y },
  );
  return exit && { x: exit.x + outline.x, y: exit.y + outline.y };
}

/**
 * Where a place on a side of a shape's box, carried straight in from that side, first meets the
 * outline, on the canvas, and whether it met it: where it misses, the outline's point nearest the
 * place. A stroked line is met at the edge of its stroke. On an outline with a name tag that reaches
 * past that side, as a tag reaches past the bottom, the place is carried in from past the tag, so
 * that it meets the tag's edge where the tag lies in its way.
 */
export function carriedIn(
  outline: PlacedOutline,
  rect: Rect,
  side: Side,
  at: number,
): { point: Point; met: boolean } {
  const place = placeOn(rect, side, at);
  const inward = INWARD[side];
  const beyond = pastTag(outline, place, side);
  const from = { x: place.x - inward.x * beyond, y: place.y - inward.y * beyond };
  const across = (side === 'top' || side === 'bottom' ? rect.height : rect.width) + beyond;
  const flat = flattenOutline(outline.fitted);
  const local = { x: from.x - outline.x, y: from.y - outline.y };
  const t = firstCrossing(flat, local, inward, across);
  if (t !== undefined) {
    return { point: { x: from.x + inward.x * t, y: from.y + inward.y * t }, met: true };
  }
  return { point: nearestOnOutline(outline, place).point, met: false };
}

/** How far past a place on a side of the box an outline's name tag reaches; 0 for none. */
function pastTag(outline: PlacedOutline, place: Point, side: Side): number {
  const box = taggedFits.get(outline.fitted)?.tag;
  if (!box) return 0;
  const x = box.x + outline.x;
  const y = box.y + outline.y;
  switch (side) {
    case 'top':
      return Math.max(0, place.y - y);
    case 'right':
      return Math.max(0, x + box.width - place.x);
    case 'bottom':
      return Math.max(0, y + box.height - place.y);
    case 'left':
      return Math.max(0, place.x - x);
  }
}

/** The point at a side and a place along it, on a rectangle. */
export function placeOn(rect: Rect, side: Side, at: number): Point {
  const place = clamp(at, 0, 1);
  switch (side) {
    case 'top':
      return { x: rect.x + place * rect.width, y: rect.y };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + place * rect.height };
    case 'bottom':
      return { x: rect.x + place * rect.width, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: rect.y + place * rect.height };
  }
}

/**
 * How far along a ray from `from`, in the outline's coordinates, it first meets the outline's edges,
 * from 0 up to `limit` past which nothing of the outline lies; a stroked line at the edge of its band.
 */
function firstCrossing(
  flat: readonly FlatContour[],
  from: Point,
  direction: Point,
  limit: number,
): number | undefined {
  let best: number | undefined;
  for (const contour of flat) {
    const points = contour.points;
    const count = points.length / 2;
    const line = contour.role === 'line';
    const last = line ? count - 1 : count;
    for (let i = 0; i < last; i += 1) {
      const j = (i + 1) % count;
      const ax = points[2 * i] as number;
      const ay = points[2 * i + 1] as number;
      const ex = (points[2 * j] as number) - ax;
      const ey = (points[2 * j + 1] as number) - ay;
      const denominator = direction.x * ey - direction.y * ex;
      if (Math.abs(denominator) < 1e-12) continue;
      const wx = ax - from.x;
      const wy = ay - from.y;
      let t = (wx * ey - wy * ex) / denominator;
      const u = (wx * direction.y - wy * direction.x) / denominator;
      if (u < 0 || u > 1) continue;
      if (line && contour.halfWidth > 0) {
        // The band's edge comes before its middle by its half width, measured across the line.
        const sine = Math.abs(denominator) / Math.hypot(ex, ey);
        t -= contour.halfWidth / Math.max(sine, 0.1);
      }
      if (t < -1e-9 || t > limit + 1e-9) continue;
      const at = Math.max(0, t);
      if (best === undefined || at < best) best = at;
    }
  }
  return best;
}

/**
 * The point of the outline's edges nearest a point, on the canvas, and how far it is: a stroked
 * line's edges are its band's, half its width from it.
 */
export function nearestOnOutline(
  outline: PlacedOutline,
  point: Point,
): { point: Point; distance: number } {
  const local = { x: point.x - outline.x, y: point.y - outline.y };
  let best = Number.POSITIVE_INFINITY;
  let nearest = local;
  let half = 0;
  for (const contour of flattenOutline(outline.fitted)) {
    const points = contour.points;
    const count = points.length / 2;
    const last = contour.role === 'line' ? count - 1 : count;
    const consider = (x: number, y: number) => {
      const d = Math.hypot(local.x - x, local.y - y) - contour.halfWidth;
      if (d < best) {
        best = d;
        nearest = { x, y };
        half = contour.halfWidth;
      }
    };
    if (last <= 0 && count >= 1) consider(points[0] as number, points[1] as number);
    for (let i = 0; i < last; i += 1) {
      const j = (i + 1) % count;
      const ax = points[2 * i] as number;
      const ay = points[2 * i + 1] as number;
      const dx = (points[2 * j] as number) - ax;
      const dy = (points[2 * j + 1] as number) - ay;
      const length = dx * dx + dy * dy;
      const t =
        length === 0 ? 0 : clamp(((local.x - ax) * dx + (local.y - ay) * dy) / length, 0, 1);
      consider(ax + t * dx, ay + t * dy);
    }
  }
  if (!Number.isFinite(best)) return { point, distance: 0 };
  // On a band, the edge nearest the point lies half its width from the line, toward the point.
  const away = Math.hypot(local.x - nearest.x, local.y - nearest.y);
  const reach = half > 0 && away > 0 ? Math.min(half, away) / away : 0;
  return {
    point: {
      x: nearest.x + (local.x - nearest.x) * reach + outline.x,
      y: nearest.y + (local.y - nearest.y) * reach + outline.y,
    },
    distance: Math.max(0, best),
  };
}

/**
 * Where a line toward `toward` attaches to an outline: at the point of its stroked lines nearest it,
 * on the edge of their stroke, for an outline of lines alone, as for a nerve drawn as a line.
 */
export function strokeEnd(outline: PlacedOutline, toward: Point): Point {
  return nearestOnOutline(outline, toward).point;
}

/**
 * Where an automatic end of a straight or curved line attaches to an outline: where the line from
 * its inner point toward `toward` last leaves it, or at its lines' point nearest `toward` for an
 * outline of lines alone. With nothing to leave by, as when `toward` lies inside it, its point
 * nearest `toward`.
 */
export function outlineEnd(outline: PlacedOutline, toward: Point): Point {
  if (onlyStrokes(outline)) return strokeEnd(outline, toward);
  return (
    lastExit(outline, innerPointOf(outline), toward) ?? nearestOnOutline(outline, toward).point
  );
}

/**
 * The side and place on a shape's box that carry in to a point of its outline: of the sides from
 * which the point is met first, the one nearest it; when none meets it exactly, as for a point in a
 * hollow no side reaches, the side and place that carry in nearest it. The place is rounded to three
 * decimals, as a border place is.
 */
export function placeCarriedTo(outline: PlacedOutline, rect: Rect, point: Point): SidePlace {
  let exact: { place: SidePlace; away: number } | undefined;
  let nearest: { place: SidePlace; distance: number } | undefined;
  for (const side of SIDES) {
    const horizontal = side === 'top' || side === 'bottom';
    const length = horizontal ? rect.width : rect.height;
    const along = horizontal ? point.x - rect.x : point.y - rect.y;
    const at = length > 0 ? round3(clamp(along / length, 0, 1)) : 0.5;
    const carried = carriedIn(outline, rect, side, at).point;
    const distance = Math.hypot(carried.x - point.x, carried.y - point.y);
    const place = { side, at };
    if (!nearest || distance < nearest.distance) nearest = { place, distance };
    if (distance <= CARRIED_TOLERANCE) {
      const away = distanceToSide(rect, side, point);
      if (!exact || away < exact.away) exact = { place, away };
    }
  }
  return exact?.place ?? nearest?.place ?? { side: 'right', at: 0.5 };
}

/** How far a point is from the line of one side of a rectangle. */
function distanceToSide(rect: Rect, side: Side, point: Point): number {
  switch (side) {
    case 'top':
      return Math.abs(point.y - rect.y);
    case 'right':
      return Math.abs(rect.x + rect.width - point.x);
    case 'bottom':
      return Math.abs(rect.y + rect.height - point.y);
    case 'left':
      return Math.abs(point.x - rect.x);
  }
}

/**
 * An orthogonal route with each end on a shape with an outline carried on from the shape's box until
 * it meets the outline, along the segment it arrives by, so that the route stays orthogonal as it
 * meets it. An end whose segment, carried in, misses the outline goes on from where it crosses the
 * box to the outline's point nearest there. An end whose outline lies beyond the route's next point,
 * as for a container whose content it leaves from, keeps its place on the box.
 */
export function carriedOrthogonal(
  route: readonly Point[],
  from: OutlinedEnd | undefined,
  to: OutlinedEnd | undefined,
): Point[] {
  let points = [...route];
  if (from && points.length >= 2) points = carriedStart(points, from);
  if (to && points.length >= 2) points = carriedStart(points.reverse(), to).reverse();
  return points;
}

/** The route with its first point carried on to an outline; see `carriedOrthogonal`. */
function carriedStart(points: Point[], end: OutlinedEnd): Point[] {
  const [first, next] = points as [Point, Point];
  const horizontal = first.y === next.y && first.x !== next.x;
  const vertical = first.x === next.x && first.y !== next.y;
  if (!horizontal && !vertical) return points;
  const { rect } = end;
  const side = sideCrossed(rect, first, next, horizontal);
  const length = horizontal ? rect.height : rect.width;
  const along = horizontal ? first.y - rect.y : first.x - rect.x;
  if (length <= 0 || along < 0 || along > length) return points;
  const at = along / length;
  const box = placeOn(rect, side, at);
  const carried = carriedIn(end.outline, rect, side, at);
  if (!carried.met) return [carried.point, box, ...points.slice(1)];
  const inward = INWARD[side];
  const depth = (point: Point) => (point.x - box.x) * inward.x + (point.y - box.y) * inward.y;
  // An outline past the next point would turn the route back on itself: the box's place stays.
  if (depth(next) > 0 && depth(carried.point) >= depth(next)) return points;
  return [carried.point, ...points.slice(1)];
}

/**
 * The side of a box a route's end segment crosses, from `first` toward `next`: the side facing
 * `next` when it lies beyond the box, or else the side nearer `first`, as when the route runs inside
 * the box to a shape it holds.
 */
function sideCrossed(rect: Rect, first: Point, next: Point, horizontal: boolean): Side {
  if (horizontal) {
    if (next.x >= rect.x + rect.width) return 'right';
    if (next.x <= rect.x) return 'left';
    return Math.abs(first.x - rect.x) <= Math.abs(rect.x + rect.width - first.x) ? 'left' : 'right';
  }
  if (next.y >= rect.y + rect.height) return 'bottom';
  if (next.y <= rect.y) return 'top';
  return Math.abs(first.y - rect.y) <= Math.abs(rect.y + rect.height - first.y) ? 'top' : 'bottom';
}

/**
 * The side of a box an end of an orthogonal route attaches by, and its place along it, read from the
 * route's end and the next point, as `carriedOrthogonal` reads them; undefined when the segment is
 * neither horizontal nor vertical, or the end lies off the box.
 */
export function placeOfEnd(rect: Rect, first: Point, next: Point): SidePlace | undefined {
  const horizontal = first.y === next.y && first.x !== next.x;
  const vertical = first.x === next.x && first.y !== next.y;
  if (!horizontal && !vertical) return undefined;
  const side = sideCrossed(rect, first, next, horizontal);
  const length = horizontal ? rect.height : rect.width;
  const along = horizontal ? first.y - rect.y : first.x - rect.x;
  if (length <= 0 || along < 0 || along > length) return undefined;
  return { side, at: along / length };
}

/** Whether a route leaves a box from inside: its next point lies within the box, as to a shape it holds. */
export function leavesFromInside(rect: Rect, next: Point): boolean {
  return (
    next.x > rect.x &&
    next.x < rect.x + rect.width &&
    next.y > rect.y &&
    next.y < rect.y + rect.height
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

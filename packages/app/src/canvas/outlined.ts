/**
 * What the canvas asks of a shape with its own outline (ADR 0066, ADR 0067), beyond what
 * `outlines.ts` gives: where it writes its name and shows its icon, whether it writes its name at
 * all, how it holds a point where it is drawn as a plain block, what box selection reads of it, its
 * simplified outline far out, and the contours a mark around it traces. Everything is worked out in
 * the coordinates of the shape's rectangle, cached by its fitted outline, and placed where the shape
 * is, so that a shape that moves reads what it read before.
 *
 * Pure, with no PixiJS, as the scene is.
 */
import {
  douglasPeucker,
  evenOddHolds,
  flattenOutline,
  outlineHolds,
  outlineLabelArea,
  simplifyOutline,
  type FittedOutline,
} from '@visual-anything/core';
import { estimateWidth } from './fit';
import { toggleRect, type Point, type Rect } from './geometry';
import type { ShapeOutline } from './outlines';

/**
 * The least height of a label area a shape writes its name in, in canvas units: the name's own size.
 * A shape whose label area is lower writes no name inside itself, and the hover and selection marks
 * write it beside the shape (ADR 0066).
 */
export const LEAST_LABEL_HEIGHT = 14;
/**
 * How far outside its outline a shape still holds a point: half the width of the stroke it is drawn
 * with (`draw.ts`), so that pointing at the drawn edge finds the shape.
 */
export const OUTLINE_REACH = 0.75;
/** The size an anchored part's name is written at, bold, as a shape's name is. */
export const PART_NAME_SIZE = 14;
/** What an anchored part's name leaves free on each side of its label area, in canvas units. */
const PART_NAME_INSET = 2;
/** The height of a line of an anchored part's name. */
export const PART_NAME_LINE = 17.5;

/**
 * The lines a shape's name is written on in its label area (ADR 0066, ADR 0067): its words, each
 * whole, as many on a line as fit its width, the lines within its height. None when a word is wider
 * than the area, or the lines taller: the name is then written in a name tag under the shape, or
 * beside an anchored part, never cut inside it.
 */
export function partNameLines(
  name: string,
  area: { width: number; height: number },
): string[] | undefined {
  const width = area.width - 2 * PART_NAME_INSET;
  const words = name.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0 || area.height < LEAST_LABEL_HEIGHT) return undefined;
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (estimateWidth(word, PART_NAME_SIZE, true) > width) return undefined;
    const longer = line === '' ? word : `${line} ${word}`;
    if (estimateWidth(longer, PART_NAME_SIZE, true) <= width) line = longer;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines.length * PART_NAME_LINE <= Math.max(area.height, PART_NAME_LINE) ? lines : undefined;
}

/** The least width of the stretch of an expanded container's header that its name is written in. */
export const LEAST_HEADER_WIDTH = 40;
/** Where an expanded container's header line lies below its top: its icon's and its name's. */
const HEADER_LINE = { top: 6, bottom: 28 } as const;
/** How far in from its sides an expanded container's header starts and ends, and its toggle's gap. */
const HEADER_INSET = 6;
const TOGGLE_GAP = 4;
/** The most places along a header line that are tried. */
const HEADER_SAMPLES = 96;

/** A shape as these read it: its rectangle and its own outline, placed from the rectangle's top left. */
export interface Outlined {
  rect: Rect;
  outline: ShapeOutline;
}

/** An icon a shape shows in its label area, which its name is written right of. */
interface WithIcon {
  image?: { placement: string; box: Rect };
}

/** The part of a label area left for text beside an icon: right of it. */
export function besideIcon(shape: WithIcon, area: Rect): Rect {
  const image = shape.image;
  if (image?.placement !== 'icon') return area;
  const by = image.box.x + image.box.width - area.x;
  return { ...area, x: area.x + by, width: Math.max(1, area.width - by) };
}

/** What tells a container that shows its contents from other shapes. */
interface Holding {
  holdsContents: boolean;
  collapsed?: unknown;
  /** Present on a shape that draws rows, and on a row, which have no outline of their own. */
  rowCount?: unknown;
  row?: unknown;
}

/** Where a shape with its own outline writes its name and detail, on the canvas (`outlineLabelArea`). */
export function labelAreaOn(shape: Outlined): Rect {
  const { rect, outline } = shape;
  const area = outlineLabelArea(outline.fitted);
  return {
    x: rect.x + outline.x + area.x,
    y: rect.y + outline.y + area.y,
    width: area.width,
    height: area.height,
  };
}

/** Whether a shape is a container that shows its contents in its rectangle, under its header. */
export function showsContents(shape: Holding): boolean {
  return shape.holdsContents && shape.collapsed === undefined;
}

const stretches = new WeakMap<FittedOutline, Map<string, Stretch | undefined>>();

/** A stretch across a shape: where it starts on the canvas and how wide it is. */
export interface Stretch {
  x: number;
  width: number;
}

/**
 * The stretch of an expanded container's header line that its outline holds whole, the longest one,
 * between its sides and left of its toggle: where it shows its icon and writes its name and detail,
 * as any container does in its header. None when its outline holds no part of that line.
 */
export function headerStretch(
  shape: Outlined & { holdsContents: boolean; collapsed?: unknown },
): Stretch | undefined {
  const { rect, outline } = shape;
  const toggle = toggleRect(shape);
  const left = HEADER_INSET;
  const right = toggle ? toggle.x - rect.x - TOGGLE_GAP : rect.width - HEADER_INSET;
  if (!(right > left)) return undefined;
  let kept = stretches.get(outline.fitted);
  if (!kept) {
    kept = new Map();
    stretches.set(outline.fitted, kept);
  }
  const key = `${outline.x} ${outline.y} ${left} ${right}`;
  let stretch: Stretch | undefined;
  if (kept.has(key)) stretch = kept.get(key);
  else {
    stretch = heldStretch(outline, left, right);
    kept.set(key, stretch);
  }
  return stretch && { x: rect.x + stretch.x, width: stretch.width };
}

/** The longest stretch of the header line between `left` and `right` that the outline holds, from the rectangle's left. */
function heldStretch(outline: ShapeOutline, left: number, right: number): Stretch | undefined {
  const samples = Math.max(2, Math.min(HEADER_SAMPLES, Math.ceil((right - left) / 2) + 1));
  const step = (right - left) / (samples - 1);
  const holds = (x: number) =>
    outlineHolds(outline.fitted, { x: x - outline.x, y: HEADER_LINE.top - outline.y }) &&
    outlineHolds(outline.fitted, { x: x - outline.x, y: HEADER_LINE.bottom - outline.y });
  let best: Stretch | undefined;
  let start: number | undefined;
  for (let at = 0; at <= samples; at += 1) {
    const x = left + at * step;
    if (at < samples && holds(x)) {
      start ??= x;
      continue;
    }
    if (start !== undefined) {
      const width = x - step - start;
      if (!best || width > best.width) best = { x: start, width };
      start = undefined;
    }
  }
  return best && best.width > 0 ? best : undefined;
}

/** A shape as where it writes its name reads it. */
type Named = Holding &
  WithIcon & {
    rect: Rect;
    outline?: ShapeOutline;
    name?: string;
    part?: { inDrawing: boolean };
    /** Present on a drawing with parts (ADR 0067). */
    picture?: unknown;
  };

/**
 * The lines a shape with its own outline that shows no contents writes its name on inside itself:
 * its words whole, in its label area right of its icon (`partNameLines`); none when the name does
 * not fit there whole.
 */
export function nameLinesInside(
  shape: Outlined & WithIcon & { name?: string },
): string[] | undefined {
  return partNameLines(shape.name ?? '', besideIcon(shape, labelAreaOn(shape)));
}

/**
 * Whether a shape writes its name inside itself: always, without its own outline, and when it has
 * no name; with one, an expanded container when its header has a stretch at least 40 units wide
 * inside the outline, and any other shape when its name fits whole in its label area, its words
 * never cut (`nameLinesInside`). One that does not writes its name in a name tag under itself
 * (`writesNameBelow`), and an anchored part in its drawing is named beside itself by the hover and
 * selection marks (ADR 0066, ADR 0067).
 */
export function writesNameInside(shape: Named): boolean {
  const { outline } = shape;
  if (!outline || shape.rowCount !== undefined || shape.row !== undefined) return true;
  if ((shape.name ?? '').trim() === '') return true;
  const outlined = { ...shape, outline };
  if (showsContents(shape)) {
    return (headerStretch(outlined)?.width ?? 0) >= LEAST_HEADER_WIDTH;
  }
  return nameLinesInside(outlined) !== undefined;
}

/**
 * Whether a shape writes its name under itself, whole, in a name tag hung under it that is part of
 * the shape (`nameTags.ts`, ADR 0066's clarification of 2026-10-27):
 *
 * - a drawing with parts that is no container, under its box, never over its picture (ADR 0067's
 *   clarification); a container writes its name in its header;
 * - a shape with its own outline, drawn on its own and showing no contents, whose name does not fit
 *   whole inside it, under its outline, rather than cut inside it (ADR 0066's clarification).
 */
export function writesNameBelow(shape: Named): boolean {
  if (shape.picture !== undefined) return !shape.holdsContents && shape.collapsed === undefined;
  return (
    shape.outline !== undefined &&
    shape.part?.inDrawing !== true &&
    !showsContents(shape) &&
    !writesNameInside(shape)
  );
}

/** Where a shape's outline lies on the canvas: its fitted bounds, placed where the shape is. */
export function outlineBoundsOn(shape: Outlined): Rect {
  const { rect, outline } = shape;
  const { bounds } = outline.fitted;
  return {
    x: rect.x + outline.x + bounds.x,
    y: rect.y + outline.y + bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

/** The flattened lines of an outline, simplified as far out its fills are, by the fitted outline. */
const simplifiedLines = new WeakMap<FittedOutline, readonly SimplifiedLine[]>();

/** A stroked line of an outline, simplified for drawing far out, and its width. */
export interface SimplifiedLine {
  points: Float64Array;
  width: number;
}

/** How far a line simplified for drawing far out may stray, as a share of its outline's size. */
const LINE_SIMPLIFYING = 1 / 200;

/**
 * The stroked lines of an outline, as a named part's nerves are, simplified for drawing far out: the
 * fills' simplified form leaves them out, since a line fills nothing.
 */
export function simplifiedLinesOf(fitted: FittedOutline): readonly SimplifiedLine[] {
  let lines = simplifiedLines.get(fitted);
  if (!lines) {
    const tolerance = Math.max(0.25, Math.hypot(fitted.width, fitted.height) * LINE_SIMPLIFYING);
    lines = flattenOutline(fitted).flatMap((contour) =>
      contour.role === 'line' && contour.points.length >= 4
        ? [{ points: douglasPeucker(contour.points, tolerance), width: 2 * contour.halfWidth }]
        : [],
    );
    simplifiedLines.set(fitted, lines);
  }
  return lines;
}

/** Points of the rectangle's coordinates placed on the canvas, `dx` and `dy` away, for drawing. */
export function placedPoints(points: Float64Array, dx: number, dy: number): number[] {
  const placed = new Array<number>(points.length);
  for (let at = 0; at < points.length; at += 2) {
    placed[at] = (points[at] as number) + dx;
    placed[at + 1] = (points[at + 1] as number) + dy;
  }
  return placed;
}

/**
 * Whether a shape drawn as a plain block holds a point: by its simplified outline, filled without its
 * holes, as far out draws it (ADR 0055's clarification), or by a line it strokes.
 */
export function simplifiedHolds(shape: Outlined, point: Point): boolean {
  const { rect, outline } = shape;
  const x = point.x - rect.x - outline.x;
  const y = point.y - rect.y - outline.y;
  const { bounds } = outline.fitted;
  for (const polygon of simplifyOutline(outline.fitted)) {
    if (evenOddHolds(polygon, x, y)) return true;
  }
  if (simplifiedLinesOf(outline.fitted).length === 0) return false;
  if (
    x < bounds.x - OUTLINE_REACH ||
    y < bounds.y - OUTLINE_REACH ||
    x > bounds.x + bounds.width + OUTLINE_REACH ||
    y > bounds.y + bounds.height + OUTLINE_REACH
  ) {
    return false;
  }
  return outlineHolds(outline.fitted, { x, y }, OUTLINE_REACH);
}

// Marks along an outline ---------------------------------------------------------------------------

const markings = new WeakMap<FittedOutline, Map<number, readonly Float64Array[]>>();
/** The most gaps a fitted outline keeps marks for: the hover's, the selection's and the highlight's. */
const GAPS_KEPT = 4;

/**
 * The closed contours a mark around an outline traces, `gap` outside what it fills, in the
 * rectangle's coordinates: each fill grown by the gap, each hole shrunk by it (a hole too small for
 * that is left out), and each line's band, half its width and the gap around it. They are simplified
 * to a sixth of the gap, a half pixel on screen for the canvas's marks, so that a mark costs few
 * points far out.
 */
export function markContours(fitted: FittedOutline, gap: number): readonly Float64Array[] {
  let kept = markings.get(fitted);
  if (!kept) {
    kept = new Map();
    markings.set(fitted, kept);
  }
  const known = kept.get(gap);
  if (known) return known;
  const tolerance = Math.max(gap / 6, 1e-3);
  const contours: Float64Array[] = [];
  for (const contour of flattenOutline(fitted)) {
    const points = distinct(contour.points);
    if (contour.role === 'line') {
      const simplified = points.length >= 4 ? douglasPeucker(points, tolerance) : points;
      const band = bandAround(simplified, contour.halfWidth + gap);
      if (band) contours.push(band);
      continue;
    }
    if (points.length < 6) continue;
    if (contour.role === 'hole') {
      const across = Math.min(contour.maxX - contour.minX, contour.maxY - contour.minY);
      if (across <= 2 * gap) continue;
    }
    const closed = Float64Array.from([...points, points[0] as number, points[1] as number]);
    const simplified = douglasPeucker(closed, tolerance).slice(0, -2);
    if (simplified.length < 6) continue;
    contours.push(offsetPolygon(simplified, contour.role === 'hole' ? -gap : gap));
  }
  if (kept.size >= GAPS_KEPT) kept.delete(kept.keys().next().value as number);
  kept.set(gap, contours);
  return contours;
}

/** A contour's points without a point repeated after itself, nor a last point repeating the first. */
function distinct(points: Float64Array): Float64Array {
  const kept: number[] = [];
  for (let at = 0; at < points.length; at += 2) {
    const x = points[at] as number;
    const y = points[at + 1] as number;
    const count = kept.length;
    if (count >= 2 && kept[count - 2] === x && kept[count - 1] === y) continue;
    kept.push(x, y);
  }
  if (kept.length >= 4 && kept[0] === kept.at(-2) && kept[1] === kept.at(-1)) kept.length -= 2;
  return Float64Array.from(kept);
}

/** Twice a polygon's signed area, by the shoelace formula. */
function signedArea(points: Float64Array): number {
  let area = 0;
  const count = points.length / 2;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    area +=
      (points[2 * i] as number) * (points[2 * j + 1] as number) -
      (points[2 * j] as number) * (points[2 * i + 1] as number);
  }
  return area;
}

/** The most a corner of an offset polygon moves, as a multiple of the offset: its miter limit. */
const MITER_LIMIT = 3;

/**
 * A closed polygon with every edge moved `by` outward, away from what it encloses (inward when `by`
 * is negative), its corners mitred up to three times as far.
 */
function offsetPolygon(points: Float64Array, by: number): Float64Array {
  const count = points.length / 2;
  // Outward is right of each edge for a polygon whose area the shoelace formula gives positive.
  const turn = signedArea(points) >= 0 ? 1 : -1;
  const normals = new Float64Array(points.length);
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const dx = (points[2 * j] as number) - (points[2 * i] as number);
    const dy = (points[2 * j + 1] as number) - (points[2 * i + 1] as number);
    const length = Math.hypot(dx, dy) || 1;
    normals[2 * i] = (turn * dy) / length;
    normals[2 * i + 1] = (-turn * dx) / length;
  }
  const out = new Float64Array(points.length);
  for (let i = 0; i < count; i += 1) {
    const before = (i - 1 + count) % count;
    const [x, y] = mitred(
      normals[2 * before] as number,
      normals[2 * before + 1] as number,
      normals[2 * i] as number,
      normals[2 * i + 1] as number,
    );
    out[2 * i] = (points[2 * i] as number) + x * by;
    out[2 * i + 1] = (points[2 * i + 1] as number) + y * by;
  }
  return out;
}

/** How far and which way a corner between two edges of these unit normals moves for an offset of 1. */
function mitred(ax: number, ay: number, bx: number, by: number): [number, number] {
  let mx = ax + bx;
  let my = ay + by;
  const length = Math.hypot(mx, my);
  if (length < 1e-9) return [ax, ay];
  mx /= length;
  my /= length;
  const reach = Math.min(MITER_LIMIT, 1 / Math.max(mx * ax + my * ay, 1 / MITER_LIMIT));
  return [mx * reach, my * reach];
}

/** The closed band `by` around an open polyline, along one side and back along the other. */
function bandAround(points: Float64Array, by: number): Float64Array | undefined {
  const count = points.length / 2;
  if (count === 0 || !(by > 0)) return undefined;
  if (count === 1) {
    const x = points[0] as number;
    const y = points[1] as number;
    return Float64Array.from([x - by, y - by, x + by, y - by, x + by, y + by, x - by, y + by]);
  }
  const normals: [number, number][] = [];
  for (let i = 0; i + 1 < count; i += 1) {
    const dx = (points[2 * i + 2] as number) - (points[2 * i] as number);
    const dy = (points[2 * i + 3] as number) - (points[2 * i + 1] as number);
    const length = Math.hypot(dx, dy) || 1;
    normals.push([dy / length, -dx / length]);
  }
  const side = (sign: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const a = normals[Math.max(0, i - 1)] as [number, number];
      const b = normals[Math.min(normals.length - 1, i)] as [number, number];
      const [x, y] = mitred(a[0], a[1], b[0], b[1]);
      out.push(
        (points[2 * i] as number) + sign * x * by,
        (points[2 * i + 1] as number) + sign * y * by,
      );
    }
    return out;
  };
  const left = side(1);
  const right = side(-1);
  const back: number[] = [];
  for (let at = right.length - 2; at >= 0; at -= 2)
    back.push(right[at] as number, right[at + 1] as number);
  return Float64Array.from([...left, ...back]);
}

// Tiles' signatures --------------------------------------------------------------------------------

const serials = new WeakMap<object, number>();
let lastSerial = 0;

function serialOf(item: object): number {
  let serial = serials.get(item);
  if (serial === undefined) {
    lastSerial += 1;
    serial = lastSerial;
    serials.set(item, serial);
  }
  return serial;
}

/**
 * Everything about a shape's own outline and its part that its drawing shows, for its tile's
 * signature: the outline it was read from, the size it is fitted to and where it sits, and the
 * part's main color and whether it is anchored in a drawing. Empty for a shape with neither.
 */
export function outlineSignature(shape: {
  outline?: ShapeOutline;
  part?: { color: string; inDrawing: boolean };
}): string {
  const { outline, part } = shape;
  if (!outline && !part) return '';
  const drawn = outline
    ? [
        serialOf(outline.source.outline),
        outline.fitted.width,
        outline.fitted.height,
        outline.x,
        outline.y,
      ].join(',')
    : '';
  return part ? `${drawn};${part.color};${part.inDrawing ? 1 : 0}` : drawn;
}

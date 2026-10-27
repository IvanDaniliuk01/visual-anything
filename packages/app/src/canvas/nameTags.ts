/**
 * Name tags (ADR 0066's clarification of 2026-10-27): a shape that cannot write its name whole inside
 * itself (`writesNameBelow`) writes it in a tag hung under its outline, a rounded rectangle in the
 * shape's fill and stroke, centred under the outline's bounds and touching them, holding the name,
 * whole, bold, on as many lines as it needs, and the detail under it. The tag is part of the shape:
 * it is drawn, pointed at, marked, related, laid out and routed around with it.
 *
 * A tag is worked out once for each shape object of a scene, cached by the outline it hangs from and
 * the texts it holds, the way outlines are, so that a shape that moves keeps the same tag object, and
 * placed from the top left of the shape's rectangle. Nothing here runs per frame but lookups.
 *
 * Pure, with no PixiJS, as the scene is.
 */
import { t } from '../i18n';
import { estimateWidth, fitText } from './fit';
import type { Point, Rect } from './geometry';
import { PART_NAME_LINE, PART_NAME_SIZE, outlineBoundsOn, writesNameBelow } from './outlined';
import type { ShapeOutline } from './outlines';

/** How far in from its left and right sides a name tag writes its text, in canvas units. */
export const TAG_INSET = 8;
/** How far in from its top and bottom a name tag writes its text. */
export const TAG_PADDING = 4;
/** The size a name tag writes its detail at, as every shape does. */
export const TAG_DETAIL_SIZE = 11;
/** How tall the line of a name tag's detail is. */
export const TAG_DETAIL_LINE = 15;
/**
 * The least width a name tag wraps its name at, in canvas units; under a wider outline, the outline's
 * width less the tag's insets.
 */
export const NAME_TAG_WIDTH = 160;

/** The lines of a name in a name tag: its words whole, as many on a line as fit `width`. */
export function tagLines(name: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of name.split(/\s+/).filter((each) => each !== '')) {
    const longer = line === '' ? word : `${line} ${word}`;
    if (line === '' || estimateWidth(longer, PART_NAME_SIZE, true) <= width) line = longer;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** A name tag, from the top left of its shape's rectangle. */
export interface NameTag {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The lines its name is written on, each whole. */
  readonly lines: readonly string[];
  /** Its detail on one line, cut to its width with "…" where it does not fit; '' for none. */
  readonly detail: string;
}

/** A shape as its name tag reads it. */
export type Tagged = Parameters<typeof writesNameBelow>[0] & {
  name: string;
  componentName?: string;
  detail?: string;
  collapsed?: { contents: number };
  outline?: ShapeOutline;
};

/** The corner radius of a name tag, as a rounded rectangle's is (`draw.ts`). */
export function tagRadius(tag: { width: number; height: number }): number {
  return Math.min(10, tag.width / 4, tag.height / 4);
}

/**
 * What a shape writes under its name: its detail, or its component's name on a shape made without
 * one; a collapsed container its count first, so that cutting the detail never cuts the count.
 */
export function outlinedDetailOf(shape: {
  detail?: string;
  componentName?: string;
  collapsed?: { contents: number };
}): string {
  const detail = shape.detail ?? shape.componentName ?? '';
  if (shape.collapsed === undefined) return detail;
  const inside = t('{count} inside', { count: shape.collapsed.contents });
  return detail === '' ? inside : `${inside} · ${detail}`;
}

/** Each shape's tag, or `null` for none, by the shape object. */
const tags = new WeakMap<object, NameTag | null>();
/** Tags made, by the outline they hang from, or `UNHUNG` for a drawing's box, then their texts and place. */
const made = new WeakMap<object, Map<string, NameTag>>();
/** What the tags of shapes that hang them from their boxes, as drawings with parts do, are kept under. */
const UNHUNG = {};
/** The most tags kept for one outline, a few names and details, and for every box. */
const TAGS_KEPT = 64;
const UNHUNG_KEPT = 1024;

/**
 * The name tag a shape writes its name in, from the top left of its rectangle; none for a shape that
 * writes its name inside itself, or nowhere (`writesNameBelow`).
 */
export function nameTagOf(shape: Tagged): NameTag | undefined {
  // Most shapes are boxes, which write their names inside: asked of every one, so asked first.
  if (shape.outline === undefined && shape.picture === undefined) return undefined;
  const known = tags.get(shape);
  if (known !== undefined) return known ?? undefined;
  const tag = writesNameBelow(shape) ? tagFor(shape) : undefined;
  tags.set(shape, tag ?? null);
  return tag;
}

function tagFor(shape: Tagged): NameTag {
  const { rect, outline } = shape;
  const hung = outline !== undefined && shape.picture === undefined;
  const bounds = hung
    ? outlineBoundsOn({ rect, outline })
    : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  const bx = bounds.x - rect.x;
  const by = bounds.y - rect.y;
  const detail = outlinedDetailOf(shape);
  const key = `${bx} ${by} ${bounds.width} ${bounds.height}\u0000${shape.name}\u0000${detail}`;
  const from = hung ? outline : UNHUNG;
  let kept = made.get(from);
  if (!kept) {
    kept = new Map();
    made.set(from, kept);
  }
  const known = kept.get(key);
  if (known) return known;
  const tag = madeTag(shape.name, detail, {
    x: bx,
    y: by,
    width: bounds.width,
    height: bounds.height,
  });
  if (kept.size >= (hung ? TAGS_KEPT : UNHUNG_KEPT))
    kept.delete(kept.keys().next().value as string);
  kept.set(key, tag);
  return tag;
}

/** A tag for a name and a detail, hung under bounds given from the top left of the shape's rectangle. */
function madeTag(name: string, detail: string, bounds: Rect): NameTag {
  const wrap = Math.max(bounds.width - 2 * TAG_INSET, NAME_TAG_WIDTH);
  const lines = tagLines(name, wrap);
  let text = 0;
  for (const line of lines) text = Math.max(text, estimateWidth(line, PART_NAME_SIZE, true));
  const cut = detail === '' ? '' : fitText(detail, Math.max(wrap, text), TAG_DETAIL_SIZE);
  if (cut !== '') text = Math.max(text, estimateWidth(cut, TAG_DETAIL_SIZE));
  const width = Math.ceil(text) + 2 * TAG_INSET;
  const height =
    2 * TAG_PADDING + lines.length * PART_NAME_LINE + (cut === '' ? 0 : TAG_DETAIL_LINE);
  return {
    x: bounds.x + bounds.width / 2 - width / 2,
    y: bounds.y + bounds.height,
    width,
    height,
    lines,
    detail: cut,
  };
}

/**
 * The name tag of whatever is given, when it is an element shape (it has a name, a rectangle and says
 * whether it holds contents): what pointing, marks and routing read, which are also given rectangles
 * and outlines alone.
 */
export function tagOfShape(item: object | undefined): NameTag | undefined {
  if (item === undefined || !('name' in item) || !('rect' in item) || !('holdsContents' in item)) {
    return undefined;
  }
  return nameTagOf(item as Tagged);
}

/** A shape's name tag placed on the canvas, where its rectangle is; none for a shape without one. */
export function nameTagOn(shape: Tagged): Rect | undefined {
  const tag = nameTagOf(shape);
  return tag && placedTag(tag, shape.rect);
}

/** A tag placed for a rectangle, as the shape it hangs from is drawn there. */
export function placedTag(tag: NameTag, rect: { x: number; y: number }): Rect {
  return { x: rect.x + tag.x, y: rect.y + tag.y, width: tag.width, height: tag.height };
}

/**
 * What a shape covers on the canvas with what it draws: its rectangle and, for one that writes its
 * name in a name tag, that tag; its rectangle itself when it has none.
 */
export function drawnBoundsOf(shape: Tagged): Rect {
  const { rect } = shape;
  const tag = nameTagOf(shape);
  return tag ? boundsWithTag(rect, tag, rect) : rect;
}

/** A box and a tag placed for `at` together: the rectangle holding both. */
export function boundsWithTag(box: Rect, tag: NameTag, at: { x: number; y: number }): Rect {
  const placed = placedTag(tag, at);
  const x = Math.min(box.x, placed.x);
  const y = Math.min(box.y, placed.y);
  return {
    x,
    y,
    width: Math.max(box.x + box.width, placed.x + placed.width) - x,
    height: Math.max(box.y + box.height, placed.y + placed.height) - y,
  };
}

/**
 * Whether a shape's name tag holds a point, to within `margin` of its rounded rectangle, as a shape
 * holds one within half its stroke of its outline; false for a shape without one.
 */
export function tagHolds(shape: Tagged, point: Point, margin = 0): boolean {
  const tag = nameTagOf(shape);
  if (!tag) return false;
  return roundedHolds(placedTag(tag, shape.rect), tagRadius(tag), point, margin);
}

/**
 * Where a ray from `from` toward `toward` last leaves a box, as a line from inside a shape leaves its
 * tag; undefined when the ray does not cross it.
 */
export function boxExit(box: Rect, from: Point, toward: Point): Point | undefined {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (dx === 0 && dy === 0) return undefined;
  let enter = 0;
  let leave = Infinity;
  for (const [d, start, low, high] of [
    [dx, from.x, box.x, box.x + box.width],
    [dy, from.y, box.y, box.y + box.height],
  ] as const) {
    if (d === 0) {
      if (start < low || start > high) return undefined;
      continue;
    }
    const a = (low - start) / d;
    const b = (high - start) / d;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  if (!(leave > 0) || enter > leave) return undefined;
  return { x: from.x + dx * leave, y: from.y + dy * leave };
}

/** Whether a rounded rectangle, grown by `margin`, holds a point. */
function roundedHolds(rect: Rect, radius: number, point: Point, margin: number): boolean {
  const { x, y, width, height } = rect;
  if (
    point.x < x - margin ||
    point.y < y - margin ||
    point.x > x + width + margin ||
    point.y > y + height + margin
  ) {
    return false;
  }
  const cx = Math.min(Math.max(point.x, x + radius), x + width - radius);
  const cy = Math.min(Math.max(point.y, y + radius), y + height - radius);
  return Math.hypot(point.x - cx, point.y - cy) <= radius + margin;
}

// Marks around a shape and its tag together --------------------------------------------------------

/** A line a mark traces: its points, from the top left of the shape's rectangle, and whether it closes. */
export interface MarkLine {
  readonly points: Float64Array;
  readonly closed: boolean;
}

const marked = new WeakMap<NameTag, Map<number, readonly MarkLine[]>>();
/** The most gaps a tag keeps marks for: the hover's, the selection's and the highlight's. */
const GAPS_KEPT = 4;

/**
 * The lines a mark around a shape and its name tag together traces, `gap` outside both: the pieces of
 * the shape's mark contours (closed polygons, from the top left of its rectangle) outside the tag's
 * box grown by the gap, and the pieces of that box outside them. So the mark goes around the outline
 * and the tag as one, and never across the name. Kept for each tag and gap, as the tag is kept for
 * its outline.
 */
export function markLinesWithTag(
  tag: NameTag,
  contours: () => readonly Float64Array[],
  gap: number,
): readonly MarkLine[] {
  let kept = marked.get(tag);
  if (!kept) {
    kept = new Map();
    marked.set(tag, kept);
  }
  const known = kept.get(gap);
  if (known) return known;
  const lines = unionLines(contours(), {
    x: tag.x - gap,
    y: tag.y - gap,
    width: tag.width + 2 * gap,
    height: tag.height + 2 * gap,
  });
  if (kept.size >= GAPS_KEPT) kept.delete(kept.keys().next().value as number);
  kept.set(gap, lines);
  return lines;
}

/**
 * The boundary of what closed polygons, read by the even-odd rule, and a box cover together, as
 * lines: each polygon's pieces outside the box, and the box's pieces outside the polygons.
 */
export function unionLines(polygons: readonly Float64Array[], box: Rect): MarkLine[] {
  const lines: MarkLine[] = [];
  for (const polygon of polygons) {
    if (polygon.length >= 6) lines.push(...piecesOutsideBox(polygon, box));
  }
  const corners = Float64Array.from([
    box.x,
    box.y,
    box.x + box.width,
    box.y,
    box.x + box.width,
    box.y + box.height,
    box.x,
    box.y + box.height,
  ]);
  lines.push(...piecesOutsidePolygons(corners, polygons));
  return lines;
}

/** The pieces of a closed polygon that lie outside a box, joined into lines. */
function piecesOutsideBox(polygon: Float64Array, box: Rect): MarkLine[] {
  const count = polygon.length / 2;
  const pieces: number[][] = [];
  let open: number[] | undefined;
  let cut = false;
  // Whether the first piece starts at the polygon's first point, so that the last joins it.
  let startsAtFirst = false;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const ax = polygon[2 * i] as number;
    const ay = polygon[2 * i + 1] as number;
    const bx = polygon[2 * j] as number;
    const by = polygon[2 * j + 1] as number;
    const inside = clipToBox(ax, ay, bx, by, box);
    if (!inside) {
      if (!open) {
        open = [ax, ay];
        if (i === 0) startsAtFirst = true;
      }
      open.push(bx, by);
      continue;
    }
    cut = true;
    const [t0, t1] = inside;
    if (t0 > 0) {
      if (!open) {
        open = [ax, ay];
        if (i === 0) startsAtFirst = true;
      }
      open.push(ax + (bx - ax) * t0, ay + (by - ay) * t0);
    }
    if (open) pieces.push(open);
    open = undefined;
    if (t1 < 1) open = [ax + (bx - ax) * t1, ay + (by - ay) * t1, bx, by];
  }
  if (!cut) return [{ points: polygon, closed: true }];
  if (open) {
    const first = pieces[0];
    if (startsAtFirst && first) {
      // The last piece ends where the first starts: they are one line.
      pieces[0] = [...open, ...first.slice(2)];
    } else pieces.push(open);
  }
  return pieces
    .filter((piece) => piece.length >= 4)
    .map((piece) => ({ points: Float64Array.from(piece), closed: false }));
}

/**
 * Where a segment lies inside a box, as the part of it from `t0` to `t1`, 0 at its start and 1 at
 * its end, by Liang and Barsky's clipping; undefined when no part of it does.
 */
function clipToBox(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: Rect,
): [number, number] | undefined {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, ax - box.x],
    [dx, box.x + box.width - ax],
    [-dy, ay - box.y],
    [dy, box.y + box.height - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return undefined;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return undefined;
      if (r < t1) t1 = r;
    }
  }
  return t1 - t0 > 1e-9 ? [t0, t1] : undefined;
}

/** The pieces of a closed polygon's edges that lie outside closed polygons read together by the even-odd rule. */
function piecesOutsidePolygons(ring: Float64Array, polygons: readonly Float64Array[]): MarkLine[] {
  const count = ring.length / 2;
  const pieces: number[][] = [];
  let open: number[] | undefined;
  let cut = false;
  let startsAtFirst = false;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const ax = ring[2 * i] as number;
    const ay = ring[2 * i + 1] as number;
    const bx = ring[2 * j] as number;
    const by = ring[2 * j + 1] as number;
    const splits = [0, ...crossingsAlong(ax, ay, bx, by, polygons), 1];
    for (let k = 0; k + 1 < splits.length; k += 1) {
      const s0 = splits[k] as number;
      const s1 = splits[k + 1] as number;
      if (s1 - s0 < 1e-9) continue;
      const middle = (s0 + s1) / 2;
      const outside = !evenOddInside(polygons, ax + (bx - ax) * middle, ay + (by - ay) * middle);
      if (outside) {
        if (!open) {
          open = [ax + (bx - ax) * s0, ay + (by - ay) * s0];
          if (i === 0 && s0 === 0) startsAtFirst = true;
        }
        open.push(ax + (bx - ax) * s1, ay + (by - ay) * s1);
      } else {
        cut = true;
        if (open) pieces.push(open);
        open = undefined;
      }
    }
  }
  if (!cut) return [{ points: ring, closed: true }];
  if (open) {
    const first = pieces[0];
    if (startsAtFirst && first) pieces[0] = [...open, ...first.slice(2)];
    else pieces.push(open);
  }
  return pieces
    .filter((piece) => piece.length >= 4)
    .map((piece) => ({ points: Float64Array.from(piece), closed: false }));
}

/** Where, from 0 to 1 along a segment, it crosses the polygons' edges, in order. */
function crossingsAlong(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  polygons: readonly Float64Array[],
): number[] {
  const found: number[] = [];
  const ex = bx - ax;
  const ey = by - ay;
  for (const polygon of polygons) {
    const count = polygon.length / 2;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const cx = polygon[2 * i] as number;
      const cy = polygon[2 * i + 1] as number;
      const fx = (polygon[2 * j] as number) - cx;
      const fy = (polygon[2 * j + 1] as number) - cy;
      const denominator = ex * fy - ey * fx;
      if (Math.abs(denominator) < 1e-12) continue;
      const wx = cx - ax;
      const wy = cy - ay;
      const s = (wx * fy - wy * fx) / denominator;
      const u = (wx * ey - wy * ex) / denominator;
      if (s > 0 && s < 1 && u >= 0 && u <= 1) found.push(s);
    }
  }
  return found.sort((a, b) => a - b);
}

/** Whether closed polygons read together by the even-odd rule hold a point. */
function evenOddInside(polygons: readonly Float64Array[], x: number, y: number): boolean {
  let inside = false;
  for (const polygon of polygons) {
    const count = polygon.length / 2;
    for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
      const xi = polygon[2 * i] as number;
      const yi = polygon[2 * i + 1] as number;
      const xj = polygon[2 * j] as number;
      const yj = polygon[2 * j + 1] as number;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

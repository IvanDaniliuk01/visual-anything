/**
 * How readable a view is as drawn (ADR 0080, "Layout quality, held by tests"): the measures the
 * layout research took of every engine, worked out from a scene, its shapes and the routes its lines
 * are drawn along. Tests hold layout to thresholds on them; nothing in the app reads them.
 *
 * - **Crossings**: pairs of segments of two lines that cross each other properly.
 * - **Shared segments**: pairs of horizontal or vertical segments of two lines without a common end
 *   that lie on the same line and overlap by more than 4 units, which the eye cannot tell apart.
 * - **Lines through shapes**: lines with a segment through a shape that is neither one of their ends
 *   nor holds one. A shape counts when it is drawn as one block: a shape without contents, one that
 *   draws rows, or a collapsed container; an expanded container is crossed into and out of. A shape
 *   that covers one of the line's ends, as a pinned shape may (ADR 0080's consequences), cannot be
 *   gone around: **lines over covering shapes** counts those lines apart.
 * - **Overlapping siblings**: pairs of shapes in the same container, or both in World, that cover
 *   each other by more than a unit, one of them at least not pinned; rows and anchored parts, whose
 *   places are not layout's, are left out. Pinned shapes that cover each other stay so, since layout
 *   moves neither (ADR 0080's consequences): **pinned overlaps** counts them apart.
 * - **Ends at their row**: of the line ends on rows, those that lie on a side of the row's table, at
 *   the row's middle, within 2 units.
 * - **Bends**: turns of more than 20 degrees along a route; **length**: along the route.
 * - **Fill**: the area of the shapes drawn as one block over the area of the box holding World's
 *   contents; **aspect**: that box's width over its height.
 */
import type { Point, Rect } from '../geometry';
import type { ElementShape, RelationLine, Scene } from '../scene';

/** What `measureScene` finds. */
export interface LayoutQuality {
  /** The lines measured: those with a route of two points or more that `lines` keeps. */
  lines: number;
  crossings: number;
  crossingsPerLine: number;
  sharedSegments: number;
  /** How long the shared segments run in all. */
  sharedLength: number;
  linesThroughShapes: number;
  /** Lines through a shape that covers one of their ends, counted apart from `linesThroughShapes`. */
  linesOverCoveringShapes: number;
  overlappingSiblings: number;
  pinnedOverlaps: number;
  rowEnds: number;
  rowEndsAtMiddle: number;
  bends: number;
  bendsPerLine: number;
  meanLength: number;
  maxLength: number;
  fill: number;
  aspect: number;
  width: number;
  height: number;
}

/** How a measure is taken. */
export interface MeasureOptions {
  /** Which lines the measures of lines take; every line by default. */
  lines?: (line: RelationLine) => boolean;
}

/** How far a row's end may lie from its row's middle and still count as there. */
const AT_ROW = 2;
/** How much two segments on one line must overlap to count as shared. */
const SHARED_OVERLAP = 4;
/** How far apart two parallel segments may be and still count as on the same line. */
const SAME_LINE = 0.5;
/** A turn of more than this many radians is a bend: 20 degrees. */
const BEND = 0.35;
/** The cells segments are indexed by, so that pairs are compared only nearby. */
const CELL = 256;

interface Segment {
  line: number;
  a: Point;
  b: Point;
}

/** The measures of a scene as drawn. */
export function measureScene(scene: Scene, options: MeasureOptions = {}): LayoutQuality {
  const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
  const keep = options.lines ?? (() => true);
  const lines = scene.relations.filter((line) => line.route.length >= 2 && keep(line));
  const blocks = scene.shapes.filter(drawnAsBlock);

  const segments: Segment[] = [];
  let bends = 0;
  let total = 0;
  let longest = 0;
  let rowEnds = 0;
  let rowEndsAtMiddle = 0;
  lines.forEach((line, at) => {
    const own = segmentsOf(line.route, at);
    segments.push(...own);
    let length = 0;
    own.forEach((segment, index) => {
      length += Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
      const before = own[index - 1];
      if (before && turn(before, segment) > BEND) bends += 1;
    });
    total += length;
    longest = Math.max(longest, length);
    const ends = line.ends;
    if (!ends) return;
    const first = line.route[0] as Point;
    const last = line.route[line.route.length - 1] as Point;
    for (const [end, point] of [
      [ends.from, first],
      [ends.to, last],
    ] as const) {
      if (end.kind !== 'shape') continue;
      const row = byKey.get(end.key);
      if (row?.row === undefined) continue;
      const table = row.containerShape === undefined ? undefined : byKey.get(row.containerShape);
      if (!table) continue;
      rowEnds += 1;
      if (atRowMiddle(point, row.rect, table.rect)) rowEndsAtMiddle += 1;
    }
  });

  const endKeys = lines.map(endKeysOf);
  let crossings = 0;
  let sharedSegments = 0;
  let sharedLength = 0;
  forNearbyPairs(segments, (one, other) => {
    if (one.line === other.line) return;
    if (crossProperly(one.a, one.b, other.a, other.b)) crossings += 1;
    const shared = sharedRun(one, other);
    if (shared <= SHARED_OVERLAP) return;
    const a = endKeys[one.line] as readonly string[];
    const b = endKeys[other.line] as readonly string[];
    if (a.some((key) => b.includes(key))) return;
    sharedSegments += 1;
    sharedLength += shared;
  });

  let linesThroughShapes = 0;
  let linesOverCoveringShapes = 0;
  lines.forEach((line, at) => {
    const ends = holdersOf(line, byKey);
    const tables = endTablesOf(line, byKey);
    const own = segments.filter((segment) => segment.line === at);
    let covering = false;
    const through = blocks.some((shape) => {
      if (ends.has(shape.key)) return false;
      const rect = shape.plate ?? shape.rect;
      if (!own.some((segment) => segmentThrough(segment.a, segment.b, rect))) return false;
      if (tables.some((table) => covers(table, rect))) {
        covering = true;
        return false;
      }
      return true;
    });
    if (through) linesThroughShapes += 1;
    else if (covering) linesOverCoveringShapes += 1;
  });

  const siblings = new Map<string, ElementShape[]>();
  for (const shape of scene.shapes) {
    if (shape.row !== undefined || shape.part?.inDrawing === true) continue;
    const key = shape.containerShape ?? '';
    const list = siblings.get(key) ?? [];
    list.push(shape);
    siblings.set(key, list);
  }
  let overlappingSiblings = 0;
  let pinnedOverlaps = 0;
  for (const list of siblings.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const one = list[i] as ElementShape;
        const other = list[j] as ElementShape;
        if (!covers(one.rect, other.rect)) continue;
        if (one.positioned === 'pinned' && other.positioned === 'pinned') pinnedOverlaps += 1;
        else overlappingSiblings += 1;
      }
    }
  }

  const tops = scene.shapes.filter((shape) => shape.containerShape === undefined);
  const box = boundsOfRects(tops.map((shape) => shape.extent));
  const width = box ? box.width : 0;
  const height = box ? box.height : 0;
  const area = blocks.reduce((sum, shape) => sum + shape.rect.width * shape.rect.height, 0);
  const count = Math.max(1, lines.length);
  return {
    lines: lines.length,
    crossings,
    crossingsPerLine: round(crossings / count),
    sharedSegments,
    sharedLength: Math.round(sharedLength),
    linesThroughShapes,
    linesOverCoveringShapes,
    overlappingSiblings,
    pinnedOverlaps,
    rowEnds,
    rowEndsAtMiddle,
    bends,
    bendsPerLine: round(bends / count),
    meanLength: Math.round(total / count),
    maxLength: Math.round(longest),
    fill: round(area / Math.max(1, width * height)),
    aspect: round(width / Math.max(1, height)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Whether a shape is drawn as one block that lines go around: see the module's comment. */
function drawnAsBlock(shape: ElementShape): boolean {
  if (shape.row !== undefined || shape.part?.inDrawing === true) return false;
  return !shape.holdsContents || shape.rowCount !== undefined || shape.collapsed !== undefined;
}

/** The keys a line's ends count by for sharing: each end's shape, or the relation it ends on. */
function endKeysOf(line: RelationLine): string[] {
  const ends = line.ends;
  if (!ends) return [`line ${line.relation}`];
  return [ends.from, ends.to].map((end) =>
    end.kind === 'shape' ? end.key : `relation ${end.relation}`,
  );
}

/** The keys of a line's end shapes and of every shape that holds one, which it may run through. */
function holdersOf(line: RelationLine, byKey: ReadonlyMap<string, ElementShape>): Set<string> {
  const keys = new Set<string>();
  const ends = line.ends;
  if (!ends) return keys;
  for (const end of [ends.from, ends.to]) {
    if (end.kind !== 'shape') continue;
    for (let key: string | undefined = end.key; key !== undefined;) {
      keys.add(key);
      key = byKey.get(key)?.containerShape;
    }
  }
  return keys;
}

/** The rectangles of a line's end shapes, a row's table in place of the row. */
function endTablesOf(line: RelationLine, byKey: ReadonlyMap<string, ElementShape>): Rect[] {
  const ends = line.ends;
  if (!ends) return [];
  const rects: Rect[] = [];
  for (const end of [ends.from, ends.to]) {
    if (end.kind !== 'shape') continue;
    const shape = byKey.get(end.key);
    const table =
      shape?.row !== undefined && shape.containerShape !== undefined
        ? byKey.get(shape.containerShape)
        : shape;
    if (table) rects.push(table.rect);
  }
  return rects;
}

function atRowMiddle(point: Point, row: Rect, table: Rect): boolean {
  const middle = row.y + row.height / 2;
  const onSide =
    Math.abs(point.x - table.x) <= AT_ROW || Math.abs(point.x - (table.x + table.width)) <= AT_ROW;
  return onSide && Math.abs(point.y - middle) <= AT_ROW;
}

function segmentsOf(route: readonly Point[], line: number): Segment[] {
  const out: Segment[] = [];
  for (let at = 0; at + 1 < route.length; at++) {
    const a = route[at] as Point;
    const b = route[at + 1] as Point;
    if (a.x === b.x && a.y === b.y) continue;
    out.push({ line, a, b });
  }
  return out;
}

function turn(one: Segment, next: Segment): number {
  const first = Math.atan2(one.b.y - one.a.y, one.b.x - one.a.x);
  const second = Math.atan2(next.b.y - next.a.y, next.b.x - next.a.x);
  let angle = Math.abs(first - second);
  if (angle > Math.PI) angle = 2 * Math.PI - angle;
  return angle;
}

/** Calls `each` once for every pair of segments whose boxes share a cell of the index. */
function forNearbyPairs(segments: readonly Segment[], each: (a: Segment, b: Segment) => void) {
  const cells = new Map<string, number[]>();
  segments.forEach((segment, at) => {
    const x0 = Math.floor(Math.min(segment.a.x, segment.b.x) / CELL);
    const x1 = Math.floor(Math.max(segment.a.x, segment.b.x) / CELL);
    const y0 = Math.floor(Math.min(segment.a.y, segment.b.y) / CELL);
    const y1 = Math.floor(Math.max(segment.a.y, segment.b.y) / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const list = cells.get(key);
        if (list) list.push(at);
        else cells.set(key, [at]);
      }
    }
  });
  const seen = new Set<number>();
  const count = segments.length;
  for (const list of cells.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as number;
        const b = list[j] as number;
        const pair = a < b ? a * count + b : b * count + a;
        if (seen.has(pair)) continue;
        seen.add(pair);
        each(segments[a] as Segment, segments[b] as Segment);
      }
    }
  }
}

/** Whether two segments cross each other at a point inside both. */
function crossProperly(p: Point, q: Point, r: Point, s: Point): boolean {
  return crossesAt(p.x, p.y, q.x, q.y, r.x, r.y, s.x, s.y);
}

/**
 * Whether the segments p-q and r-s cross at a point inside both, from their coordinates: what
 * crossProperly says, with nothing made for each call, as routes are checked against every shape.
 */
function crossesAt(
  px: number,
  py: number,
  qx: number,
  qy: number,
  rx: number,
  ry: number,
  sx: number,
  sy: number,
): boolean {
  const d1 = (sx - rx) * (py - ry) - (sy - ry) * (px - rx);
  const d2 = (sx - rx) * (qy - ry) - (sy - ry) * (qx - rx);
  if (!apart(d1, d2)) return false;
  const d3 = (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d4 = (qx - px) * (sy - py) - (qy - py) * (sx - px);
  return apart(d3, d4);
}

/** Whether two orientations lie on either side of a line, beyond rounding. */
function apart(one: number, two: number): boolean {
  return (one > 1e-9 && two < -1e-9) || (one < -1e-9 && two > 1e-9);
}

/** How far two horizontal, or two vertical, segments on the same line run together; 0 otherwise. */
function sharedRun(one: Segment, other: Segment): number {
  const vertical = (segment: Segment) => Math.abs(segment.a.x - segment.b.x) < 0.01;
  const horizontal = (segment: Segment) => Math.abs(segment.a.y - segment.b.y) < 0.01;
  if (vertical(one) && vertical(other)) {
    if (Math.abs(one.a.x - other.a.x) > SAME_LINE) return 0;
    return overlapOf(one.a.y, one.b.y, other.a.y, other.b.y);
  }
  if (horizontal(one) && horizontal(other)) {
    if (Math.abs(one.a.y - other.a.y) > SAME_LINE) return 0;
    return overlapOf(one.a.x, one.b.x, other.a.x, other.b.x);
  }
  return 0;
}

function overlapOf(a0: number, a1: number, b0: number, b1: number): number {
  return (
    Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1))
  );
}

/** Whether a segment runs through a rectangle, 2 units in from its sides. */
export function segmentThrough(p: Point, q: Point, rect: Rect): boolean {
  const left = rect.x + 2;
  const top = rect.y + 2;
  const width = rect.width - 4;
  const height = rect.height - 4;
  if (width <= 0 || height <= 0) return false;
  const right = left + width;
  const bottom = top + height;
  if (p.x > left && p.x < right && p.y > top && p.y < bottom) return true;
  if (q.x > left && q.x < right && q.y > top && q.y < bottom) return true;
  // Its four sides, from the top left corner round.
  return (
    crossesAt(p.x, p.y, q.x, q.y, left, top, right, top) ||
    crossesAt(p.x, p.y, q.x, q.y, right, top, right, bottom) ||
    crossesAt(p.x, p.y, q.x, q.y, right, bottom, left, bottom) ||
    crossesAt(p.x, p.y, q.x, q.y, left, bottom, left, top)
  );
}

/** Whether two rectangles cover each other by more than a unit each way. */
export function covers(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1
  );
}

function boundsOfRects(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

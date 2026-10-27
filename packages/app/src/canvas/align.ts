/**
 * Aligning, distributing and the alignment guides (ADR 0074), worked out on rectangles in canvas
 * units with no drawing and no commands, so that the canvas, the menus, the keys and Claude's
 * `align_shapes` share one answer.
 *
 * - **Aligning** lines up edges or middles on the bounds of the rectangles given: all on the leftmost
 *   left edge, the rightmost right edge, and so on. Centers and middles go to the middle of the
 *   bounds, rounded once through the widest (or tallest) rectangle, so that aligning again moves
 *   nothing.
 * - **Distributing** keeps the first and the last rectangle along an axis, by their middles, and
 *   spaces the others between them with equal gaps, to within a unit.
 * - **Same width** and **same height** give every rectangle the widest's width or the tallest's height,
 *   each keeping its top left corner.
 * - **Guides** find where a moving rectangle's edges or middle come within a tolerance of another
 *   rectangle's, shift it onto the nearest, and say which lines to draw there.
 *
 * Every result is in whole units when what it was given is.
 */
import type { Rect } from './geometry';
import type { IndexedScene } from './hit';

/** The ways shapes can be aligned, distributed or sized alike, as the menus and Claude name them. */
export type AlignHow =
  | 'left'
  | 'centers'
  | 'right'
  | 'top'
  | 'middles'
  | 'bottom'
  | 'distribute-horizontally'
  | 'distribute-vertically'
  | 'same-width'
  | 'same-height';

/** Every way, in the order the menus list them. */
export const ALIGN_HOWS: readonly AlignHow[] = Object.freeze([
  'left',
  'centers',
  'right',
  'top',
  'middles',
  'bottom',
  'distribute-horizontally',
  'distribute-vertically',
  'same-width',
  'same-height',
]);

/** How many shapes a way needs: three to distribute, two otherwise. */
export function fewestFor(how: AlignHow): 2 | 3 {
  return how === 'distribute-horizontally' || how === 'distribute-vertically' ? 3 : 2;
}

/** Whether a way only moves shapes, rather than sizing them. */
export function onlyMoves(how: AlignHow): boolean {
  return how !== 'same-width' && how !== 'same-height';
}

/** One axis of a rectangle, read the same way for x and for y. */
interface Axis {
  start: (rect: Rect) => number;
  size: (rect: Rect) => number;
  at: (rect: Rect, start: number) => Rect;
  sized: (rect: Rect, size: number) => Rect;
}

const X: Axis = {
  start: (rect) => rect.x,
  size: (rect) => rect.width,
  at: (rect, x) => (x === rect.x ? rect : { ...rect, x }),
  sized: (rect, width) => (width === rect.width ? rect : { ...rect, width }),
};

const Y: Axis = {
  start: (rect) => rect.y,
  size: (rect) => rect.height,
  at: (rect, y) => (y === rect.y ? rect : { ...rect, y }),
  sized: (rect, height) => (height === rect.height ? rect : { ...rect, height }),
};

/**
 * The rectangles aligned, distributed or sized alike, in the order given. One that need not change is
 * the same object, so that what moves can be told by identity.
 */
export function alignedRects(rects: readonly Rect[], how: AlignHow): Rect[] {
  if (rects.length < fewestFor(how)) return [...rects];
  switch (how) {
    case 'left':
      return toStart(rects, X);
    case 'top':
      return toStart(rects, Y);
    case 'right':
      return toEnd(rects, X);
    case 'bottom':
      return toEnd(rects, Y);
    case 'centers':
      return toMiddle(rects, X);
    case 'middles':
      return toMiddle(rects, Y);
    case 'distribute-horizontally':
      return distributed(rects, X);
    case 'distribute-vertically':
      return distributed(rects, Y);
    case 'same-width':
      return sameSize(rects, X);
    case 'same-height':
      return sameSize(rects, Y);
  }
}

function toStart(rects: readonly Rect[], axis: Axis): Rect[] {
  const start = Math.min(...rects.map(axis.start));
  return rects.map((rect) => axis.at(rect, start));
}

function toEnd(rects: readonly Rect[], axis: Axis): Rect[] {
  const end = Math.max(...rects.map((rect) => axis.start(rect) + axis.size(rect)));
  return rects.map((rect) => axis.at(rect, end - axis.size(rect)));
}

/**
 * Each rectangle's middle on the bounds' middle: the largest is placed there, rounded, and every other
 * is centred inside it, its odd half unit to the start. The bounds of what this gives are the largest
 * one's, so doing it again changes nothing.
 */
function toMiddle(rects: readonly Rect[], axis: Axis): Rect[] {
  const start = Math.min(...rects.map(axis.start));
  const end = Math.max(...rects.map((rect) => axis.start(rect) + axis.size(rect)));
  const largest = Math.max(...rects.map(axis.size));
  const from = Math.round((start + end) / 2 - largest / 2);
  return rects.map((rect) => axis.at(rect, from + Math.floor((largest - axis.size(rect)) / 2)));
}

/**
 * The first and the last along the axis, by their middles, stay; the others are spaced between them
 * so that every gap is the same, each rounded to a whole unit on its own, so that two gaps differ by a
 * unit at most.
 */
function distributed(rects: readonly Rect[], axis: Axis): Rect[] {
  const middle = (rect: Rect) => axis.start(rect) + axis.size(rect) / 2;
  const order = rects
    .map((_, at) => at)
    .sort((a, b) => middle(rects[a] as Rect) - middle(rects[b] as Rect) || a - b);
  const first = rects[order[0] as number] as Rect;
  const last = rects[order.at(-1) as number] as Rect;
  const inner = order.slice(1, -1).map((at) => rects[at] as Rect);
  const firstEnd = axis.start(first) + axis.size(first);
  const taken = inner.reduce((sum, rect) => sum + axis.size(rect), 0);
  const gap = (axis.start(last) - firstEnd - taken) / (order.length - 1);
  const result = [...rects];
  let along = firstEnd;
  for (const at of order.slice(1, -1)) {
    const rect = rects[at] as Rect;
    along += gap;
    result[at] = axis.at(rect, Math.round(along));
    along += axis.size(rect);
  }
  return result;
}

function sameSize(rects: readonly Rect[], axis: Axis): Rect[] {
  const largest = Math.max(...rects.map(axis.size));
  return rects.map((rect) => axis.sized(rect, largest));
}

// ——— Guides ———

/** Which of a rectangle's lines along an axis a guide may meet: its start edge, its middle, its end. */
export type GuideEdge = 'start' | 'middle' | 'end';

/** The lines of a moving rectangle that guides look at, on each axis. */
export interface GuideEdges {
  readonly x: readonly GuideEdge[];
  readonly y: readonly GuideEdge[];
}

/** Every edge and the middle, on both axes: what a move looks at. */
export const ALL_EDGES: GuideEdges = Object.freeze({
  x: Object.freeze(['start', 'middle', 'end'] as const),
  y: Object.freeze(['start', 'middle', 'end'] as const),
});

/**
 * A guide drawn on the canvas, in canvas units: down the canvas at `at` for axis x, from `from` to
 * `to` down; across it at `at` for axis y, from `from` to `to` across.
 */
export interface GuideLine {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** How far guides shift a moving rectangle, and the lines they draw once it is shifted. */
export interface GuideSnap {
  dx: number;
  dy: number;
  lines: GuideLine[];
}

const EDGES: readonly GuideEdge[] = ['start', 'middle', 'end'];

function lineOf(rect: Rect, axis: 'x' | 'y', edge: GuideEdge): number {
  const start = axis === 'x' ? rect.x : rect.y;
  const size = axis === 'x' ? rect.width : rect.height;
  return edge === 'start' ? start : edge === 'middle' ? start + size / 2 : start + size;
}

/**
 * The shift of the smallest size, at most `tolerance` either way, that puts one of `values` on one of
 * `targets`; undefined when none is that near.
 */
export function guideShift(
  values: readonly number[],
  targets: readonly number[],
  tolerance: number,
): number | undefined {
  let best: number | undefined;
  for (const value of values) {
    for (const target of targets) {
      const shift = target - value;
      if (Math.abs(shift) > tolerance) continue;
      if (best === undefined || Math.abs(shift) < Math.abs(best)) best = shift;
    }
  }
  return best;
}

/** Every line, start, middle and end, of the candidates along an axis. */
export function guideTargets(candidates: readonly Rect[], axis: 'x' | 'y'): number[] {
  return candidates.flatMap((rect) => EDGES.map((edge) => lineOf(rect, axis, edge)));
}

/** How near two lines are to count as one, in canvas units: what floating point leaves between equals. */
const SAME_LINE = 1e-6;

/**
 * The guides to draw for a rectangle: one for each of its lines that `edges` names and that a
 * candidate's edge or middle lies on, across the rectangle and every candidate on it.
 */
export function guideLines(
  moving: Rect,
  candidates: readonly Rect[],
  edges: GuideEdges,
): GuideLine[] {
  const lines: GuideLine[] = [];
  for (const axis of ['x', 'y'] as const) {
    const seen = new Set<number>();
    for (const edge of edges[axis]) {
      const at = lineOf(moving, axis, edge);
      if (seen.has(at)) continue;
      const on = candidates.filter((rect) =>
        EDGES.some((each) => Math.abs(lineOf(rect, axis, each) - at) <= SAME_LINE),
      );
      if (on.length === 0) continue;
      seen.add(at);
      // Down the canvas for x, across it for y: the line spans the rectangles along the other axis.
      const across = axis === 'x' ? 'y' : 'x';
      const all = [moving, ...on];
      lines.push({
        axis,
        at,
        from: Math.min(...all.map((rect) => lineOf(rect, across, 'start'))),
        to: Math.max(...all.map((rect) => lineOf(rect, across, 'end'))),
      });
    }
  }
  return lines;
}

/**
 * Shifts a moving rectangle onto the nearest guide on each axis, at most `tolerance` away, as the
 * lines `edges` names meet the candidates' edges and middles; with the lines to draw then.
 */
export function snapToGuides(
  moving: Rect,
  candidates: readonly Rect[],
  tolerance: number,
  edges: GuideEdges,
): GuideSnap {
  const dx =
    guideShift(
      edges.x.map((edge) => lineOf(moving, 'x', edge)),
      guideTargets(candidates, 'x'),
      tolerance,
    ) ?? 0;
  const dy =
    guideShift(
      edges.y.map((edge) => lineOf(moving, 'y', edge)),
      guideTargets(candidates, 'y'),
      tolerance,
    ) ?? 0;
  const moved = dx === 0 && dy === 0 ? moving : { ...moving, x: moving.x + dx, y: moving.y + dy };
  return { dx, dy, lines: guideLines(moved, candidates, edges) };
}

/**
 * The shapes that can guide a rectangle moving in a container (key '' for World): those that sit
 * directly in it, as drawn, but the ones in `exclude`, found through the container's index near the
 * rectangle: in the band across `view` level with it, and the band down `view` beside it, `tolerance`
 * wider, since only a shape that meets one of them has an edge or a middle that near. In World, notes
 * guide too, but those whose ids are in `exclude`.
 */
export function guideCandidates(
  indexed: IndexedScene,
  container: string,
  moving: Rect,
  exclude: ReadonlySet<string>,
  view: Rect,
  tolerance: number,
): Rect[] {
  const across = {
    x: view.x,
    y: moving.y - tolerance,
    width: view.width,
    height: moving.height + 2 * tolerance,
  };
  const down = {
    x: moving.x - tolerance,
    y: view.y,
    width: moving.width + 2 * tolerance,
    height: view.height,
  };
  const index = indexed.contentsIndex(container);
  const found = new Map<string, Rect>();
  for (const band of [across, down]) {
    for (const shape of index.query(band)) {
      if (exclude.has(shape.key) || found.has(shape.key)) continue;
      // As it is drawn, which an overlay may size around what layout gave it (ADR 0055).
      found.set(shape.key, shape.rect);
    }
  }
  if (container === '') {
    const notes = indexed.scene.notes;
    for (const band of [across, down]) {
      for (const at of indexed.notes.query(band)) {
        const note = notes[at];
        if (!note || exclude.has(note.id) || found.has(note.id)) continue;
        found.set(note.id, note.rect);
      }
    }
  }
  return [...found.values()];
}

/**
 * The guides for a rectangle moving in a container: its candidates near it, and how far they shift
 * it, with the lines to draw then.
 */
export function guidesNear(
  indexed: IndexedScene,
  container: string,
  moving: Rect,
  exclude: ReadonlySet<string>,
  view: Rect,
  tolerance: number,
  edges: GuideEdges,
): GuideSnap {
  return snapToGuides(
    moving,
    guideCandidates(indexed, container, moving, exclude, view, tolerance),
    tolerance,
    edges,
  );
}

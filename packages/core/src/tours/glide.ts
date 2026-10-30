/**
 * How a tour step's shapes glide from the step before (ADR 0084): the shapes the two scenes share are
 * matched by element id, a copy drawn in several containers by its container path first and then by
 * the nearest copy, and each moves and resizes on screen from its place before to its place after, on
 * the camera's eased timing. A step that shares fewer than {@link MIN_GLIDE_SHARED} shapes, or more
 * than {@link MAX_GLIDE_SHAPES}, cuts instead, as one that asks to does and every step under reduced
 * motion. Pure: the scenes are the app's, which gives each shape's rectangle on screen.
 */
import type { Id, TourStep } from '@visual-anything/schema';
import {
  MAX_TOUR_MOVE_TIME,
  TOUR_MOVE_TIME,
  TOUR_MOVE_TIME_PER_UNIT,
  type ScreenSize,
} from './camera';

/** The most shapes that glide; past them a step cuts, since the eye cannot follow them anyway. */
export const MAX_GLIDE_SHAPES = 400;
/** The fewest shapes two steps share for the step to glide: with fewer there is nothing to follow. */
export const MIN_GLIDE_SHARED = 3;

/** A rectangle, in whatever space the caller places both scenes' shapes: the screen, for a glide. */
export interface GlideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A shape of an element as a scene draws it, for matching. */
export interface GlideShape {
  element: Id;
  /**
   * Its container path: the containers it is drawn in, from World down, joined as the caller likes,
   * the same way in both scenes. A shape's key in the app's scene is one.
   */
  path: string;
  rect: GlideRect;
}

/** Two shapes of one element, by their indexes in the scene before and the scene after. */
export interface GlidePair {
  before: number;
  after: number;
}

/** Why a step's shapes do not glide. */
export type GlideCutReason = 'opted-out' | 'reduced-motion' | 'too-few' | 'too-many';

/** How a step's shapes get from the step before: they glide, for so long, or the step cuts. */
export type GlidePlan =
  | { kind: 'glide'; pairs: GlidePair[]; duration: number }
  | { kind: 'cut'; reason: GlideCutReason; shared: number };

/**
 * The shapes two scenes share, matched by element: a copy with the same container path on both
 * sides first, then, among the copies left, the nearest pairs first. Symmetric: matching the other
 * way round gives the same pairs, swapped. Sorted by the shape before.
 */
export function matchShapes(
  before: readonly GlideShape[],
  after: readonly GlideShape[],
): GlidePair[] {
  const byElement = (shapes: readonly GlideShape[]) => {
    const found = new Map<Id, number[]>();
    shapes.forEach((shape, at) => {
      const list = found.get(shape.element);
      if (list) list.push(at);
      else found.set(shape.element, [at]);
    });
    return found;
  };
  const afterBy = byElement(after);
  const pairs: GlidePair[] = [];
  for (const [element, ours] of byElement(before)) {
    const theirs = afterBy.get(element);
    if (!theirs) continue;
    if (ours.length === 1 && theirs.length === 1) {
      pairs.push({ before: ours[0] as number, after: theirs[0] as number });
      continue;
    }
    // By container path first: copies drawn in the same containers on both sides.
    const paths = new Set(ours.map((at) => before[at]?.path));
    const leftOurs: number[] = [];
    const leftTheirs = theirs.filter((at) => !paths.has(after[at]?.path));
    const samePath = new Map<string, { ours: number[]; theirs: number[] }>();
    for (const at of ours) {
      const path = (before[at] as GlideShape).path;
      const group = samePath.get(path) ?? { ours: [], theirs: [] };
      group.ours.push(at);
      samePath.set(path, group);
    }
    for (const at of theirs) {
      const group = samePath.get((after[at] as GlideShape).path);
      group?.theirs.push(at);
    }
    for (const group of samePath.values()) {
      const matched = nearest(before, after, group.ours, group.theirs);
      pairs.push(...matched);
      const usedOurs = new Set(matched.map((pair) => pair.before));
      const usedTheirs = new Set(matched.map((pair) => pair.after));
      leftOurs.push(...group.ours.filter((at) => !usedOurs.has(at)));
      leftTheirs.push(...group.theirs.filter((at) => !usedTheirs.has(at)));
    }
    // Then by the nearest copy.
    pairs.push(...nearest(before, after, leftOurs, leftTheirs));
  }
  return pairs.sort((a, b) => a.before - b.before);
}

/**
 * Pairs copies nearest first, each once: the same pairs whichever side is which, since the order
 * the pairs are taken in depends on both shapes alike.
 */
function nearest(
  before: readonly GlideShape[],
  after: readonly GlideShape[],
  ours: readonly number[],
  theirs: readonly number[],
): GlidePair[] {
  if (ours.length === 0 || theirs.length === 0) return [];
  const candidates: { pair: GlidePair; distance: number; order: string }[] = [];
  for (const a of ours) {
    for (const b of theirs) {
      const one = before[a] as GlideShape;
      const two = after[b] as GlideShape;
      const signs = [signOf(one), signOf(two)].sort();
      candidates.push({
        pair: { before: a, after: b },
        distance: Math.hypot(middleX(one) - middleX(two), middleY(one) - middleY(two)),
        order: signs.join('\u0000'),
      });
    }
  }
  candidates.sort((x, y) =>
    x.distance !== y.distance
      ? x.distance - y.distance
      : x.order < y.order
        ? -1
        : x.order > y.order
          ? 1
          : 0,
  );
  const usedOurs = new Set<number>();
  const usedTheirs = new Set<number>();
  const pairs: GlidePair[] = [];
  for (const { pair } of candidates) {
    if (usedOurs.has(pair.before) || usedTheirs.has(pair.after)) continue;
    usedOurs.add(pair.before);
    usedTheirs.add(pair.after);
    pairs.push(pair);
  }
  return pairs;
}

function signOf(shape: GlideShape): string {
  const { x, y, width, height } = shape.rect;
  return `${shape.path}\u0000${x}\u0000${y}\u0000${width}\u0000${height}`;
}

const middleX = (shape: GlideShape) => shape.rect.x + shape.rect.width / 2;
const middleY = (shape: GlideShape) => shape.rect.y + shape.rect.height / 2;

/**
 * How a step's shapes get there from the step before, their rectangles on a screen of this size: a
 * glide of the shapes the two share, lasting {@link TOUR_MOVE_TIME} ms and
 * {@link TOUR_MOVE_TIME_PER_UNIT} ms more for each screen width the farthest one travels, a doubling
 * of its size counting as one, at most {@link MAX_TOUR_MOVE_TIME}; or a cut, and why.
 */
export function planGlide(
  before: readonly GlideShape[],
  after: readonly GlideShape[],
  options: {
    screen: ScreenSize;
    reducedMotion: boolean;
    transition?: TourStep['transition'];
  },
): GlidePlan {
  if (options.transition === 'cut') return { kind: 'cut', reason: 'opted-out', shared: 0 };
  if (options.reducedMotion) return { kind: 'cut', reason: 'reduced-motion', shared: 0 };
  const pairs = matchShapes(before, after);
  const shared = pairs.length;
  if (shared < MIN_GLIDE_SHARED) return { kind: 'cut', reason: 'too-few', shared };
  if (shared > MAX_GLIDE_SHAPES) return { kind: 'cut', reason: 'too-many', shared };
  const width = Math.max(1, options.screen.width);
  let travel = 0;
  for (const pair of pairs) {
    const one = before[pair.before] as GlideShape;
    const two = after[pair.after] as GlideShape;
    const moved =
      Math.hypot(middleX(two) - middleX(one), middleY(two) - middleY(one)) / width +
      Math.abs(Math.log2(Math.max(1e-6, two.rect.width) / Math.max(1e-6, one.rect.width)));
    if (moved > travel) travel = moved;
  }
  const duration = Math.round(
    Math.min(MAX_TOUR_MOVE_TIME, TOUR_MOVE_TIME + TOUR_MOVE_TIME_PER_UNIT * travel),
  );
  return { kind: 'glide', pairs, duration };
}

/** A shape's rectangle a part of the way, from 0 to 1, from its place before to its place after. */
export function glideRectAt(from: GlideRect, to: GlideRect, part: number): GlideRect {
  if (part <= 0) return from;
  if (part >= 1) return to;
  return {
    x: from.x + (to.x - from.x) * part,
    y: from.y + (to.y - from.y) * part,
    width: from.width + (to.width - from.width) * part,
    height: from.height + (to.height - from.height) * part,
  };
}

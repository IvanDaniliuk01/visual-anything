/**
 * Where layout puts things inside one container, or in World: shapes packed in rows when no relation
 * orders them, the block of arranged shapes placed clear of what layout keeps, and the size a shape
 * that holds contents takes, as the scene works it out. Pure, and run in the layout worker.
 */
import { boundsOf, type Point, type Rect, type Size } from '../geometry';
import { CONTENTS_ORIGIN } from '../scene';
import { GAP_BELOW, GAP_BESIDE, LAYOUT_STEP, NODE_GAP } from './types';

/**
 * The room the scene leaves around the contents of a container without a stored size, on its right
 * and bottom sides; the same as on its left.
 */
const CONTENTS_PADDING = CONTENTS_ORIGIN.x;
/** How much wider than tall shapes packed in rows are, about. */
export const ROWS_ASPECT = 1.6;

/** The nearest multiple of the layout step. */
export function roundToStep(value: number): number {
  return Math.round(value / LAYOUT_STEP) * LAYOUT_STEP + 0;
}

/** The smallest multiple of the layout step that is at least `value`. */
export function ceilToStep(value: number): number {
  return Math.ceil(value / LAYOUT_STEP) * LAYOUT_STEP + 0;
}

function floorToStep(value: number): number {
  return Math.floor(value / LAYOUT_STEP) * LAYOUT_STEP + 0;
}

/**
 * Places boxes in rows, in the order given, from (0, 0): left to right, and a new row below once a row
 * is about `ROWS_ASPECT` times wider than the rows are tall in all.
 */
export function packInRows(sizes: readonly Size[], gap = NODE_GAP): Point[] {
  if (sizes.length === 0) return [];
  const area = sizes.reduce((sum, size) => sum + (size.width + gap) * (size.height + gap), 0);
  const widest = Math.max(...sizes.map((size) => size.width));
  const rowWidth = Math.max(widest, Math.sqrt(area * ROWS_ASPECT));
  const places: Point[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const size of sizes) {
    if (x > 0 && x + size.width > rowWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    places.push({ x, y });
    x += size.width + gap;
    rowHeight = Math.max(rowHeight, size.height);
  }
  return places;
}

/** The container or World whose contents a block is placed among. */
export type BlockLevel =
  | { kind: 'container' }
  /** `now` holds the shapes of the block where they are before layout. */
  | { kind: 'world'; now: Rect | undefined };

/**
 * Where the top left corner of a block of arranged shapes goes, relative to its container's shape or
 * to the canvas, on the layout step and clear of every shape kept there:
 * - with nothing kept, at the container's contents origin, or in World where its shapes start now;
 * - otherwise beside what is kept when relations lead mostly between the two (to its right when they
 *   lead into the block, to its left in World when they lead out of it), and below it otherwise. In a
 *   container, never above or left of the contents origin.
 * `flow` counts the relations from kept shapes into the block, and from the block out to kept shapes.
 */
export function placeBlock(
  block: Size,
  level: BlockLevel,
  kept: readonly Rect[],
  flow: { into: number; out: number },
): Point {
  const inContainer = level.kind === 'container';
  const bounds = boundsOf(kept);
  if (!bounds) {
    if (inContainer) return { ...CONTENTS_ORIGIN };
    return { x: roundToStep(level.now?.x ?? 0), y: roundToStep(level.now?.y ?? 0) };
  }
  const top = inContainer
    ? Math.max(CONTENTS_ORIGIN.y, ceilToStep(bounds.y))
    : ceilToStep(bounds.y);
  if (flow.into > flow.out) {
    const beside = ceilToStep(bounds.x + bounds.width + GAP_BESIDE);
    return { x: inContainer ? Math.max(CONTENTS_ORIGIN.x, beside) : beside, y: top };
  }
  if (!inContainer && flow.out > flow.into) {
    return { x: floorToStep(bounds.x - GAP_BESIDE - block.width), y: top };
  }
  const below = ceilToStep(bounds.y + bounds.height + GAP_BELOW);
  return inContainer
    ? { x: CONTENTS_ORIGIN.x, y: Math.max(CONTENTS_ORIGIN.y, below) }
    : { x: roundToStep(bounds.x), y: below };
}

/**
 * The size of a shape that holds `contents`, as the scene gives it: a stored size grows to hold them,
 * and without one, the appearance's size grows to hold them with room to spare. A shape that holds
 * nothing keeps its stored size, or else its appearance's.
 */
export function measuredSize(
  contents: readonly Rect[],
  base: Size,
  stored: { width?: number | undefined; height?: number | undefined },
): Size {
  if (contents.length === 0) {
    return { width: stored.width ?? base.width, height: stored.height ?? base.height };
  }
  const right = Math.max(...contents.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...contents.map((rect) => rect.y + rect.height));
  return {
    width: grownTo(stored.width, base.width, right),
    height: grownTo(stored.height, base.height, bottom),
  };
}

function grownTo(stored: number | undefined, base: number, end: number): number {
  return stored === undefined ? Math.max(base, end + CONTENTS_PADDING) : Math.max(stored, end);
}

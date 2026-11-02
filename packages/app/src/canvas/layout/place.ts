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
export function packInRows(sizes: readonly Size[], gap = NODE_GAP, width?: number): Point[] {
  if (sizes.length === 0) return [];
  const widest = Math.max(...sizes.map((size) => size.width));
  const rowWidth = Math.max(widest, width ?? rowsWidth(sizes, gap));
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

/** How wide `packInRows` makes its rows by default: about `ROWS_ASPECT` times their height in all. */
function rowsWidth(sizes: readonly Size[], gap: number): number {
  const area = sizes.reduce((sum, size) => sum + (size.width + gap) * (size.height + gap), 0);
  return Math.sqrt(area * ROWS_ASPECT);
}

/** A block of shapes packed in rows: the width its rows wrap at, and the size it takes. */
export interface PackedRows {
  width: number;
  size: Size;
}

/**
 * The rows of a block left out of a layout's run, packed into the room beside or below the block the
 * run arranged, so that it leaves no hole beside it (A4, from the user's notes; ADR 0080's
 * clarification of 2026-10-31):
 *
 * - **below**, its rows wrap at the arranged block's width, so that they run under the whole of it,
 *   or at their own width when that is wider;
 * - **beside**, at the narrowest width, in steps of its widest shape, that keeps the block no taller
 *   than the arranged one, or at their own width when none does.
 */
export function packedInto(
  sizes: readonly Size[],
  arranged: Size,
  side: 'beside' | 'below',
  gap = NODE_GAP,
): PackedRows {
  const own = rowsWidth(sizes, gap);
  const widest = Math.max(0, ...sizes.map((size) => size.width));
  const sized = (width: number): PackedRows => {
    const places = packInRows(sizes, gap, width);
    const box = boundsOf(sizes.map((size, at) => ({ ...(places[at] as Point), ...size })));
    return { width, size: { width: box?.width ?? 0, height: box?.height ?? 0 } };
  };
  if (side === 'below') return sized(Math.max(own, arranged.width));
  for (let width = widest; width < own; width += widest + gap) {
    const packed = sized(width);
    if (packed.size.height <= arranged.height) return packed;
  }
  return sized(own);
}

/** The container or World whose contents a block is placed among. */
export type BlockLevel =
  /** `top`: where its contents start, under a face's header taller than the canvas's own. */
  | { kind: 'container'; top?: number }
  /** `now` holds the shapes of the block where they are before layout. */
  | { kind: 'world'; now: Rect | undefined };

/** Where a level's contents start from its top. */
function topOf(level: BlockLevel): number {
  return level.kind === 'container' ? Math.max(CONTENTS_ORIGIN.y, level.top ?? 0) : 0;
}

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
    if (inContainer) return { x: CONTENTS_ORIGIN.x, y: topOf(level) };
    return { x: roundToStep(level.now?.x ?? 0), y: roundToStep(level.now?.y ?? 0) };
  }
  const top = inContainer ? Math.max(topOf(level), ceilToStep(bounds.y)) : ceilToStep(bounds.y);
  if (flow.into > flow.out) {
    const beside = ceilToStep(bounds.x + bounds.width + GAP_BESIDE);
    return { x: inContainer ? Math.max(CONTENTS_ORIGIN.x, beside) : beside, y: top };
  }
  if (!inContainer && flow.out > flow.into) {
    return { x: floorToStep(bounds.x - GAP_BESIDE - block.width), y: top };
  }
  const below = ceilToStep(bounds.y + bounds.height + GAP_BELOW);
  return inContainer
    ? { x: CONTENTS_ORIGIN.x, y: Math.max(topOf(level), below) }
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

/**
 * The sizes of shapes that draw their contents as rows, as a table draws its columns (ADR 0023), and
 * where relations attach beside them. Pure: the scene, the drawing, the router and the layout input
 * all take their sizes from here, so they never disagree.
 *
 * A row is one band as wide as its container, all of one height, stacked under the container's
 * header in the model's order. Relations that end on a row leave its container's left or right side
 * at the row's middle, each row along a lane of its own a little way out; relations that end on the
 * container leave beside its header.
 */
import { SHEET, type Rect, type ShapeKind, type Size } from './geometry';

/** The header band of a shape that draws its contents as rows. */
export const ROWS_HEADER = 32;
/** The height of each row. */
export const ROW_HEIGHT = 24;
/** The room under the last row. */
export const ROWS_FOOT = 4;
/** The narrowest such shape. */
export const ROWS_MIN_WIDTH = 120;
/**
 * Below this scale, rows write nothing: at the scale names show from, a row's text would be about
 * five pixels tall, and writing thousands of them would spend the frame's budget on text nobody reads.
 */
export const ROWS_FROM = 0.7;

/** The side of a shape that draws rows that a relation leaves from. */
export type RowSide = 'left' | 'right';

/** How far out from its side the first lane runs. */
export const FIRST_LANE = 12;
/** How far apart the lanes of one side run. */
export const LANE_GAP = 4;
/**
 * The last lane: the seventh row with relations on a side, and every one after it, share it. The
 * last lane runs 36 units out, inside the 40 the stand-in row leaves between shapes, so that no stub
 * reaches the shape beside.
 */
export const MAX_LANE = 6;

/** The size of a shape that draws `rows` rows; an empty one keeps one empty row, so it can take a drop. */
export function measureRows(width: number, rows: number): Size {
  return {
    width: Math.max(ROWS_MIN_WIDTH, width),
    height: ROWS_HEADER + Math.max(1, rows) * ROW_HEIGHT + ROWS_FOOT,
  };
}

/**
 * The height of a collapsed shape that draws rows: its header and the room under it, on the sheet
 * that shows behind every collapsed container, so that its toggle still fits.
 */
export function collapsedRowsHeight(): number {
  return ROWS_HEADER + ROWS_FOOT + SHEET;
}

/** The width of a shape that draws rows: the one the view stores, else its appearance's, never below the narrowest. */
export function rowsWidth(stored: number | undefined, inherited: number): number {
  return Math.max(ROWS_MIN_WIDTH, stored ?? inherited);
}

/** The kind a shape that draws rows is drawn as: rows never sit inside an ellipse, a cylinder or a person. */
export function rowsShapeKind(kind: ShapeKind): ShapeKind {
  return kind === 'rounded-rectangle' ? kind : 'rectangle';
}

/** Where row `index` sits inside a shape whose rectangle is `rect`. */
export function rowRect(rect: Rect, index: number): Rect {
  return {
    x: rect.x,
    y: rect.y + ROWS_HEADER + index * ROW_HEIGHT,
    width: rect.width,
    height: ROW_HEIGHT,
  };
}

/** The middle of row `index`, where relations that end on it attach. */
export function rowMiddle(rect: Rect, index: number): number {
  return rect.y + ROWS_HEADER + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/** The middle of the header, where relations that end on the container itself attach. */
export function headerMiddle(rect: Rect): number {
  return rect.y + ROWS_HEADER / 2;
}

/** Where a lane runs, outward from a side of a container. */
export function laneX(container: Rect, side: RowSide, lane: number): number {
  const out = FIRST_LANE + LANE_GAP * Math.min(MAX_LANE, Math.max(0, lane));
  return side === 'right' ? container.x + container.width + out : container.x - out;
}

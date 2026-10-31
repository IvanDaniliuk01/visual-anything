/**
 * How shapes that draw their contents as rows, and their rows, are drawn (ADR 0023). The scene draws
 * a table and its rows apart: the table, in its band, draws its body, its header band in its fill, a
 * rule under the header and its border; each row, one band higher, draws its own band in its fill
 * from just inside the border, and a separator along its top from the second row on. A row draws no
 * border of its own. A row the emphasis hides is not drawn, so its line shows empty, in the body's
 * color, and the table keeps its size.
 *
 * Far out, a table is two blocks, its body and its header, and its rows draw nothing.
 *
 * The header writes its name, centered on its band, and its detail on the right; a row writes its
 * name on the left and its detail on the right, both small, and only when details show. A picture
 * goes before the name: in the header's icon square, and in a row's at its left (`shape-images.ts`).
 * Each text was fitted to its line by the scene (`fit.ts`), so none of them overlap.
 */
import type { CanvasTextOptions, Graphics, TextStyleOptions } from 'pixi.js';
import type { Color } from '@visual-anything/schema';
import {
  HEADER_DETAIL_INSET,
  HEADER_DETAIL_SIZE,
  HEADER_INSET,
  HEADER_NAME_SIZE,
  HEADER_TOGGLE,
  ROW_DETAIL_SIZE,
  ROW_ICON,
  ROW_INSET,
  ROW_NAME_SIZE,
} from './fit';
import { THEMES } from '../theme/themes';
import { readableTextColors } from './colors';
import { SHEET, bodyOf, grow, toggleRect, type Rect } from './geometry';
import { ROWS_FROM, ROWS_HEADER } from './rows';
import type { ElementShape } from './scene';
import { headerShift, showsPicture } from './shape-images';

/**
 * The colors of a theme that rows are drawn in (ADR-0033): the body of a shape that draws rows, which
 * shows under its rows, in its foot, in the empty row of an empty one and in the line of a row the
 * emphasis hides; and the line between two rows.
 */
export interface RowColors {
  body: Color;
  separator: Color;
}

/** The light theme's, which drawing takes when it is given no theme. */
export const LIGHT_ROWS: RowColors = {
  body: THEMES.light.canvas.rowsBody,
  separator: THEMES.light.canvas.rowSeparator,
};

/** The colors rows are drawn in, in a canvas theme. */
export function rowColorsOf(theme: { rowsBody: Color; rowSeparator: Color }): RowColors {
  return theme.rowsBody === LIGHT_ROWS.body && theme.rowSeparator === LIGHT_ROWS.separator
    ? LIGHT_ROWS
    : { body: theme.rowsBody, separator: theme.rowSeparator };
}

/**
 * Whether a shape's drawing takes colors from the theme besides its own: a shape that draws rows,
 * whose body is the theme's, and a row, whose separator is.
 */
export function rowsFollowTheme(shape: ElementShape): boolean {
  return shape.rowCount !== undefined || shape.row !== undefined;
}

/** How wide a shape's border is, as `draw.ts` strokes it. */
const BORDER = 1.5;
/** How wide the rule under the header is, drawn inside the header so that no row covers it. */
const RULE = 1.5;
/** How far in from the border each row's band starts and ends. */
const ROW_INSIDE = 1;
const SEPARATOR = 1;

/** The fonts text is drawn in, first available first, as `draw.ts` writes them. */
const FONT = ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'];

/** Whether a shape draws its contents as rows. */
export function drawsRows(shape: ElementShape): boolean {
  return shape.rowCount !== undefined;
}

/** Whether a shape is a row. */
export function isRow(shape: ElementShape): boolean {
  return shape.row !== undefined;
}

/** A rectangle to fill, and its color. */
export interface Block {
  color: Color;
  rect: Rect;
}

/**
 * What a shape that draws rows, or a row, draws far out: a table's body and header as two blocks
 * that do not overlap, inside its outline; nothing for a row. Undefined for any other shape.
 */
export function rowsBlocks(
  shape: ElementShape,
  outline: number,
  colors: RowColors = LIGHT_ROWS,
): { outline?: Block; fills: Block[] } | undefined {
  if (isRow(shape)) return { fills: [] };
  if (!drawsRows(shape)) return undefined;
  const body = bodyOf(shape);
  const inner = grow(body, -outline);
  if (inner.width <= 0 || inner.height <= 0) {
    return { fills: [{ color: shape.stroke, rect: body }] };
  }
  const header = Math.min(inner.height, Math.max(0, (shape.header ?? ROWS_HEADER) - outline));
  const fills: Block[] = [{ color: shape.fill, rect: { ...inner, height: header } }];
  if (inner.height > header) {
    fills.push({
      color: colors.body,
      rect: { ...inner, y: inner.y + header, height: inner.height - header },
    });
  }
  return { outline: { color: shape.stroke, rect: body }, fills };
}

/**
 * Draws a shape that draws rows, or a row, in full; says whether it did, which it does for no other
 * shape. A collapsed one shows the sheet behind it, as every collapsed container does.
 */
export function drawRowsShape(
  graphics: Graphics,
  shape: ElementShape,
  colors: RowColors = LIGHT_ROWS,
): boolean {
  if (isRow(shape)) {
    drawRow(graphics, shape, colors);
    return true;
  }
  if (!drawsRows(shape)) return false;
  const body = bodyOf(shape);
  if (body !== shape.rect) {
    const sheet = { ...body, x: body.x + SHEET, y: body.y + SHEET };
    drawTableBody(graphics, shape, sheet, false, colors);
  }
  drawTableBody(graphics, shape, body, true, colors);
  return true;
}

/** A table's body, header band, the rule under the header, and its border. */
function drawTableBody(
  graphics: Graphics,
  shape: ElementShape,
  rect: Rect,
  header: boolean,
  colors: RowColors,
): void {
  const { x, y, width, height } = rect;
  const rounded = shape.kind === 'rounded-rectangle';
  const radius = Math.min(8, width / 4, height / 2);
  const band = Math.min(shape.header ?? ROWS_HEADER, height);
  if (rounded) graphics.roundRect(x, y, width, height, radius).fill(colors.body);
  else graphics.rect(x, y, width, height).fill(colors.body);
  if (header) {
    if (rounded) {
      // The header follows the rounded top corners, as one path with a straight bottom.
      const r = Math.min(radius, band);
      graphics
        .moveTo(x, y + band)
        .lineTo(x, y + r)
        .arcTo(x, y, x + r, y, r)
        .lineTo(x + width - r, y)
        .arcTo(x + width, y, x + width, y + r, r)
        .lineTo(x + width, y + band)
        .closePath()
        .fill(shape.fill);
    } else {
      graphics.rect(x, y, width, band).fill(shape.fill);
    }
    if (band < height) graphics.rect(x, y + band - RULE, width, RULE).fill(shape.stroke);
  }
  const stroke = { color: shape.stroke, width: BORDER };
  if (rounded) graphics.roundRect(x, y, width, height, radius).stroke(stroke);
  else graphics.rect(x, y, width, height).stroke(stroke);
}

/** A row's band in its fill, inside its table's border, with a separator above it after the first. */
function drawRow(graphics: Graphics, shape: ElementShape, colors: RowColors): void {
  const { x, y, width, height } = shape.rect;
  const left = x + ROW_INSIDE;
  const inner = Math.max(0, width - 2 * ROW_INSIDE);
  graphics.rect(left, y, inner, height).fill(shape.fill);
  if ((shape.row ?? 0) > 0) graphics.rect(left, y, inner, SEPARATOR).fill(colors.separator);
}

/**
 * Writes the texts of a shape that draws rows, or of a row; says whether it did. `detail` says that a
 * text shows only when details show; `room` is the height it may take.
 */
export function writeRowsText(
  shape: ElementShape,
  write: (options: CanvasTextOptions, detail: boolean, room: number) => void,
): boolean {
  const fitted = shape.fitted;
  if (isRow(shape)) {
    if (!fitted) return true;
    const { x, y, width, height } = shape.rect;
    const colors = readableTextColors(shape.fill);
    const middle = y + height / 2;
    if (fitted.name !== '') {
      write(
        {
          text: fitted.name,
          anchor: { x: 0, y: 0.5 },
          // After the row's picture, when it shows one at its left.
          x: x + ROW_INSET + (showsPicture(shape) ? ROW_ICON : 0),
          y: middle,
          // In the detail's color, which a theme switch tints it to again, as it is written small.
          style: oneLine(ROW_NAME_SIZE, colors.detail),
        },
        true,
        height,
      );
    }
    if (fitted.detail !== '') {
      write(
        {
          text: fitted.detail,
          anchor: { x: 1, y: 0.5 },
          x: x + width - ROW_INSET,
          y: middle,
          style: oneLine(ROW_DETAIL_SIZE, colors.detail),
        },
        true,
        height,
      );
    }
    return true;
  }
  if (!drawsRows(shape)) return false;
  if (!fitted) return true;
  const body = bodyOf(shape);
  const colors = readableTextColors(shape.fill);
  const band = Math.min(shape.header ?? ROWS_HEADER, body.height);
  const middle = body.y + band / 2;
  if (fitted.name !== '') {
    write(
      {
        text: fitted.name,
        anchor: { x: 0, y: 0.5 },
        x: body.x + HEADER_INSET + headerShift(shape),
        y: middle,
        style: oneLine(HEADER_NAME_SIZE, colors.name, '600'),
      },
      false,
      band,
    );
  }
  if (fitted.detail !== '') {
    const toggle = toggleRect(shape) ? HEADER_TOGGLE : 0;
    write(
      {
        text: fitted.detail,
        anchor: { x: 1, y: 0.5 },
        x: body.x + body.width - HEADER_DETAIL_INSET - toggle,
        y: middle,
        style: oneLine(HEADER_DETAIL_SIZE, colors.detail),
      },
      true,
      band,
    );
  }
  return true;
}

function oneLine(
  fontSize: number,
  fill: Color,
  fontWeight: TextStyleOptions['fontWeight'] = 'normal',
): TextStyleOptions {
  return { fontFamily: FONT, fontSize, fontWeight, fill, align: 'left', wordWrap: false };
}

/**
 * The level of detail a tile of shapes shows when the scale asks for `wanted`: a tile that holds rows
 * writes its rows' texts, which show only with details, from `ROWS_FROM` on, and nothing of them
 * below it, however few shapes are on screen.
 */
export function levelWithRows<L extends 0 | 1 | 2>(
  shapes: readonly ElementShape[],
  wanted: L,
  scale: number,
): L | 1 | 2 {
  if (wanted === 0 || !holdsRows(shapes)) return wanted;
  return scale >= ROWS_FROM ? 2 : 1;
}

const rowsInTiles = new WeakMap<readonly ElementShape[], boolean>();

/** Whether some of these shapes are rows, worked out once for each list. */
export function holdsRows(shapes: readonly ElementShape[]): boolean {
  let rows = rowsInTiles.get(shapes);
  if (rows === undefined) {
    rows = shapes.some(isRow);
    rowsInTiles.set(shapes, rows);
  }
  return rows;
}

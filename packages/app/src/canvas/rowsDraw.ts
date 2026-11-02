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
import type { ResolvedDrawing } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import {
  HEADER_DETAIL_INSET,
  HEADER_INSET,
  HEADER_TOGGLE,
  ROW_ICON,
  ROW_INSET,
  rowTextSizesOf,
  type RowColumns,
} from './fit';
import { MONO_FAMILY } from './fontFamilies';
import { BASE_DRAWING, fontFamilyOf, nameWeightOf, rowsCornerRadius } from './drawing';
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

/**
 * How far in from the border each row's band starts and ends, and how wide the line between two
 * rows is. A table's border and the rule under its header are as wide as every shape's border, the
 * drawing defaults' `shapes.borderWidth` (ADR 0086).
 */
export const ROW_INSIDE = 1;
export const ROW_SEPARATOR = 1;

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
  drawing: ResolvedDrawing = BASE_DRAWING,
): boolean {
  if (isRow(shape)) {
    drawRow(graphics, shape, colors);
    return true;
  }
  if (!drawsRows(shape)) return false;
  const body = bodyOf(shape);
  if (body !== shape.rect) {
    const sheet = { ...body, x: body.x + SHEET, y: body.y + SHEET };
    drawTableBody(graphics, shape, sheet, false, colors, drawing);
  }
  drawTableBody(graphics, shape, body, true, colors, drawing);
  return true;
}

/** A table's body, header band, the rule under the header, and its border. */
function drawTableBody(
  graphics: Graphics,
  shape: ElementShape,
  rect: Rect,
  header: boolean,
  colors: RowColors,
  drawing: ResolvedDrawing,
): void {
  const { x, y, width, height } = rect;
  const rounded = shape.kind === 'rounded-rectangle';
  const radius = rowsCornerRadius(drawing, width, height);
  const border = drawing.shapes.borderWidth;
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
    if (band < height) graphics.rect(x, y + band - border, width, border).fill(shape.stroke);
  }
  const stroke = { color: shape.stroke, width: border };
  if (rounded) graphics.roundRect(x, y, width, height, radius).stroke(stroke);
  else graphics.rect(x, y, width, height).stroke(stroke);
}

/** A row's band in its fill, inside its table's border, with a separator above it after the first. */
function drawRow(graphics: Graphics, shape: ElementShape, colors: RowColors): void {
  const { x, y, width, height } = shape.rect;
  const left = x + ROW_INSIDE;
  const inner = Math.max(0, width - 2 * ROW_INSIDE);
  graphics.rect(left, y, inner, height).fill(shape.fill);
  if ((shape.row ?? 0) > 0) graphics.rect(left, y, inner, ROW_SEPARATOR).fill(colors.separator);
}

/**
 * Writes the texts of a shape that draws rows, or of a row; says whether it did. `detail` says that a
 * text shows only when details show; `room` is the height it may take.
 */
export function writeRowsText(
  shape: ElementShape,
  write: (options: CanvasTextOptions, detail: boolean, room: number) => void,
  drawing: ResolvedDrawing = BASE_DRAWING,
): boolean {
  const fitted = shape.fitted;
  const sizes = rowTextSizesOf(drawing);
  const oneLine = (fontSize: number, fill: Color, fontWeight: TextStyleOptions['fontWeight']) =>
    lineStyle(fontSize, fill, fontWeight, drawing);
  if (isRow(shape)) {
    if (!fitted) return true;
    const { x, y, width, height } = shape.rect;
    const colors = readableTextColors(shape.fill);
    const middle = y + height / 2;
    if (shape.columns) {
      writeRowColumns(shape, shape.columns, write, colors.detail, drawing);
      return true;
    }
    if (fitted.name !== '') {
      write(
        {
          text: fitted.name,
          anchor: { x: 0, y: 0.5 },
          // After the row's picture, when it shows one at its left.
          x: x + ROW_INSET + (showsPicture(shape) ? ROW_ICON : 0),
          y: middle,
          // In the detail's color, which a theme switch tints it to again, as it is written small.
          style: oneLine(sizes.rowName, colors.detail, 'normal'),
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
          style: oneLine(sizes.rowDetail, colors.detail, 'normal'),
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
        style: oneLine(sizes.headerName, colors.name, nameWeightOf(drawing)),
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
        style: oneLine(sizes.headerDetail, colors.detail, 'normal'),
      },
      true,
      band,
    );
  }
  return true;
}

/**
 * Writes a row's texts in its table's columns (A5.1): its name at the left, after its picture; its
 * column's type in Roboto Mono, one size under the row's name, from the type column's left edge, the
 * same x for every row of the table; its badges from the badges column's, at the right. A face keeps
 * its own layout (ADR 0083), and draws in place of all three.
 */
function writeRowColumns(
  shape: ElementShape,
  columns: RowColumns,
  write: (options: CanvasTextOptions, detail: boolean, room: number) => void,
  color: Color,
  drawing: ResolvedDrawing,
): void {
  const { x, y, height } = shape.rect;
  const middle = y + height / 2;
  const sizes = rowTextSizesOf(drawing);
  const at = (text: string, left: number, style: TextStyleOptions) => {
    if (text === '') return;
    write({ text, anchor: { x: 0, y: 0.5 }, x: left, y: middle, style }, true, height);
  };
  at(
    columns.name,
    x + ROW_INSET + (showsPicture(shape) ? ROW_ICON : 0),
    lineStyle(sizes.rowName, color, 'normal', drawing),
  );
  at(columns.type, x + columns.typeX, {
    ...lineStyle(sizes.rowDetail, color, 'normal', drawing),
    fontFamily: [...MONO_FAMILY],
  });
  at(columns.badges, x + columns.badgesX, lineStyle(sizes.rowDetail, color, 'normal', drawing));
}

function lineStyle(
  fontSize: number,
  fill: Color,
  fontWeight: TextStyleOptions['fontWeight'],
  drawing: ResolvedDrawing,
): TextStyleOptions {
  const fontFamily = fontFamilyOf(drawing);
  return { fontFamily, fontSize, fontWeight, fill, align: 'left', wordWrap: false };
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
  rowsFrom = ROWS_FROM,
): L | 1 | 2 {
  if (wanted === 0 || !holdsRows(shapes)) return wanted;
  return scale >= rowsFrom ? 2 : 1;
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

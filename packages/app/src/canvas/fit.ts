/**
 * Fitting text to one line of a known width, from an estimate of each character's width rather than
 * from font metrics, so that the scene can work it out without drawing anything. The estimate leans
 * wide, so that a text it fits fits once drawn. Rows and the headers of shapes that draw rows write
 * one line each; their name and detail share it and never overlap.
 */

import type { ResolvedDrawing } from '@visual-anything/core';
import { BASE_DRAWING } from './drawing';

/**
 * The sizes texts are written at in the header of a shape that draws rows, and in a row, where the
 * drawing defaults say nothing else (`textSizesOf`, ADR 0086).
 */
export const HEADER_NAME_SIZE = BASE_DRAWING.text.nameSize;
export const HEADER_DETAIL_SIZE = BASE_DRAWING.text.detailSize;
export const ROW_NAME_SIZE = BASE_DRAWING.text.rowSize;
export const ROW_DETAIL_SIZE = BASE_DRAWING.text.rowSize - 1;

/** The sizes a header's and a row's texts are written at, and whether a header's name is bold. */
export interface RowTextSizes {
  headerName: number;
  headerNameBold: boolean;
  headerDetail: number;
  rowName: number;
  /** A row's detail, its column's type, one size under its name. */
  rowDetail: number;
}

const sizes = new WeakMap<ResolvedDrawing, RowTextSizes>();

/**
 * The sizes in a drawing: a header's name at `text.nameSize` in the name's weight, its detail at
 * `text.detailSize`, a row's name at `text.rowSize` and its detail one under.
 */
export function rowTextSizesOf(drawing: ResolvedDrawing = BASE_DRAWING): RowTextSizes {
  let known = sizes.get(drawing);
  if (known === undefined) {
    const { nameSize, nameWeight, detailSize, rowSize } = drawing.text;
    known = {
      headerName: nameSize,
      headerNameBold: nameWeight !== 400,
      headerDetail: detailSize,
      rowName: rowSize,
      rowDetail: rowSize - 1,
    };
    sizes.set(drawing, known);
  }
  return known;
}

/** Where a header's and a row's texts start and end, inside the shape's rectangle. */
export const HEADER_INSET = 12;
export const HEADER_DETAIL_INSET = 10;
export const ROW_INSET = 10;
/** The room an icon takes beside a header's name, and beside a row's. */
export const HEADER_ICON = 24;
export const ROW_ICON = 22;
/** The room the toggle that collapses a container takes at the right of its header. */
export const HEADER_TOGGLE = 20;
/** The space kept between a name and its detail on one line. */
export const BETWEEN = 8;

const NARROW = new Set("il.,:;'!|");
const WIDE = new Set('mwMW@');
const ELLIPSIS = '…';
/** How much wider bold text is, and the margin the whole estimate keeps. */
const BOLD = 1.06;
const MARGIN = 1.08;

/** How wide a character is, in ems. */
function emsOf(character: string): number {
  if (NARROW.has(character)) return 0.3;
  if (WIDE.has(character)) return 0.86;
  if (character === ELLIPSIS) return 0.9;
  if (character !== character.toLowerCase() && character === character.toUpperCase()) return 0.68;
  return 0.56;
}

/** How wide a text is estimated to be, written at `fontSize`, bold or not. */
export function estimateWidth(text: string, fontSize: number, bold = false): number {
  let ems = 0;
  for (const character of text) ems += emsOf(character);
  return ems * fontSize * (bold ? BOLD : 1) * MARGIN;
}

/** A text on one line: its line breaks become spaces. */
function oneLine(text: string): string {
  return /[\r\n]/.test(text) ? text.replace(/\s*[\r\n]+\s*/g, ' ') : text;
}

/**
 * A text cut to fit `width` on one line: whole when it fits, otherwise cut at the last character that
 * fits with "…" after it, or nothing when not even "…" fits.
 */
export function fitText(text: string, width: number, fontSize: number, bold = false): string {
  const line = oneLine(text);
  if (estimateWidth(line, fontSize, bold) <= width) return line;
  const scale = fontSize * (bold ? BOLD : 1) * MARGIN;
  let left = width / scale - emsOf(ELLIPSIS);
  if (left < 0) return '';
  let kept = '';
  for (const character of line) {
    left -= emsOf(character);
    if (left < 0) break;
    kept += character;
  }
  return `${kept.trimEnd()}${ELLIPSIS}`;
}

/** Whether a header or a row has an icon beside its name, and a header the collapse toggle. */
export interface FitRoom {
  icon?: boolean;
  toggle?: boolean;
}

/** The room a header's name and detail share on its line. */
export function headerRoom(width: number, { icon = false, toggle = false }: FitRoom = {}): number {
  return width - 2 * HEADER_INSET - (icon ? HEADER_ICON : 0) - (toggle ? HEADER_TOGGLE : 0);
}

/** The room a row's name and detail share on its line. */
export function rowRoom(width: number, { icon = false }: FitRoom = {}): number {
  return width - 2 * ROW_INSET - (icon ? ROW_ICON : 0);
}

/** A name and a detail fitted to one line, and whether the detail was cut to fit. */
export interface FittedLine {
  name: string;
  detail: string;
  detailCut?: boolean;
}

/**
 * A header's name and detail fitted to its line: the detail first, to at most 40% of the room, then
 * the name to what is left, so that the two never overlap.
 */
export function fitHeader(
  name: string,
  detail: string,
  width: number,
  room: FitRoom = {},
  drawing: ResolvedDrawing = BASE_DRAWING,
): FittedLine {
  const text = rowTextSizesOf(drawing);
  return fitLine(name, detail, headerRoom(width, room), 0.4, {
    name: [text.headerName, text.headerNameBold],
    detail: [text.headerDetail, false],
  });
}

/**
 * A row's name and detail fitted to its line: the detail first, to at most 45% of the room, then the
 * name to what is left.
 */
export function fitRow(
  name: string,
  detail: string,
  width: number,
  room: FitRoom = {},
  drawing: ResolvedDrawing = BASE_DRAWING,
): FittedLine {
  const text = rowTextSizesOf(drawing);
  return fitLine(name, detail, rowRoom(width, room), 0.45, {
    name: [text.rowName, false],
    detail: [text.rowDetail, false],
  });
}

function fitLine(
  name: string,
  detail: string,
  room: number,
  detailShare: number,
  sizes: { name: [number, boolean]; detail: [number, boolean] },
): FittedLine {
  const [detailSize, detailBold] = sizes.detail;
  const [nameSize, nameBold] = sizes.name;
  const fittedDetail =
    detail === '' ? '' : fitText(detail, Math.max(0, room * detailShare), detailSize, detailBold);
  const taken =
    fittedDetail === '' ? 0 : estimateWidth(fittedDetail, detailSize, detailBold) + BETWEEN;
  return {
    name: fitText(name, Math.max(0, room - taken), nameSize, nameBold),
    detail: fittedDetail,
    // Told from the source, since a detail may end in "…" of its own.
    ...(detail !== '' && fittedDetail !== oneLine(detail) ? { detailCut: true } : {}),
  };
}

// --- A table's rows in columns (A5.1, ADR 0086's clarification) -----------------------------------

/**
 * What a row of a table writes in columns: its name at the left; its column's type in Roboto Mono, in
 * a column of its own, right-aligned so that every type of its table ends at one x, `typeEnd`, as the
 * data-modeling face writes them (ADR 0086); and its badges in a column after it, at the right.
 * `typeX`, `typeEnd` and `badgesX` are from the row's left side.
 */
export interface RowColumns {
  name: string;
  type: string;
  badges: string;
  typeX: number;
  typeEnd: number;
  badgesX: number;
}

/** How wide a table's type and badges columns are: as its widest, within a share of its room. */
export interface ColumnWidths {
  type: number;
  badges: number;
}

/** The most of a row's room its type column takes, and its badges column. */
const TYPE_SHARE = 0.45;
const BADGES_SHARE = 0.3;
/** How wide a monospace character is, in ems: Roboto Mono advances every glyph by 0.6 em. */
const MONO_EMS = 0.6;

/** How wide a text is in Roboto Mono at `size`. */
export function monoWidth(text: string, size: number): number {
  return [...text].length * MONO_EMS * size;
}

/** A text cut to fit `width` in Roboto Mono at `size`, with "…" in place of what is cut. */
export function fitMono(text: string, width: number, size: number): string {
  const line = oneLine(text);
  const characters = [...line];
  const fits = Math.floor(width / (MONO_EMS * size) + 1e-6);
  if (characters.length <= fits) return line;
  if (fits < 2) return '';
  return `${characters
    .slice(0, fits - 1)
    .join('')
    .trimEnd()}${ELLIPSIS}`;
}

/**
 * The widths of a table's columns, `width` wide, from the type and badges each of its rows writes:
 * the widest type in Roboto Mono and the widest badges, at a row's detail size, each within its share
 * of a row's room.
 */
export function columnWidthsOf(
  rows: readonly { type: string; badges: string }[],
  width: number,
  drawing: ResolvedDrawing = BASE_DRAWING,
): ColumnWidths {
  const size = rowTextSizesOf(drawing).rowDetail;
  const room = rowRoom(width);
  let type = 0;
  let badges = 0;
  for (const row of rows) {
    if (row.type !== '') type = Math.max(type, monoWidth(oneLine(row.type), size));
    if (row.badges !== '') badges = Math.max(badges, estimateWidth(oneLine(row.badges), size));
  }
  return {
    type: Math.min(type, room * TYPE_SHARE),
    badges: Math.min(badges, room * BADGES_SHARE),
  };
}

/**
 * A row's texts in its table's columns, the row `width` wide: the badges column against the right,
 * the type column before it, and the name in what is left, after the row's picture when it shows one.
 */
export function fitRowColumns(
  name: string,
  type: string,
  badges: string,
  width: number,
  widths: ColumnWidths,
  room: FitRoom = {},
  drawing: ResolvedDrawing = BASE_DRAWING,
): RowColumns {
  const sizes = rowTextSizesOf(drawing);
  const badgesX = width - ROW_INSET - widths.badges;
  const typeEnd = widths.badges > 0 ? badgesX - BETWEEN : width - ROW_INSET;
  const typeX = typeEnd - widths.type;
  const nameStart = ROW_INSET + (room.icon ? ROW_ICON : 0);
  const nameEnd = widths.type > 0 ? typeX - BETWEEN : badgesX - BETWEEN;
  return {
    name: fitText(name, Math.max(0, nameEnd - nameStart), sizes.rowName),
    type: type === '' ? '' : fitMono(type, widths.type, sizes.rowDetail),
    badges: badges === '' ? '' : fitText(badges, widths.badges, sizes.rowDetail),
    typeX,
    typeEnd,
    badgesX,
  };
}

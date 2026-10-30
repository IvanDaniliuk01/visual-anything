/**
 * Where a shape writes its name and its detail (ADR 0082): the two as one block, placed in the
 * shape's label area by its `textPlacement`, 8 units in from the area's top or bottom. The room is
 * shared out in order: the name first, wrapped, then the detail, wrapped to its `lines` (3 unless
 * the appearance says otherwise) and to what the area holds, its last line ending in "…".
 *
 * It is pure, and measures with the function it is given: the canvas and the exports both in
 * Roboto's widths, the exports with a margin for the system fonts an SVG may be drawn in.
 * Containers, rows, name tags and shapes drawn by their picture write their text as they always
 * have, elsewhere.
 */
import { robotoWidth, type EmphasisRun } from '@visual-anything/core';
import { SYSTEM_FONT_MARGIN } from '../export/measure';
import { LINE_HEIGHT, layOutRuns, type LaidText, type Measure } from '../text/layout';
import type { Rect } from './geometry';

/** How big a shape's name and detail are written. */
export const NAME_SIZE = 14;
export const DETAIL_SIZE = 11;
/** How tall a line of each is, as the block is placed. */
export const NAME_LINE_HEIGHT = NAME_SIZE * LINE_HEIGHT;
export const DETAIL_LINE_HEIGHT = DETAIL_SIZE * LINE_HEIGHT;
/** How far in from its label area's top or bottom a block placed there starts or ends. */
export const BLOCK_INSET = 8;
/** How far in from its label area's ends a centred block keeps. */
const CENTRED_INSET = 2;
/** Between the name and the detail. */
const GAP = 2;
/** The lines a detail takes when its appearance says nothing. */
export const DEFAULT_DETAIL_LINES = 3;

/**
 * How wide a text is in the exports: in Roboto's widths, which the core holds (ADR 0083), its real
 * italic and bold italic widths included, with the margin the exports keep for the system fonts a
 * browser may draw an SVG in. Code is Roboto Mono, 0.6 em a character, with no margin.
 */
export const robotoMeasure: Measure = (text, variant, size) =>
  variant === 'mono'
    ? robotoWidth(text, 'mono', size)
    : robotoWidth(text, variant, size) * SYSTEM_FONT_MARGIN;

/**
 * How wide a text is on the canvas: exactly in Roboto's widths, the fonts the canvas draws in
 * (`robotoFonts.ts`), as faces are laid out, so that what is measured is what is drawn.
 */
export const canvasMeasure: Measure = (text, variant, size) => robotoWidth(text, variant, size);

/** A shape's text, as the block places it. */
export interface TextBlock {
  /** The top of the name's first line. */
  nameTop: number;
  /** How many lines of the name are written, and how tall they are. */
  nameLines: number;
  nameHeight: number;
  /** Whether the name was cut to fit. */
  nameCut: boolean;
  /**
   * The height its label may take: its lines and a quarter of one, which fonts draw a little shorter
   * than the block counts them.
   */
  nameRoom: number;
  /** The same for the detail; 0 when it writes none. */
  detailRoom: number;
  /** The top of the detail's first line, when it writes one. */
  detailTop: number;
  /** How many lines the detail takes, 0 when it writes none, and how tall they are. */
  detailLines: number;
  detailHeight: number;
  /** The detail laid out to those lines, when it writes some. */
  detail?: LaidText;
  /** Whether the detail was cut, or left out for want of room. */
  detailCut: boolean;
}

/** What a block is made from. */
export interface TextBlockInput {
  area: Rect;
  /** The widest a line may be. */
  wrap: number;
  name: string;
  /** The detail as written, and its runs when it takes text emphasis. */
  detail: string;
  detailRuns?: readonly EmphasisRun[];
  /** The most lines the detail takes. */
  lines?: number;
  placement?: 'top' | 'middle' | 'bottom';
  measure?: Measure;
  /** How the name is measured, when not by `measure` in bold. */
  measureName?: (text: string) => number;
  /**
   * A name laid out elsewhere, whole on its lines, as a shape with its own outline writes it
   * (`nameLinesInside`): how many lines it takes and how tall each is. The detail then wraps under it.
   */
  nameBlock?: { lines: number; lineHeight: number };
}

/** Places a shape's name and detail in its label area. */
export function placeTextBlock(input: TextBlockInput): TextBlock {
  const { area, wrap } = input;
  const measure = input.measure ?? robotoMeasure;
  const measureName = input.measureName ?? ((text: string) => measure(text, 'bold', NAME_SIZE));
  const placement = input.placement ?? 'middle';
  // A block at the top or the bottom keeps 8 units from the area's edge, which a low area gives up
  // before its name; a centred one may take the whole area but for a line's breath at each end.
  const inset =
    placement === 'middle'
      ? CENTRED_INSET
      : Math.max(CENTRED_INSET, Math.min(BLOCK_INSET, (area.height - NAME_LINE_HEIGHT) / 2));
  const usable = Math.max(0, area.height - 2 * inset);
  const given = input.nameBlock;
  const name = given
    ? undefined
    : layOutRuns([plainRun(input.name)], {
        measure: (text) => measureName(text),
        size: NAME_SIZE,
        width: wrap,
        align: 'center',
      });
  const lineHeight = given?.lineHeight ?? NAME_LINE_HEIGHT;
  const fitting = Math.max(1, Math.floor(usable / NAME_LINE_HEIGHT + 1e-6));
  const nameLines = given ? given.lines : Math.min(Math.max(1, name?.lines.length ?? 1), fitting);
  const nameHeight = nameLines * lineHeight;
  let detailLines = 0;
  let detail: LaidText | undefined;
  let detailCut = false;
  if (input.detail !== '') {
    const room = Math.floor((usable - nameHeight - GAP) / DETAIL_LINE_HEIGHT + 1e-6);
    const most = Math.min(input.lines ?? DEFAULT_DETAIL_LINES, Math.max(0, room));
    if (most > 0) {
      detail = layOutRuns(input.detailRuns ?? [plainRun(input.detail)], {
        measure,
        size: DETAIL_SIZE,
        width: wrap,
        align: 'center',
        maxLines: most,
      });
      detailLines = detail.lines.length;
      detailCut = detail.cut;
    } else {
      detailCut = true;
    }
  }
  const detailHeight = detailLines * DETAIL_LINE_HEIGHT;
  const height = nameHeight + (detailLines > 0 ? GAP + detailHeight : 0);
  const top =
    placement === 'top'
      ? area.y + inset
      : placement === 'bottom'
        ? area.y + area.height - inset - height
        : area.y + (area.height - height) / 2;
  return {
    nameTop: top,
    nameLines,
    nameHeight,
    nameCut: name !== undefined && name.lines.length > nameLines,
    nameRoom: nameHeight + lineHeight / 4,
    detailTop: top + nameHeight + GAP,
    detailLines,
    detailHeight,
    detailRoom: detailLines === 0 ? 0 : detailHeight + DETAIL_LINE_HEIGHT / 4,
    ...(detail ? { detail } : {}),
    detailCut,
  };
}

function plainRun(text: string): EmphasisRun {
  return {
    text,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    code: false,
    highlight: false,
  };
}

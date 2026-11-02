/**
 * How a shape writes its element's name (ADR 0088, A6.2): the parts of its appearance's `text` some
 * appearance sets, as the scene carries them, and what the canvas and the exports write from them.
 * A part no appearance sets is absent, and so is one that draws as nothing set does (an alignment in
 * the middle, a name written inside, wrapping, no italic, no underline), so that a shape whose
 * appearances set none draws exactly as it did before ADR 0088.
 *
 * - **The name's font** (`nameLookOf`): Roboto, the system's fonts or Roboto Mono, at its size, bold
 *   at 700 and regular at 400, the drawing defaults' weight otherwise; italic in Roboto's loaded
 *   Italic and Bold Italic, a Medium name taking Bold Italic, since no Medium Italic is loaded.
 *   Roboto Mono is loaded in one style: a name in it is written upright at 400, whatever bold and
 *   italic say, so that no weight or style the canvas has not loaded is ever asked for (ADR 0086).
 * - **Its lines** (`nameLinesOf`): wrapped at spaces to the width it is given, a word too wide
 *   broken where it reaches it, the last line ending in "…" past the lines it may take; without
 *   wrapping, on one line cut with "…".
 * - **Its colors** (`nameColorsOf`): its own text color, or the one that reads on what it is written
 *   on: its label back when it has one, the tag it sits in, or the shape's fill.
 * - **Its block in a box** (`styledTextBlock`): the name and detail placed as `textBlock.ts` places
 *   them, at the name's size, in from the area's edges by the shape's own padding, aligned to the
 *   left, the middle or the right, and the back behind them when the text has a background or a
 *   border.
 *
 * Pure, with no PixiJS, so that the scene, the canvas and the SVG writer read the same.
 */
import {
  adaptedForDark,
  type ResolvedAppearance,
  type ResolvedDrawing,
  type StoredColorsInDark,
} from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import type { FontVariant } from '../text/layout';
import { readableTextColors, type TextColors } from './colors';
import { BASE_DRAWING, fontFamilyOf, nameWeightOf } from './drawing';
import { MONO_FAMILY, ROBOTO, SANS_FAMILY } from './fontFamilies';
import type { Rect } from './geometry';
import { placeTextBlock, type TextBlock, type TextBlockInput } from './textBlock';

export { nameLinesOf, type NameLines } from './nameLines';

/** Where a name is written in a tag attached to its shape (ADR 0088), which generalizes name tags. */
export type TagSide = 'above' | 'below' | 'left' | 'right';

/** What a shape's appearances set of how it writes its name, each part absent where nothing differs. */
export interface ShapeText {
  font?: 'roboto' | 'system' | 'mono';
  /** The name's size, from 8 to 48. */
  size?: number;
  /** Bold at 700, or regular at 400; absent, the drawing defaults' weight. */
  bold?: boolean;
  italic?: true;
  underline?: true;
  /** Its lines' alignment, when not in the middle. */
  align?: 'left' | 'right';
  /** The side of the tag it is written in, when not inside the shape. */
  position?: TagSide;
  /** The name's own color, its label back's fill and its line, as stored. */
  color?: Color;
  background?: Color;
  border?: Color;
  /** On one line, cut with "…", rather than wrapped. */
  wrap?: false;
  /** The space between the label area's edge and the text, from 0 to 48. */
  padding?: number;
  /**
   * The colors drawn on the dark canvas where they differ from the stored ones: adapted, where the
   * drawing defaults ask for stored colors adapted there (ADR 0087).
   */
  dark?: { color?: Color; background?: Color; border?: Color };
}

const COLOR_PARTS = ['color', 'background', 'border'] as const;

/** What a resolved appearance sets of how its shapes write the name, or nothing when it sets none. */
export function shapeTextOf(
  appearance: ResolvedAppearance,
  storedInDark: StoredColorsInDark,
): ShapeText | undefined {
  const text = appearance.text;
  const own: ShapeText = {};
  if (text.font !== undefined) own.font = text.font;
  if (text.size !== undefined) own.size = text.size;
  if (text.bold !== undefined) own.bold = text.bold;
  if (text.italic === true) own.italic = true;
  if (text.underline === true) own.underline = true;
  if (text.align === 'left' || text.align === 'right') own.align = text.align;
  if (text.position !== undefined && text.position !== 'inside') own.position = text.position;
  if (text.wrap === false) own.wrap = false;
  if (text.padding !== undefined) own.padding = text.padding;
  for (const part of COLOR_PARTS) {
    const color = text[part];
    if (color === undefined) continue;
    own[part] = color;
    if (storedInDark === 'adapted') {
      const dark = adaptedForDark(color);
      if (dark !== color) own.dark = { ...own.dark, [part]: dark };
    }
  }
  return Object.keys(own).length === 0 ? undefined : own;
}

/** Whether two texts draw alike, part by part. */
export function sameShapeText(a: ShapeText | undefined, b: ShapeText | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.font === b.font &&
    a.size === b.size &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.align === b.align &&
    a.position === b.position &&
    a.color === b.color &&
    a.background === b.background &&
    a.border === b.border &&
    a.wrap === b.wrap &&
    a.padding === b.padding &&
    a.dark?.color === b.dark?.color &&
    a.dark?.background === b.dark?.background &&
    a.dark?.border === b.dark?.border
  );
}

/** A text with the colors it is drawn in on the dark canvas, where they differ. */
export function darkShapeText(text: ShapeText): ShapeText {
  const { dark, ...rest } = text;
  return dark ? { ...rest, ...dark } : rest;
}

/** The weights the canvas loads (`robotoFonts.ts`). */
export type LoadedWeight = '400' | '500' | '700';

/** How a name is written: its fonts, size, weight, style, the widths it is measured in, its line. */
export interface NameLook {
  /** The fonts, first available first. */
  family: readonly string[];
  size: number;
  weight: LoadedWeight;
  italic: boolean;
  /** The widths it is measured in. */
  variant: FontVariant;
  underline: boolean;
  /** Whether it is written in Roboto Mono. */
  mono: boolean;
  /** Whether it is written in the system's fonts alone. */
  system: boolean;
}

/** The system's fonts alone, as the drawing defaults' `system` font writes. */
const SYSTEM_FAMILY: readonly string[] = SANS_FAMILY.filter((family) => family !== ROBOTO);

/**
 * How a shape writes its name: the parts its text sets, over a size and weight that are the drawing
 * defaults' unless given, as a name tag gives its own.
 */
export function nameLookOf(
  text: ShapeText | undefined,
  drawing: ResolvedDrawing = BASE_DRAWING,
  baseSize: number = drawing.text.nameSize,
  baseWeight: LoadedWeight = nameWeightOf(drawing),
): NameLook {
  const font = text?.font;
  const mono = font === 'mono';
  const system = font === 'system' || (font === undefined && drawing.text.font === 'system');
  const family = mono
    ? MONO_FAMILY
    : font === 'system'
      ? SYSTEM_FAMILY
      : font === 'roboto'
        ? SANS_FAMILY
        : fontFamilyOf(drawing);
  // Roboto Mono is loaded upright at 400 alone.
  const weight: LoadedWeight = mono
    ? '400'
    : text?.bold === true
      ? '700'
      : text?.bold === false
        ? '400'
        : baseWeight;
  const italic = !mono && text?.italic === true;
  // No Medium Italic is loaded: a Medium name in italics is written in Bold Italic.
  const heavy = weight !== '400';
  const variant: FontVariant = mono
    ? 'mono'
    : italic
      ? heavy
        ? 'boldItalic'
        : 'italic'
      : heavy
        ? 'bold'
        : 'regular';
  return {
    family,
    size: text?.size ?? baseSize,
    weight: italic && heavy ? '700' : weight,
    italic,
    variant,
    underline: text?.underline === true,
    mono,
    system,
  };
}

/**
 * The colors a shape's name and detail are written in: its own text color for the name, else the
 * one that reads on its label back, or on `base`, the tag's fill or the shape's, as drawn in the
 * theme of the shape given (`paintedShape`). A shape whose text sets none of them writes as always.
 */
export function nameColorsOf(shape: { text?: ShapeText }, base: Color): TextColors {
  const text = shape.text;
  const colors = readableTextColors(text?.background ?? base);
  if (text?.color === undefined) return colors;
  return { name: text.color, detail: colors.detail };
}

/** How far a label back reaches past its text, across and down, and how round its corners are. */
export const LABEL_BACK = { x: 4, y: 2, radius: 3 } as const;

/** A shape's name and detail as one block in its label area, with how its name is written. */
export interface StyledBlock {
  block: TextBlock;
  look: NameLook;
  /** The name's lines, as written, and their widths. */
  lines: string[];
  widths: number[];
  /** How its lines are aligned, and the column they are aligned in. */
  align: 'left' | 'center' | 'right';
  left: number;
  right: number;
  /** The width its lines wrap at. */
  wrap: number;
  /** The back drawn behind the name and detail, when the text has a background or a border. */
  back?: Rect;
}

/**
 * A shape's name and detail placed in its label area as `placeTextBlock` places them, written as
 * its text says: the name at its size and in its widths, wrapped or cut, in from the area's sides
 * and its top or bottom by the text's own padding, and aligned in that column.
 */
export function styledTextBlock(input: TextBlockInput, text: ShapeText): StyledBlock {
  const drawing = input.drawing ?? BASE_DRAWING;
  const look = nameLookOf(text, drawing);
  const { padding } = text;
  const own: ResolvedDrawing = {
    ...drawing,
    text: { ...drawing.text, nameSize: look.size, ...(padding === undefined ? {} : { padding }) },
  };
  const { area } = input;
  const wrap = padding === undefined ? input.wrap : Math.max(1, area.width - 2 * padding);
  const block = placeTextBlock({
    ...input,
    drawing: own,
    wrap,
    styledName: { variant: look.variant, wrap: text.wrap !== false },
  });
  const named = block.nameText ?? { lines: [], widths: [] };
  const center = area.x + area.width / 2;
  const left = center - wrap / 2;
  const right = center + wrap / 2;
  const align = text.align ?? 'center';
  const styled: StyledBlock = {
    block,
    look,
    lines: named.lines,
    widths: named.widths,
    align,
    left,
    right,
    wrap,
  };
  if (text.background !== undefined || text.border !== undefined) {
    const widest = Math.max(0, ...named.widths, block.detail?.width ?? 0);
    const x = align === 'left' ? left : align === 'right' ? right - widest : center - widest / 2;
    const bottom =
      block.detailLines > 0
        ? block.detailTop + block.detailHeight
        : block.nameTop + block.nameHeight;
    if (widest > 0) {
      styled.back = {
        x: x - LABEL_BACK.x,
        y: block.nameTop - LABEL_BACK.y,
        width: widest + 2 * LABEL_BACK.x,
        height: bottom - block.nameTop + 2 * LABEL_BACK.y,
      };
    }
  }
  return styled;
}

/** Where a line of `width` starts, aligned in a column from `left` to `right`. */
export function lineStart(
  align: 'left' | 'center' | 'right',
  left: number,
  right: number,
  width: number,
): number {
  return align === 'left' ? left : align === 'right' ? right - width : (left + right - width) / 2;
}

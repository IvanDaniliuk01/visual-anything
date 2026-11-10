/**
 * Builds the two tables Math reads from KaTeX's fonts (ADR 0106), from each font's bytes: the advances
 * the layout places glyphs by, with each font's line metrics, and the outlines the exports draw glyphs
 * with. `generate.ts` writes them; `tables.test.ts` checks the committed ones against KaTeX's fonts.
 */
import type { MathFont } from './drawing';
import { outlinePath, readTrueType } from './ttf';

/** Every font KaTeX ships, in the tables' order. */
export const MATH_FONTS: readonly MathFont[] = [
  'AMS-Regular',
  'Caligraphic-Bold',
  'Caligraphic-Regular',
  'Fraktur-Bold',
  'Fraktur-Regular',
  'Main-Bold',
  'Main-BoldItalic',
  'Main-Italic',
  'Main-Regular',
  'Math-BoldItalic',
  'Math-Italic',
  'SansSerif-Bold',
  'SansSerif-Italic',
  'SansSerif-Regular',
  'Script-Regular',
  'Size1-Regular',
  'Size2-Regular',
  'Size3-Regular',
  'Size4-Regular',
  'Typewriter-Regular',
];

/** One font's line metrics and advances, in ems: code point (in decimal) to advance. */
export interface MathFontAdvances {
  ascent: number;
  /** Below the baseline, positive. */
  descent: number;
  advances: Record<string, number>;
}

export type MathAdvanceTable = Record<MathFont, MathFontAdvances>;

/** Per font, code point (in decimal) to the glyph's outline as SVG path data in ems, y down. */
export type MathOutlineTable = Record<MathFont, Record<string, string>>;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

export function buildAdvanceTable(fonts: ReadonlyMap<MathFont, Uint8Array>): MathAdvanceTable {
  const table = {} as MathAdvanceTable;
  for (const name of MATH_FONTS) {
    const font = readTrueType(fontBytes(fonts, name));
    const advances: Record<string, number> = {};
    for (const [codePoint, glyph] of font.glyphOf) {
      advances[codePoint] = round(font.advanceOf(glyph) / font.unitsPerEm);
    }
    table[name] = {
      ascent: round(font.ascent / font.unitsPerEm),
      descent: round(font.descent / font.unitsPerEm),
      advances,
    };
  }
  return table;
}

export function buildOutlineTable(fonts: ReadonlyMap<MathFont, Uint8Array>): MathOutlineTable {
  const table = {} as MathOutlineTable;
  for (const name of MATH_FONTS) {
    const font = readTrueType(fontBytes(fonts, name));
    const outlines: Record<string, string> = {};
    for (const [codePoint, glyph] of font.glyphOf) {
      const path = outlinePath(font.contoursOf(glyph), font.unitsPerEm);
      if (path !== '') outlines[codePoint] = path;
    }
    table[name] = outlines;
  }
  return table;
}

/** A table as the committed file holds it: two spaces, keys in order, a final line break. */
export function tableFile(table: MathAdvanceTable | MathOutlineTable): string {
  return `${JSON.stringify(table, null, 2)}\n`;
}

function fontBytes(fonts: ReadonlyMap<MathFont, Uint8Array>, name: MathFont): Uint8Array {
  const bytes = fonts.get(name);
  if (!bytes) throw new Error(`KaTeX_${name}.ttf was not given.`);
  return bytes;
}

/**
 * The outlines of KaTeX's glyphs, for exports that write a math drawing's glyphs as paths so that an
 * SVG opened elsewhere needs no KaTeX font (ADR 0106). About 1.3 MB, so it is its own entry,
 * `@visual-anything/core/math-outlines`, which `math/index.ts` does not re-export: the canvas never
 * loads it.
 */
import outlineTable from './outlines.json';
import type { MathFont } from './drawing';
import type { MathOutlineTable } from './tables';

const OUTLINES = outlineTable as MathOutlineTable;

/**
 * One glyph's outline as SVG path data, in ems of its size, y down from its baseline, its pen at 0:
 * place it at the glyph's `x` and `baseline` and scale it by its `size`. Undefined for a character the
 * font does not hold, or one that draws nothing, such as a space.
 */
export function mathGlyphOutline(font: MathFont, char: string): string | undefined {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return undefined;
  return (OUTLINES[font] as Partial<Record<string, string>> | undefined)?.[codePoint];
}

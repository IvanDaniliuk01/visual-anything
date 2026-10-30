/**
 * How wide the exports' texts are: in Roboto's own widths, the font the PDF embeds, which the core
 * holds (`core/src/text/roboto-widths.ts`, ADR 0083), with a margin for the system fonts a browser
 * draws an SVG in, which run a little wider. The canvas measures its labels in the font it draws them
 * in, so wrapping by real widths keeps an export's lines where the canvas breaks them, closer than
 * the scene's estimate for rows (`fit.ts`), which leans wide on purpose.
 */
import { robotoWidth } from '@visual-anything/core';

/** How much wider than Roboto the system fonts that draw an SVG may be. */
export const SYSTEM_FONT_MARGIN = 1.06;

/** How wide a text is at `size`, bold or not, with the margin for system fonts. */
export function textWidth(text: string, size: number, bold = false): number {
  return robotoWidth(text, bold ? 'bold' : 'regular', size) * SYSTEM_FONT_MARGIN;
}

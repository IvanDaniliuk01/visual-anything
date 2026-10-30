/**
 * Text emphasis in SVG and PDF (ADR 0082), as the canvas draws it: a text laid out by `text/layout.ts`
 * in Roboto's widths, each line a `<text>` with a `<tspan>` for each piece, placed by its own `x` so
 * that no reader flows it again, in its weight, style and family; and each band a `<rect>`, so that
 * SVG-to-PDFKit draws it exactly. Highlights and code are drawn on the backs that read under the
 * text's color (`emphasisBacks`), lines in the text's color.
 */
import type { Color } from '@visual-anything/schema';
import { emphasisBacks } from '../canvas/colors';
import type { FontVariant, LaidPiece, LaidText, Measure } from '../text/layout';
import { element, empty, textElement } from './markup';

/** The family a monospace run is written in: Roboto Mono, which the PDF embeds. */
export const MONO_FAMILY = 'Roboto Mono, monospace';

/** What a piece is written with, beyond its text. */
function pieceValues(piece: LaidPiece): Record<string, string | number | undefined> {
  const variant: FontVariant = piece.variant;
  return {
    'font-size': piece.size,
    'font-weight': variant === 'bold' || variant === 'boldItalic' ? 700 : undefined,
    'font-style': variant === 'italic' || variant === 'boldItalic' ? 'italic' : undefined,
    'font-family': variant === 'mono' ? MONO_FAMILY : undefined,
  };
}

/**
 * A laid out text written at (x, y), its box's top left, in `fill`. `texts` gets each line's text,
 * for the PDF's check of the glyphs its fonts lack.
 */
export function laidTextSvg(
  laid: LaidText,
  at: { x: number; y: number },
  fill: Color,
  measure: Measure,
  texts?: string[],
): string {
  const backs = emphasisBacks(fill);
  let written = '';
  for (const line of laid.lines) {
    for (const band of line.bands) {
      const rect = {
        x: at.x + band.x,
        y: at.y + band.y,
        width: band.width,
        height: band.height,
      };
      if (band.outline !== undefined) {
        written += empty('rect', {
          ...rect,
          fill: 'none',
          stroke: fill,
          'stroke-width': band.outline,
        });
        continue;
      }
      const color =
        band.kind === 'highlight' ? backs.highlight : band.kind === 'code' ? backs.code : fill;
      written += empty('rect', { ...rect, fill: color });
    }
    const spans: string[] = [];
    for (const piece of line.pieces) {
      // Spaces at a piece's start are moved past, since readers of SVG fold them away.
      const text = piece.text.trimStart();
      if (text.trim() === '') continue;
      const lead = piece.text.slice(0, piece.text.length - text.length);
      const x = at.x + piece.x + (lead === '' ? 0 : measure(lead, piece.variant, piece.size));
      spans.push(
        textElement('tspan', { x, y: at.y + line.baseline, ...pieceValues(piece) }, text.trimEnd()),
      );
    }
    if (spans.length === 0) continue;
    texts?.push(line.pieces.map((piece) => piece.text).join(''));
    written += element('text', { fill }, spans.join(''));
  }
  return written;
}

/** Whether SVG written with text emphasis uses a font the PDF embeds only when needed. */
export function usesEmphasisFonts(svg: string): { italic: boolean; mono: boolean } {
  return { italic: svg.includes('font-style="italic"'), mono: svg.includes('Roboto Mono') };
}

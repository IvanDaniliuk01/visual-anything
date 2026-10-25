/**
 * How wide the exports' texts are: in Roboto's own widths, the font the PDF embeds, with a margin for
 * the system fonts a browser draws an SVG in, which run a little wider. The canvas measures its labels
 * in the font it draws them in, so wrapping by real widths keeps an export's lines where the canvas
 * breaks them, closer than the scene's estimate for rows (`fit.ts`), which leans wide on purpose.
 */
import { BOLD_WIDTHS, MEASURED_EXTRA, MEASURED_RANGES, REGULAR_WIDTHS } from './fonts/widths';

/** How much wider than Roboto the system fonts that draw an SVG may be. */
export const SYSTEM_FONT_MARGIN = 1.06;

/** The width of a character the table does not hold, in ems: wide for East Asian scripts and emoji. */
function unmeasured(point: number): number {
  const wide =
    (point >= 0x1100 && point <= 0x115f) ||
    (point >= 0x2e80 && point <= 0xa4cf) ||
    (point >= 0xac00 && point <= 0xd7a3) ||
    (point >= 0xf900 && point <= 0xfaff) ||
    (point >= 0xfe30 && point <= 0xfe4f) ||
    (point >= 0xff00 && point <= 0xff60) ||
    (point >= 0xffe0 && point <= 0xffe6) ||
    point >= 0x1f000;
  return wide ? 1 : 0.6;
}

/** Each measured code point's place in the tables. */
const PLACES = new Map<number, number>();
{
  let place = 0;
  for (const [from, to] of MEASURED_RANGES)
    for (let point = from; point <= to; point++) PLACES.set(point, place++);
  for (const point of MEASURED_EXTRA) PLACES.set(point, place++);
}

/** How wide a character is, in ems. */
function emsOf(point: number, bold: boolean): number {
  const place = PLACES.get(point);
  const width = place === undefined ? 0 : ((bold ? BOLD_WIDTHS : REGULAR_WIDTHS)[place] ?? 0);
  return width > 0 ? width / 1000 : unmeasured(point);
}

/** How wide a text is at `size`, bold or not, with the margin for system fonts. */
export function textWidth(text: string, size: number, bold = false): number {
  let ems = 0;
  for (const character of text) ems += emsOf(character.codePointAt(0) ?? 0, bold);
  return ems * size * SYSTEM_FONT_MARGIN;
}

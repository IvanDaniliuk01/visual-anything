/**
 * The font a drawing's text is drawn in, whatever font the page names (ADR 0068): Roboto 2.137 Regular
 * and Bold, under Apache-2.0, as WOFF files in base64 in `fonts/roboto.json`, taken unchanged from the
 * npm package `roboto-fontface` 0.10.0, which the PDF export embeds too (ADR 0047's clarification);
 * `fonts/LICENSE-roboto.txt` holds their license. Only the worker that lays a drawing out loads them.
 */
import roboto from './fonts/roboto.json';
import { coverageOf, type Coverage } from './glyphs';

/** The family name the layout step knows the fonts by. */
export const FONT_FAMILY = 'Roboto';

/** A font as the layout step takes it. */
export interface LayoutFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
}

let loaded: { fonts: LayoutFont[]; coverage: Coverage } | undefined;

/** Roboto Regular and Bold, and the characters they draw, read once. */
export function robotoFonts(): { fonts: LayoutFont[]; coverage: Coverage } {
  if (loaded === undefined) {
    const regular = Buffer.from(roboto.regular, 'base64');
    const bold = Buffer.from(roboto.bold, 'base64');
    loaded = {
      fonts: [
        { name: FONT_FAMILY, data: regular, weight: 400, style: 'normal' },
        { name: FONT_FAMILY, data: bold, weight: 700, style: 'normal' },
      ],
      // A character either font lacks is left out: bold text falls back to nothing else.
      coverage: intersection(coverageOf(regular), coverageOf(bold)),
    };
  }
  return loaded;
}

/** The code points two coverages both hold. */
function intersection(a: Coverage, b: Coverage): Coverage {
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const [aFrom, aTo] = a[i] as readonly [number, number];
    const [bFrom, bTo] = b[j] as readonly [number, number];
    const from = Math.max(aFrom, bFrom);
    const to = Math.min(aTo, bTo);
    if (from <= to) out.push([from, to]);
    if (aTo < bTo) i++;
    else j++;
  }
  return out;
}

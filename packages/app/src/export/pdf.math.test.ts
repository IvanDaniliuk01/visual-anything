// @vitest-environment node
/**
 * Math in the PDF (ADR 0106): made from the SVG through SVG-to-PDFKit, which draws a formula's glyph
 * outlines, rules and KaTeX's paths as paths, so that the PDF embeds no font of KaTeX's and draws
 * every formula the SVG draws.
 */
import { describe, expect, it } from 'vitest';
import { EMPHASIS_VIEW, withEmphasis } from '../test/emphasis';
import { forgetMathOutlines, loadedMathOutlines } from './math-svg';
import { PDF_PICTURES, writePdf } from './pdf';
import { writeSvg } from './svg';

const DATE = new Date('2026-10-30T12:00:00Z');
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const fonts = (bytes: Uint8Array) =>
  [...latin1(bytes).matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([A-Za-z-]+)/g)].map((match) => match[1]);
/** How many paths a PDF's pages fill: `f` and `f*` operators in its uncompressed content. */
const fills = (bytes: Uint8Array) => latin1(bytes).match(/(?:^|\s)f\*?(?=\s)/g)?.length ?? 0;

/** How many clips a PDF's pages set: `W n` in its uncompressed content. */
const clips = (bytes: Uint8Array) => latin1(bytes).match(/\sW\*?\s+n\s/g)?.length ?? 0;

const detail = { detail: { attributes: ['note'], componentName: false } };

describe('Math in the PDF (ADR 0106)', () => {
  it('draws formulas as paths, embedding no KaTeX font, after loading the outlines itself', async () => {
    forgetMathOutlines();
    const plain = await writePdf(withEmphasis('the loss', detail), EMPHASIS_VIEW, {
      date: DATE,
      compress: false,
    });
    // A drawing without Math never loads the outline table.
    expect(loadedMathOutlines()).toBeUndefined();
    const formula = '$\\sqrt{x}$ and $\\frac{1}{n}\\sum_i (y_i - \\hat y_i)^2$';
    const math = await writePdf(withEmphasis(formula, detail), EMPHASIS_VIEW, {
      date: DATE,
      compress: false,
    });
    expect(loadedMathOutlines()).toBeDefined();
    expect(new Set(fonts(math.bytes))).toEqual(new Set(fonts(plain.bytes)));
    expect(fonts(math.bytes).some((name) => /KaTeX|Times|Helvetica/.test(name ?? ''))).toBe(false);
    // Each glyph and the surd is a filled path of its own, as many as the SVG uses, and the lines more.
    const svg = writeSvg(withEmphasis(formula, detail), EMPHASIS_VIEW, PDF_PICTURES);
    const used = svg.text.match(/<use href="#va-math-/g)?.length ?? 0;
    expect(used).toBeGreaterThan(10);
    expect(fills(math.bytes) - fills(plain.bytes)).toBeGreaterThanOrEqual(used);
    // The surd's bar, which KaTeX draws far past its box, is clipped to it.
    expect(clips(math.bytes)).toBeGreaterThan(clips(plain.bytes));
    expect(math.lost).toEqual(plain.lost);
  }, 60_000);

  it('writes the same PDF each time', async () => {
    const project = withEmphasis('$\\sqrt{x^2+1}$', detail);
    const once = await writePdf(project, EMPHASIS_VIEW, { date: DATE });
    const again = await writePdf(structuredClone(project), EMPHASIS_VIEW, { date: DATE });
    expect(again.bytes).toEqual(once.bytes);
  }, 60_000);
});

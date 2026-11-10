/**
 * Math in the SVG (ADR 0106): a formula is drawn from its math drawing where the canvas draws it,
 * its glyphs as outlines kept once each in `<defs>` and used where they are drawn, its rules as
 * rectangles and KaTeX's paths fitted to their boxes, in its text's color, so that an SVG opened
 * elsewhere needs no KaTeX font; a formula cut to its line is clipped there; the outline table is
 * loaded only when an export writes Math.
 */
import {
  compileFace,
  facePalette,
  layOutFace,
  parseEmphasis,
  typesetMath,
  type FaceDrawing,
} from '@visual-anything/core';
import { mathGlyphOutline } from '@visual-anything/core/math-outlines';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EMPHASIS_VIEW, calendarOf, withEmphasis } from '../test/emphasis';
import { layOutRuns } from '../text/layout';
import { robotoMeasure } from '../canvas/textBlock';
import { laidTextSvg } from './emphasis-svg';
import { exportView } from './exports';
import { faceSvg } from './face-svg';
import {
  MathSvg,
  forgetMathOutlines,
  loadMathOutlines,
  loadedMathOutlines,
  mathGlyphId,
} from './math-svg';
import { svgPieces, writeSvg } from './svg';

function readSvg(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const errors = document.getElementsByTagName('parsererror');
  if (errors.length > 0) throw new Error(`The SVG does not parse: ${errors[0]?.textContent}`);
  return document;
}

const LOSS = '$\\frac{1}{n}\\sum_i (y_i - \\hat y_i)^2$';
const ROOT = '$\\sqrt{x^2 + y^2}$';

/** The sample, its calendar's detail a note holding two formulas. */
function withFormulas() {
  return withEmphasis(`${ROOT} and ${LOSS}`, {
    detail: { attributes: ['note'], componentName: false },
  });
}

const drawingOf = (tex: string, display = false) => {
  const typeset = typesetMath(tex, { display });
  if (!typeset.ok) throw new Error(typeset.error);
  return typeset.drawing;
};

describe('Math in the SVG (ADR 0106)', () => {
  beforeAll(async () => {
    await loadMathOutlines();
  });
  afterEach(async () => {
    await loadMathOutlines();
  });

  it('draws a detail’s formulas as glyph outlines, rules and paths, and never their TeX', () => {
    const project = withFormulas();
    const drawing = writeSvg(project, EMPHASIS_VIEW);
    expect(drawing.mathOutlinesWanted).toBeUndefined();
    const document = readSvg(drawing.text);
    const calendar = document.querySelector(`g[data-element="${calendarOf(project)}"]`);
    const formulas = [...(calendar?.querySelectorAll('g[data-tex]') ?? [])];
    expect(formulas.map((each) => each.getAttribute('data-tex'))).toEqual([ROOT, LOSS]);
    // The text around them is written; the TeX is not.
    expect(calendar?.textContent).toContain('and');
    expect(calendar?.textContent).not.toContain('\\frac');
    expect(drawing.texts.join(' ')).not.toContain('\\frac');
    // In the detail's color, as its words are.
    const fill = calendar?.querySelector('text:last-of-type')?.getAttribute('fill');
    for (const formula of formulas) expect(formula.getAttribute('fill')).toBe(fill);
    // Glyphs as uses of outlines, the fraction's line as a rect, the surd as KaTeX's path in its box.
    const [root, loss] = formulas as [Element, Element];
    expect(loss.querySelectorAll('use').length).toBeGreaterThan(8);
    const surd = root.querySelector('svg');
    expect(surd?.getAttribute('preserveAspectRatio')).toMatch(/slice/);
    expect(surd?.getAttribute('overflow')).toBe('hidden');
    expect(surd?.querySelector('use')?.getAttribute('href')).toMatch(/^#va-math-path-\d+$/);
    expect(calendar?.querySelectorAll('rect').length).toBeGreaterThan(0);
    // No KaTeX font is needed to read it.
    expect(drawing.text).not.toContain('KaTeX');
  });

  it('keeps each glyph once in the document’s defs, with ids stable and unique', () => {
    const project = withFormulas();
    const text = writeSvg(project, EMPHASIS_VIEW).text;
    const document = readSvg(text);
    const ids = [...document.querySelectorAll('[id]')].map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
    const defined = new Set(
      [...document.querySelectorAll('defs > [id]')].map((each) => each.getAttribute('id')),
    );
    const used = [...document.querySelectorAll('use')].map((each) =>
      (each.getAttribute('href') ?? '').slice(1),
    );
    for (const id of used) expect(defined.has(id), id).toBe(true);
    // The subscript i is drawn several times, and kept once.
    const i = mathGlyphId('Math-Italic', 'i');
    expect(used.filter((id) => id === i).length).toBeGreaterThan(1);
    expect(document.querySelectorAll(`defs > path[id="${i}"]`)).toHaveLength(1);
    expect(document.querySelector(`path[id="${i}"]`)?.getAttribute('d')).toBe(
      mathGlyphOutline('Math-Italic', 'i'),
    );
    // Written again, it is the same file.
    expect(writeSvg(withFormulas(), EMPHASIS_VIEW).text).toBe(text);
  });

  it('places each glyph at its x and baseline, scaled by its size', () => {
    const drawing = drawingOf('x^2');
    const svg = new MathSvg(new Map(), mathGlyphOutline).formula(
      { drawing, x: 100, baseline: 50, size: 20 },
      '#123456',
    );
    const transforms = [...svg.matchAll(/transform="([^"]+)"/g)].map((match) => match[1]);
    expect(transforms).toEqual(
      drawing.glyphs.map(
        (glyph) =>
          `translate(${round(100 + glyph.x * 20)} ${round(50 + glyph.baseline * 20)}) scale(${round(20 * glyph.size)})`,
      ),
    );
    expect(svg).toMatch(/^<g fill="#123456">/);
  });

  it('writes a face’s formula, its rules and glyphs in its run’s color', () => {
    const face = layOutFace(
      compileFace({
        size: 'content',
        markup: ['<p>{{formula}}</p>'],
        style: ['p { font-size: 12px; }'],
        variants: [],
      }),
      {
        name: 'loss',
        component: 'Table',
        attributes: [{ name: 'formula', value: `mean ${LOSS}`, format: 'emphasis' }],
      },
      { width: 300 },
    ) satisfies FaceDrawing;
    const run = face.runs.find((each) => each.math);
    expect(run).toBeDefined();
    const svg = faceSvg(face, { x: 10, y: 20 }, facePalette('light', '#ffffff', '#000000'));
    const document = readSvg(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`);
    const formula = document.querySelector('g[data-tex]');
    expect(formula?.getAttribute('data-tex')).toBe(LOSS);
    // The fraction's line, a rect, and the glyphs, with their outlines in the face's own defs.
    expect(formula?.querySelectorAll('rect').length).toBeGreaterThan(0);
    expect(formula?.querySelectorAll('use').length).toBeGreaterThan(8);
    expect(document.querySelectorAll('defs > path').length).toBeGreaterThan(5);
    expect(document.querySelector('text')?.textContent).toBe('mean');
  });

  it('clips a formula cut to its line where it was cut, with a clip of its own', () => {
    const runs = parseEmphasis(`${LOSS} ${LOSS}`, { blocks: false })[0];
    if (runs?.kind !== 'paragraph') throw new Error('No paragraph.');
    const laid = layOutRuns(runs.runs, {
      measure: robotoMeasure,
      size: 12,
      width: 40,
      align: 'left',
      maxLines: 1,
    });
    const math = new MathSvg(new Map(), mathGlyphOutline);
    const svg = laidTextSvg(laid, { x: 0, y: 0 }, '#000000', robotoMeasure, undefined, math);
    expect(svg).toMatch(/clip-path="url\(#va-math-clip-1\)"/);
    expect(math.defs).toMatch(/<clipPath id="va-math-clip-1"><rect /);
    expect(laid.cut).toBe(true);
  });

  it('is drawn whole by the PDF’s pieces, each holding the outlines it uses', () => {
    const drawing = writeSvg(withFormulas(), EMPHASIS_VIEW);
    for (const piece of svgPieces(drawing.layers, 2_000)) {
      for (const [, id] of piece.matchAll(/(?:href="#|url\(#)(va-math-[^")]+)/g)) {
        expect(piece, id).toContain(`id="${id}"`);
      }
    }
  });

  it('loads the outline table only when an export writes Math, and writes the glyphs from it', async () => {
    forgetMathOutlines();
    const plain = writeSvg(withEmphasis('plain'), EMPHASIS_VIEW);
    expect(plain.mathOutlinesWanted).toBeUndefined();
    expect(loadedMathOutlines()).toBeUndefined();
    // Written before it is loaded, its glyphs are KaTeX's characters, and it says so.
    const early = writeSvg(withFormulas(), EMPHASIS_VIEW);
    expect(early.mathOutlinesWanted).toBe(true);
    expect(early.text).toContain('font-family="KaTeX_Math"');
    const exported = await exportView(withFormulas(), EMPHASIS_VIEW, 'svg');
    expect(loadedMathOutlines()).toBeDefined();
    expect(exported.text).not.toContain('KaTeX');
    expect(exported.text).toContain(`href="#${mathGlyphId('Main-Regular', '1')}"`);
  });
});

function round(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

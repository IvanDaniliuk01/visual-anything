/**
 * Math in faces (ADR 0106): a slot that takes text emphasis gives formulas, measured by their
 * drawing's box, so that a face of size `content` knows its size before layout; a line that holds
 * one is as tall as the formula; one wider than its box is shrunk, then cut, and the face counts as
 * cut so that the hover card shows it whole; one that fails is its TeX in Roboto Mono, dotted under.
 */
import { describe, expect, it } from 'vitest';
import { typesetMath } from '../math';
import { compileFace } from './compile';
import { MATH_EM, MATH_LEAST_SCALE, faceDrawingText, layOutFace, type FaceDrawing } from './layout';
import { face, input } from './test-faces';

const EMPHASIS = { definitions: { formula: { format: 'emphasis' as const } } };

function draw(
  formula: string,
  options: { width?: number; height?: number; markup?: string; style?: string[] } = {},
): FaceDrawing {
  const { width = 200, height, markup = '<p>{{formula}}</p>', style = [] } = options;
  return layOutFace(
    compileFace(face(markup, ['p { font-size: 12px; }', ...style], { size: 'content' })),
    input({ formula }, EMPHASIS),
    { width, ...(height === undefined ? {} : { height }) },
  );
}

const drawingOf = (tex: string) => {
  const typeset = typesetMath(tex, { display: false });
  if (!typeset.ok) throw new Error(typeset.error);
  return typeset.drawing;
};

describe('Math in a face (ADR 0106)', () => {
  it('writes a formula as one run with its drawing, measured by its box', () => {
    const drawing = draw('the loss $\\frac{1}{n}\\sum_i e_i^2$ falls');
    const run = drawing.runs.find((each) => each.math);
    expect(run?.text).toBe('$\\frac{1}{n}\\sum_i e_i^2$');
    const box = drawingOf('\\frac{1}{n}\\sum_i e_i^2');
    expect(run?.math?.size).toBeCloseTo(12 * MATH_EM);
    expect(run?.width).toBeCloseTo(box.width * 12 * MATH_EM);
    const after = drawing.runs[drawing.runs.indexOf(run!) + 1]!;
    expect(after.x).toBeCloseTo(run!.x + run!.width);
    // What the outline and announcements read: the TeX as written.
    expect(faceDrawingText(drawing)).toBe('the loss $\\frac{1}{n}\\sum_i e_i^2$ falls');
    expect(drawing.cut).toBe(false);
  });

  it('writes Math only where the attribute takes emphasis, and never through | plain', () => {
    const plain = layOutFace(
      compileFace(face('<p>{{formula}}</p>', [], { size: 'content' })),
      input({ formula: '$x^2$' }),
      { width: 200 },
    );
    expect(plain.runs.some((run) => run.math)).toBe(false);
    expect(draw('$x^2$', { markup: '<p>{{formula | plain}}</p>' }).runs.some((r) => r.math)).toBe(
      false,
    );
  });

  it('makes a line holding a tall formula as tall as it, so a face of size content grows', () => {
    const short = draw('a $x$ b');
    const tall = draw('a $\\dfrac{\\dfrac{1}{2}}{\\dfrac{3}{4}}$ b');
    expect(tall.height).toBeGreaterThan(short.height);
    const run = tall.runs.find((each) => each.math)!;
    const box = drawingOf('\\dfrac{\\dfrac{1}{2}}{\\dfrac{3}{4}}');
    // Its top and bottom stay inside the face.
    expect(run.y - box.height * run.math!.size).toBeGreaterThanOrEqual(0);
    expect(run.y + box.depth * run.math!.size).toBeLessThanOrEqual(tall.height);
    // The text on its line stands on the same baseline.
    expect(tall.runs.find((each) => each.text.startsWith('a'))!.y).toBeCloseTo(run.y);
  });

  it('shrinks a formula wider than its box, down to 70 %, and counts the face as cut', () => {
    const tex = 'a+b+c+d+e';
    const full = drawingOf(tex).width * 12 * MATH_EM;
    const drawing = draw(`$${tex}$`, { width: full * 0.85 });
    const run = drawing.runs.find((each) => each.math)!;
    expect(run.math!.size).toBeCloseTo(12 * MATH_EM * 0.85);
    expect(run.math!.clip).toBeUndefined();
    expect(drawing.cut).toBe(true);
  });

  it('cuts a formula too wide at 70 %, ending in "…" within its box', () => {
    const tex = 'a+b+c+d+e+f+g+h+i+j+k';
    const full = drawingOf(tex).width * 12 * MATH_EM;
    const width = full * 0.4;
    const drawing = draw(`$${tex}$`, { width });
    const run = drawing.runs.find((each) => each.math)!;
    expect(run.math!.size).toBeCloseTo(12 * MATH_EM * MATH_LEAST_SCALE);
    expect(run.math!.clip).toBeGreaterThan(0);
    expect(run.width).toBe(run.math!.clip);
    const last = drawing.runs.at(-1)!;
    expect(last.text).toBe('…');
    expect(last.x + last.width).toBeLessThanOrEqual(width + 1e-6);
    expect(drawing.cut).toBe(true);
  });

  it('writes a formula that fails as its TeX in Roboto Mono, with a dotted line under it', () => {
    const drawing = draw('see $\\color{red}{x}$');
    expect(drawing.runs.some((run) => run.math)).toBe(false);
    const tex = drawing.runs.find((run) => run.text.includes('color'))!;
    expect(tex.variant).toBe('mono');
    const dashes = drawing.bands.filter((band) => band.kind === 'warning');
    expect(dashes.length).toBeGreaterThan(1);
    for (const dash of dashes) expect(dash.y).toBeGreaterThan(tex.y);
    expect(faceDrawingText(drawing)).toBe('see $\\color{red}{x}$');
  });

  it('cuts a face of size shape by height, a tall formula past its height counting as cut', () => {
    const drawing = layOutFace(
      compileFace(face('<p>{{formula}}</p>', ['p { font-size: 12px; }'], { size: 'shape' })),
      input({ formula: 'one\n\n$\\dfrac{\\dfrac{1}{2}}{\\dfrac{3}{4}}$' }, EMPHASIS),
      { width: 30, height: 20 },
    );
    expect(drawing.runs.some((run) => run.math)).toBe(false);
    expect(drawing.cut).toBe(true);
  });
});

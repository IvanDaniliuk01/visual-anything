/**
 * The golden test (ADR 0106): the layout of KaTeX's tree against Chrome's measurements of KaTeX's own
 * HTML, recorded by `golden/regenerate.js` for the two corpora of `prototype/math-layout` at four sizes
 * of the KaTeX em. With the browser's pixel snapping copied, every glyph's pen x and baseline is within
 * 0.5 px, in the same font and size as Chrome's, and every rule and SVG piece is in its place. The
 * default layout, in ems without snapping, stays within about a pixel.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToHTMLTree } from './katex-tree';
import { layoutTree, type MathLayout } from './layout';
import { MATH_KATEX_OPTIONS, typesetUncached } from './typeset';

interface TruthGlyph {
  char: string;
  x: number;
  baseline: number;
  font: string;
  style: string;
  weight: string;
  size: number;
}
interface TruthBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Truth {
  tex: string;
  d: boolean;
  width: number;
  glyphs: TruthGlyph[];
  rules: TruthBox[];
  svgs: TruthBox[];
}

const TOLERANCE = 0.5;
const CORPORA = ['corpus', 'corpus2'] as const;
const SIZES = [16, 13, 19.36, 24] as const;

function truthOf(corpus: string, px: number): Truth[] {
  const suffix = px === 16 ? '' : `-${px}px`;
  const url = new URL(`./golden/truth-${corpus}${suffix}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Truth[];
}

function layoutOf(truth: Truth, pixelsPerEm: number): MathLayout {
  const tree = renderToHTMLTree(truth.tex, { ...MATH_KATEX_OPTIONS, displayMode: truth.d });
  return layoutTree(tree, truth.d, { pixelsPerEm, skipTags: true });
}

interface Comparison {
  glyphs: number;
  glyphsWithin: number;
  rules: number;
  rulesWithin: number;
  svgs: number;
  svgsWithin: number;
  /** The worst error of anything compared, in px. */
  worst: number;
  problems: string[];
}

/** As `compare.mjs` on `prototype/math-layout` compares. */
function compare(layout: MathLayout, truth: Truth, px: number): Comparison {
  const problems: string[] = [];
  let worst = 0;
  let glyphsWithin = 0;
  const glyphCount = Math.max(layout.glyphs.length, truth.glyphs.length);
  for (let k = 0; k < glyphCount; k++) {
    const a = layout.glyphs[k];
    const b = truth.glyphs[k];
    if (!a || !b || a.char !== b.char) {
      problems.push(`glyph #${k} ${a?.char}/${b?.char} missing`);
      worst = Infinity;
      continue;
    }
    const family = `KaTeX_${a.font.split('-')[0]}`;
    const bold = a.font.includes('Bold');
    const italic = a.font.includes('Italic');
    if (
      family !== b.font ||
      bold !== Number(b.weight) >= 600 ||
      italic !== (b.style === 'italic') ||
      Math.abs(a.size * px - b.size) > 0.02
    ) {
      problems.push(
        `${b.char} in ${a.font} at ${a.size * px} px, Chrome ${b.font} ${b.weight} ${b.style} at ${b.size}`,
      );
      worst = Infinity;
      continue;
    }
    const error = Math.max(Math.abs(a.x * px - b.x), Math.abs(a.baseline * px - b.baseline));
    worst = Math.max(worst, error);
    if (error <= TOLERANCE) glyphsWithin++;
    else
      problems.push(
        `${b.char} dx=${(a.x * px - b.x).toFixed(2)} dy=${(a.baseline * px - b.baseline).toFixed(2)}`,
      );
  }
  let rulesWithin = 0;
  const ruleCount = Math.max(layout.rules.length, truth.rules.length);
  for (let k = 0; k < ruleCount; k++) {
    const a = layout.rules[k];
    const b = truth.rules[k];
    if (!a || !b) {
      problems.push(`rule #${k} missing`);
      worst = Infinity;
      continue;
    }
    // x, width and bottom edge: Chrome snaps the border to whole pixels and adds a minimum height.
    const error = Math.max(
      Math.abs(a.x * px - b.x),
      Math.abs(a.width * px - b.w),
      Math.abs((a.y + a.height) * px - (b.y + b.h)),
    );
    worst = Math.max(worst, error);
    if (error <= TOLERANCE) rulesWithin++;
    else problems.push(`rule ${a.kind} error ${error.toFixed(2)}`);
  }
  let svgsWithin = 0;
  const svgCount = Math.max(layout.paths.length, truth.svgs.length);
  for (let k = 0; k < svgCount; k++) {
    const a = layout.paths[k];
    const b = truth.svgs[k];
    if (!a || !b) {
      problems.push(`svg #${k} missing`);
      worst = Infinity;
      continue;
    }
    const error = Math.max(
      Math.abs(a.x * px - b.x),
      Math.abs(a.y * px - b.y),
      Math.abs(a.width * px - b.w),
      Math.abs(a.height * px - b.h),
    );
    worst = Math.max(worst, error);
    if (error <= TOLERANCE) svgsWithin++;
    else problems.push(`svg error ${error.toFixed(2)}`);
  }
  return {
    glyphs: glyphCount,
    glyphsWithin,
    rules: ruleCount,
    rulesWithin,
    svgs: svgCount,
    svgsWithin,
    worst,
    problems,
  };
}

interface Totals {
  formulas: number;
  formulasWithin: number;
  glyphs: number;
  glyphsWithin: number;
  rules: number;
  rulesWithin: number;
  svgs: number;
  svgsWithin: number;
  worst: number;
}

function run(corpus: string, px: number, pixelsPerEm: number) {
  const totals: Totals = {
    formulas: 0,
    formulasWithin: 0,
    glyphs: 0,
    glyphsWithin: 0,
    rules: 0,
    rulesWithin: 0,
    svgs: 0,
    svgsWithin: 0,
    worst: 0,
  };
  const failures: { index: number; tex: string; worst: number; problems: string[] }[] = [];
  truthOf(corpus, px).forEach((truth, index) => {
    const c = compare(layoutOf(truth, pixelsPerEm), truth, px);
    totals.formulas++;
    totals.glyphs += c.glyphs;
    totals.glyphsWithin += c.glyphsWithin;
    totals.rules += c.rules;
    totals.rulesWithin += c.rulesWithin;
    totals.svgs += c.svgs;
    totals.svgsWithin += c.svgsWithin;
    totals.worst = Math.max(totals.worst, c.worst);
    if (c.problems.length === 0) totals.formulasWithin++;
    else failures.push({ index, tex: truth.tex, worst: c.worst, problems: c.problems.slice(0, 6) });
  });
  return { totals, failures };
}

const summary = (corpus: string, px: number, t: Totals) =>
  `${corpus} at ${px} px: formulas ${t.formulasWithin}/${t.formulas}, glyphs ${t.glyphsWithin}/${t.glyphs}, ` +
  `rules ${t.rulesWithin}/${t.rules}, svgs ${t.svgsWithin}/${t.svgs}, worst ${t.worst.toFixed(3)} px`;

describe('the layout against Chrome, with its pixel snapping', () => {
  for (const corpus of CORPORA) {
    for (const px of SIZES) {
      it(`places every glyph, rule and SVG piece of ${corpus} within ${TOLERANCE} px at ${px} px an em`, () => {
        const { totals, failures } = run(corpus, px, px);
        console.log(summary(corpus, px, totals));
        expect(failures).toEqual([]);
        expect(totals.glyphs).toBeGreaterThan(400);
      });
    }
  }
});

describe('the layout in ems, without snapping', () => {
  // ADR 0106: array column separators sit up to about 1 px from where a browser at 100 % puts them.
  // The array with three separators gathers about 0.38 px from each: Chrome draws their 0.04 em borders 1 px wide.
  const EM_TOLERANCE = 1.15;
  for (const corpus of CORPORA) {
    it(`stays within ${EM_TOLERANCE} px of Chrome for ${corpus} at 16 px an em`, () => {
      const { totals, failures } = run(corpus, 16, 0);
      console.log(summary(corpus, 16, totals) + ' (in ems)');
      for (const failure of failures) {
        console.log(
          `  #${failure.index} ${failure.tex}: worst ${failure.worst.toFixed(2)} px; ${failure.problems.join('; ')}`,
        );
      }
      expect(totals.worst).toBeLessThanOrEqual(EM_TOLERANCE);
    });
  }
});

describe('typesetting the golden corpora', () => {
  it('draws every formula but the tagged one, and records the time it takes', () => {
    const formulas = CORPORA.flatMap((corpus) => truthOf(corpus, 16));
    const refused = formulas.filter((truth) => !typesetUncached(truth.tex, truth.d).ok);
    expect(refused.map((truth) => truth.tex)).toEqual(['E = mc^2 \\tag{1}']);
    const rounds = 20;
    const start = performance.now();
    for (let round = 0; round < rounds; round++) {
      for (const truth of formulas) typesetUncached(truth.tex, truth.d);
    }
    const mean = (performance.now() - start) / (rounds * formulas.length);
    console.log(
      `typesetMath without its cache: ${mean.toFixed(3)} ms a formula, over ${formulas.length} formulas`,
    );
  });
});

/**
 * KaTeX's fonts in a read-only page (ADR 0106, ADR 0041): a page holds the families its project's
 * Math uses, and only those, as data; a page without Math holds none; its policy does not change; the
 * viewer reads them strictly and installs them from their bytes for its canvas and its panels.
 */
import { encodeBase64, type MathFont, type ProjectSnapshot } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetMathFonts, mathFontInstalled, wantMathFonts } from '../canvas/mathFonts';
import { loadSample } from '../test/sample';
import { pageDataOf, readPageData } from './data';
import { MATH_FAMILIES, katexFontFace, mathFontsOfFiles, readPageMathFonts } from './math-families';
import { installPageMathFonts } from './math-fonts';
import { pagePolicy, writePage, type ViewerAssets } from './page';

const ASSETS: ViewerAssets = {
  script: 'document.body.dataset.viewer = "ready";',
  style: ':root { color: CanvasText; }',
};

/** A stand-in for a family's woff2 file: its signature, then its name. */
function fontBytes(font: MathFont): Uint8Array {
  return new Uint8Array([0x77, 0x4f, 0x46, 0x32, ...new TextEncoder().encode(font)]);
}

const ALL_FONTS = Object.fromEntries(MATH_FAMILIES.map((font) => [font, fontBytes(font)]));

/** The sample, its first element described with this text. */
function described(description: string): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    model: {
      ...sample.model,
      elements: sample.model.elements.map((element, at) =>
        at === 0 ? { ...element, description } : element,
      ),
    },
  };
}

/** The data element of a written page, as JSON. */
function dataOf(html: string): Record<string, unknown> {
  const held = /<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(held?.[1] ?? 'null') as Record<string, unknown>;
}

describe('the families a project’s Math uses', () => {
  it('are none for a project without Math, nor for dollars that are no formula', () => {
    expect(mathFontsOfFiles(pageDataOf(loadSample()))).toEqual([]);
    expect(mathFontsOfFiles(pageDataOf(described('$20 and $30, then $ alone')))).toEqual([]);
  });

  it('are those its formulas’ glyphs use, wherever a text holds them, in KaTeX’s order', () => {
    expect(mathFontsOfFiles(pageDataOf(described('the $x$ axis')))).toEqual(['Math-Italic']);
    expect(mathFontsOfFiles(pageDataOf(described('$$\\frac{1}{2}$$')))).toEqual(['Main-Regular']);
    const both = mathFontsOfFiles(
      pageDataOf(described('mean\n\n```math\n\\sum_i x_i\n```\n\nand $\\mathbb{R}$')),
    );
    expect(both).toEqual(['AMS-Regular', 'Math-Italic', 'Size2-Regular']);
  });
});

describe('a page’s Math fonts', () => {
  it('are those its Math uses, and none for a project without Math', async () => {
    const assets = { ...ASSETS, mathFonts: ALL_FONTS };
    const plain = await writePage({
      assets,
      data: pageDataOf(loadSample()),
      title: 'My systems',
    });
    expect(dataOf(plain.html)).not.toHaveProperty('mathFonts');
    const math = await writePage({
      assets,
      data: pageDataOf(described('the $x$ axis')),
      title: 'My systems',
    });
    expect(dataOf(math.html).mathFonts).toEqual({
      'Math-Italic': encodeBase64(fontBytes('Math-Italic')),
    });
    // The policy is the same, its hashes but for the stylesheet aside: no font source is named.
    const shape = (policy: string) => policy.replace(/'sha256-[^']+'/g, 'HASH');
    expect(shape(math.policy)).toBe(shape(plain.policy));
    expect(shape(math.policy)).toBe(shape(pagePolicy(['sha256-a', 'sha256-b'], ['sha256-c'])));
    expect(math.policy).not.toMatch(/font-src/);
  });

  it('are read back strictly, by family', () => {
    const data = pageDataOf(described('the $x$ axis'), {
      mathFonts: { 'Math-Italic': encodeBase64(fontBytes('Math-Italic')) },
    });
    const read = readPageData(JSON.stringify(data), validateFile);
    expect(read.ok && [...(read.mathFonts?.keys() ?? [])]).toEqual(['Math-Italic']);
    const problems: string[] = [];
    readPageMathFonts(
      {
        'Main-Regular': encodeBase64(new Uint8Array([1, 2, 3])),
        'Comic-Sans': encodeBase64(fontBytes('Main-Regular')),
        'Math-Italic': 'not base64!',
      },
      problems,
    );
    expect(problems).toEqual([
      'The page’s Math font "Main-Regular" is not a woff2 file in base64 of at most 256 KiB.',
      'The page holds a Math font "Comic-Sans" that is none of KaTeX’s.',
      'The page’s Math font "Math-Italic" is not a woff2 file in base64 of at most 256 KiB.',
    ]);
    const refused = readPageData(
      JSON.stringify({ ...data, mathFonts: ['Math-Italic'] }),
      validateFile,
    );
    expect(refused.ok).toBe(false);
  });

  it('name KaTeX’s families, weights and styles for the panels', () => {
    expect(katexFontFace('Main-BoldItalic')).toEqual({
      family: 'KaTeX_Main',
      weight: 'bold',
      style: 'italic',
    });
    expect(katexFontFace('Size1-Regular')).toEqual({
      family: 'KaTeX_Size1',
      weight: 'normal',
      style: 'normal',
    });
  });
});

describe('installing a page’s Math fonts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetMathFonts();
  });

  it('gives the canvas its families from the page’s bytes, and the panels KaTeX’s from the same', async () => {
    const made: { family: string; bytes: Uint8Array; descriptors: FontFaceDescriptors }[] = [];
    class Face {
      constructor(family: string, bytes: Uint8Array, descriptors: FontFaceDescriptors) {
        made.push({ family, bytes, descriptors });
      }
      load() {
        return Promise.resolve(this);
      }
    }
    vi.stubGlobal('FontFace', Face);
    const added: unknown[] = [];
    vi.stubGlobal('document', { ...document, fonts: { add: (face: unknown) => added.push(face) } });
    const bytes = fontBytes('Math-Italic');
    installPageMathFonts(new Map([['Math-Italic', bytes]]));
    // The panels' family, at once.
    expect(made).toEqual([
      { family: 'KaTeX_Math', bytes, descriptors: { weight: 'normal', style: 'italic' } },
    ]);
    // The canvas's, when a formula wants it; a family the page lacks fails, and is not waited for.
    wantMathFonts(['Math-Italic', 'Main-Regular']);
    await vi.waitFor(() => expect(made).toHaveLength(2));
    expect(made[1]?.family).toBe('Visual Anything Math Math-Italic');
    expect([...(made[1]?.bytes ?? [])]).toEqual([...bytes]);
    expect(mathFontInstalled('Main-Regular')).toBe(false);
    expect(added).toHaveLength(2);
  });
});

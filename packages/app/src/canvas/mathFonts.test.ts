import { emphasisRuns, typesetMath } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settle, withFakeMathFonts } from '../test/math-fonts';
import {
  forgetMathFonts,
  mathFamily,
  mathFontInstalled,
  mathFontsPending,
  mathGlyphFont,
  onMathFontsInstalled,
  repaintWhenMathFontsInstalled,
  wantMathDrawing,
  wantMathFonts,
  wantMathOfScene,
  whenMathFontsSettled,
} from './mathFonts';

beforeEach(() => forgetMathFonts());
afterEach(() => {
  forgetMathFonts();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as { fonts?: unknown }).fonts;
});

describe('KaTeX’s fonts on the canvas (ADR 0106)', () => {
  it('loads nothing where fonts cannot be made, and draws no glyph', async () => {
    vi.stubGlobal('FontFace', undefined);
    expect(wantMathFonts(['Main-Regular'])).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mathFontInstalled('Main-Regular')).toBe(false);
    expect(mathGlyphFont('Main-Regular')).toBeUndefined();
  });

  it('ships KaTeX’s own woff2 bytes in the bundle, nothing fetched', async () => {
    const module = await import('katex/dist/fonts/KaTeX_Main-Regular.woff2?inline');
    expect(module.default.startsWith('data:')).toBe(true);
    const bytes = atob(module.default.slice(module.default.indexOf(',') + 1)).slice(0, 4);
    expect(bytes).toBe('wOF2');
  });

  it('loads a family from bytes under a name of its own, and installs it in a later task', async () => {
    const made = withFakeMathFonts();
    expect(wantMathFonts(['Main-Regular'], new Map([['Main-Regular', ['x', '+']]]))).toBe(false);
    // Nothing is drawn in the call that wants it, nor in the task its load ends in.
    expect(made.installed).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(made.faces.map((face) => face.family)).toEqual([mathFamily('Main-Regular')]);
    expect(made.faces[0]!.bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(...made.faces[0]!.bytes.slice(0, 4))).toBe('wOF2');
    expect(made.installed).toEqual([]);
    await settle(made);
    expect(mathFontInstalled('Main-Regular')).toBe(true);
    const [options] = made.installed;
    expect(options?.name).toBe('visual-anything-math-Main-Regular');
    expect(options?.style).toMatchObject({
      fontFamily: mathFamily('Main-Regular'),
      fill: '#ffffff',
    });
    expect(JSON.stringify(options?.chars)).toContain('x+');
    expect(mathGlyphFont('Main-Regular')?.chars?.x).toBeDefined();
    // Wanted again, it is installed already.
    expect(wantMathFonts(['Main-Regular'])).toBe(true);
  });

  it('draws again what waited, and tells the canvas, once its families are installed', async () => {
    const made = withFakeMathFonts();
    const repaint = vi.fn();
    const gone = vi.fn();
    const frame = vi.fn();
    onMathFontsInstalled(frame);
    expect(mathGlyphFont('Math-Italic')).toBeUndefined();
    repaintWhenMathFontsInstalled({ repaint });
    repaintWhenMathFontsInstalled({ repaint: gone, destroyed: true });
    await settle(made);
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(gone).not.toHaveBeenCalled();
    expect(frame).toHaveBeenCalled();
  });

  it('wants the families of a drawing’s glyphs, with their characters', async () => {
    const made = withFakeMathFonts();
    const typeset = typesetMath('\\left(\\frac{x}{2}\\right)', { display: true });
    if (!typeset.ok) throw new Error(typeset.error);
    expect(wantMathDrawing(typeset.drawing)).toBe(false);
    await settle(made);
    expect(new Set(made.installed.map((each) => each.name))).toEqual(
      new Set(typeset.drawing.fonts.map((font) => `visual-anything-math-${font}`)),
    );
    expect(wantMathDrawing(typeset.drawing)).toBe(true);
  });

  it('wants the families of a scene’s details and notes when it is shown', async () => {
    const made = withFakeMathFonts();
    wantMathOfScene({
      shapes: [{}, { detailRuns: emphasisRuns('loss $x^2$') }],
      notes: [{ text: 'plain' }, { text: '$$\n\\sum_i i\n$$' }],
    });
    await settle(made);
    expect(mathFontInstalled('Math-Italic')).toBe(true);
    expect(mathFontInstalled('Main-Regular')).toBe(true);
    expect(mathFontInstalled('Size1-Regular') || mathFontInstalled('Size2-Regular')).toBe(true);
  });

  it('tells when every family on its way is installed or failed, after drawing again what waited', async () => {
    withFakeMathFonts({ tasks: 'run', failing: ['Size1-Regular'] });
    await expect(whenMathFontsSettled()).resolves.toBe(true);
    const repaint = vi.fn();
    expect(mathGlyphFont('Main-Regular')).toBeUndefined();
    expect(mathGlyphFont('Size1-Regular')).toBeUndefined();
    repaintWhenMathFontsInstalled({ repaint });
    expect(mathFontsPending()).toBe(true);
    await expect(whenMathFontsSettled()).resolves.toBe(true);
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(mathFontsPending()).toBe(false);
    expect(mathFontInstalled('Main-Regular')).toBe(true);
    expect(mathFontInstalled('Size1-Regular')).toBe(false);
  });

  it('stops waiting after its time, for a family that never loads', async () => {
    withFakeMathFonts({ tasks: 'run', loading: 1_000 });
    wantMathFonts(['Main-Regular']);
    await expect(whenMathFontsSettled(10)).resolves.toBe(false);
    expect(mathFontsPending()).toBe(true);
  });
});

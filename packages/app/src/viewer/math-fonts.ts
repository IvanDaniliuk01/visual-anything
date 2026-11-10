/**
 * Installing a read-only page's KaTeX fonts (ADR 0106, ADR 0041), read from its data
 * (`math-families.ts`), from their bytes with `FontFace`, as Roboto is installed, so that nothing is
 * fetched and the page's policy, which names no font source, does not change: for the canvas, as the
 * families its bitmap fonts are drawn from (`forgetMathFonts({ sources })`); for its panels, under
 * the families KaTeX's stylesheet names, such as `KaTeX_Main` in bold, so that `katex.render` draws
 * with them.
 */
import { encodeBase64, type MathFont } from '@visual-anything/core';
import { forgetMathFonts } from '../canvas/mathFonts';
import { MATH_FAMILIES, katexFontFace } from './math-families';

/** What registers a font: the document's `FontFaceSet`, as far as this uses it. */
interface FontSet {
  add(face: FontFace): unknown;
}

/**
 * Installs a page's fonts: the canvas takes its families from them, and from nothing else, and the
 * panels get KaTeX's families from the same bytes. Where `FontFace` is missing, as in a test, the
 * panels get none.
 */
export function installPageMathFonts(
  fonts: ReadonlyMap<MathFont, Uint8Array>,
  fontSet: FontSet | undefined = (globalThis.document as { fonts?: FontSet } | undefined)?.fonts,
): void {
  const sources: Partial<Record<MathFont, () => Promise<{ default: string }>>> = {};
  for (const font of MATH_FAMILIES) {
    const bytes = fonts.get(font);
    sources[font] = bytes
      ? () => Promise.resolve({ default: `data:font/woff2;base64,${encodeBase64(bytes)}` })
      : () => Promise.reject(new Error(`This page holds no KaTeX_${font}.`));
  }
  forgetMathFonts({ sources });
  if (typeof FontFace === 'undefined' || fontSet === undefined) return;
  for (const [font, bytes] of fonts) {
    const { family, weight, style } = katexFontFace(font);
    try {
      // A copy in an `ArrayBuffer` of its own, which `FontFace` takes.
      const face = new FontFace(family, new Uint8Array(bytes), { weight, style });
      fontSet.add(face);
      void face.load().catch(() => undefined);
    } catch {
      // A family that cannot be read draws in the panels as KaTeX's fallbacks do.
    }
  }
}

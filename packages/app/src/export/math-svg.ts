/**
 * Math in SVG and PDF (ADR 0106), as the canvas draws it: a math drawing written from its formula's
 * left on its line's baseline, an em of it `size` units, in its text's color.
 *
 * - Its glyphs are outlines from the core's outline table (`@visual-anything/core/math-outlines`):
 *   one `<path>` for each distinct glyph in the document's `<defs>`, in ems, and a `<use>` for each
 *   time it is drawn, placed and scaled there; so an SVG opened elsewhere needs no KaTeX font, and
 *   SVG-to-PDFKit draws them as paths in the PDF.
 * - Its paths (surds, stretchy delimiters, braces, wide accents) are KaTeX's own path data, each
 *   distinct one a `<path>` in `<defs>`, drawn in an `<svg>` of its box with KaTeX's `viewBox` and
 *   `preserveAspectRatio`, so that SVG fits it as KaTeX's HTML does; a piece fitted with `slice`
 *   reaches far past its box and is clipped to it, as the canvas holds it.
 * - Its rules are rectangles: a text's are among its bands (`mathRuleBands`), so the caller writes
 *   them; a face's are written here.
 * - A formula cut to its line is clipped where it was cut.
 *
 * The outline table is about 1.3 MB, so it is loaded only when an export writes Math: a drawing
 * written before it is loaded says so (`MathSvg.outlinesWanted`), and the export loads it and writes
 * the drawing again (`loadMathOutlines`). Until then, a glyph is written as a character in KaTeX's
 * family, for a reader that has KaTeX's fonts.
 *
 * Ids are stable and unique across a document: a glyph's names its font and code point, a path's and
 * a clip's are numbered in the order the document first needs them.
 */
import type { MathDrawing, MathFont, MathPath } from '@visual-anything/core';
import { mathRuleBands } from '../text/layout';
import { katexFontFace } from '../viewer/math-families';
import { element, empty, num, textElement } from './markup';

/** A glyph's outline as SVG path data in ems of its size, y down from its baseline; none for a blank. */
export type MathOutline = (font: MathFont, char: string) => string | undefined;

let outlines: MathOutline | undefined;

/** Loads the outline table, once; the exports that write Math wait for it. */
export async function loadMathOutlines(): Promise<MathOutline> {
  if (outlines === undefined) {
    const table = await import('@visual-anything/core/math-outlines');
    outlines = table.mathGlyphOutline;
  }
  return outlines;
}

/** The outline table once it is loaded. */
export function loadedMathOutlines(): MathOutline | undefined {
  return outlines;
}

/** Forgets the loaded table, or uses this one in its place, for tests. */
export function forgetMathOutlines(table?: MathOutline): void {
  outlines = table;
}

/**
 * Writes `write` once and, when it met Math before the outline table was loaded, loads it and writes
 * it again, so that its glyphs are outlines.
 */
export async function writtenWithMath<T extends { mathOutlinesWanted?: boolean }>(
  write: () => T,
): Promise<T> {
  const first = write();
  if (first.mathOutlinesWanted !== true) return first;
  await loadMathOutlines();
  return write();
}

/** Where a formula is drawn: its left on its baseline, an em of it `size` units, cut at `clip`. */
export interface PlacedMath {
  drawing: MathDrawing;
  x: number;
  baseline: number;
  size: number;
  /** How much of its width is drawn, from `x`, when it was cut. */
  clip?: number;
  /** Its TeX as written, kept as `data-tex` so that a reader of the SVG can find it. */
  tex?: string;
}

/** The ids a glyph's outline is named by: its font and its code point. */
export function mathGlyphId(font: MathFont, char: string): string {
  return `va-math-${font}-${(char.codePointAt(0) ?? 0).toString(16)}`;
}

/** Writes the formulas of one document, keeping what they share in its `<defs>`. */
export class MathSvg {
  /** Whether a glyph was met before the outline table was loaded. */
  outlinesWanted = false;
  readonly #defs: Map<string, string>;
  readonly #outline: MathOutline | undefined;
  readonly #paths = new Map<string, string>();
  #clips = 0;

  /**
   * `defs` is the document's, by id, which it writes in its `<defs>`; `outline`, the outline table,
   * the loaded one by default.
   */
  constructor(defs: Map<string, string>, outline: MathOutline | undefined = loadedMathOutlines()) {
    this.#defs = defs;
    this.#outline = outline;
  }

  /** The `<defs>` this wrote, for a writer that keeps no document of its own. */
  get defs(): string {
    return this.#defs.size === 0 ? '' : element('defs', {}, [...this.#defs.values()].join(''));
  }

  /**
   * A formula in `fill`: its glyphs and paths and, with `rules`, its rules, in a group of its own,
   * clipped where it was cut.
   */
  formula(placed: PlacedMath, fill: string, { rules = false }: { rules?: boolean } = {}): string {
    const { drawing, x, baseline, size, clip } = placed;
    let written = '';
    if (rules) {
      for (const band of mathRuleBands(drawing, x, baseline, size, clip)) {
        written += empty('rect', { x: band.x, y: band.y, width: band.width, height: band.height });
      }
    }
    for (const glyph of drawing.glyphs) written += this.#glyph(glyph, x, baseline, size);
    for (const path of drawing.paths) {
      if (clip !== undefined && path.x * size >= clip) continue;
      written += this.#path(path, x, baseline, size);
    }
    if (written === '') return '';
    return element(
      'g',
      {
        'data-tex': placed.tex,
        fill,
        'clip-path': clip === undefined ? undefined : `url(#${this.#clip(placed)})`,
      },
      written,
    );
  }

  #glyph(glyph: MathDrawing['glyphs'][number], x: number, baseline: number, size: number): string {
    const left = x + glyph.x * size;
    const y = baseline + glyph.baseline * size;
    const scale = size * glyph.size;
    if (this.#outline === undefined) {
      this.outlinesWanted = true;
      if (glyph.char.trim() === '') return '';
      const face = katexFontFace(glyph.font);
      return textElement(
        'text',
        {
          x: left,
          y,
          'font-family': face.family,
          'font-size': scale,
          'font-weight': face.weight === 'bold' ? 700 : undefined,
          'font-style': face.style === 'italic' ? 'italic' : undefined,
        },
        glyph.char,
      );
    }
    const d = this.#outline(glyph.font, glyph.char);
    if (d === undefined || d === '') return '';
    const id = mathGlyphId(glyph.font, glyph.char);
    if (!this.#defs.has(id)) this.#defs.set(id, empty('path', { id, d }));
    return empty('use', {
      href: `#${id}`,
      transform: `translate(${num(left)} ${num(y)}) scale(${num(scale)})`,
    });
  }

  #path(path: MathPath, x: number, baseline: number, size: number): string {
    let id = this.#paths.get(path.d);
    if (id === undefined) {
      let count = this.#paths.size + 1;
      while (this.#defs.has(`va-math-path-${count}`)) count += 1;
      id = `va-math-path-${count}`;
      this.#paths.set(path.d, id);
      this.#defs.set(id, empty('path', { id, d: path.d }));
    }
    const { viewBox } = path;
    const slice = /\bslice\b/.test(path.preserveAspectRatio);
    return element(
      'svg',
      {
        x: x + path.x * size,
        y: baseline + path.y * size,
        width: path.width * size,
        height: path.height * size,
        viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map(String).join(' '),
        preserveAspectRatio: path.preserveAspectRatio,
        // KaTeX's stretchy pieces reach far past their boxes, and are cut to them; others are not.
        overflow: slice ? 'hidden' : 'visible',
      },
      empty('use', { href: `#${id}` }),
    );
  }

  /** A clip of a cut formula: as wide as was drawn, and tall enough for all of it. */
  #clip({ drawing, x, baseline, size, clip = 0 }: PlacedMath): string {
    do this.#clips += 1;
    while (this.#defs.has(`va-math-clip-${this.#clips}`));
    const id = `va-math-clip-${this.#clips}`;
    const above = (drawing.height + 1) * size;
    const below = (drawing.depth + 1) * size;
    this.#defs.set(
      id,
      element(
        'clipPath',
        { id },
        empty('rect', {
          x: x - size,
          y: baseline - above,
          width: clip + size,
          height: above + below,
        }),
      ),
    );
    return id;
  }
}

/**
 * KaTeX's fonts in a read-only page (ADR 0106, ADR 0041): a page holds the families its project's
 * Math uses, and only those, as data beside its project, as it holds media files: base64 of KaTeX's
 * own woff2 files, by family, never fetched and never run. A page whose project holds no formula
 * holds none, and the viewer's script holds none either: its build leaves them out and writes them
 * beside it, `viewer/fonts/KaTeX_<family>.woff2`, for the page writer to take.
 *
 * This finds the families a project uses, writes them into a page and reads them back strictly; the
 * viewer installs them (`math-fonts.ts`). Pure, so that the app and the command line write the same
 * page.
 */
import {
  decodeBase64,
  encodeBase64,
  parseEmphasis,
  typesetMath,
  type EmphasisBlock,
  type EmphasisRun,
  type MathFont,
} from '@visual-anything/core';

/** Every family KaTeX ships, each once: the names a page's fonts may have. */
const FAMILIES: Record<MathFont, true> = {
  'AMS-Regular': true,
  'Caligraphic-Bold': true,
  'Caligraphic-Regular': true,
  'Fraktur-Bold': true,
  'Fraktur-Regular': true,
  'Main-Bold': true,
  'Main-BoldItalic': true,
  'Main-Italic': true,
  'Main-Regular': true,
  'Math-BoldItalic': true,
  'Math-Italic': true,
  'SansSerif-Bold': true,
  'SansSerif-Italic': true,
  'SansSerif-Regular': true,
  'Script-Regular': true,
  'Size1-Regular': true,
  'Size2-Regular': true,
  'Size3-Regular': true,
  'Size4-Regular': true,
  'Typewriter-Regular': true,
};

/** KaTeX's families, in their order. */
export const MATH_FAMILIES = Object.keys(FAMILIES) as MathFont[];

/** Whether a name is one of KaTeX's families. */
export function isMathFamily(name: string): name is MathFont {
  return Object.prototype.hasOwnProperty.call(FAMILIES, name);
}

/** Where the viewer's build writes a family's file, beside `viewer.js`. */
export function mathFontFile(font: MathFont): string {
  return `fonts/KaTeX_${font}.woff2`;
}

/** The most bytes one family's file takes in a page: KaTeX's largest is under 30 kB. */
export const MOST_MATH_FONT_BYTES = 256 * 1024;

/** What every woff2 file starts with. */
const WOFF2 = [0x77, 0x4f, 0x46, 0x32];

/** The family KaTeX's stylesheet names a font by, and the weight and style it asks for. */
export function katexFontFace(font: MathFont): {
  family: string;
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
} {
  const [family = font, shape = ''] = font.split('-');
  return {
    family: `KaTeX_${family}`,
    weight: shape.includes('Bold') ? 'bold' : 'normal',
    style: shape.includes('Italic') ? 'italic' : 'normal',
  };
}

// --- Writing ---------------------------------------------------------------------------------------

/** The most distinct formulas a page's families are found from; past them, every family is held. */
const MOST_FORMULAS = 20_000;

/** The keys under which a project's files hold no text that takes emphasis, and much else. */
const NO_TEXT = new Set(['images', 'solids', 'media']);

/**
 * The families a project's Math uses, in KaTeX's order: those of every formula in every text its
 * files hold that may take emphasis, typeset as the canvas typesets it. A name, which never takes
 * Math, may add a family the page then holds for nothing; never one fewer.
 */
export function mathFontsOfFiles(files: unknown): MathFont[] {
  const used = new Set<MathFont>();
  const seen = new Set<string>();
  let everything = false;
  const formula = (tex: string, display: boolean) => {
    const key = `${display ? '$$' : '$'}${tex}`;
    if (seen.has(key)) return;
    if (seen.size >= MOST_FORMULAS) {
      everything = true;
      return;
    }
    seen.add(key);
    const typeset = typesetMath(tex, { display });
    if (typeset.ok) for (const font of typeset.drawing.fonts) used.add(font);
  };
  const runs = (list: readonly EmphasisRun[]) => {
    for (const run of list) if (run.math) formula(run.math.tex, run.math.display);
  };
  const blocks = (list: readonly EmphasisBlock[]): void => {
    for (const block of list) {
      switch (block.kind) {
        case 'math':
          formula(block.tex, true);
          break;
        case 'paragraph':
        case 'heading':
          runs(block.runs);
          break;
        case 'list':
          for (const item of block.items) blocks(item.blocks);
          break;
        case 'quote':
          blocks(block.blocks);
          break;
        case 'table':
          for (const row of [block.head, ...block.rows]) for (const cell of row) runs(cell);
          break;
        case 'rule':
        case 'code':
          break;
      }
    }
  };
  const visit = (value: unknown): void => {
    if (everything) return;
    if (typeof value === 'string') {
      if (!value.includes('$')) return;
      // A text of one line reads a formula as a text of blocks does; a block only blocks read.
      blocks(parseEmphasis(value, { blocks: true }));
      runs(parseEmphasis(value, { blocks: false }).flatMap((block) => runsOf(block)));
    } else if (Array.isArray(value)) {
      for (const each of value) visit(each);
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, each] of Object.entries(value)) if (!NO_TEXT.has(key)) visit(each);
    }
  };
  visit(files);
  if (everything) return [...MATH_FAMILIES];
  return MATH_FAMILIES.filter((font) => used.has(font));
}

function runsOf(block: EmphasisBlock): readonly EmphasisRun[] {
  return block.kind === 'paragraph' || block.kind === 'heading' ? block.runs : [];
}

/**
 * The fonts a page holds, in base64 by family: those of `wanted` that `files` has, in KaTeX's order;
 * none when it has none of them.
 */
export function pageMathFonts(
  wanted: readonly MathFont[],
  files: Partial<Record<MathFont, Uint8Array>> | undefined,
): Partial<Record<MathFont, string>> | undefined {
  if (files === undefined) return undefined;
  const held: Partial<Record<MathFont, string>> = {};
  for (const font of wanted) {
    const bytes = files[font];
    if (bytes) held[font] = encodeBase64(bytes);
  }
  return Object.keys(held).length === 0 ? undefined : held;
}

// --- Reading ---------------------------------------------------------------------------------------

/**
 * Reads a page's fonts strictly: an object of base64 by family, each one of KaTeX's, each a woff2
 * file within `MOST_MATH_FONT_BYTES`. What is not is said in `problems`, and the page is refused, as
 * for its media files.
 */
export function readPageMathFonts(value: unknown, problems: string[]): Map<MathFont, Uint8Array> {
  const fonts = new Map<MathFont, Uint8Array>();
  if (value === undefined) return fonts;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push('The page’s Math fonts are not an object of fonts by family.');
    return fonts;
  }
  const most = Math.ceil(MOST_MATH_FONT_BYTES / 3) * 4;
  for (const [family, text] of Object.entries(value as Record<string, unknown>)) {
    if (!isMathFamily(family)) {
      problems.push(`The page holds a Math font "${family}" that is none of KaTeX’s.`);
      continue;
    }
    const bytes = typeof text === 'string' && text.length <= most ? decodeBase64(text) : undefined;
    if (bytes === undefined || !WOFF2.every((byte, at) => bytes[at] === byte)) {
      problems.push(
        `The page’s Math font "${family}" is not a woff2 file in base64 of at most 256 KiB.`,
      );
      continue;
    }
    fonts.set(family, bytes);
  }
  return fonts;
}

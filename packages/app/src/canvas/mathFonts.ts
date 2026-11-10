/**
 * KaTeX's fonts on the canvas (ADR 0106): bitmap fonts made from KaTeX's own woff2 fonts, loaded with
 * `FontFace` from bytes the app's bundle holds, as Roboto is (`robotoFonts.ts`), so that nothing is
 * fetched and the page needs no new source. Each font file is a family of its own, named after it,
 * so that a KaTeX installed on the computer is never drawn in its place. They are drawn white and
 * tinted, so that a theme switch only tints formulas again.
 *
 * A family is wanted when a project that holds Math opens (`wantMathOfScene`), or when a formula is
 * first laid out (`mathGlyphFont`), and installed after: its bytes load, then each family's bitmap
 * font is drawn in a task of its own, never inside the frame that first needs it. Until a family is
 * installed, a formula draws its rules and paths and not its glyphs, and asks to be drawn again
 * (`repaintWhenMathFontsInstalled`); the canvas is told to draw once they are (`onMathFontsInstalled`).
 *
 * Where `FontFace` or a canvas is missing, as in a test, nothing loads, and formulas draw without
 * their glyphs.
 */
import { BitmapFont, Cache } from 'pixi.js';
import {
  decodeBase64,
  parseEmphasis,
  typesetMath,
  type EmphasisBlock,
  type EmphasisRun,
  type MathDrawing,
  type MathFont,
} from '@visual-anything/core';

/** What drawing reads of a bitmap font: PixiJS's own, or nothing where fonts cannot be drawn. */
export interface GlyphFont {
  chars?: BitmapFont['chars'];
  /** The size its glyphs and offsets are measured at, which PixiJS scales them from. */
  baseMeasurementFontSize?: number;
  fontMetrics?: { fontSize: number; ascent: number };
  ensureCharacters?: (chars: string) => void;
}

/** The family a KaTeX font is registered under, such as `Visual Anything Math Main-Regular`. */
export function mathFamily(font: MathFont): string {
  return `Visual Anything Math ${font}`;
}

/** The name its bitmap font is installed under; PixiJS keeps it as `<name>-bitmap`. */
function bitmapName(font: MathFont): string {
  return `visual-anything-math-${font}`;
}

/** The size the families are drawn at, scaled to each glyph's: as the text emphasis fonts are. */
const DRAWN_SIZE = 16;

/** The bytes of each font, as a `data:` address Vite writes into the bundle: one chunk each. */
type Source = () => Promise<{ default: string }>;
const SOURCES: Record<MathFont, Source> = {
  'AMS-Regular': () => import('katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline'),
  'Caligraphic-Bold': () => import('katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline'),
  'Caligraphic-Regular': () => import('katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline'),
  'Fraktur-Bold': () => import('katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline'),
  'Fraktur-Regular': () => import('katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline'),
  'Main-Bold': () => import('katex/dist/fonts/KaTeX_Main-Bold.woff2?inline'),
  'Main-BoldItalic': () => import('katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline'),
  'Main-Italic': () => import('katex/dist/fonts/KaTeX_Main-Italic.woff2?inline'),
  'Main-Regular': () => import('katex/dist/fonts/KaTeX_Main-Regular.woff2?inline'),
  'Math-BoldItalic': () => import('katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline'),
  'Math-Italic': () => import('katex/dist/fonts/KaTeX_Math-Italic.woff2?inline'),
  'SansSerif-Bold': () => import('katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline'),
  'SansSerif-Italic': () => import('katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline'),
  'SansSerif-Regular': () => import('katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline'),
  'Script-Regular': () => import('katex/dist/fonts/KaTeX_Script-Regular.woff2?inline'),
  'Size1-Regular': () => import('katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline'),
  'Size2-Regular': () => import('katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline'),
  'Size3-Regular': () => import('katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline'),
  'Size4-Regular': () => import('katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline'),
  'Typewriter-Regular': () => import('katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline'),
};

/** Where each family is: its bytes loading, loaded and waiting to be drawn, installed, or failed. */
type FamilyState = 'loading' | 'loaded' | 'installed' | 'failed';

/** What registers a font: the document's `FontFaceSet`, as far as this uses it. */
interface FontSet {
  add(face: FontFace): unknown;
}

/** Something drawn without glyphs whose family was not installed, to draw again once it is. */
export interface MathRepaint {
  repaint(): void;
  readonly destroyed?: boolean;
}

const states = new Map<MathFont, FamilyState>();
/** The characters each family's formulas use so far: drawn into its atlas when it is installed. */
const wantedChars = new Map<MathFont, Set<string>>();
/** Families loaded and waiting for their bitmap font, drawn one a task. */
const toInstall: MathFont[] = [];
let installing = false;
const waiting = new Set<MathRepaint>();
const listeners = new Set<() => void>();
/** How each family is loaded and installed: replaced in tests. */
let sources: Record<MathFont, Source> = SOURCES;
let schedule: (task: () => void) => void = (task) => void setTimeout(task, 0);

/** Whether a family's bitmap font is installed. */
export function mathFontInstalled(font: MathFont): boolean {
  return states.get(font) === 'installed';
}

/** Whether a family is on its way: wanted, and neither installed nor failed. */
export function mathFontPending(font: MathFont): boolean {
  const state = states.get(font);
  return state === 'loading' || state === 'loaded';
}

/**
 * Wants these families, with the characters they will draw: each one not yet asked for starts
 * loading, and is installed after, outside the frame. Answers whether all of them are installed.
 */
export function wantMathFonts(
  fonts: Iterable<MathFont>,
  chars?: ReadonlyMap<MathFont, Iterable<string>>,
): boolean {
  let ready = true;
  for (const font of fonts) {
    const wanted = chars?.get(font);
    if (wanted) {
      let set = wantedChars.get(font);
      if (!set) wantedChars.set(font, (set = new Set()));
      for (const char of wanted) set.add(char);
    }
    const state = states.get(font);
    if (state === 'installed') continue;
    ready = false;
    if (state === undefined) {
      states.set(font, 'loading');
      void load(font);
    }
  }
  return ready;
}

/** Wants the families a drawing's glyphs use, with their characters; whether all are installed. */
export function wantMathDrawing(drawing: MathDrawing): boolean {
  if (drawing.fonts.every(mathFontInstalled)) return true;
  const chars = new Map<MathFont, string[]>();
  for (const glyph of drawing.glyphs) {
    let list = chars.get(glyph.font);
    if (!list) chars.set(glyph.font, (list = []));
    list.push(glyph.char);
  }
  return wantMathFonts(drawing.fonts, chars);
}

/**
 * A family's bitmap font when it is installed. Otherwise none, and the family is wanted: the glyphs
 * drawn with it are left out until it is installed.
 */
export function mathGlyphFont(font: MathFont): GlyphFont | undefined {
  if (states.get(font) !== 'installed') {
    wantMathFonts([font]);
    return undefined;
  }
  const key = `${bitmapName(font)}-bitmap`;
  return Cache.has(key) ? Cache.get<GlyphFont>(key) : undefined;
}

/** Draws this again once the families wanted now are installed. */
export function repaintWhenMathFontsInstalled(drawn: MathRepaint): void {
  waiting.add(drawn);
}

/** Calls `listener` each time families are installed, so that the canvas draws a frame. */
export function onMathFontsInstalled(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How many formulas `wantMathOfScene` typesets at most for each scene it is shown. */
const SCAN_FORMULAS = 200;
const scannedRuns = new WeakSet<readonly EmphasisRun[]>();
const scannedTexts = new Set<string>();
const SCANNED_TEXTS = 2_000;

/**
 * Wants the families a scene's formulas use, when a project that holds Math opens or Math first
 * appears through an edit: those of its shapes' details and notes, as far as its first formulas
 * show. A formula met later, as a face's, is wanted when it is laid out.
 */
export function wantMathOfScene(scene: {
  readonly shapes: readonly { readonly detailRuns?: readonly EmphasisRun[] }[];
  readonly notes: readonly { readonly text: string }[];
}): void {
  const budget = { left: SCAN_FORMULAS };
  for (const shape of scene.shapes) {
    const runs = shape.detailRuns;
    if (!runs || scannedRuns.has(runs)) continue;
    scannedRuns.add(runs);
    if (!wantRuns(runs, budget)) return;
  }
  for (const note of scene.notes) {
    const { text } = note;
    if (!text.includes('$') && !text.includes('```') && !text.includes('~~~')) continue;
    if (scannedTexts.has(text)) continue;
    if (scannedTexts.size >= SCANNED_TEXTS) scannedTexts.clear();
    scannedTexts.add(text);
    if (!wantBlocks(parseEmphasis(text, { blocks: true }), budget)) return;
  }
}

function wantFormula(tex: string, display: boolean, budget: { left: number }): boolean {
  if (budget.left <= 0) return false;
  budget.left -= 1;
  const typeset = typesetMath(tex, { display });
  if (typeset.ok) wantMathDrawing(typeset.drawing);
  return true;
}

function wantRuns(runs: readonly EmphasisRun[], budget: { left: number }): boolean {
  for (const run of runs) {
    if (run.math && !wantFormula(run.math.tex, run.math.display, budget)) return false;
  }
  return true;
}

function wantBlocks(blocks: readonly EmphasisBlock[], budget: { left: number }): boolean {
  for (const block of blocks) {
    switch (block.kind) {
      case 'math':
        if (!wantFormula(block.tex, true, budget)) return false;
        break;
      case 'paragraph':
      case 'heading':
        if (!wantRuns(block.runs, budget)) return false;
        break;
      case 'list':
        for (const item of block.items) if (!wantBlocks(item.blocks, budget)) return false;
        break;
      case 'quote':
        if (!wantBlocks(block.blocks, budget)) return false;
        break;
      case 'table':
        for (const cells of [block.head, ...block.rows]) {
          for (const cell of cells) if (!wantRuns(cell, budget)) return false;
        }
        break;
      case 'rule':
      case 'code':
        break;
    }
  }
  return true;
}

async function load(font: MathFont): Promise<void> {
  try {
    const fonts = (globalThis.document as { fonts?: FontSet } | undefined)?.fonts;
    if (typeof FontFace === 'undefined' || !fonts) throw new Error('No fonts here.');
    const address = (await sources[font]()).default;
    const bytes = decodeBase64(address.slice(address.indexOf(',') + 1));
    if (!bytes) throw new Error(`KaTeX_${font} could not be read.`);
    // A copy in an `ArrayBuffer` of its own, which `FontFace` takes.
    const face = new FontFace(mathFamily(font), new Uint8Array(bytes), {
      weight: '400',
      style: 'normal',
    });
    await face.load();
    fonts.add(face);
    states.set(font, 'loaded');
    toInstall.push(font);
    if (!installing) {
      installing = true;
      schedule(installNext);
    }
  } catch {
    // A family that cannot load leaves its glyphs out; the formula still draws its rules and paths.
    // What waited for it is drawn again, and waits no more.
    states.set(font, 'failed');
    if (!installing) {
      installing = true;
      schedule(installNext);
    }
  }
}

/** Installs the next family loaded, one a task; tells what waits once none is left. */
function installNext(): void {
  const font = toInstall.shift();
  if (font === undefined) {
    installing = false;
    const drawn = [...waiting];
    waiting.clear();
    for (const each of drawn) if (!each.destroyed) each.repaint();
    for (const listener of listeners) listener();
    return;
  }
  try {
    const key = `${bitmapName(font)}-bitmap`;
    if (!Cache.has(key)) {
      BitmapFont.install({
        name: bitmapName(font),
        style: { fontFamily: mathFamily(font), fontSize: DRAWN_SIZE, fill: '#ffffff' },
        chars: [[' ', ' '], [...(wantedChars.get(font) ?? [])].join('')],
        // Drawn at twice the screen's density or more, as the other label fonts.
        resolution: Math.min(4, Math.max(2, (globalThis.devicePixelRatio || 1) * 2)),
        padding: 4,
      });
    }
    states.set(font, 'installed');
  } catch {
    states.set(font, 'failed');
  }
  schedule(installNext);
}

/** Forgets what was loaded and wanted, and how, for tests. */
export function forgetMathFonts(
  options: {
    sources?: Partial<Record<MathFont, Source>>;
    schedule?: (task: () => void) => void;
  } = {},
): void {
  for (const font of states.keys()) Cache.remove(`${bitmapName(font)}-bitmap`);
  states.clear();
  wantedChars.clear();
  toInstall.length = 0;
  installing = false;
  waiting.clear();
  listeners.clear();
  scannedTexts.clear();
  sources = { ...SOURCES, ...options.sources };
  schedule = options.schedule ?? ((task) => void setTimeout(task, 0));
}

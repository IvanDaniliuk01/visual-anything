/**
 * Text emphasis on the canvas (ADR 0082): a text laid out by `text/layout.ts` over the advances of
 * bitmap fonts, its glyphs drawn as textured quads in one drawing, as PixiJS draws a bitmap text, and
 * its bands in two more: highlights and code backs. All three are drawn in white and tinted, so that
 * a theme switch or a new fill only tints them again (`paint`).
 *
 * The fonts are a family of their own, drawn at 16 and scaled: regular, bold, italic, bold italic and
 * monospace, in Roboto and Roboto Mono once loaded (`robotoFonts.ts`, ADR 0083). Each is installed the
 * first time a text needs it. Texts are measured in the core's tables of the same fonts, and each
 * glyph is placed by them, so that a text is drawn where it was laid out to the unit, faces included.
 * A text is laid out once per text, width and lines, and kept; nothing is read or laid out again while
 * the canvas pans or zooms.
 *
 * Math (ADR 0106) is typeset when its text is laid out, and drawn here: its glyphs as tinted quads
 * in the same drawing, from KaTeX's own fonts as bitmap families (`mathFonts.ts`), its rules as bands,
 * and its paths as `Graphics` that share one context per piece and size (`mathPaths.ts`), white and
 * tinted with the text. A formula whose families are not installed yet draws without its glyphs and
 * is drawn again once they are.
 */
import { Cache, BitmapFont, Container, Graphics } from 'pixi.js';
import {
  robotoEms,
  type EmphasisBlock,
  type EmphasisRun,
  type MathDrawing,
} from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { layOutBlocks, layOutRuns, type FontVariant, type LaidText } from '../text/layout';
import { emphasisBacks } from './colors';
import {
  mathFontPending,
  mathGlyphFont,
  repaintWhenMathFontsInstalled,
  type GlyphFont,
  type MathRepaint,
} from './mathFonts';
import { PATH_UNITS, mathPathContext, sharedMathContext } from './mathPaths';
import { MONO_FAMILY, SANS_FAMILY } from './robotoFonts';
import { canvasMeasure } from './textBlock';

/** The fonts the family is drawn in, first available first: Roboto, then the system's until it loads. */
const SANS = [...SANS_FAMILY];
const MONO = [...MONO_FAMILY];

const FONT_NAMES: Record<FontVariant, string> = {
  regular: 'visual-anything-text',
  bold: 'visual-anything-text-bold',
  italic: 'visual-anything-text-italic',
  boldItalic: 'visual-anything-text-bold-italic',
  mono: 'visual-anything-text-mono',
};

/** The size the family is drawn at: large enough for a note's first heading, scaled down for a detail. */
const DRAWN_SIZE = 16;

/** Printable ASCII and the letters and signs Spanish and English use most; others are added when met. */
const CHARACTERS: (string | string[])[] = [[' ', '~'], 'áéíóúüñÁÉÍÓÚÜÑ¿¡…—–→·“”‘’×•◦▪'];

/** A variant's font, installed the first time it is asked for. */
export function fontOf(variant: FontVariant): GlyphFont | undefined {
  const name = FONT_NAMES[variant];
  const key = `${name}-bitmap`;
  if (!Cache.has(key)) {
    try {
      BitmapFont.install({
        name,
        style: {
          fontFamily: variant === 'mono' ? MONO : SANS,
          fontSize: DRAWN_SIZE,
          fontWeight: variant === 'bold' || variant === 'boldItalic' ? '700' : 'normal',
          fontStyle: variant === 'italic' || variant === 'boldItalic' ? 'italic' : 'normal',
          fill: '#ffffff',
        },
        chars: CHARACTERS,
        // Drawn at twice the screen's density or more, as the other label fonts.
        resolution: Math.min(4, Math.max(2, (globalThis.devicePixelRatio || 1) * 2)),
        padding: 4,
      });
    } catch {
      // Where no font can be drawn, as in a test without a canvas, text is measured in Roboto.
      return undefined;
    }
  }
  return Cache.has(key) ? Cache.get<GlyphFont>(key) : undefined;
}

/**
 * A text with emphasis, drawn: its bands for highlights and code under its glyphs, and its lines
 * (underline, strikethrough, rules, quote bars, task boxes) with its glyphs, each part tinted; its
 * formulas' paths over them, tinted with its glyphs.
 */
export class EmphasisLabel extends Container implements MathRepaint {
  readonly highlights = new Graphics();
  readonly codes = new Graphics();
  readonly glyphs = new Graphics();
  readonly paths = new Container();

  constructor(readonly laid: LaidText) {
    super();
    this.addChild(this.highlights, this.codes, this.glyphs, this.paths);
    drawLaid(this, laid);
  }

  /** Tints its text, and its backs to read under it. */
  paint(text: Color): void {
    const backs = emphasisBacks(text);
    this.glyphs.tint = text;
    this.paths.tint = text;
    this.highlights.tint = backs.highlight;
    this.codes.tint = backs.code;
  }

  /** Draws it again, as the families its formulas wanted are installed; its tints stay. */
  repaint(): void {
    if (this.destroyed) return;
    this.highlights.clear();
    this.codes.clear();
    this.glyphs.clear();
    clearMathPaths(this.paths);
    drawLaid(this, this.laid);
  }
}

/** Tints a label, as `paint` tints a label with emphasis. */
export function tintLabel(label: Container, color: Color): void {
  if (label instanceof EmphasisLabel) label.paint(color);
  else label.tint = color;
}

function drawLaid(label: EmphasisLabel, laid: LaidText): void {
  const white = 0xffffff;
  for (const line of laid.lines) {
    for (const band of line.bands) {
      const target =
        band.kind === 'highlight'
          ? label.highlights
          : band.kind === 'code'
            ? label.codes
            : label.glyphs;
      target.rect(band.x, band.y, band.width, band.height);
      if (band.outline !== undefined) target.stroke({ color: white, width: band.outline });
      else target.fill(white);
    }
    for (const piece of line.pieces) {
      if (piece.math) {
        const drawn = drawMath(
          label.glyphs,
          label.paths,
          piece.math,
          piece.x,
          line.baseline,
          white,
        );
        if (!drawn) repaintWhenMathFontsInstalled(label);
        continue;
      }
      drawGlyphs(
        label.glyphs,
        piece.text,
        piece.variant,
        piece.size,
        piece.x,
        line.baseline,
        white,
      );
    }
  }
}

/** A formula as it is drawn: its drawing, an em of it in units, and where it was cut. */
export interface DrawnMath {
  drawing: MathDrawing;
  size: number;
  clip?: number;
}

/**
 * Draws a formula from `x` on `baseline`: its glyphs as quads in `graphics`, tinted `color`, and its
 * paths as `Graphics` added to `paths`, when given, each sharing its piece's context, tinted `color` too (white
 * where the container is tinted). Its rules are drawn by whoever draws its bands. A glyph that
 * reaches past a cut is left out. Answers false when a family its glyphs need is not installed yet
 * but on its way: those glyphs are left out, and the caller draws it again once it is.
 */
export function drawMath(
  graphics: Graphics,
  paths: Container | undefined,
  math: DrawnMath,
  x: number,
  baseline: number,
  color: number | string,
): boolean {
  const { drawing, size, clip } = math;
  const right = clip === undefined ? Infinity : x + clip + 1e-6;
  let ready = true;
  for (const glyph of drawing.glyphs) {
    const font = mathGlyphFont(glyph.font);
    if (!font) {
      // A family that failed to load is not waited for.
      if (mathFontPending(glyph.font)) ready = false;
      continue;
    }
    const chars = font.chars;
    const measured = font.baseMeasurementFontSize ?? font.fontMetrics?.fontSize;
    if (!chars || !measured) continue;
    if (!chars[glyph.char]) font.ensureCharacters?.(glyph.char);
    const data = chars[glyph.char];
    const texture = data?.texture;
    if (!data || !texture || texture.orig.width <= 0) continue;
    const px = size * glyph.size;
    const scale = px / measured;
    const left = x + glyph.x * size;
    if (left + data.xAdvance * scale > right) continue;
    const ascent = font.fontMetrics?.ascent ?? measured * 0.8;
    const top = baseline + glyph.baseline * size - ascent * scale;
    graphics.texture(
      texture,
      color,
      left + data.xOffset * scale,
      top + data.yOffset * scale,
      texture.orig.width * scale,
      texture.orig.height * scale,
    );
  }
  const clipEms = clip === undefined ? undefined : clip / size;
  if (!paths) return ready;
  for (const path of drawing.paths) {
    if (clipEms !== undefined && path.x >= clipEms) continue;
    const piece = new Graphics(mathPathContext(path, clipEms));
    piece.position.set(x + path.x * size, baseline + path.y * size);
    piece.scale.set(size / PATH_UNITS);
    if (color !== 0xffffff) piece.tint = color;
    paths.addChild(piece);
  }
  return ready;
}

/** Takes a formula's paths away, destroying no context another shape shares. */
export function clearMathPaths(paths: Container): void {
  for (const piece of paths.removeChildren()) {
    const context = piece instanceof Graphics ? piece.context : undefined;
    piece.destroy({ context: context !== undefined && !sharedMathContext(context) });
  }
}

/**
 * Draws a text's glyphs as textured quads in `graphics`, its letters standing on `baseline` from `x`,
 * each placed by Roboto's widths in the core, as the text was measured, and tinted `color`.
 */
export function drawGlyphs(
  graphics: Graphics,
  text: string,
  variant: FontVariant,
  size: number,
  x: number,
  baseline: number,
  color: number | string,
): void {
  const font = fontOf(variant);
  const chars = font?.chars;
  // Glyphs are measured at the font's measurement size, as PixiJS lays them out; the metrics' size is
  // its ascent and descent together, larger than an em, and drew each glyph narrower than its advance.
  const drawn = font?.baseMeasurementFontSize ?? font?.fontMetrics?.fontSize;
  if (!chars || !drawn) return;
  font.ensureCharacters?.(text);
  const scale = size / drawn;
  const ascent = font.fontMetrics?.ascent ?? drawn * 0.8;
  const top = baseline - ascent * scale;
  let at = x;
  for (const character of text) {
    const glyph = chars[character];
    const texture = glyph?.texture;
    if (glyph && texture && texture.orig.width > 0) {
      graphics.texture(
        texture,
        color,
        at + glyph.xOffset * scale,
        top + glyph.yOffset * scale,
        texture.orig.width * scale,
        texture.orig.height * scale,
      );
    }
    at += robotoEms(character.codePointAt(0) ?? 0, variant) * size;
  }
}

/** Layouts kept by the runs they were made from, then by width, size, alignment and room. */
const laidRuns = new WeakMap<readonly EmphasisRun[], Map<string, LaidText>>();

/**
 * The runs of a detail laid out, once for each width, size, alignment, number of lines and height:
 * a formula is typeset here, never while a frame draws.
 */
export function laidOutRuns(
  runs: readonly EmphasisRun[],
  size: number,
  width: number,
  align: 'left' | 'center' | 'right',
  maxLines: number,
  maxHeight?: number,
): LaidText {
  let kept = laidRuns.get(runs);
  if (!kept) {
    kept = new Map();
    laidRuns.set(runs, kept);
  }
  const key = `${size} ${width} ${align} ${maxLines} ${maxHeight ?? ''}`;
  let laid = kept.get(key);
  if (!laid) {
    laid = layOutRuns(runs, {
      measure: canvasMeasure,
      size,
      width,
      align,
      maxLines,
      ...(maxHeight === undefined ? {} : { maxHeight }),
    });
    kept.set(key, laid);
  }
  return laid;
}

/**
 * A detail with text emphasis as a label: laid out in `width`, in as many lines as fit in `room`,
 * cut by height, since a line that holds a formula may be taller than one of text (ADR 0106); one
 * line without a room. It is placed as an anchored text would be. None when not even one line fits.
 */
export function emphasisLabel(
  runs: readonly EmphasisRun[],
  place: {
    x: number;
    y: number;
    anchor: { x: number; y: number };
    size: number;
    width: number;
    align: 'left' | 'center' | 'right';
    room: number | undefined;
    fill: Color;
  },
): EmphasisLabel | undefined {
  const laid =
    place.room === undefined
      ? laidOutRuns(runs, place.size, place.width, place.align, 1)
      : laidOutRuns(runs, place.size, place.width, place.align, Infinity, place.room);
  if (laid.lines.length === 0) return undefined;
  const label = new EmphasisLabel(laid);
  const width = place.align === 'left' ? laid.width : place.width;
  label.position.set(place.x - place.anchor.x * width, place.y - place.anchor.y * laid.height);
  label.paint(place.fill);
  return label;
}

/** Layouts of texts of several lines, kept by text, size and room. */
const laidNotes = new Map<string, LaidText>();
const KEPT_NOTES = 500;

/** A note's text, laid out with its blocks in its room and drawn (ADR 0082). */
export function noteLabel(
  text: string,
  blocks: () => readonly EmphasisBlock[],
  place: { x: number; y: number; width: number; height: number; size: number; fill: Color },
): EmphasisLabel {
  const key = `${place.size} ${place.width} ${place.height}\n${text}`;
  let laid = laidNotes.get(key);
  if (!laid) {
    laid = layOutBlocks(blocks(), {
      measure: canvasMeasure,
      size: place.size,
      width: place.width,
      align: 'left',
      maxHeight: place.height,
    });
    if (laidNotes.size >= KEPT_NOTES) laidNotes.delete(laidNotes.keys().next().value as string);
    laidNotes.set(key, laid);
  }
  const label = new EmphasisLabel(laid);
  label.position.set(place.x, place.y);
  label.paint(place.fill);
  return label;
}

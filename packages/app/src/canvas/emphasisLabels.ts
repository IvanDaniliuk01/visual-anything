/**
 * Text emphasis on the canvas (ADR 0082): a text laid out by `text/layout.ts` over the advances of
 * bitmap fonts, its glyphs drawn as textured quads in one drawing, as PixiJS draws a bitmap text, and
 * its bands in two more: highlights and code backs. All three are drawn in white and tinted, so that
 * a theme switch or a new fill only tints them again (`paint`).
 *
 * The fonts are a family of their own, drawn at 16 and scaled: regular, bold, italic, bold italic and
 * monospace. Each is installed the first time a text needs it. A text is laid out once per text, width
 * and lines, and kept; nothing is read or laid out again while the canvas pans or zooms.
 */
import { BitmapFont, Cache, Container, Graphics } from 'pixi.js';
import type { EmphasisBlock, EmphasisRun } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import {
  LINE_HEIGHT,
  layOutBlocks,
  layOutRuns,
  type FontVariant,
  type LaidText,
  type Measure,
} from '../text/layout';
import { emphasisBacks } from './colors';
import { robotoMeasure } from './textBlock';

/** The fonts the family is drawn in, first available first. */
const SANS = ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'];
const MONO = ['ui-monospace', 'Cascadia Mono', 'Roboto Mono', 'Consolas', 'monospace'];

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

/** What drawing reads of a bitmap font: PixiJS's own, or nothing where fonts cannot be drawn. */
interface GlyphFont {
  chars?: BitmapFont['chars'];
  fontMetrics?: { fontSize: number; ascent: number };
  ensureCharacters?: (chars: string) => void;
}

/** A variant's font, installed the first time it is asked for. */
function fontOf(variant: FontVariant): GlyphFont | undefined {
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

/** How wide a text is in a variant's font, at a size: by its glyphs' advances once installed. */
export const glyphMeasure: Measure = (text, variant, size) => {
  const font = fontOf(variant);
  const chars = font?.chars;
  const drawn = font?.fontMetrics?.fontSize;
  if (!chars || !drawn) return robotoMeasure(text, variant, size);
  font.ensureCharacters?.(text);
  let width = 0;
  for (const character of text) width += chars[character]?.xAdvance ?? 0;
  return (width * size) / drawn;
};

/**
 * A text with emphasis, drawn: its bands for highlights and code under its glyphs, and its lines
 * (underline, strikethrough, rules, quote bars, task boxes) with its glyphs, each part tinted.
 */
export class EmphasisLabel extends Container {
  readonly highlights = new Graphics();
  readonly codes = new Graphics();
  readonly glyphs = new Graphics();

  constructor(readonly laid: LaidText) {
    super();
    this.addChild(this.highlights, this.codes, this.glyphs);
    drawLaid(this, laid);
  }

  /** Tints its text, and its backs to read under it. */
  paint(text: Color): void {
    const backs = emphasisBacks(text);
    this.glyphs.tint = text;
    this.highlights.tint = backs.highlight;
    this.codes.tint = backs.code;
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
      const font = fontOf(piece.variant);
      const chars = font?.chars;
      const drawn = font?.fontMetrics?.fontSize;
      if (!chars || !drawn) continue;
      font.ensureCharacters?.(piece.text);
      const scale = piece.size / drawn;
      const ascent = font.fontMetrics?.ascent ?? drawn * 0.8;
      const top = line.baseline - ascent * scale;
      let x = piece.x;
      for (const character of piece.text) {
        const glyph = chars[character];
        if (!glyph) continue;
        const texture = glyph.texture;
        if (texture && texture.orig.width > 0) {
          label.glyphs.texture(
            texture,
            white,
            x + glyph.xOffset * scale,
            top + glyph.yOffset * scale,
            texture.orig.width * scale,
            texture.orig.height * scale,
          );
        }
        x += glyph.xAdvance * scale;
      }
    }
  }
}

/** Layouts kept by the runs they were made from, then by width, size, alignment and lines. */
const laidRuns = new WeakMap<readonly EmphasisRun[], Map<string, LaidText>>();

/** The runs of a detail laid out, once for each width, size, alignment and number of lines. */
export function laidOutRuns(
  runs: readonly EmphasisRun[],
  size: number,
  width: number,
  align: 'left' | 'center',
  maxLines: number,
): LaidText {
  let kept = laidRuns.get(runs);
  if (!kept) {
    kept = new Map();
    laidRuns.set(runs, kept);
  }
  const key = `${size} ${width} ${align} ${maxLines}`;
  let laid = kept.get(key);
  if (!laid) {
    laid = layOutRuns(runs, { measure: glyphMeasure, size, width, align, maxLines });
    kept.set(key, laid);
  }
  return laid;
}

/**
 * A detail with text emphasis as a label: laid out in `width`, at most as many lines as `room` holds,
 * placed as an anchored text would be. None when not even one line fits.
 */
export function emphasisLabel(
  runs: readonly EmphasisRun[],
  place: {
    x: number;
    y: number;
    anchor: { x: number; y: number };
    size: number;
    width: number;
    align: 'left' | 'center';
    room: number | undefined;
    fill: Color;
  },
): EmphasisLabel | undefined {
  const lineHeight = place.size * LINE_HEIGHT;
  const maxLines = place.room === undefined ? 1 : Math.floor(place.room / lineHeight + 1e-6);
  if (maxLines < 1) return undefined;
  const laid = laidOutRuns(runs, place.size, place.width, place.align, maxLines);
  if (laid.lines.length === 0) return undefined;
  const label = new EmphasisLabel(laid);
  const width = place.align === 'center' ? place.width : laid.width;
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
      measure: glyphMeasure,
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

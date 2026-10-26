/**
 * The legend of an exported drawing, laid out (ADR 0055): a band below the drawing, so that it never
 * covers it, with each overlay's title, what it changes by which attribute, each entry's swatch and
 * words, and what the legend warns about its colors, in the theme and the language the drawing is in.
 *
 * It is laid out once, here, for the PNG, which draws it on a canvas (`legendBand.ts`), and for the
 * SVG writer, which writes the same items as SVG, and so for the PDF made from that SVG: the three
 * exports carry the same legend, laid out alike. Pure, with no DOM, as the SVG writer is, so that the
 * command line and Claude's tools lay it out the same way.
 */
import type { Legend, LegendEntry, LegendOverlay, ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { entryAmount, entryLabel, legendSubtitle } from '../canvas/overlays/legendText';
import type { Translator } from '../i18n';
import { THEMES } from '../theme/themes';

/** The font the band is written in, as the app writes its text. */
export const BAND_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** The narrowest a band is, in pixels of the screen: a narrow drawing is widened to hold it. */
export const NARROWEST_BAND = 320;

/** A canvas's font for a size, bold or not, in the band's font. */
export function bandFont(size: number, bold: boolean): string {
  return `${bold ? '600 ' : ''}${size}px ${BAND_FONT_FAMILY}`;
}

/** What the band draws, in the image's pixels, from the band's top left corner. */
export type BandItem =
  | {
      kind: 'text';
      text: string;
      /** Its left, and the top of its line. */
      x: number;
      y: number;
      /** How tall its letters are, in pixels, and whether they are bold. */
      size: number;
      bold: boolean;
      /** The same, as a canvas's font. */
      font: string;
      color: Color;
      /** Whether it is what the legend warns about its colors. */
      warning?: true;
    }
  | {
      kind: 'swatch';
      x: number;
      y: number;
      /** The room it takes, a square this wide. */
      room: number;
      entry: LegendEntry;
      part: LegendOverlay;
    };

/** The band laid out for a drawing's width. */
export interface BandLayout {
  /** How wide it is: the drawing's width, or the narrowest a band is when the drawing is narrower. */
  width: number;
  height: number;
  items: BandItem[];
  /** Which overlay each item belongs to, by its index in `items`, for writers that group them. */
  parts: { id: string; from: number; to: number }[];
}

/** How wide a text is, in pixels, at a size, bold or not. */
export type Measure = (text: string, size: number, bold: boolean) => number;

/** A text broken into lines no wider than `width`, words kept whole. */
function wrapped(text: string, width: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((each) => each !== '')) {
    const joined = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measure(joined) > width) {
      lines.push(line);
      line = word;
    } else {
      line = joined;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * Lays the band out for a drawing `width` pixels wide, at `scale` pixels for each pixel of the
 * screen: each overlay's title and subtitle, its entries one after another, wrapping before the edge,
 * then its warnings, translated, each wrapped to the band's width.
 */
export function layOutBand(
  legend: Legend,
  t: Translator,
  measure: Measure,
  width: number,
  scale: number,
  theme: ThemeName,
): BandLayout {
  const { colors } = THEMES[theme].shell;
  const pad = 16 * scale;
  const room = 26 * scale;
  const gap = 6 * scale;
  const spacing = 18 * scale;
  const titleSize = 13 * scale;
  const bodySize = 12 * scale;
  const line = 18 * scale;
  const bandWidth = Math.max(width, NARROWEST_BAND * scale);
  const right = bandWidth - pad;
  const items: BandItem[] = [];
  const parts: BandLayout['parts'] = [];
  let y = pad;
  /** Writes a text from the left edge, wrapped to the band, one line under the other. */
  const paragraph = (text: string, size: number, bold: boolean, color: Color, warning = false) => {
    for (const each of wrapped(text, right - pad, (part) => measure(part, size, bold))) {
      items.push({
        kind: 'text',
        text: each,
        x: pad,
        y,
        size,
        bold,
        font: bandFont(size, bold),
        color,
        ...(warning ? { warning: true as const } : {}),
      });
      y += line;
    }
  };
  legend.overlays.forEach((part, index) => {
    if (index > 0) y += 12 * scale;
    const from = items.length;
    paragraph(part.title, titleSize, true, colors.text);
    paragraph(legendSubtitle(t, part), bodySize, false, colors.textMuted);
    let x = pad;
    for (const entry of part.entries) {
      const label = entryLabel(t, entry);
      const amount = entryAmount(t, entry);
      const text = amount === undefined ? label : `${label} ${amount}`;
      const swatch =
        entry.badge === undefined ? room : measure(entry.badge, bodySize, false) + 10 * scale;
      const needs = swatch + gap + measure(text, bodySize, false);
      if (x > pad && x + needs > right) {
        x = pad;
        y += room + 4 * scale;
      }
      items.push({ kind: 'swatch', x, y, room: swatch, entry, part });
      items.push({
        kind: 'text',
        text,
        x: x + swatch + gap,
        y: y + (room - bodySize) / 2,
        size: bodySize,
        bold: false,
        font: bandFont(bodySize, false),
        color: colors.text,
      });
      x += needs + spacing;
    }
    y += room;
    if (part.warnings.length > 0) {
      y += 6 * scale;
      for (const warning of part.warnings) {
        paragraph(t.message(warning), bodySize, false, colors.warning, true);
      }
    }
    parts.push({ id: part.id, from, to: items.length });
  });
  return { width: bandWidth, height: Math.ceil(y + pad), items, parts };
}

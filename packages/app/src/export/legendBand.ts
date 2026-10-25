/**
 * The legend of a PNG (ADR 0055): a band below the image, so that it never covers the drawing, with
 * each overlay's title, what it changes by which attribute, and each entry's swatch and words, in
 * the theme and the language the image is drawn in. The SVG and PDF writers draw the same legend from
 * the core's description their own way.
 */
import type { Legend, LegendEntry, LegendOverlay, ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { entryAmount, entryLabel, legendSubtitle } from '../canvas/overlays/legendText';
import type { Translator } from '../i18n';
import { THEMES } from '../theme/themes';
import { ImageError, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from './image';

/** The font of the band, as the app writes its text. */
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** What the band draws, in the image's pixels. */
export type BandItem =
  | { kind: 'text'; text: string; x: number; y: number; font: string; color: Color }
  | {
      kind: 'swatch';
      x: number;
      y: number;
      /** The room it takes, a square this wide. */
      room: number;
      entry: LegendEntry;
      part: LegendOverlay;
    };

/** The band laid out for an image's width. */
export interface BandLayout {
  height: number;
  items: BandItem[];
}

/** How wide a text is in a font, in pixels, as the canvas measures it. */
export type Measure = (text: string, font: string) => number;

/**
 * Lays the band out for an image `width` pixels wide, at `scale` pixels for each pixel of the screen:
 * each overlay's title and subtitle, then its entries one after another, wrapping before the edge.
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
  const title = `600 ${13 * scale}px ${FONT_FAMILY}`;
  const body = `${12 * scale}px ${FONT_FAMILY}`;
  const right = Math.max(width - pad, pad + 240 * scale);
  const items: BandItem[] = [];
  let y = pad;
  legend.overlays.forEach((part, index) => {
    if (index > 0) y += 12 * scale;
    items.push({ kind: 'text', text: part.title, x: pad, y, font: title, color: colors.text });
    y += 18 * scale;
    const subtitle = legendSubtitle(t, part);
    items.push({ kind: 'text', text: subtitle, x: pad, y, font: body, color: colors.textMuted });
    y += 18 * scale;
    let x = pad;
    for (const entry of part.entries) {
      const label = entryLabel(t, entry);
      const amount = entryAmount(t, entry);
      const text = amount === undefined ? label : `${label} ${amount}`;
      const swatch = entry.badge === undefined ? room : measure(entry.badge, body) + 10 * scale;
      const needs = swatch + gap + measure(text, body);
      if (x > pad && x + needs > right) {
        x = pad;
        y += room + 4 * scale;
      }
      items.push({ kind: 'swatch', x, y, room: swatch, entry, part });
      items.push({
        kind: 'text',
        text,
        x: x + swatch + gap,
        y: y + (room - 12 * scale) / 2,
        font: body,
        color: colors.text,
      });
      x += needs + spacing;
    }
    y += room;
  });
  return { height: Math.ceil(y + pad), items };
}

/** What draws on a canvas, as far as the band needs it: the browser's 2D context. */
type Context = CanvasRenderingContext2D;

/**
 * The image with the legend in a band below it, in the theme it is drawn in; the image itself when
 * the legend shows nothing. Throws an `ImageError` when the band makes it too large to draw.
 */
export function withLegendBand(
  image: HTMLCanvasElement,
  legend: Legend,
  t: Translator,
  theme: ThemeName,
  scale: number,
  make: () => HTMLCanvasElement = () => document.createElement('canvas'),
): HTMLCanvasElement {
  if (legend.overlays.length === 0) return image;
  const measuring = make().getContext('2d');
  if (!measuring) return image;
  const measure: Measure = (text, font) => {
    measuring.font = font;
    return measuring.measureText(text).width;
  };
  const band = layOutBand(legend, t, measure, image.width, scale, theme);
  const width = image.width;
  const height = image.height + band.height;
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new ImageError({ reason: 'too-large', width, height });
  }
  const canvas = make();
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return image;
  const { colors } = THEMES[theme].shell;
  context.drawImage(image, 0, 0);
  context.fillStyle = colors.canvas;
  context.fillRect(0, image.height, width, band.height);
  // A rule between the drawing and its legend.
  context.fillStyle = colors.border;
  context.fillRect(0, image.height, width, Math.max(1, scale));
  context.textBaseline = 'top';
  for (const item of band.items) {
    if (item.kind === 'text') {
      context.font = item.font;
      context.fillStyle = item.color;
      context.fillText(item.text, item.x, image.height + item.y);
    } else {
      drawSwatch(context, item, image.height, scale, theme);
    }
  }
  return canvas;
}

/** Draws an entry's swatch in its room: a color, a size, a fade or a badge, as the overlay draws it. */
function drawSwatch(
  context: Context,
  item: Extract<BandItem, { kind: 'swatch' }>,
  top: number,
  scale: number,
  theme: ThemeName,
): void {
  const { colors } = THEMES[theme].shell;
  const { entry, part, room } = item;
  const x = item.x;
  const y = top + item.y;
  const middle = { x: x + room / 2, y: y + room / 2 };
  const side = 14 * scale;
  context.save();
  context.lineWidth = Math.max(1, scale);
  context.strokeStyle = colors.controlBorder;
  if (entry.badge !== undefined) {
    context.strokeRect(x, y + 3 * scale, room, room - 6 * scale);
    context.font = `${12 * scale}px ${FONT_FAMILY}`;
    context.fillStyle = colors.text;
    context.textBaseline = 'middle';
    context.fillText(entry.badge, x + 5 * scale, middle.y);
  } else if (part.of === 'relations') {
    const width = entry.size === undefined ? 2 * scale : 2 * scale * entry.size;
    context.strokeStyle = entry.color ?? colors.text;
    context.globalAlpha = entry.opacity ?? 1;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x + 2 * scale, middle.y);
    context.lineTo(x + room - 2 * scale, middle.y);
    context.stroke();
  } else if (entry.color !== undefined) {
    const box = { x: middle.x - side / 2, y: middle.y - side / 2 };
    if (part.channel === 'stroke') {
      context.strokeStyle = entry.color;
      context.lineWidth = 3 * scale;
      context.strokeRect(box.x, box.y, side, side);
    } else {
      context.fillStyle = entry.color;
      context.fillRect(box.x, box.y, side, side);
      context.strokeRect(box.x, box.y, side, side);
    }
  } else if (entry.size !== undefined) {
    const sized = 12 * scale * entry.size;
    context.strokeRect(middle.x - sized / 2, middle.y - sized / 2, sized, sized);
  } else if (entry.opacity !== undefined) {
    context.globalAlpha = entry.opacity;
    context.fillStyle = colors.text;
    context.fillRect(middle.x - side / 2, middle.y - side / 2, side, side);
  }
  context.restore();
}

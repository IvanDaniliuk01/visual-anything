/**
 * The legend of a PNG (ADR 0055): the band `legendLayout.ts` lays out, drawn below the image on a
 * canvas, so that it never covers the drawing, in the theme and the language the image is drawn in.
 * The SVG writer writes the same band as SVG, and the PDF draws that.
 */
import type { Legend, ThemeName } from '@visual-anything/core';
import type { Translator } from '../i18n';
import { THEMES } from '../theme/themes';
import { ImageError, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from './image';
import { bandFont, layOutBand, type BandItem, type Measure } from './legendLayout';

/** What draws on a canvas, as far as the band needs it: the browser's 2D context. */
type Context = CanvasRenderingContext2D;

/**
 * The image with the legend in a band below it, in the theme it is drawn in, and widened to the
 * band's width when it is narrower; the image itself when the legend shows nothing. Throws an
 * `ImageError` when the band makes it too large to draw.
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
  const measure: Measure = (text, size, bold) => {
    measuring.font = bandFont(size, bold);
    return measuring.measureText(text).width;
  };
  const band = layOutBand(legend, t, measure, image.width, scale, theme);
  const width = band.width;
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
  // A drawing narrower than its band sits on the canvas's color, as the band does.
  context.fillStyle = colors.canvas;
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
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
    context.font = bandFont(12 * scale, false);
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

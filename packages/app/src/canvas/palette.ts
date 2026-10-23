/** The colors the canvas draws with, beyond those that components and relation types define. */
import type { Color } from '@visual-anything/schema';

export const CANVAS_BACKGROUND: Color = '#FFFFFF';

export const NOTE_FILL: Color = '#FFF7D1';
export const NOTE_STROKE: Color = '#B08D1A';
export const NOTE_TEXT: Color = '#3D3000';

export const ARROW_STROKE: Color = '#3E4C59';

export const RELATION_LABEL_TEXT: Color = '#1F2933';
/** Drawn around relation labels so they stay readable where they cross a line or a shape. */
export const RELATION_LABEL_HALO: Color = '#FFFFFF';

/** The text drawn on a shape: its name, and the smaller details under it. */
export interface TextColors {
  name: Color;
  detail: Color;
}

/** The minimum contrast for text, from WCAG 2.1 level AA. */
const MINIMUM_CONTRAST = 4.5;

/**
 * Text colors that stay readable on a shape's fill. Soft dark grays are preferred on light fills and
 * near-white on dark ones; pure black or white take over when the softer color would fall below 4.5:1.
 */
export function readableTextColors(fill: Color): TextColors {
  const firstReadable = (preferred: readonly Color[], fallback: Color): Color =>
    preferred.find((color) => contrastRatio(color, fill) >= MINIMUM_CONTRAST) ?? fallback;
  if (contrastRatio('#FFFFFF', fill) > contrastRatio('#000000', fill)) {
    return { name: '#FFFFFF', detail: firstReadable(['#E4E7EB'], '#FFFFFF') };
  }
  return {
    name: firstReadable(['#1F2933'], '#000000'),
    detail: firstReadable(['#3E4C59', '#1F2933'], '#000000'),
  };
}

/** The WCAG contrast ratio between two `#rrggbb` colors, from 1 to 21. */
export function contrastRatio(a: Color, b: Color): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The relative luminance of a `#rrggbb` color; a color in any other form counts as white. */
function luminance(color: Color): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return 1;
  const channel = (hex: string | undefined): number => {
    const value = parseInt(hex ?? 'ff', 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(match[1]) + 0.7152 * channel(match[2]) + 0.0722 * channel(match[3]);
}

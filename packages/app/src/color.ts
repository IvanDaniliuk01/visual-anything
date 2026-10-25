/**
 * Colors as people write them. Project files keep a color as `#RRGGBB`; people also write it in lower
 * case, without `#`, in the short `#RGB` form or as `rgb(r, g, b)`, and every one of these reads.
 * Whether two colors are the same is `sameColor`, from the core.
 */
import type { Color } from '@visual-anything/schema';

/** How the forms a color can be written in are described to people. */
export const COLOR_FORMS = 'Write a color as #RRGGBB, #RGB or rgb(r, g, b), such as #F3F5F8.';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** rgb(r, g, b), with commas or spaces between the channels. */
const RGB = /^rgb\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)$/i;

/**
 * The color some text stands for, as `#RRGGBB` in capitals, as commands write new colors;
 * undefined when it stands for none.
 */
export function readColor(text: string): Color | undefined {
  const written = text.trim();
  const hex = HEX.exec(written)?.[1];
  if (hex !== undefined) {
    const digits = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return `#${digits.toUpperCase()}`;
  }
  const rgb = RGB.exec(written);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.some((channel) => channel > 255)) return undefined;
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return undefined;
}

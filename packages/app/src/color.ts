/**
 * Colours as people write them. Project files keep a colour as `#rrggbb`; people also write it in
 * capitals, without `#`, in the short `#rgb` form or as `rgb(r, g, b)`, and every one of these reads.
 */
import type { Color } from '@visual-anything/schema';

/** How the forms a colour can be written in are described to people. */
export const COLOR_FORMS = 'Write a colour as #rrggbb, #rgb or rgb(r, g, b), such as #f3f5f8.';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** rgb(r, g, b), with commas or spaces between the channels. */
const RGB = /^rgb\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)$/i;

/** The colour some text stands for, as `#rrggbb` in lower case; undefined when it stands for none. */
export function readColor(text: string): Color | undefined {
  const written = text.trim();
  const hex = HEX.exec(written)?.[1];
  if (hex !== undefined) {
    const digits = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return `#${digits.toLowerCase()}`;
  }
  const rgb = RGB.exec(written);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.some((channel) => channel > 255)) return undefined;
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

/** Whether two colours are the same, however each is written. */
export function sameColor(a: string, b: string): boolean {
  const first = readColor(a);
  return first !== undefined && first === readColor(b);
}

/**
 * How wide text is in Roboto, the font faces are laid out in and the exports write (ADR 0083): pure,
 * from the tables in `roboto-widths.ts`, so that Node and the browser measure to the same unit.
 */
import {
  BOLD_ITALIC_WIDTHS,
  BOLD_WIDTHS,
  ITALIC_WIDTHS,
  MEASURED_EXTRA,
  MEASURED_RANGES,
  MONO_WIDTH,
  REGULAR_WIDTHS,
} from './roboto-widths';

/** The styles of Roboto text is measured in: Roboto's four, and Roboto Mono. */
export type RobotoVariant = 'regular' | 'bold' | 'italic' | 'boldItalic' | 'mono';

export const ROBOTO_VARIANTS: readonly RobotoVariant[] = [
  'regular',
  'bold',
  'italic',
  'boldItalic',
  'mono',
];

const TABLES: Readonly<Record<Exclude<RobotoVariant, 'mono'>, readonly number[]>> = {
  regular: REGULAR_WIDTHS,
  bold: BOLD_WIDTHS,
  italic: ITALIC_WIDTHS,
  boldItalic: BOLD_ITALIC_WIDTHS,
};

/** Each measured code point's place in the tables. */
const PLACES = new Map<number, number>();
{
  let place = 0;
  for (const [from, to] of MEASURED_RANGES)
    for (let point = from; point <= to; point++) PLACES.set(point, place++);
  for (const point of MEASURED_EXTRA) PLACES.set(point, place++);
}

/** The width of a character the tables do not hold, in ems: wide for East Asian scripts and emoji. */
export function unmeasuredEms(point: number): number {
  const wide =
    (point >= 0x1100 && point <= 0x115f) ||
    (point >= 0x2e80 && point <= 0xa4cf) ||
    (point >= 0xac00 && point <= 0xd7a3) ||
    (point >= 0xf900 && point <= 0xfaff) ||
    (point >= 0xfe30 && point <= 0xfe4f) ||
    (point >= 0xff00 && point <= 0xff60) ||
    (point >= 0xffe0 && point <= 0xffe6) ||
    point >= 0x1f000;
  return wide ? 1 : 0.6;
}

/** How wide a character is in a variant, in ems. Roboto Mono gives every character 0.6 em. */
export function robotoEms(point: number, variant: RobotoVariant): number {
  if (variant === 'mono') return MONO_WIDTH / 1000;
  const place = PLACES.get(point);
  const width = place === undefined ? 0 : (TABLES[variant][place] ?? 0);
  return width > 0 ? width / 1000 : unmeasuredEms(point);
}

/** How wide a text is in a variant at `size`, in the same units as the size. */
export function robotoWidth(text: string, variant: RobotoVariant, size: number): number {
  if (variant === 'mono') return [...text].length * size * (MONO_WIDTH / 1000);
  let ems = 0;
  for (const character of text) ems += robotoEms(character.codePointAt(0) ?? 0, variant);
  return ems * size;
}

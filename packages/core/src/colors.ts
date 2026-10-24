/**
 * Colors: how they are written, how they read on each canvas, and the colors notes and free arrows
 * are drawn in. Every color stored in a project is `#RRGGBB` and is drawn as stored in both themes
 * (ADR-0033); commands write new colors in capitals and keep the stored spelling of a color equal to
 * it ignoring case, and nothing rewrites a color read from a file.
 */
import type { Arrow, Color, Note } from '@visual-anything/schema';
import type { ThemeName } from './preferences';

/** A color as project files write it: `#` and six hexadecimal digits, in either case. */
export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Whether a value is a color written as `#RRGGBB`, in either case. */
export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && COLOR_PATTERN.test(value);
}

/** Whether two values are the same color, ignoring case. Anything that is not a color is no color. */
export function sameColor(a: unknown, b: unknown): boolean {
  return isColor(a) && isColor(b) && a.toUpperCase() === b.toUpperCase();
}

/**
 * The spelling a command stores a color in: `stored`, the color already stored in that place, when
 * it is the same color, so that picking it again changes nothing; otherwise the color in capitals.
 */
export function storedColor(color: Color, stored?: Color): Color {
  return stored !== undefined && sameColor(stored, color) ? stored : color.toUpperCase();
}

/** The relative luminance of a color, from 0 to 1, as WCAG 2.1 defines it; any other value counts as white. */
export function relativeLuminance(color: string): number {
  if (!isColor(color)) return 1;
  const channel = (at: number): number => {
    const value = parseInt(color.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The canvas of each theme, which the app's themes draw too. */
export const CANVAS_BACKGROUNDS: Readonly<Record<ThemeName, Color>> = Object.freeze({
  light: '#FFFFFF',
  dark: '#16191E',
});

/** The least contrast text needs, from WCAG 2.1 level AA. */
export const MINIMUM_TEXT_CONTRAST = 4.5;

/** The least contrast a line, a mark or a boundary needs, from WCAG 2.1 level AA. */
export const MINIMUM_MARK_CONTRAST = 3;

/** How a color reads on the canvas of each theme: its contrast ratio against each. */
export function legibility(color: Color): Readonly<Record<ThemeName, number>> {
  return {
    light: contrastRatio(color, CANVAS_BACKGROUNDS.light),
    dark: contrastRatio(color, CANVAS_BACKGROUNDS.dark),
  };
}

/**
 * The colors a theme gives the notes and free arrows that have none of their own, by the names the
 * app's canvas theme gives them, so that one can be passed whole.
 */
export interface FreeShapeTheme {
  noteFill: Color;
  noteStroke: Color;
  freeArrow: Color;
}

/** A color a note or a free arrow is drawn in, and whether it is the shape's own or the theme's. */
export interface FreeShapeColor {
  color: Color;
  origin: { kind: 'own' } | { kind: 'theme' };
}

/** The fill and stroke a note is drawn in, in a theme. */
export function noteColorsOf(
  note: Pick<Note, 'fill' | 'stroke'>,
  theme: FreeShapeTheme,
): { fill: FreeShapeColor; stroke: FreeShapeColor } {
  return {
    fill: freeShapeColor(note.fill, theme.noteFill),
    stroke: freeShapeColor(note.stroke, theme.noteStroke),
  };
}

/** The color a free arrow is drawn in, in a theme. */
export function arrowColorOf(arrow: Pick<Arrow, 'stroke'>, theme: FreeShapeTheme): FreeShapeColor {
  return freeShapeColor(arrow.stroke, theme.freeArrow);
}

function freeShapeColor(own: Color | undefined, theme: Color): FreeShapeColor {
  return own === undefined
    ? { color: theme, origin: { kind: 'theme' } }
    : { color: own, origin: { kind: 'own' } };
}

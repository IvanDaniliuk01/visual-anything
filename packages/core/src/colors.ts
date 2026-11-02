/**
 * Colors: how they are written, how they read on each canvas, and the colors notes and free arrows
 * are drawn in. Every color stored in a project is `#RRGGBB` and is drawn as stored in both themes
 * (ADR-0033), unless its drawing defaults ask for stored colors adapted on the dark canvas, which
 * turns their lightness there and only draws (ADR 0087); commands write new colors in capitals and
 * keep the stored spelling of a color equal to it ignoring case, and nothing rewrites a color read
 * from a file.
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

/**
 * A color in CIELAB, under the D65 white point: lightness from 0 to 100, then the red–green and the
 * yellow–blue axes. Any other value than a color counts as white.
 */
export function labOf(color: string): readonly [number, number, number] {
  const hex = isColor(color) ? color : '#FFFFFF';
  const linear = (at: number): number => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [linear(1), linear(3), linear(5)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** The sRGB channels, from 0 to 1 and not yet clamped, of a color in CIELAB under the D65 white point. */
function rgbOfLab(lightness: number, a: number, b: number): readonly [number, number, number] {
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inverse = (t: number): number =>
    t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);
  const x = inverse(fx) * 0.95047;
  const y = inverse(fy);
  const z = inverse(fz) * 1.08883;
  const gamma = (value: number): number =>
    value <= 0.0031308
      ? 12.92 * value
      : 1.055 * Math.sign(value) * Math.abs(value) ** (1 / 2.4) - 0.055;
  return [
    gamma(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    gamma(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    gamma(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

const IN_GAMUT = 1e-6;

function inGamut(channels: readonly number[]): boolean {
  return channels.every((value) => value >= -IN_GAMUT && value <= 1 + IN_GAMUT);
}

/**
 * A color's lightness turned for the dark canvas, before it is written as `#RRGGBB`: its channels
 * from 0 to 255, unrounded. L* becomes 100 − L*, a and b are kept, and when that falls outside sRGB
 * its chroma is lowered, its hue kept, until it fits (ADR 0087).
 */
function turnedChannels(color: Color): readonly number[] {
  const [lightness, a, b] = labOf(color);
  const turned = 100 - lightness;
  let channels = rgbOfLab(turned, a, b);
  if (!inGamut(channels)) {
    let fits = 0;
    let falls = 1;
    for (let step = 0; step < 32; step++) {
      const middle = (fits + falls) / 2;
      if (inGamut(rgbOfLab(turned, a * middle, b * middle))) fits = middle;
      else falls = middle;
    }
    channels = rgbOfLab(turned, a * fits, b * fits);
  }
  return channels.map((value) => Math.min(255, Math.max(0, value * 255)));
}

function channelsOf(color: Color): readonly number[] {
  return [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16));
}

function written(channels: readonly number[]): Color {
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const turnedColors = new Map<string, Color>();
const TURNED_KEPT = 4096;

/**
 * A stored color as the dark canvas draws it when the drawing defaults adapt stored colors (ADR
 * 0087): its CIELAB lightness L* turned to 100 − L*, its a and b kept, and its chroma lowered, its
 * hue kept, where that falls outside sRGB. Of the eight ways to round the result to `#RRGGBB`, the one
 * whose own turn comes nearest the color is written, so that turning twice gives the color back:
 * within three steps of each channel and ΔE 1.5, under what a person notices, wherever its turn kept
 * its chroma (ADR 0087's clarifications); a color whose chroma had to be lowered comes back with its
 * lightness and that lower chroma. Pure; what is not a color counts as white. Built-in colors, which
 * have a dark shade of their own, never come here.
 */
export function adaptedForDark(color: Color): Color {
  const key = isColor(color) ? color.toUpperCase() : '#FFFFFF';
  const known = turnedColors.get(key) ?? turned(key);
  // A color that turns into itself keeps its spelling, as every stored color does.
  return sameColor(known, color) ? color : known;
}

function turned(key: Color): Color {
  const exact = turnedChannels(key);
  const original = channelsOf(key);
  let best = written(exact.map(Math.round));
  let nearest = Number.POSITIVE_INFINITY;
  for (let way = 0; way < 8; way++) {
    const candidate = written(
      exact.map((value, at) => ((way >> at) & 1 ? Math.ceil(value) : Math.floor(value))),
    );
    const back = turnedChannels(candidate);
    const distance = Math.max(...back.map((value, at) => Math.abs(value - (original[at] ?? 0))));
    if (distance < nearest - 1e-9) {
      nearest = distance;
      best = candidate;
    }
  }
  if (turnedColors.size >= TURNED_KEPT) turnedColors.clear();
  turnedColors.set(key, best);
  return best;
}

/**
 * Whether turning a color's lightness for the dark canvas keeps its chroma: whether L* → 100 − L*,
 * with a and b kept, still fits sRGB. Turning twice gives such a color back (`adaptedForDark`).
 */
export function turnKeepsChroma(color: Color): boolean {
  const [lightness, a, b] = labOf(color);
  return inGamut(rgbOfLab(100 - lightness, a, b));
}

/** How the dark canvas draws the colors a project stores (ADR 0087): as stored, or adapted. */
export type StoredColorsInDark = 'as-stored' | 'adapted';

/** A stored color as the dark canvas draws it: adapted, or as stored (ADR 0087). */
export function storedColorInDark(color: Color, stored: StoredColorsInDark): Color {
  return stored === 'adapted' ? adaptedForDark(color) : color;
}

/**
 * How far apart two colors look: their distance in CIELAB (ΔE 1976). About 2 is the least a person
 * notices side by side; categories read apart from about 20.
 */
export function colorDifference(a: string, b: string): number {
  const [l1, a1, b1] = labOf(a);
  const [l2, a2, b2] = labOf(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * The least difference two colors that stand for different values need (ADR 0080's clarification of
 * 2026-10-30). Their contrast with one another is not asked for: colors that each keep 3:1 against
 * both canvases cannot also keep 3:1 between them.
 */
export const MINIMUM_COLOR_DIFFERENCE = 20;

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

/**
 * The fill and stroke a note is drawn in, in a theme. `adapted` says that the theme is the dark one
 * and the drawing defaults adapt stored colors there (ADR 0087): its own colors are then adapted.
 */
export function noteColorsOf(
  note: Pick<Note, 'fill' | 'stroke'>,
  theme: FreeShapeTheme,
  adapted = false,
): { fill: FreeShapeColor; stroke: FreeShapeColor } {
  return {
    fill: freeShapeColor(note.fill, theme.noteFill, adapted),
    stroke: freeShapeColor(note.stroke, theme.noteStroke, adapted),
  };
}

/** The color a free arrow is drawn in, in a theme; its own adapted when `adapted`, as a note's. */
export function arrowColorOf(
  arrow: Pick<Arrow, 'stroke'>,
  theme: FreeShapeTheme,
  adapted = false,
): FreeShapeColor {
  return freeShapeColor(arrow.stroke, theme.freeArrow, adapted);
}

function freeShapeColor(own: Color | undefined, theme: Color, adapted: boolean): FreeShapeColor {
  if (own === undefined) return { color: theme, origin: { kind: 'theme' } };
  return { color: adapted ? adaptedForDark(own) : own, origin: { kind: 'own' } };
}

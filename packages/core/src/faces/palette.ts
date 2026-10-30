/**
 * The theme's colors a face names with `var(--…)` (ADR 0083), worked out for a shape in a theme, so
 * that faces follow the light and dark themes and the core can check their contrast in both:
 *
 * - `fill` and `stroke` are the shape's own, as the theme draws them;
 * - `text` and `text-muted` read on the shape's fill, as the canvas writes a name and a detail on it
 *   (soft dark grays on light fills, near-white on dark ones, black or white below 4.5:1);
 * - `highlight` and `code-back` are what text emphasis draws a highlight and code on, under that text
 *   (ADR 0082's clarification of part B);
 * - `row-separator` and `canvas` are the theme's.
 *
 * The values are the app's (`app/src/theme/themes.ts`, `app/src/canvas/colors.ts`).
 */
import type { Color } from '@visual-anything/schema';
import { CANVAS_BACKGROUNDS, contrastRatio, MINIMUM_TEXT_CONTRAST } from '../colors';
import type { ThemeName } from '../preferences';
import { isFaceToken, type FaceColor, type FaceToken } from './style';

export type FacePalette = Readonly<Record<FaceToken, Color>>;

/** The text of the light theme's panels, on light fills, and of the dark theme's, on dark fills. */
const DARK_TEXT = '#1F2933';
const LIGHT_TEXT = '#E4E7EB';
/** A softer gray for details on light fills. */
const DARK_DETAIL = '#3E4C59';

/** What a highlight and code are drawn on: the light theme's under dark text, the dark one's under light. */
const BACKS = {
  underDark: { highlight: '#FFEB99', code: '#E8ECF1' },
  underLight: { highlight: '#4A3800', code: '#303844' },
} as const;

const ROW_SEPARATORS: Readonly<Record<ThemeName, Color>> = { light: '#D9E2EC', dark: '#2F3640' };

/** The text colors that read on a fill: the name's and the detail's. */
export function readableOn(fill: Color): { text: Color; muted: Color } {
  const first = (preferred: readonly Color[], fallback: Color): Color =>
    preferred.find((color) => contrastRatio(color, fill) >= MINIMUM_TEXT_CONTRAST) ?? fallback;
  if (contrastRatio('#FFFFFF', fill) > contrastRatio('#000000', fill)) {
    return { text: '#FFFFFF', muted: first([LIGHT_TEXT], '#FFFFFF') };
  }
  return { text: first([DARK_TEXT], '#000000'), muted: first([DARK_DETAIL, DARK_TEXT], '#000000') };
}

/** The colors of a face's tokens for a shape of this fill and stroke, in a theme. */
export function facePalette(theme: ThemeName, fill: Color, stroke: Color): FacePalette {
  const { text, muted } = readableOn(fill);
  const backs =
    contrastRatio(text, '#000000') > contrastRatio(text, '#FFFFFF')
      ? BACKS.underLight
      : BACKS.underDark;
  return {
    fill,
    stroke,
    text,
    'text-muted': muted,
    highlight: backs.highlight,
    'code-back': backs.code,
    'row-separator': ROW_SEPARATORS[theme],
    canvas: CANVAS_BACKGROUNDS[theme],
  };
}

/** The color a face's color is drawn in, with this palette. */
export function resolveFaceColor(color: FaceColor, palette: FacePalette): Color {
  return isFaceToken(color) ? palette[color] : color;
}

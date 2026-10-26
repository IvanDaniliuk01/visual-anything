/**
 * The colors the canvas draws with, beyond those that components, relation types and people set:
 * each theme's own, from `theme/themes.ts`, the one source the panels' colors come from too
 * (ADR-0033). The constants are the light theme's, which drawing takes when it is given no theme;
 * the renderer draws in the theme it is given (`renderer.setTheme`).
 */
import { contrastRatio as ratioOf } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import type { ElementShape } from './scene';
import { THEMES } from '../theme/themes';

const LIGHT = THEMES.light.canvas;

export const CANVAS_BACKGROUND: Color = LIGHT.background;

export const NOTE_FILL: Color = LIGHT.noteFill;
export const NOTE_STROKE: Color = LIGHT.noteStroke;
export const NOTE_TEXT: Color = LIGHT.noteText;

export const ARROW_STROKE: Color = LIGHT.freeArrow;

export const RELATION_LABEL_TEXT: Color = LIGHT.relationLabelText;
/** Behind relation labels, so that they stay readable where they cross a line or a shape. */
export const RELATION_LABEL_HALO: Color = LIGHT.relationLabelBack;

/**
 * What a scenario step or Claude's guidance highlights, and the markers travelling along relations:
 * a burnt orange that keeps 3:1 against the canvas (WCAG 1.4.11) and differs from the selection's
 * blue. Neither relies on it alone: highlights are wider, with a halo and corner marks, and markers
 * are discs ringed in the canvas color.
 */
export const HIGHLIGHT: Color = LIGHT.highlight;
export const MARKER_RING: Color = LIGHT.background;
/** How opaque what a focus dims is drawn. */
export const DIMMED_ALPHA = 0.22;

/** The text drawn on a shape: its name, and the smaller details under it. */
export interface TextColors {
  name: Color;
  detail: Color;
}

/** The minimum contrast for text, from WCAG 2.1 level AA. */
const MINIMUM_CONTRAST = 4.5;

/** The text of the light theme's panels, on light fills, and of the dark theme's, on dark fills. */
const DARK_TEXT = THEMES.light.shell.colors.text;
const LIGHT_TEXT = THEMES.dark.shell.colors.text;
/** A softer gray for details on light fills. */
const DARK_DETAIL = '#3E4C59';

const readable = new Map<Color, TextColors>();

/**
 * Text colors that stay readable on a shape's fill. Soft dark grays are preferred on light fills and
 * near-white on dark ones; pure black or white take over when the softer color would fall below 4.5:1.
 * Worked out once per fill.
 */
export function readableTextColors(fill: Color): TextColors {
  let colors = readable.get(fill);
  if (!colors) {
    colors = textColorsOn(fill);
    readable.set(fill, colors);
  }
  return colors;
}

function textColorsOn(fill: Color): TextColors {
  const firstReadable = (preferred: readonly Color[], fallback: Color): Color =>
    preferred.find((color) => contrastRatio(color, fill) >= MINIMUM_CONTRAST) ?? fallback;
  if (contrastRatio('#FFFFFF', fill) > contrastRatio('#000000', fill)) {
    return { name: '#FFFFFF', detail: firstReadable([LIGHT_TEXT], '#FFFFFF') };
  }
  return {
    name: firstReadable([DARK_TEXT], '#000000'),
    detail: firstReadable([DARK_DETAIL, DARK_TEXT], '#000000'),
  };
}

/** The WCAG contrast ratio between two `#rrggbb` colors, from 1 to 21; anything else counts as white. */
export function contrastRatio(a: Color, b: Color): number {
  return ratioOf(a, b);
}

/** The contrast a shape's outline needs against its fill to mark its boundary, from WCAG 1.4.11. */
const MARK_CONTRAST = 3;

const outlineColors = new Map<string, Color>();

/**
 * The color a shape's outline is drawn in: its stroke, or, for a shape inside a container whose
 * stroke is under 3:1 against its own fill, the color that reads on that fill, so that a shape in a
 * container of nearly its own fill is always told apart from it by its outline (ADR 0033).
 */
export function outlineColorOf(
  shape: Pick<ElementShape, 'fill' | 'stroke' | 'containerShape'>,
): Color {
  if (shape.containerShape === undefined) return shape.stroke;
  const key = `${shape.fill} ${shape.stroke}`;
  let color = outlineColors.get(key);
  if (color === undefined) {
    color =
      contrastRatio(shape.stroke, shape.fill) < MARK_CONTRAST
        ? readableTextColors(shape.fill).detail
        : shape.stroke;
    outlineColors.set(key, color);
  }
  return color;
}

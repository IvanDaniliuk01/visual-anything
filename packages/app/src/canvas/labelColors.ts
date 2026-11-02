/**
 * Which colors a shape's name and detail are written in, as its text says (ADR 0088), where the
 * canvas and the SVG write them: what `draw.ts` writes, the painter tints again, and `svg.ts`
 * writes alike. Pure, with no PixiJS.
 */
import type { Color } from '@visual-anything/schema';
import { readableTextColors, type TextColors } from './colors';
import { nameTagOf } from './nameTags';
import type { ElementShape } from './scene';
import { nameBandOf } from './shape-images';
import { nameColorsOf } from './shapeText';

/** Whether a shape writes its name and detail inside itself as its text says (`styledBlockInside`). */
export function writesStyledInside(shape: ElementShape): boolean {
  return (
    shape.text !== undefined &&
    shape.outline === undefined &&
    shape.region !== true &&
    shape.face === undefined &&
    shape.row === undefined &&
    shape.rowCount === undefined &&
    !shape.holdsContents &&
    shape.collapsed === undefined &&
    nameBandOf(shape) === undefined &&
    nameTagOf(shape) === undefined
  );
}

/**
 * The colors a shape's name and detail are written in on `base`, its fill as drawn, as its text says
 * (ADR 0088): in a tag or inside a box, its own color, else the one that reads on its label back or
 * on `base`; in a container's header and inside its own outline, its own color for the name alone,
 * which no back is drawn behind. Rows, regions, faces, anchored parts and names under a picture
 * write as always. What the canvas writes, and what a retint tints again.
 */
export function labelColorsOf(shape: ElementShape, base: Color): TextColors {
  const text = shape.text;
  const colors = readableTextColors(base);
  if (
    text === undefined ||
    shape.region === true ||
    shape.row !== undefined ||
    shape.rowCount !== undefined ||
    shape.part?.inDrawing === true
  ) {
    return colors;
  }
  if (nameTagOf(shape) || writesStyledInside(shape)) return nameColorsOf(shape, base);
  if (shape.face || nameBandOf(shape)) return colors;
  return text.color === undefined ? colors : { name: text.color, detail: colors.detail };
}

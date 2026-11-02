/**
 * When a shape shows its hover card (ADR 0082): when the canvas cut its name or its detail, so that
 * the card gives back what the shape could not hold. The card shows after the pointer rests on the
 * shape, or the keys reach it, for 400 ms. The cut is judged against the text as the drawing
 * defaults write it (ADR 0086): the name's size and weight, the detail's size, the padding, and a
 * region's name tab.
 */
import type { ResolvedDrawing } from '@visual-anything/core';
import type { Measure } from '../text/layout';
import { headerLines, headerWrapOf } from './collapse';
import { detailOf, labelArea, textBlockOf } from './draw';
import { BASE_DRAWING, nameVariantOf, textSideInset } from './drawing';
import { faceCut } from './faces';
import { outlinedTextBlock } from './outlinedText';
import { bodyOf } from './geometry';
import { nameTagOf, outlinedDetailOf } from './nameTags';
import { writesNameBelow } from './outlined';
import { regionTabOf } from './regionDraw';
import type { ElementShape } from './scene';
import { besideImage, nameBandOf, pictureOn } from './shape-images';
import { canvasMeasure } from './textBlock';

/** How long the pointer rests on a shape, or the keys stay on it, before its card shows. */
export const HOVER_CARD_DELAY = 400;

/** Whether the canvas cut a shape's name or detail, as it writes them in a drawing. */
export function cutOnCanvas(
  shape: ElementShape,
  measure: Measure = canvasMeasure,
  drawing: ResolvedDrawing = BASE_DRAWING,
): boolean {
  // A face writes in place of its name and detail, and says when it cut something (ADR 0083).
  if (shape.face) return faceCut(shape);
  const detail = detailOf(shape);
  if (shape.fitted) {
    // A row and a shape that draws rows cut their lines when fitted, told from their source: a
    // detail may end in "…" of its own.
    return shape.fitted.name !== shape.name || shape.fitted.detailCut === true;
  }
  const { nameSize, detailSize, containerNameSize } = drawing.text;
  const variant = nameVariantOf(drawing);
  const detailOver = (width: number) =>
    detail !== '' && measure(detail, 'regular', detailSize) > width;
  if (shape.region) return regionCut(shape, measure, drawing);
  if (shape.collapsed !== undefined && !shape.outline) {
    // Its name on one line, and its detail wrapped to its lines (ADR 0082).
    const wrap = headerWrapOf(shape, drawing);
    return (
      measure(shape.name, variant, containerNameSize) > wrap ||
      headerLines(shape, bodyOf(shape).height, wrap, measure, drawing).detailCut
    );
  }
  if (shape.holdsContents || shape.collapsed !== undefined) {
    const wrap = headerWrapOf(shape, drawing);
    return measure(shape.name, variant, containerNameSize) > wrap || detailOver(wrap);
  }
  if (shape.outline) {
    // Its name whole on its lines, or in its name tag, and its detail wrapped under it (ADR 0082).
    // A name tag holds the name whole, and its detail on one line, cut with "…".
    if (writesNameBelow(shape)) {
      const tag = nameTagOf(shape);
      return tag !== undefined && tag.detail !== outlinedDetailOf(shape);
    }
    const placed = outlinedTextBlock(shape, shape.outline, measure);
    if (!placed) return false;
    return placed.block.nameCut || placed.block.detailCut;
  }
  if (pictureOn(shape)?.placement === 'drawing') {
    // Its name and its detail on one line each, in the band under its picture.
    const band = nameBandOf(shape);
    const wrap = Math.max(1, (band?.width ?? shape.rect.width) - textSideInset(drawing));
    return measure(shape.name, variant, nameSize) > wrap || detailOver(wrap);
  }
  const area = besideImage(shape, labelArea(shape));
  const block = textBlockOf(
    shape,
    area,
    Math.max(1, area.width - textSideInset(drawing)),
    { measure },
    drawing,
  );
  return block.nameCut || block.detailCut;
}

/**
 * Whether a region cut its name, on its one line in its tab at 500, measured as Bold (ADR 0086), or
 * its detail, which it writes where it says more than its component's name and its header has room.
 */
function regionCut(shape: ElementShape, measure: Measure, drawing: ResolvedDrawing): boolean {
  const tab = regionTabOf(shape, drawing);
  const { containerNameSize, detailSize } = drawing.text;
  // A region too short for its tab writes no name; the marks write it beside it.
  if (tab.name.y + tab.name.height > shape.rect.y + shape.rect.height) return true;
  if (measure(shape.name, 'bold', containerNameSize) > tab.name.width) return true;
  const { detail } = shape;
  if (detail === undefined || detail === '' || detail === shape.componentName) return false;
  if (!tab.detail) return true;
  return measure(detail, 'regular', detailSize) > tab.detail.rect.width;
}

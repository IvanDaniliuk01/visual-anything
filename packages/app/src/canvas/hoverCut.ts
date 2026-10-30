/**
 * When a shape shows its hover card (ADR 0082): when the canvas cut its name or its detail, so that
 * the card gives back what the shape could not hold. The card shows after the pointer rests on the
 * shape, or the keys reach it, for 400 ms.
 */
import type { Measure } from '../text/layout';
import { collapsedHeaderWrap, headerLines } from './collapse';
import { detailOf, labelArea, textBlockOf } from './draw';
import { outlinedTextBlock } from './outlinedText';
import { bodyOf } from './geometry';
import { nameTagOf, outlinedDetailOf } from './nameTags';
import { writesNameBelow } from './outlined';
import type { ElementShape } from './scene';
import { besideImage } from './shape-images';
import { canvasMeasure } from './textBlock';

/** How long the pointer rests on a shape, or the keys stay on it, before its card shows. */
export const HOVER_CARD_DELAY = 400;

/** The insets the canvas writes a container's header and a shape's text within. */
const TEXT_INSET = 12;

/** Whether the canvas cut a shape's name or detail, as it writes them. */
export function cutOnCanvas(shape: ElementShape, measure: Measure = canvasMeasure): boolean {
  const detail = detailOf(shape);
  if (shape.fitted) {
    // A row and a shape that draws rows cut their lines when fitted, told from their source: a
    // detail may end in "…" of its own.
    return shape.fitted.name !== shape.name || shape.fitted.detailCut === true;
  }
  const oneLine = (width: number) =>
    measure(shape.name, 'bold', 14) > width ||
    (detail !== '' && measure(detail, 'regular', 11) > width);
  if (shape.collapsed !== undefined && !shape.outline) {
    // Its name on one line, and its detail wrapped to its lines (ADR 0082).
    const body = bodyOf(shape);
    const wrap = collapsedHeaderWrap(shape.rect.width, shape.image !== undefined);
    return (
      measure(shape.name, 'bold', 14) > body.width - 2 * TEXT_INSET ||
      headerLines(shape, body.height, wrap, measure).detailCut
    );
  }
  if (shape.holdsContents || shape.collapsed !== undefined) {
    return oneLine(bodyOf(shape).width - 2 * TEXT_INSET);
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
  if (shape.image?.placement === 'drawing') {
    return oneLine(shape.rect.width - TEXT_INSET);
  }
  const area = besideImage(shape, labelArea(shape));
  const block = textBlockOf(shape, area, Math.max(1, area.width - TEXT_INSET), { measure });
  return block.nameCut || block.detailCut;
}

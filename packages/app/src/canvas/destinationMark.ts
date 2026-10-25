/**
 * The mark of a destination (ADR 0056): on a shape whose element has a destination attribute, a
 * small tab in its bottom left corner with an arrow that leaves it, up and to the right, as a page
 * that opens elsewhere does. Double-clicking it follows the first destination, Alt+Enter does on the
 * selected shape, and the shape's menu and the inspector list every one. It is drawn in the shape's
 * own colors, as the toggle and the leaving mark are, so that it follows them in each theme, and with
 * lines rather than text, so that it shows at every zoom details show at and below.
 */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Graphics } from 'pixi.js';
import { describeDestination, elementDestinations } from '../destinations/follow';
import { t } from '../i18n';
import { readableTextColors } from './colors';
import { bodyOf, type Point, type Rect } from './geometry';
import type { ElementShape } from './scene';

/** How large the mark is, and how far it sits from its shape's sides, in canvas units. */
const MARK_SIZE = 14;
const MARK_INSET = 4;

/**
 * Where a shape's mark sits: in the bottom left corner of its body. None for a shape without a
 * destination, for a row and a shape that draws rows, whose lines fill their body, and for a shape
 * too small to hold it beside its name.
 */
export function destinationMarkRect(
  shape: Pick<ElementShape, 'rect' | 'collapsed' | 'destinations' | 'row' | 'rowCount' | 'plate'>,
): Rect | undefined {
  if ((shape.destinations ?? 0) === 0 || shape.row !== undefined || shape.rowCount !== undefined) {
    return undefined;
  }
  const body = bodyOf(shape);
  if (body.width < MARK_SIZE * 3 + 2 * MARK_INSET || body.height < MARK_SIZE * 2 + 2 * MARK_INSET) {
    return undefined;
  }
  return {
    x: body.x + MARK_INSET,
    y: body.y + body.height - MARK_INSET - MARK_SIZE,
    width: MARK_SIZE,
    height: MARK_SIZE,
  };
}

/** Whether a point is on a shape's mark. */
export function onDestinationMark(shape: ElementShape, point: Point): boolean {
  const mark = destinationMarkRect(shape);
  return (
    mark !== undefined &&
    point.x >= mark.x &&
    point.x <= mark.x + mark.width &&
    point.y >= mark.y &&
    point.y <= mark.y + mark.height
  );
}

/**
 * What pointing at a shape's mark says: what double-clicking it opens, and, when its element has
 * several destinations, where the others are.
 */
export function destinationTitle(project: ProjectSnapshot, element: Id): string {
  const found = elementDestinations(project, modelIndexOf(project).element(element));
  const [first] = found;
  if (first === undefined) return '';
  const opens = t('Double-click, or press Alt+Enter, to open {opens}', {
    opens: describeDestination(t, project, first.destination),
  });
  return found.length === 1
    ? opens
    : `${opens}\n${t('Its menu lists its {count} destinations.', { count: found.length })}`;
}

/** Draws a shape's mark, when it has one: a tab of its fill, bordered by its stroke, and the arrow. */
export function drawDestinationMark(graphics: Graphics, shape: ElementShape): void {
  const mark = destinationMarkRect(shape);
  if (!mark) return;
  const { x, y, width, height } = mark;
  graphics
    .roundRect(x, y, width, height, 3)
    .fill(shape.fill)
    .stroke({ color: shape.stroke, width: 1 });
  // An arrow from the bottom left to the top right, with its head at the top right.
  const inset = width * 0.28;
  const left = x + inset;
  const bottom = y + height - inset;
  const right = x + width - inset;
  const top = y + inset;
  const head = width * 0.3;
  graphics
    .moveTo(left, bottom)
    .lineTo(right, top)
    .moveTo(right - head, top)
    .lineTo(right, top)
    .lineTo(right, top + head)
    .stroke({ color: readableTextColors(shape.fill).name, width: 1.5 });
}

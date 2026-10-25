/**
 * The mark of the relations that leave the view (ADR-0040): on a shape whose element has relations
 * whose other end the view's scope leaves out, a small tab in its bottom right corner writes how many
 * leave, after an arrow. It is drawn in the shape's own colors, so that it follows them in each
 * theme, and written as the shape's detail is, so that it shows from the zoom details show at.
 * Pointing at it says which relations leave, and the inspector lists them with Add to this view.
 */
import type { CanvasTextOptions, Graphics, TextStyleOptions } from 'pixi.js';
import { readableTextColors } from './colors';
import { FONT_FAMILY } from './draw';
import { bodyOf, type Point, type Rect } from './geometry';
import type { ElementShape } from './scene';

/** How tall the mark is, and how far it sits from its shape's sides, in canvas units. */
const MARK_HEIGHT = 14;
const MARK_INSET = 4;
/** How much room the arrow and the room around the text take, and each digit, in canvas units. */
const MARK_BASE = 16;
const DIGIT = 6;
const MARK_TEXT = 10;

/** What the mark writes: an arrow, and how many relations leave. */
export function leavingText(shape: Pick<ElementShape, 'leaving'>): string {
  return `→${shape.leaving?.length ?? 0}`;
}

/**
 * Where a shape's mark sits: in the bottom right corner of its body. None for a shape from which no
 * relation leaves the view, for a row, which is drawn as one line of its container, and for a shape
 * too small to hold it beside what it writes.
 */
export function leavingMarkRect(
  shape: Pick<ElementShape, 'rect' | 'collapsed' | 'leaving' | 'row'>,
): Rect | undefined {
  const count = shape.leaving?.length ?? 0;
  if (count === 0 || shape.row !== undefined) return undefined;
  const body = bodyOf(shape);
  const width = MARK_BASE + DIGIT * String(count).length;
  if (body.width < width * 2 + 2 * MARK_INSET || body.height < MARK_HEIGHT * 2 + 2 * MARK_INSET) {
    return undefined;
  }
  return {
    x: body.x + body.width - MARK_INSET - width,
    y: body.y + body.height - MARK_INSET - MARK_HEIGHT,
    width,
    height: MARK_HEIGHT,
  };
}

/** Whether a point is on a shape's mark. */
export function onLeavingMark(shape: ElementShape, point: Point): boolean {
  const mark = leavingMarkRect(shape);
  return (
    mark !== undefined &&
    point.x >= mark.x &&
    point.x <= mark.x + mark.width &&
    point.y >= mark.y &&
    point.y <= mark.y + mark.height
  );
}

/** Draws a shape's mark, when it has one: a tab of its fill, bordered by its stroke. */
export function drawLeavingMark(graphics: Graphics, shape: ElementShape): void {
  const mark = leavingMarkRect(shape);
  if (!mark) return;
  graphics
    .roundRect(mark.x, mark.y, mark.width, mark.height, MARK_HEIGHT / 2)
    .fill(shape.fill)
    .stroke({ color: shape.stroke, width: 1 });
}

/**
 * Writes the count on a shape's mark, as its detail is written: `write` gets the text, whether it is
 * detail, and the room it may take.
 */
export function writeLeavingMark(
  shape: ElementShape,
  write: (options: CanvasTextOptions, detail: boolean, room: number) => void,
): void {
  const mark = leavingMarkRect(shape);
  if (!mark) return;
  const style: TextStyleOptions = {
    fontFamily: FONT_FAMILY,
    fontSize: MARK_TEXT,
    fill: readableTextColors(shape.fill).detail,
    align: 'center',
  };
  write(
    {
      text: leavingText(shape),
      anchor: { x: 0.5, y: 0.5 },
      x: mark.x + mark.width / 2,
      y: mark.y + mark.height / 2,
      style,
    },
    true,
    mark.height,
  );
}

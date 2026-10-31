/**
 * Pointing at a solid's parts (ADR 0075). The pixel of a picture's part buffer under the pointer says
 * which part is drawn there, exactly to a pixel of the picture: the part buffer holds, for each pixel,
 * the innermost named part drawn there. The part found is the anchored part that stands for it, or for
 * the nearest part holding it that one stands for; where none does, or before the picture arrives,
 * the pointer finds the drawing.
 *
 * Box selection takes an anchored part whose point lies inside the box, since a picture gives a part
 * no outline; keyboard navigation and the outline go through a drawing's parts in its solid's order.
 *
 * Pure, with no PixiJS: the canvas hands it the part buffer it draws with.
 */
import type { SolidPart } from '@visual-anything/schema';
import type { SolidPartBuffer } from '../../solids/protocol';
import type { Point, Rect } from '../geometry';
import type { ElementShape } from '../scene';

/** A picture's part buffer, and where on the canvas its picture is drawn. */
export interface PlacedPartBuffer {
  buffer: SolidPartBuffer;
  rect: Rect;
}

/**
 * The pixel of a part buffer under a point of the canvas, from its top left; none outside it. Its
 * pixels are taken as squares of the picture, so that a point on a pixel's edge falls in the next.
 */
export function partPixelAt(placed: PlacedPartBuffer, point: Point): Point | undefined {
  const { buffer, rect } = placed;
  if (!(rect.width > 0) || !(rect.height > 0)) return undefined;
  const x = Math.floor(((point.x - rect.x) / rect.width) * buffer.width);
  const y = Math.floor(((point.y - rect.y) / rect.height) * buffer.height);
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return undefined;
  return { x, y };
}

/** The index of the part drawn under a point, in its solid's parts; none where no part is drawn. */
export function partIndexAt(placed: PlacedPartBuffer, point: Point): number | undefined {
  const pixel = partPixelAt(placed, point);
  if (!pixel) return undefined;
  const value = placed.buffer.data[pixel.y * placed.buffer.width + pixel.x] ?? 0;
  return value === 0 ? undefined : value - 1;
}

/**
 * The anchored part that stands for a part, or for the nearest part holding it that one stands for;
 * none when no part up to the outermost has one.
 */
export function anchoredPartFor(
  index: number,
  parts: readonly SolidPart[],
  anchored: ReadonlyMap<number, ElementShape>,
): ElementShape | undefined {
  let at: number | undefined = index;
  // At most as many steps as there are parts, should a parent ever point forward.
  for (let steps = 0; at !== undefined && steps <= parts.length; steps++) {
    const shape = anchored.get(at);
    if (shape) return shape;
    const parent: number | undefined = parts[at]?.parent;
    at = parent !== undefined && parent < at ? parent : undefined;
  }
  return undefined;
}

/** The anchored parts of a drawing, by the index of the part each stands for. */
export function anchoredByIndex(contents: readonly ElementShape[]): Map<number, ElementShape> {
  const byIndex = new Map<number, ElementShape>();
  for (const shape of contents) {
    const part = shape.part;
    if (part?.solid === undefined || !part.inDrawing) continue;
    if (!byIndex.has(part.index)) byIndex.set(part.index, shape);
  }
  return byIndex;
}

/**
 * What the pointer finds at a point of a drawing with parts whose picture shows with its part buffer:
 * the anchored part drawn there, or the drawing where no anchored part stands for what is drawn there.
 * `skip` leaves out what the canvas does not draw.
 */
export function pointedPart(
  drawing: ElementShape,
  placed: PlacedPartBuffer,
  point: Point,
  parts: readonly SolidPart[],
  anchored: ReadonlyMap<number, ElementShape>,
  skip: (shape: ElementShape) => boolean = () => false,
): ElementShape {
  const index = partIndexAt(placed, point);
  if (index === undefined) return drawing;
  const shape = anchoredPartFor(index, parts, anchored);
  return shape && !skip(shape) ? shape : drawing;
}

/** Whether a shape is an anchored part of a solid, drawn by its drawing's picture. */
export function isSolidAnchor(shape: ElementShape): boolean {
  return shape.part?.solid !== undefined && shape.part.inDrawing;
}

/** Whether a box holds an anchored part of a solid: whether its point lies inside it. */
export function boxHoldsSolidPart(shape: ElementShape, box: Rect): boolean {
  const point = shape.part?.point;
  if (!point) return false;
  return (
    point.x >= box.x &&
    point.y >= box.y &&
    point.x <= box.x + box.width &&
    point.y <= box.y + box.height
  );
}

/** Anchored parts of solids in their solids' order, by the index of the part each stands for. */
export function inSolidOrder(shapes: readonly ElementShape[]): ElementShape[] {
  return [...shapes].sort((a, b) => (a.part?.index ?? 0) - (b.part?.index ?? 0));
}

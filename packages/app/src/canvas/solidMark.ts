/**
 * A solid's placeholder (ADR 0075): until its picture exists, or for good when its file is missing,
 * not clean or past its package's total, a shape that shows a solid draws its own outline and its
 * name where the picture would leave them, and this mark where the picture goes: a cube seen from a
 * corner, in lines of the shape's stroke, so that it reads in both themes and at every zoom. The
 * anchored parts of a solid draw nothing of their own: their drawing's picture draws them.
 */
import type { Color } from '@visual-anything/schema';
import type { Graphics } from 'pixi.js';
import type { Point, Rect } from './geometry';
import type { ElementShape } from './scene';

/** The largest the mark is drawn, in canvas units across, and the share of its picture it takes. */
const MOST_MARK = 48;
const MARK_SHARE = 0.5;
/** The smallest mark drawn; a picture's place smaller than this draws none. */
const LEAST_MARK = 6;
/** The width of its lines. */
export const SOLID_MARK_LINE = 1.5;

/** Whether a shape is an anchored part of a solid, which draws nothing of its own. */
export function isAnchoredSolidPart(shape: Pick<ElementShape, 'part'>): boolean {
  return shape.part?.solid !== undefined && shape.part.inDrawing;
}

/**
 * The lines of the mark in a picture's place: the cube's outline, a hexagon, and the three edges that
 * meet at its nearest corner, centred in the place. None for a place too small for it.
 */
export function solidMarkLines(rect: Rect): [Point, Point][] {
  const side = Math.min(MOST_MARK, Math.min(rect.width, rect.height) * MARK_SHARE);
  if (!(side >= LEAST_MARK)) return [];
  const r = side / 2;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const corner = (degrees: number): Point => {
    const angle = (degrees * Math.PI) / 180;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };
  const hexagon = [-90, -30, 30, 90, 150, 210].map(corner);
  const middle = { x: cx, y: cy };
  const lines: [Point, Point][] = hexagon.map(
    (point, at) => [point, hexagon[(at + 1) % hexagon.length] as Point] as [Point, Point],
  );
  for (const at of [1, 3, 5]) lines.push([middle, hexagon[at] as Point]);
  return lines;
}

/** Draws a shape's solid's mark where its picture goes, in `color`. */
export function drawSolidMark(graphics: Graphics, shape: ElementShape, color: Color): void {
  const { solid } = shape;
  if (!solid) return;
  const lines = solidMarkLines(solid.rect);
  if (lines.length === 0) return;
  for (const [from, to] of lines) graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
  graphics.stroke({ color, width: SOLID_MARK_LINE, cap: 'round', join: 'round' });
}

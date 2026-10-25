/**
 * What editing a route draws above everything (`relation-routing.md` §6.2): the handles of the line,
 * at a constant size on screen; while it changes, the line as it now runs, in place of its drawing in
 * the tiles; and while an end is dragged, what it would attach to: the connection points of the shape
 * under the pointer, the one it snaps to filled, a tick across the border where it snaps to it, or the
 * whole outline when it would attach automatically.
 */
import type { Graphics } from 'pixi.js';
import type { Color } from '@visual-anything/schema';
import { drawRelationRoutes } from '../draw';
import { grow, type Point, type Rect } from '../geometry';
import { CANVAS_BACKGROUND } from '../palette';
import type { RelationLine } from '../scene';
import { traceCurve, drawnAsCurve } from './curves';
import { normalOf, type Side } from './hand';
import type { Handle } from './handles';

/** What a route edit shows above the scene. */
export interface RouteOverlay {
  /** The relation edited, by its line's key. */
  relation: string;
  handles: readonly Handle[];
  /** The handle chosen: the bend point selected, or the one the keys move. */
  chosen?: Handle;
  /** The line as it now runs, drawn in place of its drawing in the tiles; absent while unchanged. */
  preview?: RelationLine;
  /** While an end is dragged: the connection points of the shape under the pointer. */
  points?: readonly { at: Point; snapped: boolean }[];
  /** Where an end snaps to a shape's border. */
  tick?: { at: Point; side: Side };
  /** The outline of the shape an end would attach to automatically. */
  outline?: Rect;
  /** The outline of a shape an end may not be reconnected to. */
  refused?: Rect;
}

/** The colors route editing draws with: the selection's, the face of hollow handles, and refusals. */
export interface RouteMarkColors {
  selection: Color;
  face: Color;
  refused: Color;
}

export const ROUTE_MARK_COLORS: RouteMarkColors = {
  selection: '#2563EB',
  face: CANVAS_BACKGROUND,
  refused: '#DC2626',
};

/** The sizes of the handles on screen, in pixels: an end's square, a bend point's and a middle's circle. */
const END_SIZE = 9;
const BEND_SIZE = 8;
const MIDDLE_SIZE = 6;
const POINT_SIZE = 6;
const TICK = 8;

/** Draws a route edit at a scale, sizes kept on screen, over whatever `graphics` held. */
export function drawRouteOverlay(
  graphics: Graphics,
  overlay: RouteOverlay | undefined,
  scale: number,
  colors: RouteMarkColors = ROUTE_MARK_COLORS,
): void {
  graphics.clear();
  if (!overlay) return;
  const px = (pixels: number) => pixels / scale;
  const { selection, face, refused } = colors;
  if (overlay.outline) {
    const rect = grow(overlay.outline, px(3));
    graphics
      .rect(rect.x, rect.y, rect.width, rect.height)
      .stroke({ color: selection, width: px(2) });
  }
  if (overlay.refused) {
    const rect = grow(overlay.refused, px(3));
    graphics.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: refused, width: px(2) });
  }
  const preview = overlay.preview;
  if (preview) {
    // Marked as selected lines are, under the line itself.
    if (drawnAsCurve(preview) && preview.curve) traceCurve(graphics, preview.curve);
    else tracePolyline(graphics, preview.route);
    graphics.stroke({
      color: selection,
      width: preview.width + px(6),
      alpha: 0.35,
      join: 'round',
      cap: 'round',
    });
    drawRelationRoutes(graphics, [preview]);
  }
  for (const point of overlay.points ?? []) {
    graphics.circle(point.at.x, point.at.y, px(POINT_SIZE / 2));
    if (point.snapped) graphics.fill(selection);
    else graphics.fill(face).stroke({ color: selection, width: px(1.5) });
  }
  if (overlay.tick) {
    const { at, side } = overlay.tick;
    const normal = normalOf(side);
    const half = px(TICK / 2);
    graphics
      .moveTo(at.x - normal.x * half, at.y - normal.y * half)
      .lineTo(at.x + normal.x * half, at.y + normal.y * half)
      .stroke({ color: selection, width: px(2.5) });
  }
  for (const handle of overlay.handles) {
    const { x, y } = handle.at;
    const chosen = overlay.chosen !== undefined && sameHandle(handle, overlay.chosen);
    switch (handle.kind) {
      case 'end': {
        const half = px(END_SIZE / 2);
        graphics.rect(x - half, y - half, 2 * half, 2 * half);
        if (handle.byHand) graphics.fill(selection).stroke({ color: face, width: px(1) });
        else graphics.fill(face).stroke({ color: selection, width: px(1.5) });
        if (chosen) ring(graphics, x, y, px(END_SIZE), selection, px(1.5));
        break;
      }
      case 'bend':
        graphics
          .circle(x, y, px(BEND_SIZE / 2))
          .fill(selection)
          .stroke({ color: face, width: px(1) });
        if (chosen) ring(graphics, x, y, px(BEND_SIZE / 2 + 3), selection, px(1.5));
        break;
      case 'middle':
        graphics
          .circle(x, y, px(MIDDLE_SIZE / 2))
          .fill(face)
          .stroke({ color: selection, width: px(1.5) });
        if (chosen) ring(graphics, x, y, px(MIDDLE_SIZE / 2 + 3), selection, px(1.5));
        break;
    }
  }
}

/** Whether two handles are the same one of a route. */
export function sameHandle(a: Handle, b: Handle): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'end':
      return a.end === (b as typeof a).end;
    case 'bend':
      return a.index === (b as typeof a).index;
    case 'middle':
      return a.segment === (b as typeof a).segment;
  }
}

function ring(
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  color: Color,
  width: number,
): void {
  graphics.circle(x, y, radius).stroke({ color, width });
}

function tracePolyline(graphics: Graphics, route: readonly Point[]): void {
  const [first, ...rest] = route;
  if (!first) return;
  graphics.moveTo(first.x, first.y);
  for (const point of rest) graphics.lineTo(point.x, point.y);
}

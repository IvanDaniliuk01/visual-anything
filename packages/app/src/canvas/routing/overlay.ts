/**
 * What editing a route draws above everything (`relation-routing.md` §6.2): the handles of the line,
 * at a constant size on screen; while it changes, the line as it now runs, in place of its drawing in
 * the tiles; and while an end is dragged, what it would attach to: the connection points of the shape
 * under the pointer, the one it snaps to filled, a tick across the border where it snaps to it, or the
 * whole outline when it would attach automatically.
 *
 * It is drawn in the theme shown (ADR 0033): the line through the theme's painter, over its casing in
 * the canvas color as in the tiles, and the marks in the theme's selection color, with hollow handles
 * filled as the relate handle is, so that they keep 3:1 against the canvas in both themes.
 */
import type { Graphics } from 'pixi.js';
import type { Color } from '@visual-anything/schema';
import { grow, untilArrowhead, type Point, type Rect } from '../geometry';
import type { RelationLine } from '../scene';
import { CASING_EXTRA, type Painter } from '../theme/painter';
import { drawnAsCurve, drawnCurve, traceCurve } from './curves';
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

/** The sizes of the handles on screen, in pixels: an end's square, a bend point's and a middle's circle. */
const END_SIZE = 9;
const BEND_SIZE = 8;
const MIDDLE_SIZE = 6;
const POINT_SIZE = 6;
const TICK = 8;

/** Draws a route edit at a scale, sizes kept on screen, in a painter's theme, over what `graphics` held. */
export function drawRouteOverlay(
  graphics: Graphics,
  overlay: RouteOverlay | undefined,
  scale: number,
  painter: Painter,
): void {
  graphics.clear();
  if (!overlay) return;
  const px = (pixels: number) => pixels / scale;
  const {
    selected: selection,
    handleFill: face,
    refused,
    background,
    selectedGlowAlpha,
  } = painter.theme;
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
    // As the tiles draw a line: over its casing, in the canvas color; then marked as selected.
    traceLine(graphics, preview, true);
    graphics.stroke({ color: background, width: preview.width + CASING_EXTRA, cap: 'butt' });
    painter.relationRoutes(graphics, [preview]);
    traceLine(graphics, preview, false);
    graphics.stroke({
      color: selection,
      width: preview.width + px(6),
      alpha: selectedGlowAlpha,
      join: 'round',
      cap: 'round',
    });
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

/** Traces a line's path: its curve, or its route; up to the base of its arrowhead for a casing. */
function traceLine(graphics: Graphics, line: RelationLine, casing: boolean): void {
  if (drawnAsCurve(line) && line.curve) {
    traceCurve(graphics, casing ? drawnCurve(line) : line.curve);
    return;
  }
  const [first, ...rest] = casing ? untilArrowhead(line.route, line.arrowhead) : line.route;
  if (!first) return;
  graphics.moveTo(first.x, first.y);
  for (const point of rest) graphics.lineTo(point.x, point.y);
}

/**
 * What resizing and the alignment guides draw above everything (ADR 0074), in the marks layer: the
 * handles of the shape selected alone, on its box at a constant size on screen; while it is resized,
 * where it would be, as a ghost along its own outline where it has one, with its handles; and the guides where the edges or the middle of what is
 * dragged or resized line up with a shape beside it.
 *
 * It is drawn in the theme shown (ADR 0033): handles as the relate handle is, filled with the theme's
 * handle fill and ringed in its selection color, and the ghost and the guides in its selection color,
 * so that they keep 3:1 against the canvas in both themes.
 */
import type { Graphics } from 'pixi.js';
import type { GuideLine } from './align';
import { traceMark } from './draw';
import type { Rect } from './geometry';
import type { ShapeOutline } from './outlines';
import { handlePoint, type HandleName } from './resize';
import type { Painter } from './theme/painter';

/** What resizing and the guides show above the scene, in canvas units. */
export interface ShapeEditOverlay {
  /** The handles of the shape that can be resized, around its rectangle. */
  handles?: { rect: Rect; names: readonly HandleName[] };
  /** Where the shape being resized would be, or was let go and waits for its change. */
  ghost?: Rect;
  /** The ghost's own outline, for a shape with one, fitted to the ghost's size; else a box. */
  ghostOutline?: ShapeOutline;
  /** The guides to draw. */
  guides?: readonly GuideLine[];
}

/** A handle's side on screen, in pixels. */
export const HANDLE_SIZE = 8;
/** How far past the shapes a guide runs, on screen, and how long the marks at its ends are. */
const GUIDE_OVERRUN = 8;
const GUIDE_MARK = 3;

/** Draws resizing and the guides at a scale, sizes kept on screen, in a painter's theme. */
export function drawShapeEditOverlay(
  graphics: Graphics,
  overlay: ShapeEditOverlay | undefined,
  scale: number,
  painter: Painter,
): void {
  graphics.clear();
  if (!overlay) return;
  const px = (pixels: number) => pixels / scale;
  const { selected, handleFill, boxFillAlpha } = painter.theme;
  if (overlay.ghost) {
    // Along the shape's own outline, fitted to the ghost's size, as its marks go (ADR 0066).
    traceMark(
      graphics,
      overlay.ghostOutline ? { rect: overlay.ghost, outline: overlay.ghostOutline } : overlay.ghost,
      0,
    );
    graphics
      .fill({ color: selected, alpha: boxFillAlpha })
      .stroke({ color: selected, width: px(1.5) });
  }
  for (const line of overlay.guides ?? []) {
    const from = line.from - px(GUIDE_OVERRUN);
    const to = line.to + px(GUIDE_OVERRUN);
    const mark = px(GUIDE_MARK);
    if (line.axis === 'x') {
      graphics.moveTo(line.at, from).lineTo(line.at, to);
      for (const end of [from, to]) {
        graphics
          .moveTo(line.at - mark, end - mark)
          .lineTo(line.at + mark, end + mark)
          .moveTo(line.at - mark, end + mark)
          .lineTo(line.at + mark, end - mark);
      }
    } else {
      graphics.moveTo(from, line.at).lineTo(to, line.at);
      for (const end of [from, to]) {
        graphics
          .moveTo(end - mark, line.at - mark)
          .lineTo(end + mark, line.at + mark)
          .moveTo(end - mark, line.at + mark)
          .lineTo(end + mark, line.at - mark);
      }
    }
  }
  if ((overlay.guides?.length ?? 0) > 0) graphics.stroke({ color: selected, width: px(1) });
  const handles = overlay.handles;
  if (handles) {
    const half = px(HANDLE_SIZE / 2);
    for (const name of handles.names) {
      const at = handlePoint(handles.rect, name);
      graphics.rect(at.x - half, at.y - half, 2 * half, 2 * half);
    }
    if (handles.names.length > 0) {
      graphics.fill(handleFill).stroke({ color: selected, width: px(1.5) });
    }
  }
}

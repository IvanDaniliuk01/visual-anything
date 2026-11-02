/**
 * What a picture for Claude shows, and at what size (ADR 0081): the whole view, what the canvas shows
 * now, or the shapes of some elements, each with some room around it, drawn at the width asked for.
 * Pure, so that it is worked out the same for the canvas and for a canvas off screen.
 */
import { MAX_CAPTURE_HEIGHT, type CaptureRegion } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { visibleRect, type Camera } from '../canvas/camera';
import { grow, type Rect, type Size } from '../canvas/geometry';
import type { IndexedScene } from '../canvas/hit';
import { IMAGE_MARGIN } from '../export/image';

/**
 * The most pixels a canvas unit takes in a picture of the whole view or of some elements: twice the
 * canvas at 100%, as the PNG export's 2×. A frame smaller than the width asked for at that zoom is
 * widened around its middle, so that the picture shows what lies around it.
 */
export const MAX_PIXELS_PER_UNIT = 2;

/** What the canvas shows when a picture is asked for. */
export interface CaptureSeen {
  indexed: IndexedScene;
  camera: Camera;
  /** The canvas's size on screen, in CSS pixels. */
  viewport: Size;
  /** The shapes the emphasis hides, by key: they frame nothing. */
  hidden: ReadonlySet<string>;
}

/** What a picture frames, or why it frames nothing. */
export type Framed =
  | {
      ok: true;
      frame: Rect;
      /** Whether it shows what the canvas shows now. */
      asShown: boolean;
      /** Whether it shows the whole view. */
      whole: boolean;
      /** For a region of elements: those that have no shape the canvas draws. */
      missing?: Id[];
    }
  | { ok: false; failed: 'empty' | 'not-drawn' | 'no-canvas' };

/** What a region frames in the scene the canvas shows. */
export function frameOf(region: CaptureRegion, seen: CaptureSeen): Framed {
  const { indexed, camera, viewport, hidden } = seen;
  if (region === 'viewport') {
    if (!(viewport.width > 0) || !(viewport.height > 0) || !(camera.scale > 0)) {
      return { ok: false, failed: 'no-canvas' };
    }
    return { ok: true, frame: visibleRect(camera, viewport), asShown: true, whole: false };
  }
  if (region === 'whole') {
    const bounds = indexed.scene.bounds;
    if (bounds === undefined) return { ok: false, failed: 'empty' };
    return { ok: true, frame: grow(bounds, IMAGE_MARGIN), asShown: false, whole: true };
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const missing: Id[] = [];
  // Free shapes are framed by their id too, as highlight and tours mark them (the user's note 15).
  const notes = new Map(indexed.scene.notes.map((note) => [note.id, note.rect]));
  const arrows = new Map(
    indexed.scene.arrows.map((arrow) => [
      arrow.id,
      {
        x: Math.min(arrow.from.x, arrow.to.x),
        y: Math.min(arrow.from.y, arrow.to.y),
        width: Math.abs(arrow.to.x - arrow.from.x),
        height: Math.abs(arrow.to.y - arrow.from.y),
      },
    ]),
  );
  for (const element of new Set(region)) {
    const free = notes.get(element) ?? arrows.get(element);
    const shapes = free
      ? [{ rect: free }]
      : (indexed.byElement.get(element) ?? []).filter((each) => !hidden.has(each.key));
    if (shapes.length === 0) missing.push(element);
    for (const { rect } of shapes) {
      left = Math.min(left, rect.x);
      top = Math.min(top, rect.y);
      right = Math.max(right, rect.x + rect.width);
      bottom = Math.max(bottom, rect.y + rect.height);
    }
  }
  if (!(right >= left) || !(bottom >= top)) return { ok: false, failed: 'not-drawn' };
  return {
    ok: true,
    frame: grow({ x: left, y: top, width: right - left, height: bottom - top }, IMAGE_MARGIN),
    asShown: false,
    whole: false,
    ...(missing.length === 0 ? {} : { missing }),
  };
}

/** How a framed region is drawn: the frame it ends up showing, its zoom and its size in pixels. */
export interface CaptureSize {
  frame: Rect;
  pixelsPerUnit: number;
  width: number;
  height: number;
}

/**
 * Sizes a picture of a frame `width` pixels wide: no taller than {@link MAX_CAPTURE_HEIGHT}, a
 * taller one drawn narrower; and, unless it shows what the canvas shows, at most
 * {@link MAX_PIXELS_PER_UNIT} a canvas unit, a smaller frame widened around its middle.
 */
export function sizeFor(frame: Rect, width: number, asShown: boolean): CaptureSize {
  const across = Math.max(1, frame.width);
  const down = Math.max(1, frame.height);
  let pixelsPerUnit = Math.min(width / across, MAX_CAPTURE_HEIGHT / down);
  let shown = frame;
  if (!asShown && pixelsPerUnit > MAX_PIXELS_PER_UNIT) {
    pixelsPerUnit = MAX_PIXELS_PER_UNIT;
    const wide = width / pixelsPerUnit;
    if (wide > frame.width) {
      shown = { ...frame, x: frame.x - (wide - frame.width) / 2, width: wide };
    }
  }
  return {
    frame: shown,
    pixelsPerUnit,
    width: Math.max(1, Math.min(width, Math.round(shown.width * pixelsPerUnit))),
    height: Math.max(1, Math.min(MAX_CAPTURE_HEIGHT, Math.round(shown.height * pixelsPerUnit))),
  };
}

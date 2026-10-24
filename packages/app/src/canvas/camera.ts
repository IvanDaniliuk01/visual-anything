/**
 * The camera: how the canvas looks at the scene. A point of the scene is drawn on screen at
 * `point × scale + (x, y)`. Panning moves (x, y); zooming changes the scale around a point that stays
 * under the pointer.
 */
import { MAX_FIT_SCALE, fitTransform, type Point, type Rect, type Size } from './geometry';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** The furthest out and in the camera zooms. */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 8;

/** Where a point on screen is in the scene. */
export function screenToWorld(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale };
}

/** Where a point of the scene is on screen. */
export function worldToScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y };
}

/** Zooms by `factor` around a point on screen, which stays over the same point of the scene. */
export function zoomAt(camera: Camera, screenPoint: Point, factor: number): Camera {
  const scale = clampScale(camera.scale * factor);
  const world = screenToWorld(camera, screenPoint);
  return { scale, x: screenPoint.x - world.x * scale, y: screenPoint.y - world.y * scale };
}

/** Moves the camera by a distance on screen. */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** The camera that shows all of `bounds` in a viewport, with a margin. */
export function fitCamera(bounds: Rect | undefined, viewport: Size, margin: number): Camera {
  // Centered at the scale the camera can take, so that a scene too large to fit shows its middle.
  const { scale, x, y } = fitTransform(
    bounds,
    viewport,
    margin,
    Math.min(MAX_FIT_SCALE, MAX_SCALE),
    MIN_SCALE,
  );
  return { scale, x, y };
}

/** The part of the scene the camera shows in a viewport. */
export function visibleRect(camera: Camera, viewport: Size): Rect {
  const topLeft = screenToWorld(camera, { x: 0, y: 0 });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: viewport.width / camera.scale,
    height: viewport.height / camera.scale,
  };
}

/**
 * The camera that brings `rect` into sight: none when it is wholly on screen at `scale` or larger;
 * otherwise one centered on it, at that scale or the present one when larger.
 */
export function revealCamera(
  camera: Camera,
  viewport: Size,
  rect: Rect,
  scale: number,
): Camera | undefined {
  const shown = visibleRect(camera, viewport);
  const onScreen =
    rect.x >= shown.x &&
    rect.y >= shown.y &&
    rect.x + rect.width <= shown.x + shown.width &&
    rect.y + rect.height <= shown.y + shown.height;
  if (onScreen && camera.scale >= scale) return undefined;
  const next = clampScale(Math.max(camera.scale, scale));
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  return {
    scale: next,
    x: viewport.width / 2 - middle.x * next,
    y: viewport.height / 2 - middle.y * next,
  };
}

/** How much a wheel turn zooms: a notch of a mouse wheel zooms by about 10%. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.001 * 1.05);
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * The camera: how the canvas looks at the scene. A point of the scene is drawn on screen at
 * `point × scale + (x, y)`. Panning moves (x, y); zooming changes the scale around a point that stays
 * under the pointer.
 */
import { fitTransform, type Point, type Rect, type Size } from './geometry';

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
  const { scale, x, y } = fitTransform(bounds, viewport, margin);
  return { scale: clampScale(scale), x, y };
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

/** How much a wheel turn zooms: a notch of a mouse wheel zooms by about 10%. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.001 * 1.05);
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Moving the physical-space panel's camera (ADR 0076): turning it around the point it looks at,
 * panning that point across the frame, zooming toward a point of the frame, and easing from one
 * camera to another. Pure, with no DOM, so that the pointer, the keys and the tests move it alike.
 * Every camera it gives is one a view state takes: azimuth from −180° to 180°, elevation from −89° to
 * 89°, a distance above 0 and a target within `MAX_SPACE_DISTANCE`.
 *
 * Frames are measured in pixels of the page: a drag's `dx` and `dy`, and the frame's `height`.
 */
import { MAX_SPACE_DISTANCE } from '@visual-anything/core';
import type { SpaceCamera, SpacePoint } from '@visual-anything/schema';
import { SPACE_FIELD_OF_VIEW, spaceEye } from './camera';

/** How many degrees a pixel of a drag turns the camera. */
export const TURN_PER_PIXEL = 0.4;
/** How many degrees an arrow key turns it. */
export const TURN_STEP = 15;
/** How much of the frame's height Shift with an arrow key pans it. */
export const PAN_STEP = 0.1;
/** How much nearer + brings it, and − takes it away by its inverse. */
export const ZOOM_STEP = 0.8;
/** The nearest the camera comes to the point it looks at, in meters: a tenth of a millimetre. */
export const MIN_SPACE_CAMERA_DISTANCE = 1e-4;
/** The highest and lowest the camera looks from. */
export const MAX_ELEVATION = 89;

const RADIANS = Math.PI / 180;
const HALF_VIEW = Math.tan((SPACE_FIELD_OF_VIEW / 2) * RADIANS);

/** The camera's directions in the coordinates of the element the panel shows, each of unit length. */
export interface CameraAxes {
  /** From the eye toward the target. */
  forward: SpacePoint;
  /** To the right of the frame. */
  right: SpacePoint;
  /** Up the frame. */
  up: SpacePoint;
}

/** The camera's directions, as `spaceProjection` works them out. */
export function cameraAxes(camera: SpaceCamera): CameraAxes {
  const eye = spaceEye(camera);
  const forward = unit(sub(camera.target, eye));
  const right = unit({ x: -forward.z, y: 0, z: forward.x });
  return { forward, right, up: cross(right, forward) };
}

/** An azimuth within −180° to 180°. */
function wrapped(azimuth: number): number {
  const turned = ((((azimuth + 180) % 360) + 360) % 360) - 180;
  return turned === -180 && azimuth > 0 ? 180 : turned || 0;
}

function clampElevation(elevation: number): number {
  return Math.min(MAX_ELEVATION, Math.max(-MAX_ELEVATION, elevation)) || 0;
}

function clampDistance(distance: number): number {
  if (!Number.isFinite(distance)) return MAX_SPACE_DISTANCE;
  return Math.min(MAX_SPACE_DISTANCE, Math.max(MIN_SPACE_CAMERA_DISTANCE, distance));
}

function clampTarget(target: SpacePoint): SpacePoint {
  const clamp = (value: number) =>
    Math.min(MAX_SPACE_DISTANCE, Math.max(-MAX_SPACE_DISTANCE, value)) || 0;
  return { x: clamp(target.x), y: clamp(target.y), z: clamp(target.z) };
}

/** Turns the camera around its target by degrees of azimuth and of elevation. */
export function turnBy(camera: SpaceCamera, azimuth: number, elevation: number): SpaceCamera {
  return {
    ...camera,
    azimuth: wrapped(camera.azimuth + azimuth),
    elevation: clampElevation(camera.elevation + elevation),
  };
}

/**
 * Turns the camera as a drag of (dx, dy) pixels does: the space turns the way the pointer moves, so
 * dragging right brings what is on the left into view, and dragging down looks from higher up.
 */
export function turnByDrag(camera: SpaceCamera, dx: number, dy: number): SpaceCamera {
  return turnBy(camera, -dx * TURN_PER_PIXEL, dy * TURN_PER_PIXEL);
}

/** How many meters a pixel of the page spans at the target, in a frame this many pixels high. */
export function metersPerPixel(camera: SpaceCamera, height: number): number {
  return (2 * camera.distance * HALF_VIEW) / Math.max(1, height);
}

/**
 * Pans the camera as a drag of (dx, dy) pixels does in a frame this high: what is at the target
 * follows the pointer.
 */
export function panByDrag(
  camera: SpaceCamera,
  dx: number,
  dy: number,
  height: number,
): SpaceCamera {
  const { right, up } = cameraAxes(camera);
  const per = metersPerPixel(camera, height);
  const move = add(scale(right, -dx * per), scale(up, dy * per));
  return { ...camera, target: clampTarget(add(camera.target, move)) };
}

/**
 * Zooms by a factor of the distance, toward the point of the frame at (x, y), as shares of its width
 * and height from its top left, which stays where it is on the screen; toward the middle when none
 * is given. A factor below 1 brings the camera nearer.
 */
export function zoomBy(
  camera: SpaceCamera,
  factor: number,
  toward?: { x: number; y: number; aspect: number },
): SpaceCamera {
  if (!(factor > 0) || !Number.isFinite(factor)) return camera;
  const distance = clampDistance(camera.distance * factor);
  const kept = distance / camera.distance;
  if (!toward) return { ...camera, distance };
  // The point under (x, y) on the plane through the target, square to the camera's direction.
  const { right, up } = cameraAxes(camera);
  const half = camera.distance * HALF_VIEW;
  const aspect = Number.isFinite(toward.aspect) && toward.aspect > 0 ? toward.aspect : 1;
  const across = (toward.x - 0.5) * 2 * half * aspect;
  const above = (0.5 - toward.y) * 2 * half;
  const offset = add(scale(right, across), scale(up, above));
  // The target moves toward that point by what the distance lost, so that the point stays put.
  const target = add(camera.target, scale(offset, 1 - kept));
  return { ...camera, distance, target: clampTarget(target) };
}

/** What a key does to the camera, or none when the key is not one of the camera's. */
export type CameraKey =
  | { kind: 'turn'; azimuth: number; elevation: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'fit' };

/**
 * The camera's keys: the arrows turn the space as dragging that way does, Shift with them pans, + and
 * − zoom, and 0 fits everything, as on the canvas.
 */
export function cameraKeyOf(key: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): CameraKey | undefined {
  if (key.ctrlKey || key.metaKey || key.altKey) return undefined;
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const arrow = arrows[key.key];
  if (arrow) {
    const [x, y] = arrow;
    // Each arrow moves the space as a drag that way does: Left turns it to the left, Down looks
    // from higher up, and with Shift what is shown moves that way.
    return key.shiftKey
      ? { kind: 'pan', dx: x, dy: y }
      : { kind: 'turn', azimuth: -x * TURN_STEP || 0, elevation: y * TURN_STEP };
  }
  if (key.key === '+' || key.key === '=') return { kind: 'zoom', factor: ZOOM_STEP };
  if (key.key === '-' || key.key === '−' || key.key === '_') {
    return { kind: 'zoom', factor: 1 / ZOOM_STEP };
  }
  if (key.key === '0' && !key.shiftKey) return { kind: 'fit' };
  return undefined;
}

/** A camera moved by a key, in a frame this many pixels high; a fit is the panel's to do. */
export function cameraMovedByKey(
  camera: SpaceCamera,
  key: Exclude<CameraKey, { kind: 'fit' }>,
  height: number,
): SpaceCamera {
  switch (key.kind) {
    case 'turn':
      return turnBy(camera, key.azimuth, key.elevation);
    case 'pan': {
      const step = PAN_STEP * height;
      return panByDrag(camera, key.dx * step, key.dy * step, height);
    }
    case 'zoom':
      return zoomBy(camera, key.factor);
  }
}

/**
 * The camera a share `t` of the way, from 0 to 1, from one camera to another: the target in a line,
 * the azimuth the shorter way round, the elevation evenly, and the distance by the same factor each
 * step, so that a move across scales reads as one.
 */
export function cameraBetween(from: SpaceCamera, to: SpaceCamera, t: number): SpaceCamera {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const turn = wrapped(to.azimuth - from.azimuth);
  return {
    target: clampTarget(add(from.target, scale(sub(to.target, from.target), t))),
    azimuth: wrapped(from.azimuth + turn * t),
    elevation: clampElevation(from.elevation + (to.elevation - from.elevation) * t),
    distance: clampDistance(from.distance * (to.distance / from.distance) ** t),
  };
}

/** Whether two cameras look the same: within a millionth of the distance, and of a degree. */
export function sameCamera(a: SpaceCamera, b: SpaceCamera): boolean {
  const near = Math.max(a.distance, b.distance) * 1e-6;
  return (
    Math.abs(a.target.x - b.target.x) <= near &&
    Math.abs(a.target.y - b.target.y) <= near &&
    Math.abs(a.target.z - b.target.z) <= near &&
    Math.abs(a.distance - b.distance) <= near &&
    Math.abs(wrapped(a.azimuth - b.azimuth)) <= 1e-6 &&
    Math.abs(a.elevation - b.elevation) <= 1e-6
  );
}

/**
 * The ray from the eye through the point (x, y) of a frame of this aspect, as shares of its width and
 * height from its top left: where it starts and its direction, of unit length.
 */
export function rayAt(
  camera: SpaceCamera,
  aspect: number,
  x: number,
  y: number,
): { from: SpacePoint; direction: SpacePoint } {
  const { forward, right, up } = cameraAxes(camera);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const across = (x - 0.5) * 2 * HALF_VIEW * ratio;
  const above = (0.5 - y) * 2 * HALF_VIEW;
  return {
    from: spaceEye(camera),
    direction: unit(add(forward, add(scale(right, across), scale(up, above)))),
  };
}

// Vectors ---------------------------------------------------------------------------------------

export function add(a: SpacePoint, b: SpacePoint): SpacePoint {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: SpacePoint, b: SpacePoint): SpacePoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: SpacePoint, by: number): SpacePoint {
  return { x: a.x * by, y: a.y * by, z: a.z * by };
}

export function dot(a: SpacePoint, b: SpacePoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: SpacePoint, b: SpacePoint): SpacePoint {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function unit(a: SpacePoint): SpacePoint {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}

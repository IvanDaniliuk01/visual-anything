/**
 * Turning (ADR 0075): the selected shape's solid drawn live in its shape, so that the person can turn
 * it, zoom into it and point at its parts. This module holds what turning does with the camera, pure,
 * so that the pointer, the keys and the tests agree:
 *
 * - **Dragging** turns the solid around its target: across the picture's width, half a turn; up and
 *   down, as far, raising or lowering the camera.
 * - **The wheel** zooms the solid rather than the canvas.
 * - **The keys:** the arrows turn it by 15°, and by 90° with Shift; + and − zoom; 0 goes back to the
 *   camera it started from; Escape ends turning and gives its picture back.
 * - **Where it is seen from** is announced, such as "Arm, seen from the front left, above".
 *
 * A camera's azimuth runs around +Y, 0 looking from +Z, the solid's front; a positive one looks from
 * its left, toward +X, as the ADR's three-quarter view "from the front left" does.
 */
import type { SolidCamera } from '@visual-anything/schema';
import { t } from '../../i18n';

/** How far an arrow key turns the solid, and with Shift. */
export const TURN_STEP = 15;
export const TURN_BIG_STEP = 90;
/** How much + and − zoom, as a factor. */
export const TURN_ZOOM_STEP = 1.25;
/** The zoom a camera keeps within. */
export const TURN_ZOOM = { least: 0.25, most: 16 } as const;
/** The elevation a camera keeps within. */
export const TURN_ELEVATION = 89;
/** The smallest picture, in screen pixels across, whose shape shows the turn handle. */
export const TURN_HANDLE_FROM = 96;

/** An azimuth within −180 and 180, rounded to a hundredth of a degree. */
function azimuthWithin(degrees: number): number {
  let value = ((((degrees + 180) % 360) + 360) % 360) - 180;
  if (value === -180) value = 180;
  return Math.round(value * 100) / 100;
}

function elevationWithin(degrees: number): number {
  const value = Math.min(TURN_ELEVATION, Math.max(-TURN_ELEVATION, degrees));
  return Math.round(value * 100) / 100;
}

function zoomWithin(zoom: number): number {
  const value = Math.min(TURN_ZOOM.most, Math.max(TURN_ZOOM.least, zoom));
  return Math.round(value * 10_000) / 10_000;
}

/** A camera turned by so many degrees around, and up. */
export function turnedBy(camera: SolidCamera, around: number, up: number): SolidCamera {
  return {
    ...camera,
    azimuth: azimuthWithin(camera.azimuth + around),
    elevation: elevationWithin(camera.elevation + up),
  };
}

/** A camera zoomed by a factor. */
export function zoomedBy(camera: SolidCamera, factor: number): SolidCamera {
  const zoom = zoomWithin((camera.zoom ?? 1) * factor);
  const next: SolidCamera = { ...camera, zoom };
  if (zoom === 1) delete next.zoom;
  return next;
}

/**
 * A camera turned by a drag of `dx` and `dy` screen pixels over a picture `width` pixels across: a
 * drag to the right turns the solid's front to the right, which brings the camera round to its left,
 * and a drag down raises the camera.
 */
export function turnedByDrag(
  camera: SolidCamera,
  dx: number,
  dy: number,
  width: number,
): SolidCamera {
  const perPixel = 180 / Math.max(1, width);
  return turnedBy(camera, -dx * perPixel, dy * perPixel);
}

/** A camera zoomed by the wheel's `deltaY`, in pixels: toward the solid for a wheel turned away. */
export function zoomedByWheel(camera: SolidCamera, deltaY: number): SolidCamera {
  return zoomedBy(camera, 2 ** (-deltaY / 500));
}

/** What a key does while a solid turns. */
export type TurnKey =
  | { kind: 'camera'; camera: SolidCamera }
  | { kind: 'end' }
  /** A key turning has no use for, which the canvas handles as it would. */
  | { kind: 'none' };

/**
 * What a key does to a turning solid's camera, from `camera`, the one it has now, and `start`, the one
 * it started from, which 0 goes back to.
 */
export function turnKey(
  key: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  camera: SolidCamera,
  start: SolidCamera,
): TurnKey {
  if (key.ctrlKey === true || key.metaKey === true || key.altKey === true) return { kind: 'none' };
  const step = key.shiftKey === true ? TURN_BIG_STEP : TURN_STEP;
  switch (key.key) {
    case 'ArrowLeft':
      return { kind: 'camera', camera: turnedBy(camera, step, 0) };
    case 'ArrowRight':
      return { kind: 'camera', camera: turnedBy(camera, -step, 0) };
    case 'ArrowUp':
      return { kind: 'camera', camera: turnedBy(camera, 0, step) };
    case 'ArrowDown':
      return { kind: 'camera', camera: turnedBy(camera, 0, -step) };
    case '+':
    case '=':
      return { kind: 'camera', camera: zoomedBy(camera, TURN_ZOOM_STEP) };
    case '-':
    case '_':
      return { kind: 'camera', camera: zoomedBy(camera, 1 / TURN_ZOOM_STEP) };
    case '0':
      return { kind: 'camera', camera: start };
    case 'Escape':
      return { kind: 'end' };
    default:
      return { kind: 'none' };
  }
}

/** The side a solid is seen from, by its camera's azimuth, as a person names it. */
export type SeenSide =
  | 'front'
  | 'front left'
  | 'left'
  | 'back left'
  | 'back'
  | 'back right'
  | 'right'
  | 'front right';

/** Where a camera sees its solid from: a side, and above, below or level. */
export function seenFrom(camera: SolidCamera): {
  side: SeenSide;
  height: 'above' | 'below' | 'level';
} {
  const azimuth = azimuthWithin(camera.azimuth);
  const sides: SeenSide[] = [
    'back right',
    'right',
    'front right',
    'front',
    'front left',
    'left',
    'back left',
  ];
  // Eight sides of 45° each, the front from −22.5° to 22.5°.
  const sector = Math.round(azimuth / 45);
  const side: SeenSide = Math.abs(sector) >= 4 ? 'back' : (sides[sector + 3] as SeenSide);
  const height = camera.elevation > 15 ? 'above' : camera.elevation < -15 ? 'below' : 'level';
  return { side, height };
}

/** A side as the announcement writes it. */
function sideText(side: SeenSide): string {
  switch (side) {
    case 'front':
      return t('the front');
    case 'front left':
      return t('the front left');
    case 'left':
      return t('the left');
    case 'back left':
      return t('the back left');
    case 'back':
      return t('the back');
    case 'back right':
      return t('the back right');
    case 'right':
      return t('the right');
    case 'front right':
      return t('the front right');
  }
}

/** What turning announces: the shape's name and where its solid is seen from. */
export function turnAnnouncement(name: string, camera: SolidCamera): string {
  const { side, height } = seenFrom(camera);
  const values = { name, side: sideText(side) };
  if (height === 'above') return t('{name}, seen from {side}, above', values);
  if (height === 'below') return t('{name}, seen from {side}, below', values);
  return t('{name}, seen from {side}', values);
}

/** Whether two cameras show a solid alike, so that a change of camera need not be drawn. */
export function sameTurnCamera(a: SolidCamera, b: SolidCamera): boolean {
  return (
    a.azimuth === b.azimuth &&
    a.elevation === b.elevation &&
    (a.zoom ?? 1) === (b.zoom ?? 1) &&
    (a.projection ?? 'perspective') === (b.projection ?? 'perspective') &&
    a.target?.x === b.target?.x &&
    a.target?.y === b.target?.y &&
    a.target?.z === b.target?.z
  );
}

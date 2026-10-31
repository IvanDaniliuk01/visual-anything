/**
 * How the physical-space panel's camera gets from one place to another (ADR 0076), as a tour's camera
 * does on the canvas (ADR 0058): its travel is counted in quarter turns of its direction, doublings or
 * halvings of its distance, and moves of its target by the nearer of its two distances. Up to
 * {@link MAX_SPACE_TRAVEL}, it eases over {@link TOUR_MOVE_TIME} ms plus
 * {@link TOUR_MOVE_TIME_PER_UNIT} ms for each, at most {@link MAX_SPACE_MOVE_TIME}; past that, from
 * no camera, into another element shown, or under reduced motion, it cuts. Pure, with no DOM.
 */
import { TOUR_MOVE_TIME, TOUR_MOVE_TIME_PER_UNIT, tourEase } from '@visual-anything/core';
import type { SpaceCamera } from '@visual-anything/schema';

/** The most travel a move eases over; a longer one cuts. */
export const MAX_SPACE_TRAVEL = 3;
/** The longest a move of the panel's camera takes, in milliseconds. */
export const MAX_SPACE_MOVE_TIME = TOUR_MOVE_TIME + TOUR_MOVE_TIME_PER_UNIT * MAX_SPACE_TRAVEL;

/** Travel below this is no move at all: the camera is there already. */
const NO_TRAVEL = 1e-6;

const RADIANS = Math.PI / 180;

/** How the panel's camera gets somewhere: it stays, cuts, or eases along `at` for a while. */
export type SpaceMove =
  | { kind: 'stay' }
  | { kind: 'cut' }
  | { kind: 'ease'; duration: number; at: (part: number) => SpaceCamera };

/** Which way a camera looks, as a unit vector from its eye toward its target. */
function directionOf(camera: SpaceCamera): { x: number; y: number; z: number } {
  const azimuth = camera.azimuth * RADIANS;
  const elevation = camera.elevation * RADIANS;
  return {
    x: -Math.sin(azimuth) * Math.cos(elevation),
    y: -Math.sin(elevation),
    z: -Math.cos(azimuth) * Math.cos(elevation),
  };
}

/**
 * How far the camera travels from `from` to `to`: quarter turns of its direction, plus doublings or
 * halvings of its distance, plus moves of its target by the nearer of its two distances.
 */
export function spaceTravel(from: SpaceCamera, to: SpaceCamera): number {
  const a = directionOf(from);
  const b = directionOf(to);
  const cosine = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const turns = Math.acos(cosine) / RADIANS / 90;
  const scaling = Math.abs(Math.log2(to.distance / from.distance));
  const moved = Math.hypot(
    to.target.x - from.target.x,
    to.target.y - from.target.y,
    to.target.z - from.target.z,
  );
  const panning = moved / Math.min(from.distance, to.distance);
  const travel = turns + scaling + panning;
  return Number.isFinite(travel) ? travel : Infinity;
}

/** The azimuth's change from `from` to `to` the short way round, in degrees, from -180 to 180. */
function turnOf(from: number, to: number): number {
  const turn = ((((to - from) % 360) + 540) % 360) - 180;
  return turn === -180 && to > from ? 180 : turn;
}

/** An azimuth within -180 to 180 degrees. */
function azimuthWithin(azimuth: number): number {
  const wrapped = ((((azimuth + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && azimuth > 0 ? 180 : wrapped;
}

/**
 * The camera a part of the way from `from` to `to`, unpaced: its target along the straight line, its
 * azimuth the short way round, its elevation evenly, and its distance by equal ratios, so that a zoom
 * feels even. At 0 and 1, the ends themselves.
 */
export function spaceCameraBetween(from: SpaceCamera, to: SpaceCamera, part: number): SpaceCamera {
  if (part <= 0) return from;
  if (part >= 1) return to;
  const along = (a: number, b: number) => a + (b - a) * part;
  return {
    target: {
      x: along(from.target.x, to.target.x),
      y: along(from.target.y, to.target.y),
      z: along(from.target.z, to.target.z),
    },
    azimuth: azimuthWithin(from.azimuth + turnOf(from.azimuth, to.azimuth) * part),
    elevation: along(from.elevation, to.elevation),
    distance: from.distance * (to.distance / from.distance) ** part,
  };
}

/** Whether two cameras are the same place. */
export function sameSpaceCamera(a: SpaceCamera, b: SpaceCamera): boolean {
  return (
    a.target.x === b.target.x &&
    a.target.y === b.target.y &&
    a.target.z === b.target.z &&
    a.azimuth === b.azimuth &&
    a.elevation === b.elevation &&
    a.distance === b.distance
  );
}

/**
 * How the panel's camera gets from `from` to `to`: it stays when it is there already; it cuts under
 * reduced motion, from no camera, into another element shown (`sameRoot` false), and past
 * {@link MAX_SPACE_TRAVEL}; otherwise it eases, by a tour's sinusoidal ease, over 250 ms plus 150 ms
 * for each unit of travel.
 */
export function spaceMove(
  from: SpaceCamera | undefined,
  to: SpaceCamera,
  options: { reducedMotion: boolean; sameRoot: boolean },
): SpaceMove {
  if (from !== undefined && options.sameRoot && sameSpaceCamera(from, to)) return { kind: 'stay' };
  if (options.reducedMotion || !options.sameRoot || from === undefined) return { kind: 'cut' };
  const travel = spaceTravel(from, to);
  if (travel < NO_TRAVEL) return { kind: 'stay' };
  if (!(travel <= MAX_SPACE_TRAVEL)) return { kind: 'cut' };
  const duration = Math.min(
    MAX_SPACE_MOVE_TIME,
    Math.round(TOUR_MOVE_TIME + TOUR_MOVE_TIME_PER_UNIT * travel),
  );
  return {
    kind: 'ease',
    duration,
    at: (part) => spaceCameraBetween(from, to, tourEase(part)),
  };
}

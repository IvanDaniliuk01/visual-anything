/**
 * How the camera moves from one step of a tour to the next (ADR 0058): a short, eased move, capped at
 * three screen widths of travel, past which it cuts; and always a cut under reduced motion, or into
 * another view. Long zoom flights make people sick, so a move never becomes one.
 */
import type { ViewCamera } from '../view-state';

/** How the camera gets to a step: at once, or eased over a short time. */
export type TourMove = { kind: 'cut' } | { kind: 'ease'; duration: number };

/** The most a move travels, in screen widths, before it cuts instead. */
export const MAX_TOUR_TRAVEL = 3;

/** How long a move takes, in milliseconds: at least this, and this much more per screen width. */
export const TOUR_MOVE_TIME = 250;
export const TOUR_MOVE_TIME_PER_WIDTH = 150;
/** The longest a move takes, in milliseconds. */
export const MAX_TOUR_MOVE_TIME = 700;

/** The size of the canvas on screen, in pixels. */
export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * How far the camera travels between two places, in screen widths: how far the middle of the canvas
 * moves, measured at the nearer of the two zooms so that zooming out and back counts its whole way,
 * and one screen width more for each doubling or halving of the zoom.
 */
export function tourTravel(from: ViewCamera, to: ViewCamera, screen: ScreenSize): number {
  const width = Math.max(1, screen.width);
  const zoom = Math.min(from.zoom, to.zoom);
  const pan = Math.hypot(to.x - from.x, to.y - from.y) * zoom;
  const scale = Math.abs(Math.log2(to.zoom / from.zoom));
  const travel = pan / width + scale;
  return Number.isFinite(travel) ? travel : Number.POSITIVE_INFINITY;
}

/**
 * How the camera gets from where it is to a step's place: a cut when motion is reduced, when the step
 * is in another view, when there is no camera to start from, or when it would travel more than
 * {@link MAX_TOUR_TRAVEL} screen widths; otherwise an eased move whose time grows with its travel,
 * from {@link TOUR_MOVE_TIME} to {@link MAX_TOUR_MOVE_TIME} milliseconds. No move at all is a cut.
 */
export function tourMove(
  from: ViewCamera | undefined,
  to: ViewCamera,
  screen: ScreenSize,
  options: { reducedMotion: boolean; sameView: boolean },
): TourMove {
  if (options.reducedMotion || !options.sameView || from === undefined) return { kind: 'cut' };
  const travel = tourTravel(from, to, screen);
  if (!(travel > 0) || travel > MAX_TOUR_TRAVEL) return { kind: 'cut' };
  const duration = Math.min(
    MAX_TOUR_MOVE_TIME,
    Math.round(TOUR_MOVE_TIME + TOUR_MOVE_TIME_PER_WIDTH * travel),
  );
  return { kind: 'ease', duration };
}

/** Starts and ends gently: the ease of a tour's moves, from 0 to 1. */
export function easeInOut(part: number): number {
  const t = Math.min(1, Math.max(0, part));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

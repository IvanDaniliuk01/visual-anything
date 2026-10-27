/**
 * How the camera moves from one step of a tour to the next (ADR 0077, superseding ADR 0058's rule):
 * along van Wijk and Nuij's smooth zoom-and-pan path, with ρ = 1, as d3's `interpolateZoom` draws it,
 * timed by a sinusoidal ease. It is bounded so that it never becomes a flight: a path that would zoom
 * out more than 2.5 times beyond the wider of its two views, or take longer than 800 ms, cuts instead,
 * and so does every move under reduced motion, into another view, from no camera, or of no length.
 */
import type { ViewCamera } from '../view-state';

/** The size of the canvas on screen, in pixels. */
export interface ScreenSize {
  width: number;
  height: number;
}

/** A smooth zoom-and-pan path from one camera to another. */
export interface TourCameraPath {
  /**
   * Its length S, in van Wijk and Nuij's units: about the natural logarithm of how much the view
   * widens and narrows on the way, a pan included. 0 for no move.
   */
  length: number;
  /** How many times wider than the wider of its two ends its widest view is: 1 when it never widens past them. */
  zoomOut: number;
  /** The camera a part of the way along, from 0 to 1, by the path's own length, unpaced. */
  at(part: number): ViewCamera;
}

/** How the camera gets to a step: at once, or along a path for a while. */
export type TourMove = { kind: 'cut' } | { kind: 'ease'; duration: number; path: TourCameraPath };

/** How long a move takes, in milliseconds: this, and this much more for each unit of its length. */
export const TOUR_MOVE_TIME = 250;
export const TOUR_MOVE_TIME_PER_UNIT = 150;
/** The longest a move takes, in milliseconds; a longer one cuts. */
export const MAX_TOUR_MOVE_TIME = 800;
/** The most a path zooms out beyond the wider of its two views; one that would zoom out more cuts. */
export const MAX_TOUR_ZOOM_OUT = 2.5;

/** The trade-off between zooming and panning, van Wijk and Nuij's ρ; 1 is d3's and their own advice. */
const RHO = 1;

/**
 * The smooth zoom-and-pan path from one camera to another (van Wijk and Nuij, 2003), on a screen of
 * this size: the view's width in canvas units is what it interpolates, so that it zooms out on the
 * way to keep both places in sight and back in as it arrives.
 */
export function tourCameraPath(
  from: ViewCamera,
  to: ViewCamera,
  screen: ScreenSize,
): TourCameraPath {
  const width = Math.max(1, screen.width);
  const w0 = width / from.zoom;
  const w1 = width / to.zoom;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const ends = (part: number, camera: () => ViewCamera): ViewCamera =>
    part <= 0 ? from : part >= 1 ? to : camera();

  // Too short a pan to measure at these widths: a zoom about the moving middle.
  if (!(distance > 1e-9 * Math.max(w0, w1))) {
    const widening = Math.log(w1 / w0);
    return {
      length: Math.abs(widening) / RHO,
      zoomOut: 1,
      at: (part) =>
        ends(part, () => ({
          x: from.x + part * dx,
          y: from.y + part * dy,
          zoom: width / (w0 * Math.exp(widening * part)),
        })),
    };
  }

  const rho2 = RHO * RHO;
  const rho4 = rho2 * rho2;
  const b0 = (w1 * w1 - w0 * w0 + rho4 * distance * distance) / (2 * w0 * rho2 * distance);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * distance * distance) / (2 * w1 * rho2 * distance);
  // ln(√(b² + 1) − b) is −asinh(b), which keeps its precision where b is large.
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const length = (r1 - r0) / RHO;
  const cosh0 = Math.cosh(r0);
  const sinh0 = Math.sinh(r0);
  // The view is widest where ρs + r0 is 0, when that falls on the way.
  const widest = -r0 >= 0 && -r0 <= RHO * length ? w0 * cosh0 : Math.max(w0, w1);
  return {
    length,
    zoomOut: widest / Math.max(w0, w1),
    at: (part) =>
      ends(part, () => {
        const s = part * length;
        const u = (w0 / (rho2 * distance)) * (cosh0 * Math.tanh(RHO * s + r0) - sinh0);
        const w = (w0 * cosh0) / Math.cosh(RHO * s + r0);
        return { x: from.x + u * dx, y: from.y + u * dy, zoom: width / w };
      }),
  };
}

/**
 * How the camera gets from where it is to a step's place. It cuts when motion is reduced, when the
 * step is in another view, when there is no camera to start from, when the two are the same place,
 * and when the path would zoom out more than {@link MAX_TOUR_ZOOM_OUT} times beyond the wider of its
 * two views or take longer than {@link MAX_TOUR_MOVE_TIME}. Otherwise it moves along the path for
 * {@link TOUR_MOVE_TIME} ms plus {@link TOUR_MOVE_TIME_PER_UNIT} ms for each unit of its length.
 */
export function tourMove(
  from: ViewCamera | undefined,
  to: ViewCamera,
  screen: ScreenSize,
  options: { reducedMotion: boolean; sameView: boolean },
): TourMove {
  if (options.reducedMotion || !options.sameView || from === undefined) return { kind: 'cut' };
  const path = tourCameraPath(from, to, screen);
  if (!(path.length > 1e-9) || !(path.zoomOut <= MAX_TOUR_ZOOM_OUT)) return { kind: 'cut' };
  const duration = Math.round(TOUR_MOVE_TIME + TOUR_MOVE_TIME_PER_UNIT * path.length);
  if (!(duration <= MAX_TOUR_MOVE_TIME)) return { kind: 'cut' };
  return { kind: 'ease', duration, path };
}

/** Starts and ends gently, fastest at the middle: the sinusoidal ease of a tour's moves, from 0 to 1. */
export function tourEase(part: number): number {
  const t = Math.min(1, Math.max(0, part));
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** Starts and ends gently: the cubic ease of the canvas's other glides, from 0 to 1. */
export function easeInOut(part: number): number {
  const t = Math.min(1, Math.max(0, part));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

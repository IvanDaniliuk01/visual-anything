/**
 * Travelers along relations' lines (ADR 0110), worked out without PixiJS, so that the scene, the
 * canvas's layer and the exports place them alike:
 *
 * - A traveler goes from a directed line's `from` end to its `to` end at its speed, in canvas units a
 *   second, and starts again from its `from` end; an undirected line's travelers go from both ends
 *   toward its middle, each half carrying its own.
 * - Travelers on one piece of a line are `spacing` apart, or a little more, so that the piece holds a
 *   whole number of them and the one leaving its end comes back at its start in the same frame; a
 *   piece shorter than its spacing carries one.
 * - Standing still, as under reduced motion, in a view that keeps them still and in every export, the
 *   first stands half a spacing from its start and the others every spacing after it.
 * - Each is turned to its line's direction where it is, and mirrored across that direction while it
 *   heads left, so that it stays upright.
 * - A line whose length on screen is under twice its traveler's size carries none; at most
 *   {@link MOST_TRAVELERS} are drawn a frame, the lines nearest the screen's center keeping theirs.
 */
import type { CleanedImage } from '@visual-anything/core';
import type { Id, Traveler } from '@visual-anything/schema';
import type { Point, Rect } from './geometry';

/** How fast a traveler goes at each of its speeds, in canvas units a second. */
export const TRAVELER_SPEEDS = { slow: 60, normal: 120, fast: 240 } as const;
/** A traveler's larger side on screen when its appearance sets none, in pixels. */
export const TRAVELER_SIZE = 20;
/** The canvas units between travelers on one line when the appearance sets none. */
export const TRAVELER_SPACING = 240;
/** The most travelers the canvas draws a frame. */
export const MOST_TRAVELERS = 2000;

/** Whether a view's travelers move, stand still or are hidden (`ViewFile.travelers`, ADR 0110). */
export type TravelerMode = 'moving' | 'still' | 'hidden';

/** The mode a view's `travelers` field gives: left out, they move. */
export function travelerModeOf(travelers: 'still' | 'hidden' | undefined): TravelerMode {
  return travelers ?? 'moving';
}

/** What a line's appearance sends along it, as the canvas draws it. */
export interface LineTraveler {
  /** The package image's id. */
  image: Id;
  /** Its cleaned view, which the canvas and the exports draw. */
  picture: CleanedImage;
  /** Its larger side on screen, in pixels. */
  size: number;
  /** Canvas units a second. */
  speed: number;
  /** Canvas units between one and the next. */
  spacing: number;
  /** Whether it goes from the `from` end to the `to` end; otherwise from both ends to the middle. */
  directed: boolean;
}

/** A traveler as a line draws it, its defaults filled in. */
export function lineTravelerOf(
  traveler: Traveler,
  picture: CleanedImage,
  directed: boolean,
): LineTraveler {
  return {
    image: traveler.image,
    picture,
    size: traveler.size ?? TRAVELER_SIZE,
    speed: TRAVELER_SPEEDS[traveler.speed ?? 'normal'],
    spacing: traveler.spacing ?? TRAVELER_SPACING,
    directed,
  };
}

/** Whether two lines' travelers are drawn alike. */
export function sameLineTraveler(
  a: LineTraveler | undefined,
  b: LineTraveler | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.image === b.image &&
    a.picture === b.picture &&
    a.size === b.size &&
    a.speed === b.speed &&
    a.spacing === b.spacing &&
    a.directed === b.directed
  );
}

/** A route measured once: its points, the length up to each, and its whole length. */
export interface MeasuredRoute {
  points: readonly Point[];
  /** The length of the route from its start to each point. */
  at: Float64Array;
  length: number;
}

/** Measures a route. */
export function measureRoute(points: readonly Point[]): MeasuredRoute {
  const at = new Float64Array(points.length);
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1] as Point;
    const b = points[index] as Point;
    length += Math.hypot(b.x - a.x, b.y - a.y);
    at[index] = length;
  }
  return { points, at, length };
}

/** Where a traveler is: its middle, and the direction it heads, in radians, clockwise from right. */
export interface Place {
  x: number;
  y: number;
  angle: number;
}

/**
 * The place `distance` along a measured route, heading toward its end, or, `backward`, `distance`
 * from its end heading toward its start; written into `out`, which is returned. A route of no length
 * gives its start, heading right.
 */
export function placeAt(
  route: MeasuredRoute,
  distance: number,
  backward: boolean,
  out: Place,
): Place {
  const { points, at, length } = route;
  const first = points[0];
  if (!first || points.length < 2 || !(length > 0)) {
    out.x = first?.x ?? 0;
    out.y = first?.y ?? 0;
    out.angle = 0;
    return out;
  }
  const along = Math.min(length, Math.max(0, backward ? length - distance : distance));
  // The segment that holds it: the last whose start is at or before it, of some length.
  let low = 1;
  let high = points.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((at[middle] as number) < along) low = middle + 1;
    else high = middle;
  }
  let segment = low;
  while (
    segment < points.length - 1 &&
    (at[segment] as number) - (at[segment - 1] as number) <= 0
  ) {
    segment += 1;
  }
  while (segment > 1 && (at[segment] as number) - (at[segment - 1] as number) <= 0) segment -= 1;
  const a = points[segment - 1] as Point;
  const b = points[segment] as Point;
  const span = (at[segment] as number) - (at[segment - 1] as number);
  const t = span > 0 ? Math.min(1, Math.max(0, (along - (at[segment - 1] as number)) / span)) : 0;
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  out.angle = backward ? angle + (angle > 0 ? -Math.PI : Math.PI) : angle;
  return out;
}

/**
 * How a traveler heading at `angle` is drawn upright: turned to it, and mirrored across it while it
 * heads left, so that its top stays up. Straight up or down, it is not mirrored.
 */
export function uprightAt(angle: number): { rotation: number; mirrored: boolean } {
  return { rotation: angle, mirrored: headsLeft(angle) };
}

/** Whether a direction heads left, by more than a rounding error. */
export function headsLeft(angle: number): boolean {
  return Math.cos(angle) < -1e-9;
}

/**
 * How many travelers a piece of a line this long carries, and how far apart: as many as fit at
 * `spacing`, at least one, spread over it evenly.
 */
export function stepsOf(length: number, spacing: number): { count: number; step: number } {
  if (!(length > 0)) return { count: 0, step: 0 };
  const count = Math.max(1, Math.floor(length / Math.max(1, spacing)));
  return { count, step: length / count };
}

/**
 * How far along its piece the first traveler is: half a step when still (`seconds` undefined), and
 * so far on, wrapping, `seconds` into its travel.
 */
export function firstAt(step: number, speed: number, seconds: number | undefined): number {
  if (!(step > 0)) return 0;
  const start = step / 2;
  if (seconds === undefined) return start;
  const moved = (start + speed * seconds) % step;
  return moved < 0 ? moved + step : moved;
}

/** How many travelers a line this long carries in all: those of both halves, if undirected. */
export function travelerCount(
  length: number,
  traveler: Pick<LineTraveler, 'spacing' | 'directed'>,
): number {
  if (traveler.directed) return stepsOf(length, traveler.spacing).count;
  return 2 * stepsOf(length / 2, traveler.spacing).count;
}

/** Whether a line this long carries travelers at this scale: its length on screen at least twice their size. */
export function carriesAt(length: number, size: number, scale: number): boolean {
  return length * scale >= 2 * size;
}

/**
 * Visits each traveler of a line, `seconds` into its travel, or still when undefined, writing its
 * place into `out` before each visit. A directed line's travelers go from its start; an undirected
 * line's from each end to its middle.
 */
export function eachTraveler(
  route: MeasuredRoute,
  traveler: Pick<LineTraveler, 'spacing' | 'speed' | 'directed'>,
  seconds: number | undefined,
  out: Place,
  visit: (place: Place) => void,
): void {
  const pieces = traveler.directed ? 1 : 2;
  const length = route.length / pieces;
  const { count, step } = stepsOf(length, traveler.spacing);
  if (count === 0) return;
  const first = firstAt(step, traveler.speed, seconds);
  for (let piece = 0; piece < pieces; piece++) {
    const backward = piece === 1;
    for (let at = 0; at < count; at++) {
      placeAt(route, first + at * step, backward, out);
      visit(out);
    }
  }
}

/** Where a line's travelers stand still, as the exports draw them. */
export function stillPlaces(
  route: readonly Point[],
  traveler: Pick<LineTraveler, 'spacing' | 'speed' | 'directed'>,
): Place[] {
  const places: Place[] = [];
  const out: Place = { x: 0, y: 0, angle: 0 };
  eachTraveler(measureRoute(route), traveler, undefined, out, (place) => places.push({ ...place }));
  return places;
}

/** A line that may carry travelers this frame: where it lies, and how many it carries. */
export interface Candidate {
  bounds: Rect;
  count: number;
}

/**
 * Which candidates keep their travelers when at most `most` are drawn: all of them when they fit;
 * otherwise those nearest `center`, nearest first, until the next would not fit. Returns their
 * indexes, in the candidates' order when all fit.
 */
export function chooseLines(
  candidates: readonly Candidate[],
  center: Point,
  most: number,
): number[] {
  let total = 0;
  for (const each of candidates) total += each.count;
  if (total <= most) return candidates.map((_each, index) => index);
  const distances = candidates.map((each) => distanceToRect(center, each.bounds));
  const order = candidates.map((_each, index) => index);
  order.sort((a, b) => (distances[a] as number) - (distances[b] as number) || a - b);
  const kept: number[] = [];
  let left = most;
  for (const index of order) {
    const count = (candidates[index] as Candidate).count;
    if (count > left) break;
    kept.push(index);
    left -= count;
  }
  return kept;
}

/** How far a point is from a rectangle: 0 inside it. */
export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/** A picture's width and height when its larger side is `side`, its proportions kept. */
export function sizedPicture(
  picture: Pick<CleanedImage, 'width' | 'height'>,
  side: number,
): { width: number; height: number } {
  const long = Math.max(picture.width, picture.height);
  if (!(long > 0)) return { width: side, height: side };
  return { width: (side * picture.width) / long, height: (side * picture.height) / long };
}

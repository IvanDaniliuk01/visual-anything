/**
 * Where a tour's caption card goes, so that it does not cover what it explains (ADR 0077). When the
 * camera stops on a step, the card takes the side of the screen with the most room beyond the step's
 * marks, those revealed so far included; a reveal it would cover moves it again, and one it does not
 * cover leaves it where it is. A caption's `place` fixes a corner instead.
 */
import type { TourCaption } from '@visual-anything/schema';
import type { Camera } from '../canvas/camera';
import type { Rect, Size } from '../canvas/geometry';
import { relationLinesOf, type Scene } from '../canvas/scene';
import { rectAround } from '../canvas/spatial';

/** A side of the screen the card takes by itself. */
export type CaptionSide = 'bottom' | 'top' | 'right' | 'left';

/** A corner, or a place it was dragged to (ADR 0095), that a step's caption fixes. */
export type CaptionCorner = NonNullable<TourCaption['place']>;

/** Where the card is. */
export type CaptionPlace = CaptionSide | CaptionCorner;

/** What the card's `data-place` says: a side, a corner, or `free` where it was dragged to. */
export function placeName(place: CaptionPlace): string {
  return typeof place === 'string' ? place : 'free';
}

/**
 * How much room the card needs: its height along the top or the bottom of the screen, and its width
 * at the left or the right.
 */
export interface CardRoom {
  height: number;
  width: number;
}

/** The sides in the order they are preferred when they have as much room: the card's first. */
const SIDES: readonly CaptionSide[] = ['bottom', 'top', 'right', 'left'];

/** How close to a mark the card may come, in pixels, before it covers it. */
const CLEARANCE = 8;

/**
 * The side of the screen with the most room for the card beyond the marks, measured against what the
 * card needs on that side; the bottom when no mark is on screen, or when it has as much room as any.
 */
export function farthestSide(marks: readonly Rect[], screen: Size, card: CardRoom): CaptionSide {
  const shown = marks.flatMap((mark) => {
    const clipped = clip(mark, screen);
    return clipped ? [clipped] : [];
  });
  if (shown.length === 0) return 'bottom';
  const around = rectAround(
    shown.flatMap((rect) => [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ]),
  );
  const room: Record<CaptionSide, number> = {
    bottom: (screen.height - (around.y + around.height)) / Math.max(1, card.height),
    top: around.y / Math.max(1, card.height),
    right: (screen.width - (around.x + around.width)) / Math.max(1, card.width),
    left: around.x / Math.max(1, card.width),
  };
  let best: CaptionSide = 'bottom';
  for (const side of SIDES) if (room[side] > room[best] + 1e-9) best = side;
  return best;
}

/** What the card's place is worked out from. */
export interface CaptionPlacing {
  /** Where it is now. */
  current?: CaptionPlace | undefined;
  /** The corner the step's caption fixes, if any. */
  fixed?: CaptionCorner | undefined;
  /** Where the step's marks are on screen, those revealed so far included. */
  marks: readonly Rect[];
  screen: Size;
  card: CardRoom;
  /** Where the card is on screen now, when known. */
  shown?: Rect | undefined;
  /** Whether the camera just stopped on the step, so that the card takes its side afresh. */
  fresh: boolean;
}

/**
 * Where the card goes: the corner the step fixes; the farthest side when the camera stops on a step;
 * and otherwise, as after a reveal, where it is unless it would cover a mark there.
 */
export function placeCaption(placing: CaptionPlacing): CaptionPlace {
  const { current, fixed, marks, screen, card, shown, fresh } = placing;
  if (fixed !== undefined) return fixed;
  if (fresh || current === undefined) return farthestSide(marks, screen, card);
  if (shown && marks.some((mark) => meets(grow(shown, CLEARANCE), mark))) {
    return farthestSide(marks, screen, card);
  }
  return current;
}

/**
 * Where the shapes and lines with these keys are on screen through a camera: a shape's rectangle,
 * and the rectangle around a line's route.
 */
export function marksOnScreen(scene: Scene, keys: ReadonlySet<string>, camera: Camera): Rect[] {
  if (keys.size === 0) return [];
  const onScreen = (rect: Rect): Rect => ({
    x: rect.x * camera.scale + camera.x,
    y: rect.y * camera.scale + camera.y,
    width: rect.width * camera.scale,
    height: rect.height * camera.scale,
  });
  const rects: Rect[] = [];
  for (const shape of scene.shapes) if (keys.has(shape.key)) rects.push(onScreen(shape.rect));
  const lines = relationLinesOf(scene);
  for (const key of keys) {
    const line = lines.get(key);
    if (line && line.route.length > 0) rects.push(onScreen(rectAround(line.route)));
  }
  return rects;
}

/** The part of a rectangle on screen; none when it is wholly off it. */
function clip(rect: Rect, screen: Size): Rect | undefined {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const right = Math.min(screen.width, rect.x + rect.width);
  const bottom = Math.min(screen.height, rect.y + rect.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}

function grow(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function meets(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

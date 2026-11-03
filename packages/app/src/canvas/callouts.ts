/**
 * Callouts around a solid's picture (ADR 0091). In a drawing with parts that shows a solid, a content
 * that is not an anchored part and has a relation to one is a callout: it is placed around the
 * picture, beside the part it relates to first, rather than below the picture with the other
 * contents.
 *
 * - **Where it goes.** From the picture's middle outward through its part's point, to where that ray
 *   leaves the picture: the side it leaves by is the callout's side, and the callout stands
 *   `CALLOUT_GAP` outside it, level with its part's point, so that its line runs straight in.
 * - **Spread around.** A side whose callouts would run past the picture's span gives those nearest
 *   a corner to the side beside it, while that side runs past its own span by less.
 * - **Never on one another.** The callouts of a side keep their parts' order along it, spaced
 *   `CALLOUT_SPACING` apart, kept within the picture's span while they fit and past both its ends
 *   alike otherwise, so that the drawing grows to hold them.
 * - **Their lines** leave the callout's side that faces the picture, run outside it to the height,
 *   or the place across, of the part's point, and enter the picture only in their last segment
 *   (`calloutRoute`).
 *
 * Pure, with no PixiJS, as the scene is: the scene places callouts that the view stores no position
 * for, and layout stores where they go (`layout/input.ts`).
 */
import type { Point, Rect, Size } from './geometry';

/** The side of a picture a callout stands beside. */
export type CalloutSide = 'left' | 'right' | 'top' | 'bottom';

/** How far outside its picture a callout stands, in canvas units. */
export const CALLOUT_GAP = 40;

/** Between two callouts on one side, in canvas units. */
export const CALLOUT_SPACING = 16;

/** How far inside its callout's side a line may leave it, from the side's ends. */
const LINE_INSET = 6;

/** A callout to place: its size, and its part's point, from the picture's top left. */
export interface CalloutToPlace {
  width: number;
  height: number;
  point: Point;
}

/** Where a callout goes: its side, and its top left, from the picture's top left. */
export interface PlacedCallout {
  side: CalloutSide;
  x: number;
  y: number;
}

/**
 * The side a part's point sends its callout to: the side of the picture that the ray from its middle
 * through the point leaves by, and where along that side it leaves. A point at the middle goes right.
 */
export function calloutSideOf(picture: Size, point: Point): { side: CalloutSide; along: number } {
  const halfWidth = picture.width / 2;
  const halfHeight = picture.height / 2;
  const dx = point.x - halfWidth;
  const dy = point.y - halfHeight;
  if (dx === 0 && dy === 0) return { side: 'right', along: halfHeight };
  // Across: the ray leaves by a left or right side when it reaches it before the top or bottom.
  if (Math.abs(dx) * picture.height >= Math.abs(dy) * picture.width) {
    const along = halfHeight + (dy * halfWidth) / Math.abs(dx);
    return { side: dx >= 0 ? 'right' : 'left', along };
  }
  const along = halfWidth + (dx * halfHeight) / Math.abs(dy);
  return { side: dy >= 0 ? 'bottom' : 'top', along };
}

/**
 * Places callouts around a picture of this size, each beside its part's point (see the module's
 * comment), in the order given; positions are from the picture's top left and may be negative.
 */
export function placeCallouts(picture: Size, callouts: readonly CalloutToPlace[]): PlacedCallout[] {
  const exits = callouts.map((callout) => calloutSideOf(picture, callout.point));
  const chosen = balancedSides(picture, callouts, exits);
  const placed: PlacedCallout[] = callouts.map((_, at) => ({
    side: chosen[at] as CalloutSide,
    x: 0,
    y: 0,
  }));
  for (const side of SIDES) {
    const across = side === 'left' || side === 'right';
    // A callout on the side its ray leaves by stands level with its part's point, so that its line
    // runs straight in where it can; one moved to a side beside it, as near their corner as it goes.
    const members = callouts
      .map((callout, at) => {
        const exit = exits[at] as Exit;
        const along =
          exit.side !== side
            ? alongOn(side, exit, picture)
            : across
              ? callout.point.y
              : callout.point.x;
        return { callout, at, along };
      })
      .filter(({ at }) => (placed[at] as PlacedCallout).side === side)
      // Their parts' order along the side; the model's order between equals.
      .sort((a, b) => a.along - b.along || a.at - b.at);
    if (members.length === 0) continue;
    const sizeOf = (callout: CalloutToPlace) => (across ? callout.height : callout.width);
    const span = across ? picture.height : picture.width;
    const starts = spread(
      members.map(({ callout, along }) => along - sizeOf(callout) / 2),
      members.map(({ callout }) => sizeOf(callout)),
      span,
    );
    members.forEach(({ callout, at }, index) => {
      const start = starts[index] as number;
      const place = placed[at] as PlacedCallout;
      if (across) {
        place.y = start;
        place.x = side === 'left' ? -CALLOUT_GAP - callout.width : picture.width + CALLOUT_GAP;
      } else {
        place.x = start;
        place.y = side === 'top' ? -CALLOUT_GAP - callout.height : picture.height + CALLOUT_GAP;
      }
    });
  }
  return apart(callouts, placed);
}

const SIDES = ['left', 'right', 'top', 'bottom'] as const;

/** Where a part's ray leaves its picture: by which side, and where along it. */
type Exit = { side: CalloutSide; along: number };

/** The sides beside each side, which meet it at a corner. */
const NEIGHBOURS: Record<CalloutSide, readonly CalloutSide[]> = {
  left: ['top', 'bottom'],
  right: ['top', 'bottom'],
  top: ['left', 'right'],
  bottom: ['left', 'right'],
};

/**
 * Where a ray's exit lies along a side, measured along the picture's outline from that side's start
 * (its top, or its left): within the side for an exit on it; for an exit on a side beside it,
 * before its start or past its end by how far along the outline the exit lies from their corner.
 */
function alongOn(side: CalloutSide, exit: Exit, picture: Size): number {
  if (exit.side === side) return exit.along;
  const { width, height } = picture;
  const span = side === 'left' || side === 'right' ? height : width;
  const fromCorner = (start: boolean, distance: number) => (start ? -distance : span + distance);
  switch (side) {
    case 'left':
    case 'right': {
      // The corner with the top or bottom side: the exit's distance from it along that side.
      const distance = side === 'left' ? exit.along : width - exit.along;
      return fromCorner(exit.side === 'top', distance);
    }
    case 'top':
    case 'bottom': {
      const distance = side === 'top' ? exit.along : height - exit.along;
      return fromCorner(exit.side === 'left', distance);
    }
  }
}

/**
 * Which side each callout stands beside: the side its part's ray leaves by, unless its callouts run
 * past the picture's span along it: then they move to the sides beside it, one at a time, the one
 * whose part lies nearest its new side first, while that side then runs past its span by less than
 * theirs did, so that the callouts spread around the picture rather than in one long row.
 */
function balancedSides(
  picture: Size,
  callouts: readonly CalloutToPlace[],
  exits: readonly Exit[],
): CalloutSide[] {
  const sides = exits.map((exit) => exit.side);
  const lengthOn = (side: CalloutSide, callout: CalloutToPlace) =>
    side === 'left' || side === 'right' ? callout.height : callout.width;
  const spanOf = (side: CalloutSide) =>
    side === 'left' || side === 'right' ? picture.height : picture.width;
  const need = (side: CalloutSide, extra?: CalloutToPlace) => {
    let total = 0;
    let count = 0;
    callouts.forEach((callout, at) => {
      if (sides[at] !== side) return;
      total += lengthOn(side, callout);
      count += 1;
    });
    if (extra) {
      total += lengthOn(side, extra);
      count += 1;
    }
    return total + Math.max(0, count - 1) * CALLOUT_SPACING;
  };
  const over = (side: CalloutSide, extra?: CalloutToPlace) =>
    Math.max(0, need(side, extra) - spanOf(side));
  // Each move lowers the most a side runs past its span, so a few always suffice.
  for (let moves = callouts.length * 2; moves > 0; moves--) {
    let best: { at: number; to: CalloutSide; cost: number } | undefined;
    for (const side of SIDES) {
      const past = over(side);
      if (past <= 0) continue;
      callouts.forEach((callout, at) => {
        if (sides[at] !== side) return;
        for (const to of NEIGHBOURS[side]) {
          if (over(to, callout) >= past) continue;
          const along = alongOn(to, exits[at] as Exit, picture);
          const cost = along < 0 ? -along : along - spanOf(to);
          if (!best || cost < best.cost) best = { at, to, cost };
        }
      });
    }
    if (!best) break;
    sides[best.at] = best.to;
  }
  return sides;
}

/**
 * Starts along a side for items wanted at `wanted`, in order, each `sizes` long: none overlapping,
 * `CALLOUT_SPACING` apart, each as near its wish as that allows, within 0 and `span` while they fit,
 * and otherwise past both ends alike, centered on the side.
 */
function spread(wanted: readonly number[], sizes: readonly number[], span: number): number[] {
  const count = wanted.length;
  const sizeAt = (at: number) => sizes[at] as number;
  const total = sizes.reduce((sum, size) => sum + size, 0) + (count - 1) * CALLOUT_SPACING;
  const low = Math.min(0, (span - total) / 2);
  const high = low + Math.max(span, total);
  const starts = wanted.map((each) => Math.max(low, each));
  // Down the side, each clear of the one before it.
  for (let at = 1; at < count; at++) {
    starts[at] = Math.max(
      starts[at] as number,
      (starts[at - 1] as number) + sizeAt(at - 1) + CALLOUT_SPACING,
    );
  }
  // Back within the room from its end, each clear of the one after it.
  const last = count - 1;
  starts[last] = Math.min(starts[last] as number, high - sizeAt(last));
  for (let at = last - 1; at >= 0; at--) {
    starts[at] = Math.min(
      starts[at] as number,
      (starts[at + 1] as number) - CALLOUT_SPACING - sizeAt(at),
    );
  }
  return starts;
}

/**
 * Moves outward, away from the picture, each callout that would cover one placed before it, as two
 * sides that both ran past their ends would at a corner. Each move goes outward by what they overlap,
 * so a few always suffice.
 */
function apart(callouts: readonly CalloutToPlace[], placed: PlacedCallout[]): PlacedCallout[] {
  const rects: Rect[] = [];
  placed.forEach((place, at) => {
    const { width, height } = callouts[at] as CalloutToPlace;
    let rect: Rect = { x: place.x, y: place.y, width, height };
    for (let tries = rects.length; tries >= 0; tries--) {
      const covered = rects.find((other) => overlapping(rect, other));
      if (!covered) break;
      switch (place.side) {
        case 'left':
          rect = { ...rect, x: covered.x - CALLOUT_SPACING - width };
          break;
        case 'right':
          rect = { ...rect, x: covered.x + covered.width + CALLOUT_SPACING };
          break;
        case 'top':
          rect = { ...rect, y: covered.y - CALLOUT_SPACING - height };
          break;
        case 'bottom':
          rect = { ...rect, y: covered.y + covered.height + CALLOUT_SPACING };
          break;
      }
    }
    place.x = rect.x;
    place.y = rect.y;
    rects.push(rect);
  });
  return placed;
}

/** Whether two rectangles come nearer than `CALLOUT_SPACING`. */
function overlapping(a: Rect, b: Rect): boolean {
  const gap = CALLOUT_SPACING - 1e-6;
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

/**
 * The side of a picture a callout lies beyond, as it is placed now, which may differ from the side
 * its part sends it to once pinned elsewhere: the one it lies furthest beyond; none when it covers
 * the picture.
 */
export function calloutSideAgainst(callout: Rect, picture: Rect): CalloutSide | undefined {
  const gaps: [CalloutSide, number][] = [
    ['left', picture.x - (callout.x + callout.width)],
    ['right', callout.x - (picture.x + picture.width)],
    ['top', picture.y - (callout.y + callout.height)],
    ['bottom', callout.y - (picture.y + picture.height)],
  ];
  let best: [CalloutSide, number] | undefined;
  for (const gap of gaps) if (gap[1] >= 0 && (!best || gap[1] > best[1])) best = gap;
  return best?.[0];
}

/**
 * The route of a line from a callout to its part's point (ADR 0091): out of the callout's side that
 * faces the picture, at the point's height, or place across, where that side reaches it; otherwise
 * from the side's middle into the gap before the picture, along to the point's height there, and
 * into the point. Only its last segment lies inside the picture. The farther it runs along the gap,
 * the nearer the picture it turns (`turnAt`), so that callouts stacked beside one point do not run
 * their lines over one another.
 */
export function calloutRoute(
  callout: Rect,
  side: CalloutSide,
  point: Point,
  picture: Rect,
): Point[] {
  const across = side === 'left' || side === 'right';
  if (across) {
    const x = side === 'left' ? callout.x + callout.width : callout.x;
    const edge = side === 'left' ? picture.x : picture.x + picture.width;
    const y = within(point.y, callout.y, callout.height);
    if (y === point.y) return [{ x, y }, point];
    const turn = turnAt(x, edge, point.y - y);
    return [{ x, y }, { x: turn, y }, { x: turn, y: point.y }, point];
  }
  const y = side === 'top' ? callout.y + callout.height : callout.y;
  const edge = side === 'top' ? picture.y : picture.y + picture.height;
  const x = within(point.x, callout.x, callout.width);
  if (x === point.x) return [{ x, y }, point];
  const turn = turnAt(y, edge, point.x - x);
  return [{ x, y }, { x, y: turn }, { x: point.x, y: turn }, point];
}

/** How far along the run the most a line turns at, from its callout toward the picture. */
const TURN_FAR = 200;

/**
 * Where in the gap from a callout's side, `from`, to the picture's edge a line turns that then runs
 * `along` in the gap: a quarter of the way for a short run, three quarters for a run of `TURN_FAR`
 * or more.
 */
function turnAt(from: number, edge: number, along: number): number {
  const share = 0.25 + 0.5 * Math.min(1, Math.abs(along) / TURN_FAR);
  return from + (edge - from) * share;
}

/** A place along a side from `start`, `length` long: `wanted` where the side reaches it, else its middle. */
function within(wanted: number, start: number, length: number): number {
  const inset = Math.min(LINE_INSET, length / 2);
  if (wanted >= start + inset && wanted <= start + length - inset) return wanted;
  return start + length / 2;
}

/**
 * Resizing a shape by hand (ADR 0074), worked out with no drawing: which shapes take a size, where
 * their handles are, the rectangle a handle dragged gives, and the command that stores it.
 *
 * - A handle at a corner moves the two sides that meet there; one at the middle of a side moves that
 *   side. The other sides stay, or, from the middle, move the other way as far.
 * - Keeping proportions, the axis the pointer changes the most drives the other; from a side, the
 *   other axis grows and shrinks around its middle.
 * - No side goes below 16 canvas units, and a container never below the box around what it holds.
 * - The sides that move land where the snapping says: on an alignment guide, or on the grid.
 *
 * Letting go stores the size and the place with `set-positions`, pinned, as one action named
 * `Resize "Booking agent"`. A container whose top left corner moves keeps what it holds where it is
 * on the canvas: the same action stores the places of its contents, and of the bend points kept
 * relative to it, from the new corner.
 */
import type { Command, ProjectSnapshot, SetRouteCommand } from '@visual-anything/core';
import { positionKey } from '@visual-anything/core';
import type { Id, Note, Picture, ShapePosition, ViewFile } from '@visual-anything/schema';
import type { GuideEdge, GuideEdges } from './align';
import { boundsOf, type Point, type Rect } from './geometry';
import type { IndexedScene } from './hit';
import type { DrawnEnd, ElementShape } from './scene';

/** The handles, by the compass: the corners and the middles of the sides. */
export type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Every handle, clockwise from the top left corner, as they are drawn and pressed. */
const EVERY_HANDLE: readonly HandleName[] = Object.freeze([
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]);

/** The handles of a shape whose width alone changes, as a table's. */
const SIDE_HANDLES: readonly HandleName[] = Object.freeze(['e', 'w']);

/** The fewest canvas units a side of a shape resized by hand has. */
export const MIN_SIDE = 16;

/** What a shape takes when resized by hand: a width and a height, or a width alone. */
export type SizeTaken = 'both' | 'width';

/**
 * What a shape takes when resized by hand: none for a row or an anchored part, which have no size of
 * their own (ADR 0023, ADR 0067), for a collapsed container, drawn at its component's size, or for a
 * shape an overlay sizes, drawn at another size than it is stored at (ADR 0055); a width alone for a
 * shape that draws rows, whose height its rows give; both otherwise.
 */
export function sizeTakenBy(shape: ElementShape): SizeTaken | undefined {
  if (shape.row !== undefined || shape.part?.inDrawing === true) return undefined;
  if (shape.collapsed !== undefined || shape.laidOut !== undefined) return undefined;
  return shape.rowCount === undefined ? 'both' : 'width';
}

/** Whether a shape keeps its proportions as it resizes, unless Shift is held: its free geometry says so. */
export function keepsProportions(shape: ElementShape): boolean {
  return shape.outline?.source.outline.keepProportions === true;
}

/** The handles a shape shows for what it takes. */
export function handlesFor(taken: SizeTaken): readonly HandleName[] {
  return taken === 'both' ? EVERY_HANDLE : SIDE_HANDLES;
}

/** Which sides a handle moves on each axis: −1 the start side, 1 the end side, 0 neither. */
export function sidesOf(handle: HandleName): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  return {
    x: handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0,
    y: handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0,
  };
}

/** Where a handle sits on a rectangle. */
export function handlePoint(rect: Rect, handle: HandleName): Point {
  const { x, y } = sidesOf(handle);
  return {
    x: rect.x + ((x + 1) / 2) * rect.width,
    y: rect.y + ((y + 1) / 2) * rect.height,
  };
}

/** The lines of a rectangle that move as a handle is dragged, which alignment guides look at. */
export function movingEdges(handle: HandleName, fromMiddle: boolean): GuideEdges {
  const { x, y } = sidesOf(handle);
  const of = (side: -1 | 0 | 1): GuideEdge[] =>
    side === 0 ? [] : fromMiddle ? ['start', 'end'] : [side < 0 ? 'start' : 'end'];
  return { x: of(x), y: of(y) };
}

export interface ResizeOptions {
  /** Keeps the rectangle's proportions. */
  proportional?: boolean;
  /** Resizes around the rectangle's middle: the other sides move the other way as far. */
  fromMiddle?: boolean;
  /** The fewest units a side that changes has; 16 by default. */
  min?: number;
  /** A box the rectangle must hold whatever happens: the contents of a container. */
  holds?: Rect;
  /** Where a side that the pointer moves lands, from where the pointer puts it, on each axis. */
  snap?: { x?: (value: number) => number; y?: (value: number) => number };
}

/** What stays on an axis as it resizes: its start side, its end side, its middle, or all of it. */
type Stays = 'start' | 'end' | 'middle' | 'all';

/** One axis of a resize: where it starts, how long it is, what stays. */
interface AxisSize {
  start: number;
  size: number;
  stays: Stays;
}

/** An axis resized by the side a handle holds, `by` units, its moving side where `snap` puts it. */
function drivenAxis(
  start: number,
  size: number,
  side: -1 | 0 | 1,
  by: number,
  fromMiddle: boolean,
  snap: (value: number) => number,
): AxisSize {
  if (side === 0) return { start, size, stays: 'all' };
  const middle = start + size / 2;
  if (side > 0) {
    const end = snap(start + size + by);
    return fromMiddle
      ? { start, size: 2 * (end - middle), stays: 'middle' }
      : { start, size: end - start, stays: 'start' };
  }
  const begin = snap(start + by);
  return fromMiddle
    ? { start, size: 2 * (middle - begin), stays: 'middle' }
    : { start, size: start + size - begin, stays: 'end' };
}

/** The fewest units an axis may have for what it must hold, from the side or the middle that stays. */
function holdsAlong(
  axis: AxisSize,
  from: number,
  length: number,
  held: number,
  heldLength: number,
) {
  switch (axis.stays) {
    case 'start':
      return held + heldLength - from;
    case 'end':
      return from + length - held;
    case 'middle': {
      const middle = from + length / 2;
      return 2 * Math.max(middle - held, held + heldLength - middle);
    }
    case 'all':
      return 0;
  }
}

/** Where an axis lies once it has its size: from the side or the middle that stays, sides rounded out. */
function placed(axis: AxisSize, from: number, length: number): { start: number; size: number } {
  if (axis.stays === 'all') return { start: from, size: length };
  const begin =
    axis.stays === 'start'
      ? from
      : axis.stays === 'end'
        ? from + length - axis.size
        : from + length / 2 - axis.size / 2;
  const end = begin + axis.size;
  // A side that stays keeps its place; one that moves is rounded outwards, so as to cut nothing held.
  const first = axis.stays === 'start' ? Math.round(begin) : Math.floor(begin + 1e-9);
  const last = axis.stays === 'end' ? Math.round(end) : Math.ceil(end - 1e-9);
  return { start: first, size: Math.max(1, last - first) };
}

/**
 * The rectangle a handle dragged `delta` canvas units gives, from `start`: in whole units, no side
 * that changes below the minimum, and holding `holds` whole.
 */
export function resizedRect(
  start: Rect,
  handle: HandleName,
  delta: Point,
  options: ResizeOptions = {},
): Rect {
  const sides = sidesOf(handle);
  const fromMiddle = options.fromMiddle === true;
  const min = options.min ?? MIN_SIDE;
  const same = (value: number) => value;
  const x = drivenAxis(start.x, start.width, sides.x, delta.x, fromMiddle, options.snap?.x ?? same);
  const y = drivenAxis(
    start.y,
    start.height,
    sides.y,
    delta.y,
    fromMiddle,
    options.snap?.y ?? same,
  );

  const proportional =
    options.proportional === true &&
    start.width > 0 &&
    start.height > 0 &&
    (x.stays !== 'all' || y.stays !== 'all');
  // Keeping proportions, the axis the pointer changes the most drives, and the other follows around
  // its middle when no handle holds it.
  let factor = 1;
  if (proportional) {
    const drivesX =
      x.stays !== 'all' &&
      (y.stays === 'all' ||
        Math.abs(x.size / start.width - 1) >= Math.abs(y.size / start.height - 1));
    factor = drivesX ? x.size / start.width : y.size / start.height;
    if (x.stays === 'all') x.stays = 'middle';
    if (y.stays === 'all') y.stays = 'middle';
  }

  const holds = options.holds;
  const fewest = (axis: AxisSize, from: number, length: number, held?: number, along?: number) =>
    axis.stays === 'all'
      ? 0
      : Math.max(
          min,
          held === undefined || along === undefined
            ? 0
            : holdsAlong(axis, from, length, held, along),
        );
  const fewestX = fewest(x, start.x, start.width, holds?.x, holds?.width);
  const fewestY = fewest(y, start.y, start.height, holds?.y, holds?.height);
  if (proportional) {
    factor = Math.max(factor, fewestX / start.width, fewestY / start.height);
    x.size = start.width * factor;
    y.size = start.height * factor;
  } else {
    x.size = Math.max(x.size, fewestX);
    y.size = Math.max(y.size, fewestY);
  }

  const across = placed(x, start.x, start.width);
  const down = placed(y, start.y, start.height);
  return { x: across.start, y: down.start, width: across.size, height: down.size };
}

/**
 * The box a container's shape must hold: around the extents of what sits directly in it, but its rows
 * and anchored parts, which have no places of their own; undefined when it holds none of those.
 */
export function holdsOf(indexed: IndexedScene, shape: ElementShape): Rect | undefined {
  if (shape.collapsed !== undefined) return undefined;
  const contents = (indexed.contentsOf.get(shape.key) ?? []).filter(
    (content) => content.row === undefined && content.part?.inDrawing !== true,
  );
  return boundsOf(contents.map((content) => content.extent));
}

/**
 * The command that stores a shape resized by hand to `rect`, in canvas units: its place and size,
 * pinned, as one action named `Resize "X"`; and, when its top left corner moved, the places of what it
 * holds and of the bend points kept relative to it, so that they stay where they are on the canvas.
 * A shape that takes a width alone keeps its stored height. Undefined when nothing changes.
 */
export function resizeCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  shape: ElementShape,
  rect: Rect,
): Command | undefined {
  // Found here rather than through the route commands, which the read-only page never holds.
  const view = project.views.find((each) => each.id === viewId);
  const taken = sizeTakenBy(shape);
  if (!view || !taken) return undefined;
  const dx = Math.round(rect.x - shape.rect.x);
  const dy = Math.round(rect.y - shape.rect.y);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const size: { width?: number; height?: number } = { ...shape.storedSize };
  if (width !== shape.rect.width) size.width = width;
  if (taken === 'both' && height !== shape.rect.height) size.height = height;
  const resized = width !== shape.rect.width || (taken === 'both' && height !== shape.rect.height);
  if (dx === 0 && dy === 0 && !resized) return undefined;

  const positions = new Map<string, ShapePosition>();
  const put = (position: ShapePosition) => {
    const key = positionKey(position);
    if (!positions.has(key)) positions.set(key, position);
  };
  put({
    element: shape.element,
    ...(shape.container === undefined ? {} : { container: shape.container }),
    x: Math.round(shape.offset.x + dx),
    y: Math.round(shape.offset.y + dy),
    ...size,
    pinned: true,
  });
  const commands: Command[] = [];
  if (dx !== 0 || dy !== 0) {
    for (const content of indexed.contentsOf.get(shape.key) ?? []) {
      if (content.row !== undefined || content.part?.inDrawing === true) continue;
      put({
        element: content.element,
        container: shape.element,
        x: Math.round(content.offset.x - dx),
        y: Math.round(content.offset.y - dy),
        ...content.storedSize,
        ...(content.positioned === 'pinned' ? { pinned: true } : {}),
      });
    }
    commands.push(...keptBendPoints(indexed, view, shape, { x: dx, y: dy }));
  }
  return {
    type: 'batch',
    label: `Resize "${shape.name}"`,
    commands: [
      { type: 'set-positions', view: view.id, positions: [...positions.values()] },
      ...commands,
    ],
  };
}

/**
 * The bend points kept relative to a container's shape, of the lines drawn inside it, moved back by
 * how far its corner went, so that they stay where they are on the canvas.
 */
function keptBendPoints(
  indexed: IndexedScene,
  view: ViewFile,
  shape: ElementShape,
  moved: Point,
): SetRouteCommand[] {
  if (!view.routes) return [];
  const inside = `${shape.key}/`;
  const within = (end: DrawnEnd) => end.kind === 'shape' && end.key.startsWith(inside);
  const commands: SetRouteCommand[] = [];
  for (const line of indexed.scene.relations) {
    const hand = line.hand;
    const ends = line.ends;
    if (!hand || hand.route.bendPointsIn !== shape.element || hand.route.bendPoints.length === 0) {
      continue;
    }
    if (hand.bendOrigin.x !== shape.rect.x || hand.bendOrigin.y !== shape.rect.y) continue;
    if (!ends || !within(ends.from) || !within(ends.to)) continue;
    commands.push({
      type: 'set-route',
      view: view.id,
      relation: line.relation,
      bendPoints: hand.route.bendPoints.map((point) => ({
        x: Math.round(point.x - moved.x),
        y: Math.round(point.y - moved.y),
      })),
      container: shape.element,
    });
  }
  return commands;
}

/**
 * The command that stores a note or a picture resized by hand to `rect`, as one action; undefined when
 * it stays.
 */
export function resizeNoteCommand(view: ViewFile, id: Id, rect: Rect): Command | undefined {
  const note = view.freeShapes.find(
    (shape): shape is Note | Picture =>
      (shape.kind === 'note' || shape.kind === 'picture') && shape.id === id,
  );
  if (!note) return undefined;
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (x === note.x && y === note.y && width === note.width && height === note.height) {
    return undefined;
  }
  return {
    type: 'batch',
    label: note.kind === 'picture' ? 'Resize a picture' : 'Resize a note',
    commands: [
      { type: 'update-free-shape', view: view.id, shape: { ...note, x, y, width, height } },
    ],
  };
}

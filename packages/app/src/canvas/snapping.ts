/**
 * Snapping, as the canvas's gestures use it (A3): what snaps is what is stored. When shapes move
 * together, only the position of the moving shape that carries the pressed one is stored for it and
 * what it holds, so that one, the anchor, lands on a multiple of 8 canvas units inside its container;
 * every moving shape moves by the same distance, and keeps its place relative to it.
 */
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import type { DropAim } from './drop';
import type { Point } from './geometry';
import { GRID_STEP, nudgedOffset, snappedDelta, unitsText } from './grid';
import { movingShapes } from './gestures';
import type { Hit, IndexedScene } from './hit';
import type { Direction } from './navigation';
import type { ElementShape } from './scene';

/** Where an anchor snaps: its container's corner, or the canvas's origin in World. */
export interface SnapFrame {
  origin: Point;
  /** The container's shape; absent in World. */
  container?: ElementShape;
}

export const WORLD_FRAME: SnapFrame = Object.freeze({ origin: Object.freeze({ x: 0, y: 0 }) });

/** What snaps while shapes are dragged: where it is, in canvas units, and the frame it sits in. */
export interface Anchor {
  at: Point;
  home: SnapFrame;
}

/** The frame an element's shape sits in: its container's shape, or World. */
export function frameOf(indexed: IndexedScene, shape: ElementShape): SnapFrame {
  const container =
    shape.containerShape === undefined ? undefined : indexed.byKey.get(shape.containerShape);
  return container
    ? { origin: { x: container.rect.x, y: container.rect.y }, container }
    : WORLD_FRAME;
}

/** The moving shape that carries the shape with this key: itself, or its nearest container moving. */
export function carrierOf(moving: readonly ElementShape[], key: string): ElementShape | undefined {
  let carrier: ElementShape | undefined;
  for (const shape of moving) {
    if (shape.key === key) return shape;
    if (key.startsWith(`${shape.key}/`) && shape.key.length > (carrier?.key.length ?? -1)) {
      carrier = shape;
    }
  }
  return carrier;
}

/**
 * The anchor of a drag that pressed `pressed`: the moving shape that carries it, or the note or arrow
 * pressed, whose own position is stored, in World. None for a relation, which is never dragged.
 */
export function dragAnchor(
  indexed: IndexedScene,
  selection: Selection,
  pressed: Hit,
): Anchor | undefined {
  switch (pressed.kind) {
    case 'shape': {
      const anchor =
        carrierOf(movingShapes(indexed, selection), pressed.shape.key) ?? pressed.shape;
      return { at: { x: anchor.rect.x, y: anchor.rect.y }, home: frameOf(indexed, anchor) };
    }
    case 'note':
      return { at: { x: pressed.note.rect.x, y: pressed.note.rect.y }, home: WORLD_FRAME };
    case 'arrow':
      return { at: { ...pressed.arrow.from }, home: WORLD_FRAME };
    case 'relation':
      return undefined;
  }
}

/**
 * The frame dragged shapes land in, as a release would do now: the container a drop puts them in,
 * World when it takes them out, and otherwise the frame they sit in.
 */
export function aimFrame(aim: DropAim | undefined, home: SnapFrame): SnapFrame {
  switch (aim?.kind) {
    case 'into':
      return { origin: { x: aim.target.rect.x, y: aim.target.rect.y }, container: aim.target };
    case 'out':
      return WORLD_FRAME;
    case 'pending':
      return aimFrame(aim.fallback, home);
    default:
      return home;
  }
}

/** How far dragged shapes move: by `raw`, or, while snapping, so that the anchor lands on the grid. */
export function snapDrag(
  anchor: Anchor | undefined,
  raw: Point,
  frame: SnapFrame,
  snapping: boolean,
): Point {
  if (!snapping || !anchor) return raw;
  return snappedDelta(anchor.at, raw, frame.origin);
}

/**
 * What the readout beside the pointer says: where the anchor would be stored, in canvas units, and
 * in which container. People's names are never translated.
 */
export function readoutText(anchor: Anchor, delta: Point, frame: SnapFrame): string {
  const x = unitsText(anchor.at.x + delta.x - frame.origin.x);
  const y = unitsText(anchor.at.y + delta.y - frame.origin.y);
  return frame.container
    ? t('{x}, {y} in {container}', { x, y, container: frame.container.name })
    : `${x}, ${y}`;
}

const AXES: Record<Direction, { axis: 'x' | 'y'; sign: 1 | -1 }> = {
  left: { axis: 'x', sign: -1 },
  right: { axis: 'x', sign: 1 },
  up: { axis: 'y', sign: -1 },
  down: { axis: 'y', sign: 1 },
};

/**
 * How far Shift with an arrow key moves the selection: one grid step; while snapping, as far as takes
 * the anchor to the next grid line in that direction. The anchor is the moving shape that carries the
 * shape the keys act on: the current one when it is selected, or else the first selected.
 */
export function nudgeStep(
  indexed: IndexedScene,
  selection: Selection,
  current: string | undefined,
  direction: Direction,
  snapping: boolean,
): Point {
  const { axis, sign } = AXES[direction];
  const step = { x: 0, y: 0 };
  step[axis] = sign * GRID_STEP;
  if (!snapping) return step;
  const offset = anchorOffset(indexed, selection, current);
  if (offset === undefined) return step;
  step[axis] = nudgedOffset(offset[axis], sign) - offset[axis];
  return step;
}

/** Where the anchor of a nudge is stored: its offset in its container, or a free shape's position. */
function anchorOffset(
  indexed: IndexedScene,
  selection: Selection,
  current: string | undefined,
): Point | undefined {
  const currentShape = current === undefined ? undefined : indexed.byKey.get(current);
  const [first] = selection.elements;
  const reference =
    currentShape && selection.elements.has(currentShape.element)
      ? currentShape
      : first === undefined
        ? undefined
        : indexed.byElement.get(first)?.[0];
  if (reference) {
    const anchor = carrierOf(movingShapes(indexed, selection), reference.key) ?? reference;
    return anchor.offset;
  }
  const free =
    current !== undefined && selection.freeShapes.has(current)
      ? current
      : [...selection.freeShapes][0];
  if (free === undefined) return undefined;
  const note = indexed.scene.notes.find((each) => each.id === free);
  if (note) return { x: note.rect.x, y: note.rect.y };
  return indexed.scene.arrows.find((each) => each.id === free)?.from;
}

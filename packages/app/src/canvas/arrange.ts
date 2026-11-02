/**
 * The Arrange tab's numbers (ADR 0088, A6.3): the width, height, place, turn, mirroring and pinning
 * of the selected shapes in a view, as the format panel shows and sets them. Each change is one
 * `set-positions` that pins what it sets, in a batch named for it; a pin or an unpin only pins or
 * unpins. A field set for several shapes sets each of them to that value, and a value they do not
 * share shows as mixed.
 *
 * Rows have no position of their own and anchored parts lie in their part's place: neither is
 * arranged here. Turning and mirroring are refused for containers, which a region draws or which hold
 * shapes laid out in their own axes, for rows and for shapes that draw rows (`turnRefusal`).
 *
 * Pure, with no React and no PixiJS.
 */
import { positionKey, type Command, type PositionChange } from '@visual-anything/core';
import type { Id, ShapePosition } from '@visual-anything/schema';
import { laidOutRect } from './overlays/decorate';
import type { ElementShape } from './scene';
import type { Flip } from './turn';

/** What a field of the Arrange tab sets. */
export type ArrangeChange =
  | { kind: 'width'; value: number; keepProportions: boolean }
  | { kind: 'height'; value: number; keepProportions: boolean }
  | { kind: 'x'; value: number }
  | { kind: 'y'; value: number }
  | { kind: 'rotation'; value: number }
  /** A quarter turn clockwise more, as draw.io's "Turn" is. */
  | { kind: 'turn' }
  /** Mirrors along one axis, or takes that mirroring away. */
  | { kind: 'flip'; axis: 'horizontal' | 'vertical'; on: boolean }
  | { kind: 'pinned'; value: boolean };

/** A value the selection shares, or that it does not. */
export type Shared<V> = { mixed: false; value: V } | { mixed: true };

/** The numbers the Arrange tab shows for the selected shapes, each shared or mixed. */
export interface ArrangeValues {
  width: Shared<number>;
  height: Shared<number>;
  x: Shared<number>;
  y: Shared<number>;
  rotation: Shared<number>;
  horizontal: Shared<boolean>;
  vertical: Shared<boolean>;
  pinned: Shared<boolean>;
}

/**
 * The shapes of the selected elements the Arrange tab arranges: every shape of each, in the scene's
 * order, but rows and anchored parts; a container's copies share their contents' places, so each
 * position is listed once.
 */
export function arrangedShapes(
  byElement: ReadonlyMap<Id, readonly ElementShape[]>,
  elements: Iterable<Id>,
): ElementShape[] {
  const found: ElementShape[] = [];
  const keys = new Set<string>();
  for (const element of elements) {
    for (const shape of byElement.get(element) ?? []) {
      if (shape.row !== undefined || shape.part?.inDrawing === true) continue;
      const key = positionKey(positionPlace(shape));
      if (keys.has(key)) continue;
      keys.add(key);
      found.push(shape);
    }
  }
  return found;
}

/**
 * Why a shape cannot be turned or mirrored, in English for the catalog; undefined when it can (ADR
 * 0088): containers, drawn as regions or holding shapes laid out in their own axes, rows, shapes that
 * draw rows and anchored parts are never turned.
 */
export function turnRefusal(shape: ElementShape): string | undefined {
  if (shape.row !== undefined) return 'A row is never turned or mirrored.';
  if (shape.region) return 'A container drawn as a region is never turned or mirrored.';
  if (shape.holdsContents || shape.collapsed !== undefined) {
    return 'A container is never turned or mirrored: what it holds is laid out in its own axes.';
  }
  if (shape.rowCount !== undefined) return 'A shape that draws rows is never turned or mirrored.';
  if (shape.part?.inDrawing === true) {
    return 'An anchored part lies in its part’s place, and is never turned or mirrored.';
  }
  return undefined;
}

/** Why none of these shapes can be turned or mirrored; undefined when at least one can. */
export function turnRefusalOf(shapes: readonly ElementShape[]): string | undefined {
  let reason: string | undefined;
  for (const shape of shapes) {
    const refused = turnRefusal(shape);
    if (refused === undefined) return undefined;
    reason ??= refused;
  }
  return reason ?? 'Nothing selected is drawn in this view.';
}

/** The numbers the Arrange tab shows for these shapes. */
export function arrangeValues(shapes: readonly ElementShape[]): ArrangeValues {
  const sizes = shapes.map(laidOutRect);
  return {
    width: shared(sizes.map((rect) => rect.width)),
    height: shared(sizes.map((rect) => rect.height)),
    x: shared(shapes.map((shape) => shape.offset.x)),
    y: shared(shapes.map((shape) => shape.offset.y)),
    rotation: shared(shapes.map((shape) => shape.rotation ?? 0)),
    horizontal: shared(shapes.map((shape) => mirrors(shape.flip, 'horizontal'))),
    vertical: shared(shapes.map((shape) => mirrors(shape.flip, 'vertical'))),
    pinned: shared(shapes.map((shape) => shape.positioned === 'pinned')),
  };
}

function shared<V>(values: readonly V[]): Shared<V> {
  const [first] = values;
  if (values.length === 0 || values.some((value) => !Object.is(value, first))) {
    return { mixed: true };
  }
  return { mixed: false, value: first as V };
}

function mirrors(flip: Flip | undefined, axis: 'horizontal' | 'vertical'): boolean {
  return flip === axis || flip === 'both';
}

/** A flip with one axis set on or off, the other kept. */
function flipWith(
  flip: Flip | undefined,
  axis: 'horizontal' | 'vertical',
  on: boolean,
): Flip | 'none' {
  const horizontal = axis === 'horizontal' ? on : mirrors(flip, 'horizontal');
  const vertical = axis === 'vertical' ? on : mirrors(flip, 'vertical');
  return horizontal && vertical
    ? 'both'
    : horizontal
      ? 'horizontal'
      : vertical
        ? 'vertical'
        : 'none';
}

/** Where a shape's position is kept: its element and its container. */
function positionPlace(shape: ElementShape): Pick<ShapePosition, 'element' | 'container'> {
  return {
    element: shape.element,
    ...(shape.container === undefined ? {} : { container: shape.container }),
  };
}

/** The English undo label of a change, which the catalog translates. */
export function arrangeLabel(change: ArrangeChange, shapes: readonly ElementShape[]): string {
  const [first] = shapes;
  const one = shapes.length === 1 && first !== undefined;
  const named = (verb: string) =>
    one ? `${verb} "${first.name}"` : `${verb} ${shapes.length} shapes`;
  switch (change.kind) {
    case 'width':
    case 'height':
      return named('Resize');
    case 'x':
    case 'y':
      return named('Place');
    case 'rotation':
    case 'turn':
      return named('Turn');
    case 'flip':
      return named('Mirror');
    case 'pinned':
      return named(change.value ? 'Pin' : 'Unpin');
  }
}

/**
 * The one action that applies a change to the shapes: a batch named for it of one `set-positions`,
 * each position pinned (a pin's or an unpin's as asked), its stored size kept unless the change sets
 * it; undefined when it would change nothing, or when it turns or mirrors only shapes never turned.
 */
export function arrangeCommand(
  viewId: Id,
  shapes: readonly ElementShape[],
  change: ArrangeChange,
): Command | undefined {
  const positions: PositionChange[] = [];
  const keys = new Set<string>();
  const turning = change.kind === 'rotation' || change.kind === 'turn' || change.kind === 'flip';
  let changes = false;
  for (const shape of shapes) {
    if (turning && turnRefusal(shape) !== undefined) continue;
    if (shape.row !== undefined || shape.part?.inDrawing === true) continue;
    const place = positionPlace(shape);
    const key = positionKey(place);
    if (keys.has(key)) continue;
    keys.add(key);
    const position = changedPosition(shape, change);
    if (!position) continue;
    changes ||= position.changes;
    positions.push(position.position);
  }
  if (positions.length === 0 || !changes) return undefined;
  const changed = shapes.filter((shape) =>
    positions.some(
      (position) => position.element === shape.element && position.container === shape.container,
    ),
  );
  return {
    type: 'batch',
    label: arrangeLabel(change, changed),
    commands: [{ type: 'set-positions', view: viewId, positions }],
  };
}

const ROTATION_STEP = 90;

/** A shape's position after a change, and whether it changes anything. */
function changedPosition(
  shape: ElementShape,
  change: ArrangeChange,
): { position: PositionChange; changes: boolean } | undefined {
  const rect = laidOutRect(shape);
  const size: { width?: number; height?: number } = { ...shape.storedSize };
  let x = shape.offset.x;
  let y = shape.offset.y;
  let pinned = true;
  const turn: { rotation?: number; flip?: Flip | 'none' } = {};
  let changes = shape.positioned !== 'pinned';
  switch (change.kind) {
    case 'width': {
      const width = whole(change.value);
      if (!(width > 0)) return undefined;
      size.width = width;
      changes ||= width !== rect.width;
      if (change.keepProportions && rect.width > 0) {
        const height = Math.max(1, whole((rect.height * width) / rect.width));
        size.height = height;
        changes ||= height !== rect.height;
      }
      break;
    }
    case 'height': {
      const height = whole(change.value);
      if (!(height > 0)) return undefined;
      size.height = height;
      changes ||= height !== rect.height;
      if (change.keepProportions && rect.height > 0) {
        const width = Math.max(1, whole((rect.width * height) / rect.height));
        size.width = width;
        changes ||= width !== rect.width;
      }
      break;
    }
    case 'x':
      x = whole(change.value);
      changes ||= x !== shape.offset.x;
      break;
    case 'y':
      y = whole(change.value);
      changes ||= y !== shape.offset.y;
      break;
    case 'rotation': {
      const rotation = normalized(change.value);
      turn.rotation = rotation;
      changes ||= rotation !== (shape.rotation ?? 0);
      break;
    }
    case 'turn':
      turn.rotation = normalized((shape.rotation ?? 0) + ROTATION_STEP);
      changes = true;
      break;
    case 'flip': {
      const flip = flipWith(shape.flip, change.axis, change.on);
      turn.flip = flip;
      changes ||= flip !== (shape.flip ?? 'none');
      break;
    }
    case 'pinned':
      pinned = change.value;
      changes = pinned !== (shape.positioned === 'pinned');
      break;
  }
  return {
    position: {
      ...positionPlace(shape),
      x,
      y,
      ...size,
      ...(pinned ? { pinned: true } : {}),
      ...turn,
    },
    changes,
  };
}

/** A number of canvas units as positions store them: whole. */
function whole(value: number): number {
  return Math.round(value);
}

/** Degrees from 0 up to 360, as positions keep them; to two decimals. */
export function normalized(degrees: number): number {
  const turned = ((degrees % 360) + 360) % 360;
  const rounded = Math.round(turned * 100) / 100;
  return rounded === 360 ? 0 : rounded;
}

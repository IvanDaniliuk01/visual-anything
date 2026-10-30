/**
 * What one layout works from, taken from the scene the canvas draws: its shapes, which of them layout
 * may move, the relations drawn between them, and the notes and arrows in World. One pass over the
 * scene, on the main thread; everything else happens in the layout worker.
 */
import {
  appearanceOf,
  definitionsIn,
  modelIndexOf,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { ESSENCE_ID } from '@visual-anything/schema';
import { boundsOf, type Rect, type Size } from '../geometry';
import { nameTagOn } from '../nameTags';
import { outlineAt } from '../outlines';
import { headerMiddle } from '../rows';
import { laidOutRect } from '../overlays/decorate';
import { innerPointOf } from '../routing/outline-ends';
import { CONTENTS_ORIGIN, type ElementShape, type Scene } from '../scene';
import { connectionPointsOf, handPortsOf } from './ports';
import {
  LAYOUT_STEP,
  type LayoutConnectionPoint,
  type LayoutInput,
  type LayoutRelation,
  type LayoutShape,
} from './types';

/**
 * Which shapes one layout may move; pinned shapes never move (ADR-0009):
 * - `view`: every shape of the view that is not pinned;
 * - `contents`: the shapes inside a container, at every depth, that are not pinned; the container
 *   stays where it is;
 * - `new`: the shapes without a position, in each container, or World, where one of the shapes with
 *   these keys sits without a position. Every shape with a position stays where it is, unless a
 *   container beside it grows with what layout placed: then an unpinned one moves aside, right or
 *   down, so that nothing overlaps.
 * - `expand`: the shapes inside containers that are expanding, at every depth, that are not pinned,
 *   laid out inside them; every other shape with a position stays where it is, unless an expanding
 *   container now comes near it: then an unpinned one moves aside, right or down (ADR 0080, section
 *   4). `containers` holds the keys of the expanding containers' shapes, and `collapsed` the size each
 *   was drawn at while collapsed; without one, the size its appearance gives it.
 *
 * The view and a container's contents are laid out in one pass while they fit its budget (ADR 0080,
 * section 1); so are the contents of expanding containers.
 */
export type LayoutScope =
  | { kind: 'view' }
  | { kind: 'contents'; container: Id }
  | { kind: 'new'; keys: ReadonlySet<string> }
  | {
      kind: 'expand';
      containers: ReadonlySet<string>;
      collapsed?: ReadonlyMap<string, Size>;
    };

const IN_WORLD = '';

/**
 * Whether a shape waits for the automatic layout of new shapes: one the view stores no position for,
 * unless its place is not layout's to give, as a row's is its container's rows' (ADR 0023) and an
 * anchored part's is its part's, in its drawing (ADR 0067).
 */
export function waitsForLayout(shape: ElementShape): boolean {
  return shape.positioned === 'placed' && shape.row === undefined && shape.part?.inDrawing !== true;
}

/** What a layout of `scope` works from; undefined when it would move nothing. */
export function layoutInput(
  scene: Scene,
  project: ProjectSnapshot,
  scope: LayoutScope,
): LayoutInput | undefined {
  const all = scene.shapes;
  let shapes: readonly ElementShape[] = all;
  let free: (shape: ElementShape) => boolean;
  switch (scope.kind) {
    case 'view':
      free = (shape) => shape.positioned !== 'pinned';
      break;
    case 'contents': {
      const at = all.findIndex((shape) => shape.element === scope.container && shape.holdsContents);
      const first = all[at];
      if (!first) return undefined;
      // A container's contents follow it in the scene, at every depth: its first copy and them.
      const prefix = `${first.key}/`;
      let end = at + 1;
      while (end < all.length && (all[end] as ElementShape).key.startsWith(prefix)) end += 1;
      shapes = all.slice(at, end);
      free = (shape) => shape !== first && shape.positioned !== 'pinned';
      break;
    }
    case 'new': {
      const levels = new Set<string>();
      for (const shape of all) {
        if (shape.positioned === 'placed' && scope.keys.has(shape.key)) {
          levels.add(shape.container ?? IN_WORLD);
        }
      }
      if (levels.size === 0) return undefined;
      free = (shape) => shape.positioned === 'placed' && levels.has(shape.container ?? IN_WORLD);
      break;
    }
    case 'expand': {
      const prefixes = [...scope.containers].map((key) => `${key}/`);
      if (prefixes.length === 0) return undefined;
      free = (shape) =>
        shape.positioned !== 'pinned' && prefixes.some((prefix) => shape.key.startsWith(prefix));
      break;
    }
  }

  const definitions = definitionsIn(project);
  const index = modelIndexOf(project);
  // Elements without an appearance of their own look like their component: worked out once each.
  const byComponent = new Map<Id, Looks>();
  const looksOf = (id: Id): Looks => {
    const element = index.element(id) ?? { id, component: ESSENCE_ID, name: id };
    if (element.appearance !== undefined) return looks(appearanceOf(element, definitions));
    let known = byComponent.get(element.component);
    if (!known) {
      known = looks(appearanceOf({ component: element.component }, definitions));
      byComponent.set(element.component, known);
    }
    return known;
  };
  const indexes = new Map<string, number>();
  let anyFree = false;
  const laid = shapes.map((shape, at): LayoutShape => {
    indexes.set(shape.key, at);
    // A row has no position of its own: it moves with the shape that draws it (ADR 0023); nor has
    // an anchored part, which lies in its part's place in its drawing (ADR 0067).
    const anchored = shape.part?.inDrawing === true;
    const isFree = shape.row === undefined && !anchored && free(shape);
    anyFree ||= isFree;
    const parent =
      shape.containerShape === undefined ? undefined : indexes.get(shape.containerShape);
    // Layout never sees an overlay's size (ADR 0055): the rectangle it gave the shape. A shape is
    // spaced with its name tag (ADR 0066's clarification of 2026-10-27).
    const laidOut = laidOutRect(shape);
    const reach = tagReachOf(shape, laidOut);
    const laidShape: LayoutShape = {
      key: shape.key,
      element: shape.element,
      parent: parent ?? -1,
      free: isFree,
      x: shape.offset.x - reach.left,
      y: shape.offset.y,
      width: laidOut.width + reach.left + reach.right,
      height: laidOut.height + reach.bottom,
    };
    if (reach.left > 0) laidShape.tagLeft = reach.left;
    // A shape kept where the view stores it, unpinned, may move aside for a container that grows.
    if (!isFree && shape.row === undefined && !anchored && shape.positioned === 'stored') {
      laidShape.aside = true;
    }
    const stored = shape.storedSize;
    if (stored?.width !== undefined) laidShape.storedWidth = stored.width;
    if (stored?.height !== undefined) laidShape.storedHeight = stored.height;
    if (shape.holdsContents || isFree) {
      const own = looksOf(shape.element);
      if (shape.holdsContents) {
        laidShape.baseWidth = own.width;
        laidShape.baseHeight = own.height;
      }
      if (isFree && own.points) laidShape.points = own.points;
    }
    // An expanding container moves aside what it comes near from the size it was drawn at collapsed.
    if (scope.kind === 'expand' && scope.containers.has(shape.key)) {
      const own = looksOf(shape.element);
      laidShape.grewFrom = scope.collapsed?.get(shape.key) ?? {
        width: own.width,
        height: own.height,
      };
    }
    // Rows and the shapes that draw them attach relations beside them, at their middles.
    if (shape.row !== undefined) laidShape.rowAt = shape.offset.y + shape.rect.height / 2;
    // A container's face's header, which its contents go under (ADR 0083).
    if (shape.holdsContents && shape.rowCount === undefined && shape.header !== undefined) {
      laidShape.header = shape.header;
    }
    if (shape.rowCount !== undefined)
      laidShape.headerAt = headerMiddle(shape.rect, shape.header) - shape.rect.y;
    // A drawing with parts is one block, as large as its header, its picture and its contents.
    if (shape.picture) Object.assign(laidShape, drawingFields(shape, laidShape));
    if (anchored) {
      const holder = parent === undefined ? undefined : shapes[parent];
      const partAt = holder && partPlace(shape, holder);
      if (partAt) laidShape.partAt = partAt;
    }
    return laidShape;
  });
  // An expanding container whose contents are all pinned still moves aside what it now covers.
  if (!anyFree && scope.kind !== 'expand') return undefined;

  const relations: LayoutRelation[] = [];
  for (const line of scene.relations) {
    const ends = line.ends;
    if (ends?.from.kind !== 'shape' || ends.to.kind !== 'shape') continue;
    const from = indexes.get(ends.from.key);
    const to = indexes.get(ends.to.key);
    if (from !== undefined && to !== undefined)
      relations.push({ relation: line.relation, from, to, ...handPortsOf(line) });
  }

  const obstacles: Rect[] = scope.kind === 'contents' ? [] : worldObstacles(scene);
  return {
    shapes: laid,
    relations,
    obstacles,
    ...(scope.kind === 'new' ? {} : { onePass: true as const }),
  };
}

const NO_REACH = { left: 0, right: 0, bottom: 0 } as const;

/**
 * How far a shape's name tag reaches left, right and below the rectangle layout gave it, each rounded
 * up to the step, so that the box layout spaces it by holds the tag and the shape still lands on the
 * step; nothing for a shape without one.
 */
export function tagReachOf(
  shape: ElementShape,
  laidOut: Rect = laidOutRect(shape),
): { left: number; right: number; bottom: number } {
  const tag = nameTagOn(shape);
  if (!tag) return NO_REACH;
  const up = (room: number) => (room > 0 ? Math.ceil(room / LAYOUT_STEP - 1e-9) * LAYOUT_STEP : 0);
  return {
    left: up(laidOut.x - tag.x),
    right: up(tag.x + tag.width - (laidOut.x + laidOut.width)),
    bottom: up(tag.y + tag.height - (laidOut.y + laidOut.height)),
  };
}

/**
 * What layout takes of a drawing with parts (ADR 0067, ADR 0015's clarification): where its picture
 * ends, below which its other contents go, and the size it takes around its header and picture
 * before it grows to hold them, as the scene sizes it.
 */
function drawingFields(
  shape: ElementShape,
  laid: LayoutShape,
): Pick<LayoutShape, 'pictureBottom' | 'baseWidth' | 'baseHeight'> {
  const picture = shape.picture as NonNullable<ElementShape['picture']>;
  const right = picture.rect.x - shape.rect.x + picture.rect.width;
  const bottom = picture.rect.y - shape.rect.y + picture.rect.height;
  return {
    pictureBottom: bottom,
    baseWidth: Math.max(laid.baseWidth ?? laid.width, right + CONTENTS_ORIGIN.x),
    baseHeight: Math.max(laid.baseHeight ?? laid.height, bottom + CONTENTS_ORIGIN.x),
  };
}

/**
 * Where the relations of an anchored part attach on its drawing (ADR 0067): its outline's inner
 * point, from the top left of the drawing; the middle of its box without an outline.
 */
function partPlace(shape: ElementShape, drawing: ElementShape): { x: number; y: number } {
  const placed = outlineAt(shape);
  const inner = placed
    ? innerPointOf(placed)
    : { x: shape.rect.x + shape.rect.width / 2, y: shape.rect.y + shape.rect.height / 2 };
  return { x: inner.x - drawing.rect.x, y: inner.y - drawing.rect.y };
}

/** What layout takes of an appearance: its size, and where relations attach. */
interface Looks {
  width: number;
  height: number;
  points: LayoutConnectionPoint[] | undefined;
}

function looks(appearance: { width: number; height: number }): Looks {
  return {
    width: appearance.width,
    height: appearance.height,
    points: connectionPointsOf(appearance),
  };
}

/** The notes and arrows of the view, which sit directly in World. */
function worldObstacles(scene: Scene): Rect[] {
  return [
    ...scene.notes.map((note) => note.rect),
    ...scene.arrows.flatMap(
      (arrow) =>
        boundsOf([], [arrow.from, arrow.to, arrow.arrowhead.left, arrow.arrowhead.right]) ?? [],
    ),
  ];
}

/**
 * Where a dragged end of a route would attach (`relation-routing.md` §7.1): over its own end's shape,
 * or close to its border, at the nearest connection point, at the nearest point of the border, or
 * automatically when deep inside; over another element's shape, the same way, reconnecting the
 * relation to that element; anywhere else, nowhere: let go, the end goes back. Alt places it at the
 * exact border point nearest the pointer. Where the bend points of a route snap to its other points.
 */
import {
  appearanceOf,
  definitionsIn,
  modelIndexOf,
  relationTypeOrRelatesTo,
  wouldFormCycle,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { EndAttachment, Id, Relation } from '@visual-anything/schema';
import { holdsPoint, type Point, type Rect } from '../geometry';
import { shapesAt, type IndexedScene, type Skipped } from '../hit';
import type { ElementShape, RelationLine } from '../scene';
import { attachPoint, nearestBorderAttach, type Side } from './hand';

/** How close to a connection point, in screen pixels, a dragged end snaps to it. */
export const POINT_REACH = 16;
/** How deep inside its shape, in screen pixels, a dragged end attaches automatically. */
export const AUTOMATIC_DEPTH = 16;
/** How close to its own shape's border, in screen pixels, a dragged end still attaches to it. */
export const BORDER_REACH = 12;
/** How close to a neighbour's x or y, in screen pixels, a dragged bend point snaps to it. */
export const NEIGHBOUR_REACH = 6;

/** Where an end would attach on a shape, and what the canvas shows of it meanwhile. */
export interface EndSnap {
  /** `null` attaches automatically. */
  attachment: EndAttachment | null;
  /** The connection points of the shape, the one it snaps to marked; none on a row. */
  points: { at: Point; snapped: boolean }[];
  /** Where it snaps to the border, and the side it is on. */
  tick?: { at: Point; side: Side };
  /** The shape's outline, when it would attach automatically. */
  outline?: Rect;
}

/** What letting a dragged end go would do. */
export type EndAim =
  /** Go back where it was: over a line, or nothing. */
  | { kind: 'back' }
  /** Attach to its own end's shape. */
  | ({ kind: 'attach'; shape: ElementShape } & EndSnap)
  /** Reconnect the relation to another element, and attach there. */
  | ({ kind: 'reconnect'; shape: ElementShape } & EndSnap)
  /** Nothing, as the core would refuse the reconnection: the reason says why. */
  | { kind: 'refused'; shape: ElementShape; reason: 'cycle' | 'other-end' };

/**
 * Where an end dragged to `point` would attach on a shape, at a scale: a connection point within reach
 * when the shape has any and is no row; automatically deeper than `AUTOMATIC_DEPTH` inside; otherwise
 * the nearest border point, on a row its left or right side. With `exact`, as Alt asks, always the
 * border point nearest the pointer.
 */
export function snapEnd(
  shape: ElementShape,
  point: Point,
  scale: number,
  exact: boolean,
  rows: boolean,
): EndSnap {
  const { rect } = shape;
  const places = rows
    ? []
    : (shape.points ?? []).map((each) => ({ point: each, at: attachPoint(rect, each) }));
  let nearest: (typeof places)[number] | undefined;
  if (!exact) {
    let closest = POINT_REACH / scale;
    for (const place of places) {
      const away = Math.hypot(place.at.x - point.x, place.at.y - point.y);
      if (away <= closest) {
        closest = away;
        nearest = place;
      }
    }
  }
  const points = places.map((place) => ({ at: place.at, snapped: place === nearest }));
  if (nearest) {
    return { attachment: { kind: 'connection-point', name: nearest.point.name }, points };
  }
  const depth = depthInside(rect, point);
  if (!exact && depth > AUTOMATIC_DEPTH / scale) return { attachment: null, points, outline: rect };
  const border = rows
    ? { ...nearestBorderAttach(rect, point, ['left', 'right']), at: 0.5 }
    : nearestBorderAttach(rect, point);
  return {
    attachment: { kind: 'border', side: border.side, at: border.at },
    points,
    tick: { at: attachPoint(rect, border), side: border.side },
  };
}

/** What dragging an end of a relation's line to a point aims at, as the canvas draws it now. */
export function aimEnd(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  line: RelationLine,
  end: 'from' | 'to',
  point: Point,
  scale: number,
  exact: boolean,
  outline: (shape: ElementShape) => boolean,
  hidden: Skipped,
): EndAim {
  const index = modelIndexOf(project);
  const relation = index.relation(line.relation);
  if (!relation || line.aggregate) return { kind: 'back' };
  const drawn = line.ends?.[end];
  const own = drawn?.kind === 'shape' ? indexed.byKey.get(drawn.key) : undefined;
  if (own && nearShape(own, point, BORDER_REACH / scale)) {
    return { kind: 'attach', shape: own, ...snapEnd(own, point, scale, exact, drawsRows(project, own)) };
  }
  const [under] = shapesAt(indexed, point, outline, hidden);
  if (!under || under.element === relation[end]) return { kind: 'back' };
  const other = end === 'from' ? relation.to : relation.from;
  if (under.element === other) return { kind: 'refused', shape: under, reason: 'other-end' };
  if (formsCycle(project, relation, end, under.element)) {
    return { kind: 'refused', shape: under, reason: 'cycle' };
  }
  return {
    kind: 'reconnect',
    shape: under,
    ...snapEnd(under, point, scale, exact, drawsRows(project, under)),
  };
}

/**
 * Where a dragged bend point goes: at the pointer, but at the x or the y of a neighbour within reach,
 * so that runs stay straight; with `exact`, as Alt asks, at the pointer. Says which coordinates
 * snapped, which are kept as they are rather than rounded.
 */
export function snapBend(
  point: Point,
  neighbours: readonly Point[],
  scale: number,
  exact: boolean,
): { at: Point; snapped: { x: boolean; y: boolean } } {
  if (exact) return { at: point, snapped: { x: false, y: false } };
  const reach = NEIGHBOUR_REACH / scale;
  let x = point.x;
  let y = point.y;
  let bestX = reach;
  let bestY = reach;
  let snappedX = false;
  let snappedY = false;
  for (const neighbour of neighbours) {
    const awayX = Math.abs(neighbour.x - point.x);
    if (awayX <= bestX) {
      bestX = awayX;
      x = neighbour.x;
      snappedX = true;
    }
    const awayY = Math.abs(neighbour.y - point.y);
    if (awayY <= bestY) {
      bestY = awayY;
      y = neighbour.y;
      snappedY = true;
    }
  }
  return { at: { x, y }, snapped: { x: snappedX, y: snappedY } };
}

/** Whether a point is on a shape, or within `reach` of its border. */
function nearShape(shape: ElementShape, point: Point, reach: number): boolean {
  const { rect } = shape;
  if (holdsPoint('rectangle', rect, point)) return true;
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy) <= reach;
}

/** How deep inside a rectangle a point is: its distance to the nearest side, or 0 outside it. */
function depthInside(rect: Rect, point: Point): number {
  if (!holdsPoint('rectangle', rect, point)) return 0;
  return Math.min(
    point.x - rect.x,
    rect.x + rect.width - point.x,
    point.y - rect.y,
    rect.y + rect.height - point.y,
  );
}

/** Whether a shape is a row, or draws its contents as rows: lines attach beside it, left or right. */
export function drawsRows(project: ProjectSnapshot, shape: ElementShape): boolean {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  const rowsOf = (id: Id | undefined) => {
    const element = id === undefined ? undefined : index.element(id);
    return element !== undefined && appearanceOf(element, definitions).contentsAsRows;
  };
  return rowsOf(shape.element) || rowsOf(shape.container);
}

/** Whether ending a relation on an element would make containment form a cycle, as the core refuses. */
function formsCycle(project: ProjectSnapshot, relation: Relation, end: 'from' | 'to', element: Id): boolean {
  const definitions = definitionsIn(project);
  if (!relationTypeOrRelatesTo(definitions, relation.relationType).nests) return false;
  const index = modelIndexOf(project);
  const from = end === 'from' ? element : relation.from;
  const to = end === 'to' ? element : relation.to;
  return from === index.world.id || wouldFormCycle(index, from, to);
}

/**
 * A view turned into what the canvas draws: every shape and relation, with absolute coordinates. This
 * is pure, so the drawing step stays a thin wrapper around PixiJS and everything here can be tested.
 *
 * In v0.1 so far a view shows the whole model. Until ELK layout arrives (M3), shapes without a stored
 * position are placed in a simple row below everything else around them, and relations follow simple
 * orthogonal routes.
 *
 * The shapes keep containment order, whatever the view's stacking order, which only decides the order
 * they are drawn in. So a change of stacking order only walks the shapes again: everything else is
 * laid out once and kept until something it depends on changes.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type {
  Arrow,
  Color,
  Element,
  FreeShape,
  Id,
  Note,
  Relation,
  ShapePosition,
  ViewFile,
} from '@visual-anything/schema';
import { ESSENCE_ID } from '@visual-anything/schema';
import {
  appearanceOf,
  componentOrEssence,
  containmentTree,
  definitionsOf,
  nestingTypesInView,
  orderByStacking,
  relationTypeOrRelatesTo,
  storedStacking,
  type Definitions,
  type Placement,
  type ResolvedAppearance,
} from '@visual-anything/core';
import type { Dash, ShapeKind } from './geometry';
import {
  arrowheadAt,
  boundsOf,
  centerOf,
  directionOf,
  type Arrowhead,
  type Point,
  type Rect,
} from './geometry';
import { midpointOf, routeBetweenEnds, type RouteEnd } from './route';

/** Everything a view draws. */
export interface Scene {
  /**
   * The anchored shapes of elements in containment order: World's contents, and each container's
   * contents, in model order, a container before its contents. The outline, the keys, relations and an
   * element's first shape follow this order, whatever the stacking order.
   */
  shapes: ElementShape[];
  /**
   * The indexes of `shapes` in drawing order, back to front: a container before its contents, its
   * contents before its next sibling, siblings in the view's stacking order. Absent: as `shapes`.
   */
  drawing?: readonly number[];
  /** Drawn in front of every element shape, in model order. */
  relations: RelationLine[];
  notes: NoteShape[];
  arrows: ArrowShape[];
  /** The smallest rectangle holding everything drawn; undefined when the view draws nothing. */
  bounds: Rect | undefined;
}

/** An anchored shape of an element. An element has one inside each of its containers. */
export interface ElementShape {
  /** Identifies the shape within its scene: the elements from World down to this one, joined by `/`. */
  key: string;
  element: Id;
  /** The container whose shape holds this one; absent when it sits directly in World. */
  container?: Id;
  /** The key of the shape this one sits in; absent when it sits directly in World. */
  containerShape?: string;
  /** Where it sits relative to its container's shape, or to the canvas when directly in World. */
  offset: Point;
  /** The size the view stores for it, if any; a move keeps it. */
  storedSize?: { width?: number; height?: number };
  /** Whether the view stores its position, and whether that position was set by hand. */
  positioned: 'pinned' | 'stored' | 'placed';
  name: string;
  componentName: string;
  kind: ShapeKind;
  fill: Color;
  stroke: Color;
  rect: Rect;
  /**
   * The rectangle holding this shape and everything inside it; larger than `rect` only when contents
   * stick out of its left or top side.
   */
  extent: Rect;
  /** Whether other shapes sit inside this one; its name is then drawn at its top. */
  holdsContents: boolean;
}

/** A relation drawn along an orthogonal route. */
export interface RelationLine {
  relation: Id;
  /** The relation's name, shown at the middle of its route. */
  label?: string;
  /** The route from start to end, through its bends. */
  route: Point[];
  /** Where the route starts: on a shape's border, or at the middle of the relation it starts from. */
  from: Point;
  /** Where the route ends: on a shape's border, or at the middle of the relation it ends on. */
  to: Point;
  /** The middle of the route, where relations that end on this one attach and its label goes. */
  middle: Point;
  /** Present when the relation type is directed; its tip is `to`. */
  arrowhead?: Arrowhead;
  stroke: Color;
  width: number;
  dash: Dash;
  /**
   * What the route runs between, so that it can be routed again while one end is dragged: each end's
   * shape or relation, and how far the route runs beside others between the same ends.
   */
  ends?: { from: DrawnEnd; to: DrawnEnd; offset: number };
}

/** One end of a drawn relation: an element's shape, by its key, or the relation it ends on. */
export type DrawnEnd = { kind: 'shape'; key: string } | { kind: 'relation'; relation: Id };

/** A note: a free shape holding text. */
export interface NoteShape {
  id: Id;
  rect: Rect;
  text: string;
}

/** An arrow: a free shape pointing from one place on the canvas to another. */
export interface ArrowShape {
  id: Id;
  from: Point;
  to: Point;
  arrowhead: Arrowhead;
}

/** The line width of free arrows. */
export const ARROW_WIDTH = 2;

/** Room left around the contents of a container that has no stored size. */
const CONTAINER_PADDING = 24;
/** Where the first row of contents starts inside a container, below the container's name. */
const CONTAINER_HEADER = 48;
/** Where contents placed without a stored position start, relative to their container's shape. */
export const CONTENTS_ORIGIN: Readonly<Point> = { x: CONTAINER_PADDING, y: CONTAINER_HEADER };
/** The space between shapes in the stand-in row, and between that row and what is above it. */
const ROW_GAP = 40;
/** How far apart relations that relate the same two ends are drawn. */
const PARALLEL_GAP = 24;

/** Everything a view draws but the order its shapes are drawn in. */
interface Layout {
  shapes: ElementShape[];
  /** The indexes of the shapes that sit directly in World, in containment order. */
  inWorld: number[];
  /** The indexes of the shapes that sit directly in each shape, by its index. */
  contents: number[][];
  /** The drawing order when the view keeps no stacking order: the shapes' own order. */
  identity: readonly number[];
  relations: RelationLine[];
  notes: NoteShape[];
  arrows: ArrowShape[];
  bounds: Rect | undefined;
}

/** A layout, with what it was made from and the last scene drawn from it. */
interface LaidOut {
  viewId: Id;
  model: ProjectSnapshot['model'];
  packages: ProjectSnapshot['packages'];
  view: ViewFile;
  layout: Layout;
  scene: Scene;
}

/** The view fields a layout does not depend on: a restack or a rename changes only these. */
const NOT_LAID_OUT: ReadonlySet<string> = new Set(['stackingOrder', 'name', 'description']);

/**
 * The last layout of each view, by its positions. A change that leaves the positions, the model, the
 * packages and every other field of the view as they were reuses it.
 */
const layouts = new WeakMap<ViewFile['positions'], LaidOut>();

/**
 * Everything the view with this id draws. When nothing it draws changed, it is the same scene as
 * before; when only the view's stacking order changed, it shares everything but the drawing order.
 */
export function buildScene(project: ProjectSnapshot, viewId: Id): Scene {
  const view = project.views.find((candidate) => candidate.id === viewId);
  if (!view) throw new Error(`The project has no view ${JSON.stringify(viewId)}.`);

  const kept = layouts.get(view.positions);
  if (kept && laidOutFrom(kept, project, view)) {
    if (kept.view.stackingOrder === view.stackingOrder) return kept.scene;
    const scene = sceneOf(kept.layout, drawingOrder(kept.layout, view, project.model.world.id));
    layouts.set(view.positions, { ...kept, view, scene });
    return scene;
  }

  const layout = layOut(project, view);
  const scene = sceneOf(layout, drawingOrder(layout, view, project.model.world.id));
  layouts.set(view.positions, {
    viewId: view.id,
    model: project.model,
    packages: project.packages,
    view,
    layout,
    scene,
  });
  return scene;
}

/** Whether a layout was made from this project's model and packages and from this view as it is now. */
function laidOutFrom(kept: LaidOut, project: ProjectSnapshot, view: ViewFile): boolean {
  if (kept.viewId !== view.id || kept.model !== project.model) return false;
  if (kept.packages !== project.packages) return false;
  const before = kept.view as unknown as Record<string, unknown>;
  const now = view as unknown as Record<string, unknown>;
  const keys = (fields: Record<string, unknown>) =>
    Object.keys(fields).filter((key) => !NOT_LAID_OUT.has(key));
  const keysBefore = keys(before);
  const keysNow = keys(now);
  return (
    keysBefore.length === keysNow.length &&
    keysNow.every((key) => Object.hasOwn(before, key) && Object.is(before[key], now[key]))
  );
}

function sceneOf(layout: Layout, drawing: readonly number[]): Scene {
  const { shapes, relations, notes, arrows, bounds } = layout;
  return { shapes, drawing, relations, notes, arrows, bounds };
}

/** Lays out the view: every shape and relation, in containment and model order. */
function layOut(project: ProjectSnapshot, view: ViewFile): Layout {
  const definitions = definitionsOf(project.packages);
  // Only the listed types that a package defines and that nest arrange the view, as in the core.
  const nesting = new Set(nestingTypesInView(project, view));
  const notes = view.freeShapes.filter(isNote).map(noteShape);
  const arrows = view.freeShapes.filter(isArrow).map(arrowShape);

  const placed = placeShapes(project, view, nesting, definitions, notes, arrows);
  const { shapes } = placed;
  const relations = drawRelations(project.model.relations, nesting, shapes, definitions);

  const bounds = boundsOf(
    [...shapes.map((shape) => shape.rect), ...notes.map((note) => note.rect)],
    [
      ...relations.flatMap((line) => [...line.route, ...arrowheadCorners(line.arrowhead)]),
      ...arrows.flatMap((arrow) => [arrow.from, arrow.to, ...arrowheadCorners(arrow.arrowhead)]),
    ],
  );
  return {
    ...placed,
    identity: shapes.map((_, at) => at),
    relations,
    notes,
    arrows,
    bounds,
  };
}

/**
 * The order the shapes are drawn in, back to front: each container before its contents and its
 * contents before what comes after it, and the shapes that sit directly in one container, or in
 * World, in the view's stacking order there. Every copy of a container orders its contents alike.
 */
function drawingOrder(layout: Layout, view: ViewFile, worldId: Id): readonly number[] {
  if (view.stackingOrder === undefined) return layout.identity;
  const { shapes, contents } = layout;
  const order: number[] = [];
  const visit = (indexes: readonly number[], key: Id): void => {
    const stored = storedStacking(view, key);
    const sorted = stored
      ? orderByStacking(indexes, (at) => (shapes[at] as ElementShape).element, stored)
      : indexes;
    for (const at of sorted) {
      order.push(at);
      const inside = contents[at] as number[];
      if (inside.length > 0) visit(inside, (shapes[at] as ElementShape).element);
    }
  };
  visit(layout.inWorld, worldId);
  return order;
}

/** A placement with its size worked out, before it gets absolute coordinates. */
interface Box {
  placement: Placement;
  element: Element;
  componentName: string;
  appearance: ResolvedAppearance;
  width: number;
  height: number;
  /**
   * Where the box sits, relative to its container's shape or to the canvas when directly in World. It
   * comes from the view's stored position, or from the stand-in row once the row is laid out.
   */
  offset?: Point;
  /** The position the view stores for it, if any. */
  stored?: ShapePosition;
  contents: Box[];
}

/**
 * The anchored shapes of every element except World, with absolute rectangles, containers first, and
 * which shapes sit directly in World and in each shape.
 */
function placeShapes(
  project: ProjectSnapshot,
  view: ViewFile,
  nesting: ReadonlySet<Id>,
  definitions: Definitions,
  notes: readonly NoteShape[],
  arrows: readonly ArrowShape[],
): Pick<Layout, 'shapes' | 'inWorld' | 'contents'> {
  const { model } = project;
  const elements = new Map(model.elements.map((element) => [element.id, element]));
  const positions = positionsOf(view, model.world.id);

  const measure = (placement: Placement): Box => {
    const element = elements.get(placement.element) ?? {
      id: placement.element,
      component: ESSENCE_ID,
      name: placement.element,
    };
    const appearance = appearanceOf(element, definitions);
    const stored = positions.get(positionKey(placement.element, placement.container));
    const contents = placement.contents.map(measure);
    arrangeContents(contents);
    const contentsRight = maxOf(contents.map((box) => (box.offset?.x ?? 0) + box.width));
    const contentsBottom = maxOf(contents.map((box) => (box.offset?.y ?? 0) + box.height));
    return {
      placement,
      element,
      componentName: componentOrEssence(definitions, element.component).name,
      appearance,
      width: containerSize(stored?.width, appearance.width, contentsRight),
      height: containerSize(stored?.height, appearance.height, contentsBottom),
      ...(stored ? { offset: { x: stored.x, y: stored.y }, stored } : {}),
      contents,
    };
  };

  const worldContents = containmentTree(model, (relationType) => nesting.has(relationType)).map(
    measure,
  );

  // The stand-in row for World's contents goes below every positioned shape and every free shape.
  const elsewhere = boundsOf(
    [
      ...worldContents.flatMap((box) =>
        box.offset ? [{ ...box.offset, width: box.width, height: box.height }] : [],
      ),
      ...notes.map((note) => note.rect),
    ],
    arrows.flatMap((arrow) => [arrow.from, arrow.to]),
  );
  layOutRow(
    worldContents,
    elsewhere?.x ?? 0,
    elsewhere ? elsewhere.y + elsewhere.height + ROW_GAP : 0,
  );

  const shapes: ElementShape[] = [];
  const contents: number[][] = [];
  const place = (box: Box, origin: Point, path: string | undefined): number => {
    const offset = box.offset ?? { x: 0, y: 0 };
    const rect = {
      x: origin.x + offset.x,
      y: origin.y + offset.y,
      width: box.width,
      height: box.height,
    };
    const key = path === undefined ? box.element.id : `${path}/${box.element.id}`;
    const { stored } = box;
    const storedSize = stored
      ? {
          ...(stored.width === undefined ? {} : { width: stored.width }),
          ...(stored.height === undefined ? {} : { height: stored.height }),
        }
      : undefined;
    const shape: ElementShape = {
      key,
      element: box.element.id,
      ...(box.placement.container === undefined ? {} : { container: box.placement.container }),
      ...(path === undefined ? {} : { containerShape: path }),
      offset,
      ...(storedSize && Object.keys(storedSize).length > 0 ? { storedSize } : {}),
      positioned: stored ? (stored.pinned ? 'pinned' : 'stored') : 'placed',
      name: box.element.name,
      componentName: box.componentName,
      kind: box.appearance.shape,
      fill: box.appearance.fill,
      stroke: box.appearance.stroke,
      rect,
      extent: rect,
      holdsContents: box.contents.length > 0,
    };
    const at = shapes.length;
    shapes.push(shape);
    const inside: number[] = [];
    contents.push(inside);
    for (const content of box.contents) inside.push(place(content, rect, key));
    if (inside.length > 0) {
      const extents = inside.map((each) => (shapes[each] as ElementShape).extent);
      shape.extent = boundsOf([rect, ...extents]) ?? rect;
    }
    return at;
  };
  const inWorld = worldContents.map((box) => place(box, { x: 0, y: 0 }, undefined));
  return { shapes, inWorld, contents };
}

/** Gives contents without a stored position a place in a row below the contents that have one. */
function arrangeContents(contents: Box[]): void {
  const positioned = contents.filter((box) => box.offset !== undefined);
  const below = maxOf(positioned.map((box) => (box.offset?.y ?? 0) + box.height));
  layOutRow(contents, CONTAINER_PADDING, below === undefined ? CONTAINER_HEADER : below + ROW_GAP);
}

/** Places every box that has no offset yet in a row starting at (x, y). */
function layOutRow(boxes: Box[], x: number, y: number): void {
  let next = x;
  for (const box of boxes) {
    if (box.offset) continue;
    box.offset = { x: next, y };
    next += box.width + ROW_GAP;
  }
}

/**
 * A shape's size along one axis. A shape that holds contents is never smaller than they need: a stored
 * size grows to hold them, and without one it holds them with some room to spare.
 */
function containerSize(
  stored: number | undefined,
  inherited: number,
  contentsEnd: number | undefined,
): number {
  if (contentsEnd === undefined) return stored ?? inherited;
  if (stored !== undefined) return Math.max(stored, contentsEnd);
  return Math.max(inherited, contentsEnd + CONTAINER_PADDING);
}

/** The view's positions by element and container; a position in World has no container. */
function positionsOf(view: ViewFile, worldId: Id): Map<string, ShapePosition> {
  const positions = new Map<string, ShapePosition>();
  for (const position of view.positions) {
    const container = position.container === worldId ? undefined : position.container;
    const key = positionKey(position.element, container);
    if (!positions.has(key)) positions.set(key, position);
  }
  return positions;
}

function positionKey(element: Id, container: Id | undefined): string {
  return JSON.stringify([element, container ?? null]);
}

/** One end of a relation as drawn: a shape, or the middle of another relation's line. */
interface End {
  anchor: Point;
  shape?: ElementShape;
  drawn: DrawnEnd;
}

/**
 * Every relation whose relation type is not one of the view's nesting relation types and whose ends
 * are both shown, in model order. A relation that ends on another relation attaches to the middle of
 * that relation's line. An element with several shapes is related through its first one for now.
 */
function drawRelations(
  relations: readonly Relation[],
  nesting: ReadonlySet<Id>,
  shapes: readonly ElementShape[],
  definitions: Definitions,
): RelationLine[] {
  const firstShapes = new Map<Id, ElementShape>();
  for (const shape of shapes) {
    if (!firstShapes.has(shape.element)) firstShapes.set(shape.element, shape);
  }

  const candidates = new Map<Id, Relation>();
  for (const relation of relations) {
    if (!nesting.has(relation.relationType) && !candidates.has(relation.id)) {
      candidates.set(relation.id, relation);
    }
  }
  const sameEnds = new Map<string, Relation[]>();
  for (const relation of candidates.values()) {
    const key = endsKey(relation);
    const siblings = sameEnds.get(key);
    if (siblings) siblings.push(relation);
    else sameEnds.set(key, [relation]);
  }

  const lines = new Map<Id, RelationLine | undefined>();
  const resolving = new Set<Id>();

  const endAt = (id: Id): End | undefined => {
    const shape = firstShapes.get(id);
    if (shape) {
      return { anchor: centerOf(shape.rect), shape, drawn: { kind: 'shape', key: shape.key } };
    }
    const line = lineOf(id);
    return line && { anchor: line.middle, drawn: { kind: 'relation', relation: id } };
  };

  const lineOf = (id: Id): RelationLine | undefined => {
    if (lines.has(id)) return lines.get(id);
    const relation = candidates.get(id);
    // A relation that, through others, ends on itself cannot be drawn.
    if (!relation || resolving.has(id)) return undefined;
    resolving.add(id);
    const from = endAt(relation.from);
    const to = endAt(relation.to);
    resolving.delete(id);
    const siblings = sameEnds.get(endsKey(relation)) ?? [relation];
    const line = from && to ? lineBetween(relation, from, to, siblings, definitions) : undefined;
    lines.set(id, line);
    return line;
  };

  return [...candidates.keys()].flatMap((id) => lineOf(id) ?? []);
}

/** The same key for every relation between the same two ends, whichever way each one points. */
function endsKey(relation: Relation): string {
  return JSON.stringify([relation.from, relation.to].sort());
}

/**
 * The route of a relation between two ends, from border to border. Relations between the same ends
 * (`siblings`, this one among them) run side by side.
 */
function lineBetween(
  relation: Relation,
  from: End,
  to: End,
  siblings: readonly Relation[],
  definitions: Definitions,
): RelationLine | undefined {
  if (from.shape && from.shape === to.shape) return undefined;
  const offset = (siblings.indexOf(relation) - (siblings.length - 1) / 2) * PARALLEL_GAP;
  const route = routeBetweenEnds(routeEnd(from), routeEnd(to), offset);
  const start = route[0] as Point;
  const end = route.at(-1) as Point;
  const beforeEnd = route.at(-2) as Point;
  if (!directionOf(beforeEnd, end)) return undefined;

  const relationType = relationTypeOrRelatesTo(definitions, relation.relationType);
  const { stroke, width, dash } = relationType.appearance;
  return {
    relation: relation.id,
    ...(relation.name ? { label: relation.name } : {}),
    route,
    from: start,
    to: end,
    middle: midpointOf(route),
    ...(relationType.direction === 'directed'
      ? { arrowhead: arrowheadAt(beforeEnd, end, width) }
      : {}),
    stroke,
    width,
    dash,
    ends: { from: from.drawn, to: to.drawn, offset },
  };
}

function routeEnd(end: End): RouteEnd {
  return end.shape ? { rect: end.shape.rect } : { point: end.anchor };
}

function isNote(shape: FreeShape): shape is Note {
  return shape.kind === 'note';
}

function isArrow(shape: FreeShape): shape is Arrow {
  return shape.kind === 'arrow';
}

function noteShape(note: Note): NoteShape {
  return {
    id: note.id,
    rect: { x: note.x, y: note.y, width: note.width, height: note.height },
    text: note.text,
  };
}

function arrowShape(arrow: Arrow): ArrowShape {
  const from = { x: arrow.from.x, y: arrow.from.y };
  const to = { x: arrow.to.x, y: arrow.to.y };
  return { id: arrow.id, from, to, arrowhead: arrowheadAt(from, to, ARROW_WIDTH) };
}

function arrowheadCorners(arrowhead: Arrowhead | undefined): Point[] {
  return arrowhead ? [arrowhead.left, arrowhead.right] : [];
}

function maxOf(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : Math.max(...values);
}

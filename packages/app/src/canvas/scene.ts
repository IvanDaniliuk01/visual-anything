/**
 * A view turned into what the canvas draws: every shape and relation, with absolute coordinates. This
 * is pure, so the drawing step stays a thin wrapper around PixiJS and everything here can be tested.
 *
 * Until ELK layout arrives (M3), shapes without a stored position are placed in a stand-in row below
 * everything else around them, and relations follow simple orthogonal routes.
 *
 * The shapes keep containment order, whatever the view's stacking order, which only decides the order
 * they are drawn in. An element with several containers has one shape inside each, a copy; its
 * relations are drawn from its first copy that shows. A collapsed container shows none of its
 * contents, and each relation to or from them is drawn as one aggregated relation per relation type
 * and far end, with a count and a thicker line.
 *
 * A change costs what it touches. Each build of a view starts from the last one: what depends only on
 * an element and the definitions is kept per element; the containment tree is kept while containment
 * is; every shape and every relation's line equal to one drawn before is that same object, so what
 * draws, indexes and lists the scene can tell what changed by identity; and while no shape moves or
 * resizes, the lines are kept as they were. A build is always equal, field by field, to one made from
 * nothing (`buildSceneAfresh`).
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
  definitionsIn,
  detailParts,
  detailText,
  startedTypesByElement,
  nestingTypesInView,
  orderByStacking,
  relationTypeOrRelatesTo,
  storedStacking,
  type Definitions,
  type Placement,
  type ResolvedAppearance,
} from '@visual-anything/core';
import { collapsedIn } from './collapse';
import type { Dash, ShapeKind } from './geometry';
import { arrowheadAt, directionOf, type Arrowhead, type Point, type Rect } from './geometry';
import { midpointOf } from './route';
import { isSideEnd, routeWithSides, type AnyEnd } from './rowRoutes';
import {
  changedSides,
  hidesContents,
  rowBox,
  rowFieldsOf,
  rowSidesOf,
  rowsBox,
  rowsChanged,
  sameRowFields,
  sideEndOf,
  withRowFields,
  type RowParts,
  type RowSides,
  type SideInfo,
} from './rowShapes';

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
  /**
   * What the shape writes under its name, its appearance's detail on one line: its component's
   * name, the values of the attributes it shows and the badges that hold (core's `detailText`), or
   * nothing. Absent, as on a shape made by hand, its component's name.
   */
  detail?: string;
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
  /**
   * Present when the view collapses this container: it draws none of the shapes that sit directly in
   * it, `contents` of them, and is drawn at its component's size, its stored size kept for when it
   * expands.
   */
  collapsed?: { contents: number };
  /**
   * On a shape that draws its contents as rows (ADR 0023): how many rows it draws; 0 for an empty
   * one, which keeps the height of one empty row, and for a collapsed one, which keeps its header.
   */
  rowCount?: number;
  /** On a row: its place among its container's rows, from 0, in the model's order. */
  row?: number;
  /** On a row: the elements it holds, which a row does not draw; the outline lists them. */
  undrawn?: readonly Id[];
  /**
   * On a row, and on a shape that draws rows: its name and what its header or line writes after it,
   * cut to one line each, ending in "…" when cut. `name` stays whole, for the editor and the outline.
   */
  fitted?: { name: string; detail: string };
}

/** A relation drawn along an orthogonal route, or an aggregated relation standing for several. */
export interface RelationLine {
  /**
   * The relation's id. An aggregated relation has a key of its own instead, which starts with
   * `aggregated ` and so is never an id.
   */
  relation: Id;
  /** The relation's name, shown at the middle of its route; `×3` on an aggregated relation. */
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
  /** Present on an aggregated relation: the relations it stands for. */
  aggregate?: AggregatedRelation;
}

/**
 * What an aggregated relation stands for: relations of one relation type between the contents of a
 * collapsed container and one far end, or the contents of two collapsed containers.
 */
export interface AggregatedRelation {
  relationType: Id;
  /** The relations it stands for, in model order; their count is the line's label. */
  relations: Id[];
  /**
   * Those of them that run from its `to` end to its `from` end. Only relations of an undirected
   * relation type, which aggregate whichever way they run, are ever reversed.
   */
  reversed?: Id[];
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
const STAND_IN_GAP = 40;
/** How far apart relations that relate the same two ends are drawn. */
const PARALLEL_GAP = 24;
/** How the key of an aggregated relation starts: a space, which no id holds. */
export const AGGREGATED = 'aggregated ';
/** How much wider than its relation type's line an aggregated relation is drawn, at most. */
const MOST_EXTRA_WIDTH = 4;

/** Whether a line is an aggregated relation, by its key. */
export function isAggregated(key: string): boolean {
  return key.startsWith(AGGREGATED);
}

/**
 * The relations of the model a line draws: its own, or those an aggregated relation stands for, which
 * no line of their own draws. Filters, focus, playback and guidance name relations by these ids.
 */
export function standsFor(line: RelationLine): readonly Id[] {
  return line.aggregate ? line.aggregate.relations : [line.relation];
}

/**
 * The key of the shape that the elements of a path draw, from one directly in World down to the
 * shape's own element: their ids joined by `/`. An element's shape inside a container has the
 * container's shape's key, `/`, and its own id.
 */
export function shapeKeyOf(path: readonly Id[]): string {
  return path.join('/');
}

const hidings = new WeakMap<Scene, ReadonlyMap<Id, number>>();
const firstShapeMaps = new WeakMap<readonly ElementShape[], Map<Id, ElementShape>>();

/**
 * The shape that shows an element in a scene: its first shape, in containment order; or, when only
 * collapsed containers hold it, the shape of the outermost collapsed container that holds its first
 * copy. None for an element the view does not draw.
 */
export function shownBy(scene: Scene, element: Id): ElementShape | undefined {
  let first = firstShapeMaps.get(scene.shapes);
  if (!first) {
    first = new Map();
    for (const shape of scene.shapes)
      if (!first.has(shape.element)) first.set(shape.element, shape);
    firstShapeMaps.set(scene.shapes, first);
  }
  const shape = first.get(element);
  if (shape) return shape;
  const holder = hidings.get(scene)?.get(element);
  return holder === undefined ? undefined : scene.shapes[holder];
}

/** How much wider than its relation type's line an aggregated relation of `count` relations is. */
export function aggregatedExtraWidth(count: number): number {
  return Math.min(MOST_EXTRA_WIDTH, 1 + Math.floor(Math.log2(Math.max(1, count))));
}

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

/** A layout, with what it was made from: what the next build of the same view starts from. */
interface Built {
  viewId: Id;
  model: ProjectSnapshot['model'];
  packages: ProjectSnapshot['packages'];
  view: ViewFile;
  definitions: Definitions;
  /** The nesting relation types that arranged it. */
  nesting: ReadonlySet<Id>;
  /** The relations of those types, in model order, that the containment tree was made from. */
  nestingRelations: readonly Relation[];
  tree: Placement[];
  collapsed: ReadonlySet<Id>;
  /**
   * For each element that only collapsed containers hold, the index of the shape of the outermost
   * one that holds its first copy.
   */
  hiddenIn: ReadonlyMap<Id, number>;
  layout: Layout;
  scene: Scene;
  /** What each line is drawn between, in drawing order. */
  plan: RelationPlan;
  /** The line drawn for each line of the plan; none where its route cannot be drawn. */
  lines: readonly (RelationLine | undefined)[];
  /** How each line of the plan leaves the rows and the shapes that draw rows it ends on. */
  sides: RowSides | undefined;
}

/** The view fields a layout does not depend on: a restack or a rename changes only these. */
const NOT_LAID_OUT: ReadonlySet<string> = new Set(['stackingOrder', 'name', 'description']);

/**
 * The last build of each view, by its positions: a change that leaves the positions, the model, the
 * packages and every other field of the view as they were reuses it.
 */
const exactly = new WeakMap<ViewFile['positions'], Built>();
/** The last build of each view, by its id, which the next build starts from. */
const latest = new Map<Id, Built>();

/**
 * Everything the view with this id draws. When nothing it draws changed, it is the same scene as
 * before; when only the view's stacking order changed, it shares everything but the drawing order;
 * otherwise only what changed is worked out again, and every shape and line equal to one drawn before
 * is that same object.
 */
export function buildScene(project: ProjectSnapshot, viewId: Id): Scene {
  const view = viewOf(project, viewId);
  const kept = exactly.get(view.positions);
  if (kept && laidOutFrom(kept, project, view)) return redrawn(kept, project, view);
  const built = layOut(project, view, latest.get(view.id));
  exactly.set(view.positions, built);
  latest.set(view.id, built);
  return built.scene;
}

/** What the view draws, worked out from nothing, as a build that keeps nothing from before would be. */
export function buildSceneAfresh(project: ProjectSnapshot, viewId: Id): Scene {
  return layOut(project, viewOf(project, viewId), undefined, false).scene;
}

function viewOf(project: ProjectSnapshot, viewId: Id): ViewFile {
  const view = project.views.find((candidate) => candidate.id === viewId);
  if (!view) throw new Error(`The project has no view ${JSON.stringify(viewId)}.`);
  return view;
}

/**
 * The scene of a layout kept as it was, drawn in the view's stacking order as it is now. The next
 * build of the view starts from it.
 */
function redrawn(kept: Built, project: ProjectSnapshot, view: ViewFile): Scene {
  if (kept.view.stackingOrder === view.stackingOrder) {
    latest.set(view.id, kept);
    return kept.scene;
  }
  const drawing = sameNumbers(
    drawingOrder(kept.layout, view, project.model.world.id),
    kept.scene.drawing,
  );
  const scene = sceneOf(kept.layout, drawing);
  hidings.set(scene, kept.hiddenIn);
  const next: Built = { ...kept, view, scene };
  exactly.set(view.positions, next);
  latest.set(view.id, next);
  return scene;
}

/** Whether a layout was made from this project's model and packages and from this view as it is now. */
function laidOutFrom(kept: Built, project: ProjectSnapshot, view: ViewFile): boolean {
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

/**
 * Lays out the view: every shape and relation, in containment and model order, keeping from `before`
 * whatever comes out the same. While containment, collapse and the definitions are as they were, only
 * the shapes whose element or position changed, and what holds them, are worked out again, and only
 * the lines on shapes that moved are routed again. With `keep` off, nothing is kept, not even what
 * depends only on an element: the build is made from nothing.
 */
function layOut(
  project: ProjectSnapshot,
  view: ViewFile,
  before: Built | undefined,
  keep = true,
): Built {
  const { model, packages } = project;
  const worldId = model.world.id;
  const definitions = definitionsIn(project);
  // Only the listed types that a package defines and that nest arrange the view, as in the core.
  const listed = nestingTypesInView(project, view);
  const nesting =
    before && sameMembers(before.nesting, listed) ? before.nesting : new Set<Id>(listed);
  const nestingRelations = model.relations.filter((relation) => nesting.has(relation.relationType));
  const sameContainment =
    before !== undefined &&
    before.model.world.id === worldId &&
    before.nesting === nesting &&
    sameIds(before.model.elements, model.elements) &&
    sameItems(before.nestingRelations, nestingRelations);
  const tree =
    sameContainment && before
      ? before.tree
      : containmentTree(model, (relationType) => nesting.has(relationType));
  const collapsed = collapsedIn(view);
  const free = freeShapesOf(view, before);

  const base =
    keep &&
    before !== undefined &&
    before.tree === tree &&
    before.collapsed === collapsed &&
    before.definitions === definitions
      ? before
      : undefined;
  const replaced = base && replaceShapes(project, view, definitions, tree, free, base);
  const placed =
    replaced ??
    placeShapes(
      project,
      view,
      definitions,
      tree,
      collapsed,
      free,
      keep ? before : undefined,
      keep,
    );
  const { shapes } = placed;

  const drawn = drawRelations(
    model.relations,
    nesting,
    placed,
    definitions,
    keep ? before : undefined,
    replaced !== undefined,
  );
  const relations =
    before && sameItems(before.layout.relations, drawn.relations)
      ? before.layout.relations
      : drawn.relations;

  const boundsKept =
    before !== undefined &&
    placed.geometryKept &&
    relations === before.layout.relations &&
    free.notes === before.layout.notes &&
    free.arrows === before.layout.arrows;
  const bounds = boundsKept
    ? before.layout.bounds
    : sceneBounds(shapes, relations, free.notes, free.arrows);

  const layout: Layout = {
    shapes,
    inWorld: placed.inWorld,
    contents: placed.contents,
    identity: placed.identity,
    relations,
    notes: free.notes,
    arrows: free.arrows,
    bounds: before && sameRect(bounds, before.layout.bounds) ? before.layout.bounds : bounds,
  };
  const orderKept =
    before !== undefined && placed.keysKept && before.view.stackingOrder === view.stackingOrder;
  const drawing =
    orderKept && before
      ? (before.scene.drawing ?? before.layout.identity)
      : sameNumbers(drawingOrder(layout, view, worldId), before?.scene.drawing);
  const scene =
    before &&
    before.layout.shapes === shapes &&
    before.layout.relations === relations &&
    before.layout.notes === free.notes &&
    before.layout.arrows === free.arrows &&
    before.layout.bounds === layout.bounds &&
    (before.scene.drawing ?? before.layout.identity) === drawing
      ? before.scene
      : sceneOf(layout, drawing);
  hidings.set(scene, placed.hiddenIn);
  return {
    viewId: view.id,
    model,
    packages,
    view,
    definitions,
    nesting,
    nestingRelations,
    tree,
    collapsed,
    hiddenIn: placed.hiddenIn,
    layout,
    scene,
    plan: drawn.plan,
    lines: drawn.lines,
    sides: drawn.sides,
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

/**
 * What depends only on an element and the definitions: how its shapes look, its component's name,
 * and its detail for each set of relation types it is the `from` end of, which its badges depend on.
 */
export interface Look {
  appearance: ResolvedAppearance;
  componentName: string;
  details: Map<string, string>;
}

const NO_TYPES: ReadonlySet<Id> = new Set();
const startedMaps = new WeakMap<readonly Relation[], Map<Id, Set<Id>>>();

/** The relation types each element starts relations of, for its badges, worked out once per list. */
function startedOf(relations: readonly Relation[]): Map<Id, Set<Id>> {
  let started = startedMaps.get(relations);
  if (!started) {
    started = startedTypesByElement(relations);
    startedMaps.set(relations, started);
  }
  return started;
}

/** An element's detail, given the relation types it starts. */
function detailFor(
  look: Look,
  element: Element,
  definitions: Definitions,
  started: ReadonlySet<Id> | undefined,
): string {
  const types = started ?? NO_TYPES;
  const key = types.size === 0 ? '' : [...types].sort().join(' ');
  let detail = look.details.get(key);
  if (detail === undefined) {
    detail = detailText(detailParts(element, definitions, types));
    look.details.set(key, detail);
  }
  return detail;
}

/** Whether two sets hold the same members. */
function sameTypes(a: ReadonlySet<Id> | undefined, b: ReadonlySet<Id> | undefined): boolean {
  if (a === b) return true;
  const x = a ?? NO_TYPES;
  const y = b ?? NO_TYPES;
  if (x.size !== y.size) return false;
  for (const type of x) if (!y.has(type)) return false;
  return true;
}

/** The looks of elements, for each set of definitions: dropped with them, when packages change. */
const looks = new WeakMap<Definitions, WeakMap<Element, Look>>();

function looksOf(definitions: Definitions, keep: boolean): WeakMap<Element, Look> {
  let kept = keep ? looks.get(definitions) : undefined;
  if (!kept) {
    kept = new WeakMap();
    if (keep) looks.set(definitions, kept);
  }
  return kept;
}

/** An element's look and its detail, as `measured` takes them. */
function lookAndDetail(
  element: Element,
  definitions: Definitions,
  kept: WeakMap<Element, Look>,
  started: ReadonlyMap<Id, ReadonlySet<Id>>,
): [Look, string] {
  const look = lookOf(element, definitions, kept);
  return [look, detailFor(look, element, definitions, started.get(element.id))];
}

function lookOf(element: Element, definitions: Definitions, kept: WeakMap<Element, Look>): Look {
  let look = kept.get(element);
  if (!look) {
    look = {
      appearance: appearanceOf(element, definitions),
      componentName: componentOrEssence(definitions, element.component).name,
      details: new Map(),
    };
    kept.set(element, look);
  }
  return look;
}

/** A placement with its size worked out, before it gets absolute coordinates. */
export interface Box {
  placement: Placement;
  width: number;
  height: number;
  /**
   * Where the box sits, relative to its container's shape or to the canvas when directly in World. It
   * comes from the view's stored position, or from the stand-in row once the row is laid out.
   */
  offset: Point | undefined;
  /** Whether the view stores its position. */
  stored: boolean;
  /** Absent for a box kept from the last build, whose shape says the rest. */
  measured?: Measured;
}

/** What a box measured again holds: what its shape is made from. */
export interface Measured {
  element: Element;
  look: Look;
  detail: string;
  position: ShapePosition | undefined;
  contents: Box[];
  /** For a collapsed container: how many shapes would sit directly in it. */
  folded?: number;
  /** For a shape that draws its contents as rows, and for a row (`rowShapes.ts`). */
  rows?: RowParts;
}

/** The view's shapes, and how they compare with the last build's. */
interface Placed {
  shapes: ElementShape[];
  inWorld: number[];
  contents: number[][];
  identity: readonly number[];
  hiddenIn: ReadonlyMap<Id, number>;
  /** Whether every shape has the key it had in the last build, at the same index. */
  keysKept: boolean;
  /** Whether, besides, every shape has the rectangle and extent it had. */
  geometryKept: boolean;
  /** The indexes of the shapes whose rectangle changed, while the keys are kept. */
  moved: readonly number[];
}

/** Measures a placement whose element or position changed, with the boxes of its contents. */
function measured(
  placement: Placement,
  element: Element,
  look: Look,
  detail: string,
  position: ShapePosition | undefined,
  collapsed: boolean,
  contentsOf: (asRows: boolean) => Box[],
  asRow = false,
): Box {
  // A row, and a shape that draws its contents as rows, are measured by their rows (ADR 0023).
  if (asRow) return rowBox(placement, element, look, detail);
  if (look.appearance.contentsAsRows) {
    return rowsBox(placement, element, look, detail, position, collapsed, () => contentsOf(true));
  }
  const { appearance } = look;
  const offset = position ? { x: position.x, y: position.y } : undefined;
  if (collapsed && placement.contents.length > 0) {
    return {
      placement,
      width: appearance.width,
      height: appearance.height,
      offset,
      stored: position !== undefined,
      measured: {
        element,
        look,
        detail,
        position,
        contents: [],
        folded: placement.contents.length,
      },
    };
  }
  const contents = contentsOf(false);
  arrangeContents(contents);
  let right: number | undefined;
  let bottom: number | undefined;
  for (const box of contents) {
    const boxRight = (box.offset?.x ?? 0) + box.width;
    const boxBottom = (box.offset?.y ?? 0) + box.height;
    if (right === undefined || boxRight > right) right = boxRight;
    if (bottom === undefined || boxBottom > bottom) bottom = boxBottom;
  }
  return {
    placement,
    width: containerSize(position?.width, appearance.width, right),
    height: containerSize(position?.height, appearance.height, bottom),
    offset,
    stored: position !== undefined,
    measured: { element, look, detail, position, contents },
  };
}

/** Lays out World's stand-in row: below every positioned shape directly in World and every free shape. */
function standInWorld(
  boxes: Box[],
  free: { notes: readonly NoteShape[]; arrows: readonly ArrowShape[] },
): void {
  let left = Infinity;
  let bottom = -Infinity;
  const extend = (x: number, y: number) => {
    if (x < left) left = x;
    if (y > bottom) bottom = y;
  };
  for (const box of boxes) if (box.offset) extend(box.offset.x, box.offset.y + box.height);
  for (const note of free.notes) extend(note.rect.x, note.rect.y + note.rect.height);
  for (const arrow of free.arrows) {
    extend(arrow.from.x, arrow.from.y);
    extend(arrow.to.x, arrow.to.y);
  }
  if (left === Infinity) layOutStandIn(boxes, 0, 0);
  else layOutStandIn(boxes, left, bottom + STAND_IN_GAP);
}

/**
 * The anchored shapes of every element except World, with absolute rectangles, containers first, and
 * which shapes sit directly in World and in each shape. A collapsed container's contents get no shape;
 * the elements that then have none are listed with the collapsed container that holds them.
 */
function placeShapes(
  project: ProjectSnapshot,
  view: ViewFile,
  definitions: Definitions,
  tree: readonly Placement[],
  collapsed: ReadonlySet<Id>,
  free: { notes: readonly NoteShape[]; arrows: readonly ArrowShape[] },
  before: Built | undefined,
  keep: boolean,
): Placed {
  const { model } = project;
  const elements = elementsById(model.elements);
  const positions = positionsOf(view, model.world.id);
  const kept = looksOf(definitions, keep);
  const started = startedOf(model.relations);

  const measure = (placement: Placement, asRow = false): Box => {
    const element = elements.get(placement.element) ?? {
      id: placement.element,
      component: ESSENCE_ID,
      name: placement.element,
    };
    return measured(
      placement,
      element,
      ...lookAndDetail(element, definitions, kept, started),
      positions.get(positionKey(placement.element, placement.container)),
      collapsed.has(placement.element),
      (asRows) => placement.contents.map((content) => measure(content, asRows)),
      asRow,
    );
  };
  const worldContents = tree.map((placement) => measure(placement));
  standInWorld(worldContents, free);

  const previous = before?.layout.shapes;
  const previousAt = previous ? keyIndexOf(previous) : undefined;
  const shapes: ElementShape[] = [];
  const contents: number[][] = [];
  const hiddenIn = new Map<Id, number>();
  const moved: number[] = [];
  let keysKept = previous !== undefined;
  let geometryKept = previous !== undefined;

  const hide = (placement: Placement, under: number) => {
    for (const content of placement.contents) {
      if (!hiddenIn.has(content.element)) hiddenIn.set(content.element, under);
      hide(content, under);
    }
  };

  const place = (box: Box, originX: number, originY: number, path: string | undefined): number => {
    const parts = box.measured as Measured;
    const offset = box.offset ?? ORIGIN;
    const x = originX + offset.x;
    const y = originY + offset.y;
    const key = path === undefined ? parts.element.id : `${path}/${parts.element.id}`;
    const at = shapes.length;
    // Its place is kept before its contents', so that a container comes before them.
    shapes.push(undefined as unknown as ElementShape);
    const inside: number[] = [];
    contents.push(inside);
    for (const content of parts.contents) inside.push(place(content, x, y, key));
    const shape = shapeFor(
      previousAt === undefined ? undefined : previous?.[previousAt.get(key) ?? -1],
      box,
      key,
      path,
      offset,
      x,
      y,
      inside,
      shapes,
    );
    shapes[at] = shape;
    const was = previous?.[at];
    if (was?.key !== key) {
      keysKept = false;
      geometryKept = false;
    } else if (was !== shape) {
      if (!sameRect(was.rect, shape.rect)) {
        geometryKept = false;
        moved.push(at);
      } else if (!sameRect(was.extent, shape.extent)) geometryKept = false;
    }
    if (parts.folded !== undefined || hidesContents(parts)) hide(box.placement, at);
    return at;
  };
  const inWorld = worldContents.map((box) => place(box, 0, 0, undefined));
  if (previous && previous.length !== shapes.length) {
    keysKept = false;
    geometryKept = false;
  }
  if (before && !sameHidden(before.hiddenIn, hiddenIn)) geometryKept = false;
  const allKept = keysKept && previous !== undefined && sameItems(previous, shapes);
  return {
    shapes: allKept && previous ? previous : shapes,
    inWorld: keysKept && before ? before.layout.inWorld : inWorld,
    contents: keysKept && before ? before.layout.contents : contents,
    identity: keysKept && before ? before.layout.identity : shapes.map((_, at) => at),
    hiddenIn: before && sameHidden(before.hiddenIn, hiddenIn) ? before.hiddenIn : hiddenIn,
    keysKept,
    geometryKept,
    moved: keysKept ? moved : [],
  };
}

const ORIGIN: Readonly<Point> = { x: 0, y: 0 };

/** Where each placement sits in a containment tree, and the placements of each element. */
interface TreeIndex {
  /** The placement each one sits in; none for one directly in World. */
  holder: Map<Placement, Placement | undefined>;
  byElement: Map<Id, Placement[]>;
}

const treeIndexes = new WeakMap<readonly Placement[], TreeIndex>();

function treeIndexOf(tree: readonly Placement[]): TreeIndex {
  let index = treeIndexes.get(tree);
  if (!index) {
    const holder = new Map<Placement, Placement | undefined>();
    const byElement = new Map<Id, Placement[]>();
    const visit = (placement: Placement, outer: Placement | undefined) => {
      holder.set(placement, outer);
      const list = byElement.get(placement.element);
      if (list) list.push(placement);
      else byElement.set(placement.element, [placement]);
      for (const content of placement.contents) visit(content, placement);
    };
    for (const placement of tree) visit(placement, undefined);
    index = { holder, byElement };
    treeIndexes.set(tree, index);
  }
  return index;
}

/** Thrown, and caught, when a shape starts or stops drawing its contents as rows. */
const STALE = Symbol('stale');

/**
 * The shapes of a view whose containment, collapse and definitions are those of `base`: they sit at
 * the same indexes, so only the shapes whose element or position changed, what holds them and what
 * moves with them are worked out again; every other shape is the one `base` drew. Undefined when a
 * changed element starts or stops drawing its contents as rows, which changes the shapes there are.
 */
function replaceShapes(
  project: ProjectSnapshot,
  view: ViewFile,
  definitions: Definitions,
  tree: readonly Placement[],
  free: { notes: readonly NoteShape[]; arrows: readonly ArrowShape[] },
  base: Built,
): Placed | undefined {
  const { model } = project;
  const index = treeIndexOf(tree);
  const dirty = new Set<Placement>();
  const mark = (placement: Placement) => {
    for (
      let at: Placement | undefined = placement;
      at !== undefined && !dirty.has(at);
      at = index.holder.get(at)
    ) {
      dirty.add(at);
    }
  };
  const was = base.model.elements;
  const now = model.elements;
  if (was !== now) {
    for (let at = 0; at < now.length; at++) {
      const element = now[at] as Element;
      if (element !== was[at])
        for (const placement of index.byElement.get(element.id) ?? []) mark(placement);
    }
  }
  if (base.model.relations !== model.relations) {
    const before = startedOf(base.model.relations);
    const after = startedOf(model.relations);
    const differ = (id: Id) => {
      if (!sameTypes(before.get(id), after.get(id))) {
        for (const placement of index.byElement.get(id) ?? []) mark(placement);
      }
    };
    for (const id of after.keys()) differ(id);
    for (const id of before.keys()) if (!after.has(id)) differ(id);
  }
  const { positions, changed } = positionsAfter(base.view, view, model.world.id);
  if (changed.length > 0) {
    for (const key of changed) {
      const [element, container] = key.split('\u0000') as [Id, Id | undefined];
      for (const placement of index.byElement.get(element) ?? []) {
        if (placement.container === container) mark(placement);
      }
    }
  }

  const elements = elementsById(now);
  const kept = looksOf(definitions, true);
  const started = startedOf(model.relations);
  const old = base.layout.shapes;
  const { contents, inWorld } = base.layout;
  const collapsed = base.collapsed;

  const measureAt = (at: number, placement: Placement, asRow = false): Box => {
    if (!asRow && !dirty.has(placement)) {
      const shape = old[at] as ElementShape;
      const stored = shape.positioned !== 'placed';
      return {
        placement,
        width: shape.rect.width,
        height: shape.rect.height,
        offset: stored ? shape.offset : undefined,
        stored,
      };
    }
    const element = elements.get(placement.element) ?? {
      id: placement.element,
      component: ESSENCE_ID,
      name: placement.element,
    };
    const inside = asRow ? [] : (contents[at] as number[]);
    const [look, detail] = lookAndDetail(element, definitions, kept, started);
    // A shape that starts or stops drawing its contents as rows changes which shapes there are.
    if (!asRow && rowsChanged(old[at] as ElementShape, look)) throw STALE;
    return measured(
      placement,
      element,
      look,
      detail,
      positions.get(positionKey(placement.element, placement.container)),
      collapsed.has(placement.element),
      (asRows) =>
        placement.contents.map((content, each) =>
          measureAt(inside[each] as number, content, asRows),
        ),
      asRow,
    );
  };
  let worldContents: Box[];
  try {
    worldContents = tree.map((placement, each) => measureAt(inWorld[each] as number, placement));
  } catch (error) {
    if (error === STALE) return undefined;
    throw error;
  }
  standInWorld(worldContents, free);

  let shapes: ElementShape[] | undefined;
  const moved: number[] = [];
  let extentChanged = false;
  const write = (at: number, shape: ElementShape) => {
    const before = old[at] as ElementShape;
    if (shape === before) return;
    shapes ??= old.slice();
    shapes[at] = shape;
    if (!sameRect(before.rect, shape.rect)) moved.push(at);
    else if (!sameRect(before.extent, shape.extent)) extentChanged = true;
  };
  const current = (at: number) => (shapes ?? old)[at] as ElementShape;
  // Moves a shape kept as it was, with everything inside it.
  const translate = (at: number, dx: number, dy: number, offset: Point | undefined) => {
    const shape = old[at] as ElementShape;
    write(at, {
      ...shape,
      ...(offset && !samePoint(offset, shape.offset) ? { offset } : {}),
      rect: { ...shape.rect, x: shape.rect.x + dx, y: shape.rect.y + dy },
      extent: { ...shape.extent, x: shape.extent.x + dx, y: shape.extent.y + dy },
    });
    for (const inner of contents[at] as number[]) translate(inner, dx, dy, undefined);
  };
  const placeAt = (
    at: number,
    box: Box,
    originX: number,
    originY: number,
    path: string | undefined,
  ): void => {
    const shape = old[at] as ElementShape;
    const offset = box.offset ?? ORIGIN;
    const x = originX + offset.x;
    const y = originY + offset.y;
    if (!box.measured) {
      const dx = x - shape.rect.x;
      const dy = y - shape.rect.y;
      if (dx !== 0 || dy !== 0 || !samePoint(offset, shape.offset)) translate(at, dx, dy, offset);
      return;
    }
    const inside = contents[at] as number[];
    box.measured.contents.forEach((content, each) =>
      placeAt(inside[each] as number, content, x, y, shape.key),
    );
    write(at, shapeFor(shape, box, shape.key, path, offset, x, y, inside, { at: current }));
  };
  tree.forEach((_, each) =>
    placeAt(inWorld[each] as number, worldContents[each] as Box, 0, 0, undefined),
  );
  return {
    shapes: shapes ?? old,
    inWorld,
    contents,
    identity: base.layout.identity,
    hiddenIn: base.hiddenIn,
    keysKept: true,
    geometryKept: moved.length === 0 && !extentChanged,
    moved,
  };
}

/**
 * The view's positions by key, and the keys of those that differ from the ones `base` had. While the
 * positions keep their keys and places, as when some are set again, only those are looked at, and the
 * map is the base's with them in it.
 */
function positionsAfter(
  base: ViewFile,
  view: ViewFile,
  worldId: Id,
): { positions: Map<string, ShapePosition>; changed: string[] } {
  const before = base.positions;
  const after = view.positions;
  if (before === after) return { positions: positionsOf(view, worldId), changed: [] };
  const baseMap = positionsOf(base, worldId);
  const keyOf = (position: ShapePosition) =>
    positionKey(position.element, position.container === worldId ? undefined : position.container);
  if (before.length === after.length) {
    const changed: string[] = [];
    let inPlace = true;
    for (let at = 0; at < after.length; at++) {
      const was = before[at] as ShapePosition;
      const now = after[at] as ShapePosition;
      if (was === now) continue;
      const key = keyOf(now);
      changed.push(key);
      const wasKey = keyOf(was);
      if (wasKey !== key) changed.push(wasKey);
      if (wasKey !== key || baseMap.get(key) !== was) inPlace = false;
    }
    if (inPlace && !positionMaps.has(after)) {
      const positions = new Map(baseMap);
      for (let at = 0; at < after.length; at++) {
        const now = after[at] as ShapePosition;
        if (now !== before[at]) positions.set(keyOf(now), now);
      }
      positionMaps.set(after, positions);
    }
    return { positions: positionsOf(view, worldId), changed };
  }
  const positions = positionsOf(view, worldId);
  const changed: string[] = [];
  for (const [key, position] of positions) if (baseMap.get(key) !== position) changed.push(key);
  for (const key of baseMap.keys()) if (!positions.has(key)) changed.push(key);
  return { positions, changed };
}

/**
 * The shape of a measured box placed at (x, y): the shape `before` when it is equal to it, field by
 * field. Its extent holds the extents of its contents, found by their indexes in `shapes`.
 */
function shapeFor(
  before: ElementShape | undefined,
  box: Box,
  key: string,
  path: string | undefined,
  offset: Point,
  x: number,
  y: number,
  inside: readonly number[],
  shapes: { at(at: number): ElementShape | undefined },
): ElementShape {
  const parts = box.measured as Measured;
  const { width, height } = box;
  let x1 = x;
  let y1 = y;
  let x2 = x + width;
  let y2 = y + height;
  for (const each of inside) {
    const other = shapes.at(each) as ElementShape;
    const extent = other.extent;
    if (extent.x < x1) x1 = extent.x;
    if (extent.y < y1) y1 = extent.y;
    if (extent.x + extent.width > x2) x2 = extent.x + extent.width;
    if (extent.y + extent.height > y2) y2 = extent.y + extent.height;
  }
  const { element, look, detail, position, folded } = parts;
  const { appearance } = look;
  const positioned = position ? (position.pinned ? 'pinned' : 'stored') : 'placed';
  const container = box.placement.container;
  const holdsContents = parts.contents.length > 0;
  const rowish = rowFieldsOf(parts, width, holdsContents);
  if (
    before &&
    sameRowFields(before, rowish) &&
    before.key === key &&
    before.element === element.id &&
    before.container === container &&
    before.containerShape === path &&
    before.offset.x === offset.x &&
    before.offset.y === offset.y &&
    before.storedSize?.width === position?.width &&
    before.storedSize?.height === position?.height &&
    before.positioned === positioned &&
    before.name === element.name &&
    before.componentName === look.componentName &&
    before.detail === detail &&
    before.kind === rowish.kind &&
    before.fill === appearance.fill &&
    before.stroke === appearance.stroke &&
    before.rect.x === x &&
    before.rect.y === y &&
    before.rect.width === width &&
    before.rect.height === height &&
    before.extent.x === x1 &&
    before.extent.y === y1 &&
    before.extent.width === x2 - x1 &&
    before.extent.height === y2 - y1 &&
    before.holdsContents === holdsContents &&
    before.collapsed?.contents === folded
  ) {
    return before;
  }
  const rect = { x, y, width, height };
  const shape: ElementShape = {
    key,
    element: element.id,
    offset,
    positioned,
    name: element.name,
    componentName: look.componentName,
    detail,
    kind: rowish.kind,
    fill: appearance.fill,
    stroke: appearance.stroke,
    rect,
    extent:
      x1 === x && y1 === y && x2 === x + width && y2 === y + height
        ? rect
        : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    holdsContents,
  };
  if (container !== undefined) shape.container = container;
  if (path !== undefined) shape.containerShape = path;
  if (position && (position.width !== undefined || position.height !== undefined)) {
    shape.storedSize = {};
    if (position.width !== undefined) shape.storedSize.width = position.width;
    if (position.height !== undefined) shape.storedSize.height = position.height;
  }
  if (folded !== undefined) shape.collapsed = { contents: folded };
  withRowFields(shape, rowish);
  return shape;
}

/**
 * Gives contents without a stored position a place in a row below the contents that have one, and
 * below the container's name, even when those stick out of its top.
 */
function arrangeContents(contents: Box[]): void {
  let below: number | undefined;
  for (const box of contents) {
    if (!box.stored || !box.offset) continue;
    const boxBottom = box.offset.y + box.height;
    if (below === undefined || boxBottom > below) below = boxBottom;
  }
  layOutStandIn(
    contents,
    CONTAINER_PADDING,
    below === undefined ? CONTAINER_HEADER : Math.max(CONTAINER_HEADER, below + STAND_IN_GAP),
  );
}

/** Places every box whose position the view does not store in the stand-in row starting at (x, y). */
function layOutStandIn(boxes: Box[], x: number, y: number): void {
  let next = x;
  for (const box of boxes) {
    if (box.stored) continue;
    box.offset = { x: next, y };
    next += box.width + STAND_IN_GAP;
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

const elementMaps = new WeakMap<readonly Element[], Map<Id, Element>>();

function elementsById(elements: readonly Element[]): Map<Id, Element> {
  let byId = elementMaps.get(elements);
  if (!byId) {
    byId = new Map(elements.map((element) => [element.id, element]));
    elementMaps.set(elements, byId);
  }
  return byId;
}

const positionMaps = new WeakMap<readonly ShapePosition[], Map<string, ShapePosition>>();

/** The view's positions by element and container; a position in World has no container. */
function positionsOf(view: ViewFile, worldId: Id): Map<string, ShapePosition> {
  let positions = positionMaps.get(view.positions);
  if (!positions) {
    positions = new Map();
    for (const position of view.positions) {
      const container = position.container === worldId ? undefined : position.container;
      const key = positionKey(position.element, container);
      if (!positions.has(key)) positions.set(key, position);
    }
    positionMaps.set(view.positions, positions);
  }
  return positions;
}

function positionKey(element: Id, container: Id | undefined): string {
  return container === undefined ? element : `${element}\u0000${container}`;
}

const keyIndexes = new WeakMap<readonly ElementShape[], Map<string, number>>();

/** Each shape's index, by its key. */
function keyIndexOf(shapes: readonly ElementShape[]): Map<string, number> {
  let byKey = keyIndexes.get(shapes);
  if (!byKey) {
    byKey = new Map(shapes.map((shape, at) => [shape.key, at]));
    keyIndexes.set(shapes, byKey);
  }
  return byKey;
}

/** One end of a line: a shape, by its index, or the line of another relation, by its key. */
interface EndRef {
  kind: 'shape' | 'relation';
  /** The shape's index, for a shape. */
  at: number;
  /** The shape's key, or the line's. */
  key: string;
  /** Whether the shape stands in for an element that a collapsed container holds. */
  via: boolean;
  /** The end's key among the ends lines are drawn between. */
  id: string;
}

/** What a line is drawn for: one relation, or the relations an aggregated relation stands for. */
interface LineSpec {
  key: string;
  from: EndRef;
  to: EndRef;
  relationType: Id;
  /** The relation, for a line that draws one. */
  relation?: Id;
  members?: Id[];
  reversed?: Id[];
  offset: number;
}

/**
 * What every line is drawn between, in drawing order, worked out from the relations, the shapes'
 * keys and what collapsed containers hide; and which lines end on each shape and on each line.
 */
interface RelationPlan {
  specs: LineSpec[];
  byKey: Map<string, number>;
  onShape: Map<number, number[]>;
  onLine: Map<string, number[]>;
}

/** What a line was routed and written from, to tell whether a line drawn before is still right. */
interface LineInputs {
  from: string;
  to: string;
  fromRoute: readonly number[];
  toRoute: readonly number[];
  offset: number;
  definitions: Definitions;
  source: Relation | string;
}

const lineInputs = new WeakMap<RelationLine, LineInputs>();

const relationMaps = new WeakMap<readonly Relation[], Map<Id, Relation>>();

function relationsById(relations: readonly Relation[]): Map<Id, Relation> {
  let byId = relationMaps.get(relations);
  if (!byId) {
    byId = new Map();
    for (const relation of relations) if (!byId.has(relation.id)) byId.set(relation.id, relation);
    relationMaps.set(relations, byId);
  }
  return byId;
}

/**
 * Every relation whose relation type is not one of the view's nesting relation types and whose ends
 * both show, in model order. A relation that ends on another relation attaches to the middle of that
 * relation's line. An element with several shapes is related through its first one that shows. A
 * relation with an end that only a collapsed container holds is drawn in an aggregated relation from
 * that container, one for each relation type and far end, at the place of the first relation it
 * stands for; a relation between two contents of the same collapsed container is not drawn.
 *
 * With `kept` on, the shapes keep the keys `before` had and its plan still holds: only the lines on
 * shapes that moved, the lines of relations that changed, and the lines that end on those, are
 * routed again.
 */
function drawRelations(
  relations: readonly Relation[],
  nesting: ReadonlySet<Id>,
  placed: Placed,
  definitions: Definitions,
  before: Built | undefined,
  kept: boolean,
): {
  relations: RelationLine[];
  plan: RelationPlan;
  lines: (RelationLine | undefined)[];
  sides: RowSides | undefined;
} {
  const { shapes } = placed;
  const byId = relationsById(relations);
  let plan: RelationPlan;
  let sides: RowSides | undefined;
  let again: Set<number> | undefined;
  const changed = kept && before ? changedRelations(before.model.relations, relations) : undefined;
  if (kept && before && changed) {
    plan = before.plan;
    again = new Set();
    for (const at of placed.moved) for (const spec of plan.onShape.get(at) ?? []) again.add(spec);
    for (const id of changed) {
      const spec = plan.byKey.get(id);
      if (spec !== undefined) again.add(spec);
    }
    // A line whose end on a row now leaves by another side or lane is routed again.
    sides = rowSidesOf(plan.specs, shapes, keyIndexOf(shapes));
    for (const spec of changedSides(before.sides, sides)) again.add(spec);
    const waiting = [...again];
    for (let spec = waiting.pop(); spec !== undefined; spec = waiting.pop()) {
      for (const next of plan.onLine.get((plan.specs[spec] as LineSpec).key) ?? []) {
        if (!again.has(next)) {
          again.add(next);
          waiting.push(next);
        }
      }
    }
    if (again.size === 0) {
      return {
        relations: before.layout.relations,
        plan,
        lines: before.lines as RelationLine[],
        sides,
      };
    }
  } else {
    plan = planRelations(relations, nesting, shapes, placed.hiddenIn, definitions);
    sides = rowSidesOf(plan.specs, shapes, keyIndexOf(shapes));
  }

  const previousLines = before?.lines;
  const previousAt = before?.plan.byKey;
  const lines: (RelationLine | undefined)[] = new Array<RelationLine | undefined>(
    plan.specs.length,
  );
  const done = new Uint8Array(plan.specs.length);
  const lineAt = (at: number): RelationLine | undefined => {
    if (done[at] === 1) return lines[at];
    if (done[at] === 2) return undefined;
    if (again && !again.has(at)) {
      done[at] = 1;
      lines[at] = previousLines?.[at];
      return lines[at];
    }
    done[at] = 2;
    const spec = plan.specs[at] as LineSpec;
    const from = routeEndOf(spec.from, shapes, plan, lineAt, sides?.from[at]);
    const to = routeEndOf(spec.to, shapes, plan, lineAt, sides?.to[at]);
    const previous = previousAt?.get(spec.key);
    const line =
      from && to
        ? lineBetween(
            spec,
            from,
            to,
            definitions,
            spec.relation === undefined ? undefined : byId.get(spec.relation),
            previous === undefined ? undefined : previousLines?.[previous],
          )
        : undefined;
    lines[at] = line;
    done[at] = 1;
    return line;
  };
  const drawn: RelationLine[] = [];
  for (let at = 0; at < plan.specs.length; at++) {
    const line = lineAt(at);
    if (line) drawn.push(line);
  }
  return { relations: drawn, plan, lines, sides };
}

/**
 * The ids of the relations whose objects changed while every relation keeps its id, ends and
 * relation type in the same place; undefined when one does not, which changes the plan.
 */
function changedRelations(
  before: readonly Relation[],
  after: readonly Relation[],
): Id[] | undefined {
  if (before === after) return [];
  if (before.length !== after.length) return undefined;
  const changed: Id[] = [];
  for (let at = 0; at < after.length; at++) {
    const a = before[at] as Relation;
    const b = after[at] as Relation;
    if (a === b) continue;
    if (a.id !== b.id || a.from !== b.from || a.to !== b.to || a.relationType !== b.relationType) {
      return undefined;
    }
    changed.push(b.id);
  }
  return changed;
}

/** Works out what every line is drawn between: see `drawRelations`. */
function planRelations(
  relations: readonly Relation[],
  nesting: ReadonlySet<Id>,
  shapes: readonly ElementShape[],
  hiddenIn: ReadonlyMap<Id, number>,
  definitions: Definitions,
): RelationPlan {
  const firstShapes = new Map<Id, number>();
  shapes.forEach((shape, at) => {
    if (!firstShapes.has(shape.element)) firstShapes.set(shape.element, at);
  });
  const candidates = new Map<Id, Relation>();
  const rankOf = new Map<Id, number>();
  for (const relation of relations) {
    if (!nesting.has(relation.relationType) && !candidates.has(relation.id)) {
      rankOf.set(relation.id, candidates.size);
      candidates.set(relation.id, relation);
    }
  }

  const keys = new Map<Id, string | undefined>();
  const specs = new Map<string, LineSpec>();
  const resolving = new Set<Id>();
  const shapeEnd = (at: number, via: boolean): EndRef => {
    const key = (shapes[at] as ElementShape).key;
    return { kind: 'shape', at, key, via, id: `s ${key}` };
  };
  const endOf = (id: Id): EndRef | undefined => {
    const first = firstShapes.get(id);
    if (first !== undefined) return shapeEnd(first, false);
    const holder = hiddenIn.get(id);
    if (holder !== undefined) return shapeEnd(holder, true);
    const key = keyOf(id);
    return key === undefined
      ? undefined
      : { kind: 'relation', at: -1, key, via: false, id: `r ${key}` };
  };
  // The key of the line that draws a relation: its id, an aggregated relation's key, or none.
  const keyOf = (id: Id): string | undefined => {
    if (keys.has(id)) return keys.get(id);
    const relation = candidates.get(id);
    // A relation that, through others, ends on itself cannot be drawn.
    if (!relation || resolving.has(id)) return undefined;
    resolving.add(id);
    const from = endOf(relation.from);
    const to = endOf(relation.to);
    resolving.delete(id);
    let key: string | undefined;
    if (from && to && from.id !== to.id) {
      if (from.via || to.via) {
        const undirected =
          relationTypeOrRelatesTo(definitions, relation.relationType).direction === 'undirected';
        const reversed = undirected && from.id > to.id;
        const [a, b] = reversed ? [to, from] : [from, to];
        key = `${AGGREGATED}${JSON.stringify([relation.relationType, a.id, b.id])}`;
        let spec = specs.get(key);
        if (!spec) {
          spec = {
            key,
            from: a,
            to: b,
            relationType: relation.relationType,
            members: [],
            reversed: [],
            offset: 0,
          };
          specs.set(key, spec);
        }
        spec.members?.push(id);
        if (reversed) spec.reversed?.push(id);
      } else {
        key = id;
        specs.set(key, {
          key,
          from,
          to,
          relationType: relation.relationType,
          relation: id,
          offset: 0,
        });
      }
    }
    keys.set(id, key);
    return key;
  };

  // In model order, an aggregated relation at the place of the first relation it stands for.
  const ordered: LineSpec[] = [];
  const listed = new Set<string>();
  for (const id of candidates.keys()) {
    const key = keyOf(id);
    if (key === undefined || listed.has(key)) continue;
    listed.add(key);
    ordered.push(specs.get(key) as LineSpec);
  }
  const byRank = (a: Id, b: Id) => (rankOf.get(a) ?? 0) - (rankOf.get(b) ?? 0);
  // Lines between the same two ends, whichever way each one points, run side by side.
  const siblings = new Map<string, LineSpec[]>();
  for (const spec of ordered) {
    if (spec.members) {
      spec.members.sort(byRank);
      spec.reversed?.sort(byRank);
    }
    const pair =
      spec.from.id < spec.to.id
        ? `${spec.from.id}\u0000${spec.to.id}`
        : `${spec.to.id}\u0000${spec.from.id}`;
    const list = siblings.get(pair);
    if (list) list.push(spec);
    else siblings.set(pair, [spec]);
  }
  for (const list of siblings.values()) {
    list.forEach((spec, at) => {
      spec.offset = (at - (list.length - 1) / 2) * PARALLEL_GAP;
    });
  }

  const byKey = new Map<string, number>();
  const onShape = new Map<number, number[]>();
  const onLine = new Map<string, number[]>();
  ordered.forEach((spec, at) => {
    byKey.set(spec.key, at);
    for (const end of spec.from === spec.to ? [spec.from] : [spec.from, spec.to]) {
      if (end.kind === 'shape') append(onShape, end.at, at);
      else append(onLine, end.key, at);
    }
  });
  return { specs: ordered, byKey, onShape, onLine };
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function routeEndOf(
  end: EndRef,
  shapes: readonly ElementShape[],
  plan: RelationPlan,
  lineAt: (at: number) => RelationLine | undefined,
  side?: SideInfo,
): AnyEnd | undefined {
  if (end.kind === 'shape') {
    const shape = shapes[end.at] as ElementShape;
    // A row, or a shape that draws rows, is left beside it (ADR 0023).
    if (side) return sideEndOf(shape, shapes, keyIndexOf(shapes), side);
    return { rect: shape.rect };
  }
  const at = plan.byKey.get(end.key);
  const line = at === undefined ? undefined : lineAt(at);
  return line && { point: line.middle };
}

function drawnEnd(end: EndRef): DrawnEnd {
  return end.kind === 'shape'
    ? { kind: 'shape', key: end.key }
    : { kind: 'relation', relation: end.key };
}

function routeNumbers(end: AnyEnd): number[] {
  if (isSideEnd(end)) {
    const { container, y, lane, side } = end;
    return [container.x, container.y, container.width, container.height, y, lane, side === 'right' ? 1 : -1];
  }
  return 'rect' in end
    ? [end.rect.x, end.rect.y, end.rect.width, end.rect.height]
    : [end.point.x, end.point.y];
}

/**
 * The route of a line between two ends, from border to border, beside the others between the same
 * ends; the line drawn before, `kept`, when it was drawn from the same ends and the same relations.
 */
function lineBetween(
  spec: LineSpec,
  from: AnyEnd,
  to: AnyEnd,
  definitions: Definitions,
  relation: Relation | undefined,
  kept: RelationLine | undefined,
): RelationLine | undefined {
  const { offset, members } = spec;
  const inputs: LineInputs = {
    from: spec.from.id,
    to: spec.to.id,
    fromRoute: routeNumbers(from),
    toRoute: routeNumbers(to),
    offset,
    definitions,
    source: relation ?? `${spec.relationType} ${members?.join(' ')} | ${spec.reversed?.join(' ')}`,
  };
  const was = kept && lineInputs.get(kept);
  if (
    kept &&
    was &&
    was.from === inputs.from &&
    was.to === inputs.to &&
    sameItems(was.fromRoute, inputs.fromRoute) &&
    sameItems(was.toRoute, inputs.toRoute) &&
    was.offset === offset &&
    was.definitions === definitions &&
    was.source === inputs.source
  ) {
    return kept;
  }

  const route = routeWithSides(from, to, offset);
  const start = route[0] as Point;
  const end = route.at(-1) as Point;
  const beforeEnd = route.at(-2) as Point;
  if (!directionOf(beforeEnd, end)) return undefined;

  const relationType = relationTypeOrRelatesTo(definitions, spec.relationType);
  const { stroke, dash } = relationType.appearance;
  const width =
    relationType.appearance.width + (members ? aggregatedExtraWidth(members.length) : 0);
  const label = members ? `×${members.length}` : relation?.name;
  const line: RelationLine = {
    relation: spec.key,
    route,
    from: start,
    to: end,
    middle: midpointOf(route),
    stroke,
    width,
    dash,
    ends: { from: drawnEnd(spec.from), to: drawnEnd(spec.to), offset },
  };
  if (label) line.label = label;
  if (relationType.direction === 'directed') line.arrowhead = arrowheadAt(beforeEnd, end, width);
  if (members) {
    line.aggregate = { relationType: spec.relationType, relations: members };
    if (spec.reversed && spec.reversed.length > 0) line.aggregate.reversed = spec.reversed;
  }
  lineInputs.set(line, inputs);
  return line;
}

/** The notes and arrows of the view: those of `before` while its free shapes are the same. */
function freeShapesOf(
  view: ViewFile,
  before: Built | undefined,
): { notes: NoteShape[]; arrows: ArrowShape[] } {
  if (before && before.view.freeShapes === view.freeShapes) {
    return { notes: before.layout.notes, arrows: before.layout.arrows };
  }
  return {
    notes: view.freeShapes.filter(isNote).map(noteShape),
    arrows: view.freeShapes.filter(isArrow).map(arrowShape),
  };
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

const lineBounds = new WeakMap<RelationLine, Rect>();

/** The smallest rectangle around a line: its route and its arrowhead. */
function boundsOfLine(line: RelationLine): Rect {
  let rect = lineBounds.get(line);
  if (!rect) {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    const take = (point: Point) => {
      if (point.x < x1) x1 = point.x;
      if (point.y < y1) y1 = point.y;
      if (point.x > x2) x2 = point.x;
      if (point.y > y2) y2 = point.y;
    };
    for (const point of line.route) take(point);
    if (line.arrowhead) {
      take(line.arrowhead.left);
      take(line.arrowhead.right);
    }
    rect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    lineBounds.set(line, rect);
  }
  return rect;
}

/** The smallest rectangle holding everything the scene draws; undefined when it draws nothing. */
function sceneBounds(
  shapes: readonly ElementShape[],
  relations: readonly RelationLine[],
  notes: readonly NoteShape[],
  arrows: readonly ArrowShape[],
): Rect | undefined {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const take = (x: number, y: number, width: number, height: number) => {
    if (x < x1) x1 = x;
    if (y < y1) y1 = y;
    if (x + width > x2) x2 = x + width;
    if (y + height > y2) y2 = y + height;
  };
  for (const shape of shapes) take(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height);
  for (const note of notes) take(note.rect.x, note.rect.y, note.rect.width, note.rect.height);
  for (const line of relations) {
    const rect = boundsOfLine(line);
    take(rect.x, rect.y, rect.width, rect.height);
  }
  for (const arrow of arrows) {
    for (const point of [arrow.from, arrow.to, arrow.arrowhead.left, arrow.arrowhead.right]) {
      take(point.x, point.y, 0, 0);
    }
  }
  return x1 > x2 ? undefined : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** The relations a scene draws, by id, each with the line that draws it: its own, or an aggregated one. */
export function relationLinesOf(scene: Scene): ReadonlyMap<Id, RelationLine> {
  let byId = relationLines.get(scene.relations);
  if (!byId) {
    byId = new Map();
    for (const line of scene.relations) {
      if (line.aggregate) for (const id of line.aggregate.relations) byId.set(id, line);
      else byId.set(line.relation, line);
    }
    relationLines.set(scene.relations, byId);
  }
  return byId;
}

const relationLines = new WeakMap<readonly RelationLine[], Map<Id, RelationLine>>();

function sameRect(a: Rect | undefined, b: Rect | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The numbers given, or `before` when it holds the same ones, in the same order. */
function sameNumbers(
  numbers: readonly number[],
  before: readonly number[] | undefined,
): readonly number[] {
  if (!before || before === numbers || before.length !== numbers.length) return numbers;
  for (let at = 0; at < numbers.length; at++) if (numbers[at] !== before[at]) return numbers;
  return before;
}

/** Whether two lists hold the same items in the same order. */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
  return true;
}

/** Whether two lists of elements hold the same ids in the same order. */
function sameIds(a: readonly Element[], b: readonly Element[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) {
    const x = a[at] as Element;
    const y = b[at] as Element;
    if (x !== y && x.id !== y.id) return false;
  }
  return true;
}

function sameMembers(set: ReadonlySet<Id>, list: readonly Id[]): boolean {
  const unique = new Set(list);
  return unique.size === set.size && [...unique].every((id) => set.has(id));
}

/** Whether two maps of hidden elements send each element to the same shape. */
function sameHidden(a: ReadonlyMap<Id, number>, b: ReadonlyMap<Id, number>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, at] of a) if (b.get(id) !== at) return false;
  return true;
}

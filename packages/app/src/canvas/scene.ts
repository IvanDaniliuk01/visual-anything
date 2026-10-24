/**
 * A view turned into what the canvas draws: every shape and relation, with absolute coordinates. This
 * is pure, so the drawing step stays a thin wrapper around PixiJS and everything here can be tested.
 *
 * In M0 a view shows the whole model. Until ELK layout arrives (M3), shapes without a stored position
 * are placed in a simple row below everything else around them.
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
import { containmentTree, type Placement } from '../model/containment';
import {
  appearanceOf,
  resolveDefinitions,
  type Dash,
  type Definitions,
  type ResolvedAppearance,
  type ShapeKind,
} from '../model/definitions';
import {
  arrowheadAt,
  borderPoint,
  boundsOf,
  centerOf,
  clampInto,
  directionOf,
  middle,
  type Arrowhead,
  type Point,
  type Rect,
} from './geometry';

/** Everything a view draws, in drawing order. */
export interface Scene {
  /** The anchored shapes of elements; a container comes before its contents. */
  shapes: ElementShape[];
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
  name: string;
  componentName: string;
  kind: ShapeKind;
  fill: Color;
  stroke: Color;
  rect: Rect;
  /** Whether other shapes sit inside this one; its name is then drawn at its top. */
  holdsContents: boolean;
}

/** A relation drawn as a straight line. */
export interface RelationLine {
  relation: Id;
  /** The relation's name, shown at the middle of its line. */
  label?: string;
  /** Where the line starts: on a shape's border, or at the middle of the relation it starts from. */
  from: Point;
  /** Where the line ends: on a shape's border, or at the middle of the relation it ends on. */
  to: Point;
  /** The middle of the line, where relations that end on this one attach. */
  middle: Point;
  /** Present when the relation type is directed; its tip is `to`. */
  arrowhead?: Arrowhead;
  stroke: Color;
  width: number;
  dash: Dash;
}

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
/** The space between shapes in the stand-in row, and between that row and what is above it. */
const ROW_GAP = 40;
/** How far apart relations that relate the same two ends are drawn. */
const PARALLEL_GAP = 24;
/** How close to its shape's border a relation drawn side by side may start or end. */
const PARALLEL_INSET = 4;

/** Everything the view with this id draws. */
export function buildScene(project: ProjectSnapshot, viewId: Id): Scene {
  const view = project.views.find((candidate) => candidate.id === viewId);
  if (!view) throw new Error(`The project has no view ${JSON.stringify(viewId)}.`);

  const definitions = resolveDefinitions(project.packages);
  const nesting = new Set(view.nestingRelationTypes);
  const notes = view.freeShapes.filter(isNote).map(noteShape);
  const arrows = view.freeShapes.filter(isArrow).map(arrowShape);

  const shapes = placeShapes(project, view, nesting, definitions, notes, arrows);
  const relations = drawRelations(project.model.relations, nesting, shapes, definitions);

  const bounds = boundsOf(
    [...shapes.map((shape) => shape.rect), ...notes.map((note) => note.rect)],
    [
      ...relations.flatMap((line) => [line.from, line.to, ...arrowheadCorners(line.arrowhead)]),
      ...arrows.flatMap((arrow) => [arrow.from, arrow.to, ...arrowheadCorners(arrow.arrowhead)]),
    ],
  );
  return { shapes, relations, notes, arrows, bounds };
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
  contents: Box[];
}

/** The anchored shapes of every element except World, with absolute rectangles, containers first. */
function placeShapes(
  project: ProjectSnapshot,
  view: ViewFile,
  nesting: ReadonlySet<Id>,
  definitions: Definitions,
  notes: readonly NoteShape[],
  arrows: readonly ArrowShape[],
): ElementShape[] {
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
      componentName: definitions.component(element.component).name,
      appearance,
      width: containerSize(stored?.width, appearance.width, contentsRight),
      height: containerSize(stored?.height, appearance.height, contentsBottom),
      ...(stored ? { offset: { x: stored.x, y: stored.y } } : {}),
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
  const place = (box: Box, origin: Point, path: string | undefined): void => {
    const offset = box.offset ?? { x: 0, y: 0 };
    const rect = {
      x: origin.x + offset.x,
      y: origin.y + offset.y,
      width: box.width,
      height: box.height,
    };
    const key = path === undefined ? box.element.id : `${path}/${box.element.id}`;
    shapes.push({
      key,
      element: box.element.id,
      ...(box.placement.container === undefined ? {} : { container: box.placement.container }),
      name: box.element.name,
      componentName: box.componentName,
      kind: box.appearance.shape,
      fill: box.appearance.fill,
      stroke: box.appearance.stroke,
      rect,
      holdsContents: box.contents.length > 0,
    });
    for (const content of box.contents) place(content, rect, key);
  };
  for (const box of worldContents) place(box, { x: 0, y: 0 }, undefined);
  return shapes;
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
    sameEnds.set(key, [...(sameEnds.get(key) ?? []), relation]);
  }

  const lines = new Map<Id, RelationLine | undefined>();
  const resolving = new Set<Id>();

  const endAt = (id: Id): End | undefined => {
    const shape = firstShapes.get(id);
    if (shape) return { anchor: centerOf(shape.rect), shape };
    const line = lineOf(id);
    return line && { anchor: line.middle };
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
 * The straight line of a relation between two ends, ending at their borders. Relations between the
 * same ends (`siblings`, this one among them) are spread side by side.
 */
function lineBetween(
  relation: Relation,
  from: End,
  to: End,
  siblings: readonly Relation[],
  definitions: Definitions,
): RelationLine | undefined {
  if (from.shape && from.shape === to.shape) return undefined;

  // Spread along a direction all siblings share, so relations pointing opposite ways separate too.
  const shared =
    relation.from <= relation.to
      ? directionOf(from.anchor, to.anchor)
      : directionOf(to.anchor, from.anchor);
  if (!shared) return undefined;
  const offset = (siblings.indexOf(relation) - (siblings.length - 1) / 2) * PARALLEL_GAP;
  const shift = (end: End): Point =>
    end.shape
      ? clampInto(
          end.shape.rect,
          { x: end.anchor.x - shared.y * offset, y: end.anchor.y + shared.x * offset },
          PARALLEL_INSET,
        )
      : end.anchor;
  const fromInside = shift(from);
  const toInside = shift(to);

  let start = from.shape
    ? borderPoint(from.shape.kind, from.shape.rect, fromInside, toInside)
    : fromInside;
  let end = to.shape ? borderPoint(to.shape.kind, to.shape.rect, toInside, fromInside) : toInside;
  // Overlapping shapes leave no gap between their borders: draw between the inner points instead.
  const intended = directionOf(fromInside, toInside);
  const actual = directionOf(start, end);
  if (!intended) return undefined;
  if (!actual || actual.x * intended.x + actual.y * intended.y <= 0) {
    start = fromInside;
    end = toInside;
  }

  const relationType = definitions.relationType(relation.relationType);
  const { stroke, width, dash } = relationType.appearance;
  return {
    relation: relation.id,
    ...(relation.name ? { label: relation.name } : {}),
    from: start,
    to: end,
    middle: middle(start, end),
    ...(relationType.direction === 'directed' ? { arrowhead: arrowheadAt(start, end, width) } : {}),
    stroke,
    width,
    dash,
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

function arrowheadCorners(arrowhead: Arrowhead | undefined): Point[] {
  return arrowhead ? [arrowhead.left, arrowhead.right] : [];
}

function maxOf(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : Math.max(...values);
}

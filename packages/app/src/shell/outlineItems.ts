/**
 * The trees of the model panel, as rows. The outline mirrors the open view as the canvas draws it:
 * World's shapes at the top and each container's shapes inside it, one row per anchored shape, so that
 * an element with several containers has a row inside each; the view's free shapes come last. Inside
 * the row of the shape an element's relations are drawn from come that element's relations, before
 * the shapes it holds, clockwise from the top as the canvas steps through them: "communicates with →
 * Appointments API". Inside the row of a relation come the relations that end on it, in the model's
 * order, so that a relation between two relations has a row inside each. World's tree follows the
 * model's containment instead.
 *
 * What the canvas hides, as filters and isolating do, has no row; a shape inside a hidden one is
 * listed inside the nearest shape around it that shows. A collapsed container's row holds none of its
 * contents, as the canvas draws none, and lists its aggregated relations: each stands for the
 * relations it aggregates, which selecting it selects. A row of a table, which draws none of what its
 * element holds (ADR 0023), lists those elements last in its row, as not drawn.
 */
import {
  definitionsIn,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type Placement,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ModelFile, PackageFile } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import { NOTHING_HIDDEN, emphasize, type Hidden } from '../canvas/emphasize';
import { drawnRelations, farEnd, hiddenIn } from '../canvas/navigation';
import {
  standsFor,
  type ArrowShape,
  type ElementShape,
  type NoteShape,
  type RelationLine,
  type Scene,
} from '../canvas/scene';
import type { Selectable, Selection } from '../editor/selection';
import { outerIdsOf, type TreeItems } from './tree';

export type OutlineItem = ShapeItem | RelationItem | NoteItem | ArrowItem | UndrawnItem;

/** The row of an anchored shape of an element. */
export interface ShapeItem {
  kind: 'shape';
  /** The shape's key. */
  id: string;
  shape: ElementShape;
}

/** The row of a relation, inside the row of the shape or of the relation at one of its ends. */
export interface RelationItem {
  kind: 'relation';
  id: string;
  relation: Id;
  /** The end the row sits under: the element of the shape whose row holds it, or the relation. */
  near: Id;
  /** The relation's other end: an element, or another relation. */
  far: Id;
  /** Which way the relation points, seen from the near end; `both` when it has no direction. */
  way: 'out' | 'in' | 'both';
  relationType: string;
  /** The relation's own name, when it has one. */
  name?: string;
  farName: string;
  /** The relation as a sentence: "Booking agent communicates with Appointments API". */
  sentence: string;
  /**
   * Present on the row of an aggregated relation: the relations it stands for, of which `relation`
   * is the first. Selecting the row selects them all (`selectablesOf`).
   */
  stands?: readonly Id[];
}

export interface NoteItem {
  kind: 'note';
  id: string;
  note: NoteShape;
}

export interface ArrowItem {
  kind: 'arrow';
  id: string;
  arrow: ArrowShape;
}

/**
 * The row of an element that a row of a table holds, which the canvas does not draw (ADR 0023): inside
 * the row's own row. Selecting it selects the element; the canvas shows the row.
 */
export interface UndrawnItem {
  kind: 'undrawn';
  /** The row's key, then the element's id. */
  id: string;
  element: Id;
  name: string;
  /** The key of the row that holds it. */
  row: string;
}

/** Where a row is: its id, and the ids of the rows around it, outermost first. */
export interface RowPlace {
  id: string;
  outer: string[];
}

export interface Outline extends TreeItems<OutlineItem> {
  /** Whether a row is open until someone opens or closes it: a shape holding others is. */
  openAtFirst(item: OutlineItem): boolean;
  /** The same, for the row with this id. */
  openAtFirstOf(id: string): boolean;
  /** The row that stands for something selected; none for what the view does not draw. */
  placeOf(selectable: Selectable): RowPlace | undefined;
  /** The shape an element's relations are drawn from, and its row stands for it: its first one. */
  shapeOf(element: Id): ElementShape | undefined;
}

/**
 * The row that stands for a selection: its first element's, or else its first relation's, or else its
 * first free shape's. It takes no longer for a selection of 10,000 than for one of a single element.
 */
export function placeOfSelection(
  placeOf: (selectable: Selectable) => RowPlace | undefined,
  selection: Selection,
): RowPlace | undefined {
  const [element] = selection.elements;
  if (element !== undefined) return placeOf({ kind: 'element', id: element });
  const [relation] = selection.relations;
  if (relation !== undefined) return placeOf({ kind: 'relation', id: relation });
  const [free] = selection.freeShapes;
  return free === undefined ? undefined : placeOf({ kind: 'free-shape', id: free });
}

/** What an outline was worked out from, besides the scene's shapes. */
interface OutlineInputs {
  relations: readonly RelationLine[];
  notes: readonly NoteShape[];
  arrows: readonly ArrowShape[];
  model: ModelFile;
  packages: readonly PackageFile[];
  hidden: ReadonlySet<string> | undefined;
}

/** The outlines worked out, by the shapes of their scene. */
const outlines = new WeakMap<
  readonly ElementShape[],
  { inputs: OutlineInputs; outline: Outline }
>();

/**
 * The outline of a scene; worked out once for each scene, and each row's insides when first asked. A
 * new scene that keeps the parts the outline reads, as one the view's stacking order alone changed
 * does, keeps its outline too. The order of the relations around a shape, which the canvas works out,
 * is asked for only once the row of a shape with relations opens. `hidden` is what the canvas hides,
 * by the emphasis's keys; by default, what it last said it hides in the scene (`hiddenIn`).
 */
export function outlineOf(
  scene: Scene,
  project: ProjectSnapshot,
  hidden: ReadonlySet<string> | undefined = hiddenIn(scene),
): Outline {
  const inputs: OutlineInputs = {
    relations: scene.relations,
    notes: scene.notes,
    arrows: scene.arrows,
    model: project.model,
    packages: project.packages,
    hidden: hidden && hidden.size > 0 ? hidden : undefined,
  };
  const kept = outlines.get(scene.shapes);
  if (kept && sameInputs(kept.inputs, inputs)) return kept.outline;
  const outline = buildOutline(scene, project, inputs.hidden);
  outlines.set(scene.shapes, { inputs, outline });
  return outline;
}

function sameInputs(a: OutlineInputs, b: OutlineInputs): boolean {
  return (
    a.relations === b.relations &&
    a.notes === b.notes &&
    a.arrows === b.arrows &&
    a.model === b.model &&
    a.packages === b.packages &&
    sameKeys(a.hidden, b.hidden)
  );
}

function sameKeys(a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

const firstShapesCache = new WeakMap<readonly ElementShape[], ReadonlyMap<Id, ElementShape>>();

/** The first shape of each element: the one its relations are drawn from, and its row stands for. */
function firstShapesOf(shapes: readonly ElementShape[]): ReadonlyMap<Id, ElementShape> {
  let found = firstShapesCache.get(shapes);
  if (!found) {
    const first = new Map<Id, ElementShape>();
    for (const shape of shapes) if (!first.has(shape.element)) first.set(shape.element, shape);
    found = first;
    firstShapesCache.set(shapes, found);
  }
  return found;
}

/** The first shape of an element in a scene, which the canvas brings into sight for it. */
export function firstShapeOf(scene: Scene, element: Id): ElementShape | undefined {
  return firstShapesOf(scene.shapes).get(element);
}

function buildOutline(
  scene: Scene,
  project: ProjectSnapshot,
  hidden: ReadonlySet<string> | undefined,
): Outline {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  // What the canvas does not draw, with the lines drawn to it, which the canvas leaves out too.
  const unseen: Hidden = hidden ? emphasize(scene, { hidden }).hidden : NOTHING_HIDDEN;
  const top: OutlineItem[] = [];
  const held = new Map<string, ShapeItem[]>();
  const containers = new Set<string>();
  const firstShapes = firstShapesOf(scene.shapes);
  const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
  /** The row a shape is listed in: its container's, or that of the nearest one around it that shows. */
  const shownContainer = (shape: ElementShape): string | undefined => {
    let key = shape.containerShape;
    while (key !== undefined && unseen.shapes.has(key)) key = byKey.get(key)?.containerShape;
    return key;
  };
  /** The rows a shape's row sits in, outermost first: those of the shapes around it that show. */
  const outerOf = (shape: ElementShape): string[] => {
    if (!hidden) return outerIdsOf(shape.key);
    const outer: string[] = [];
    for (let at = shownContainer(shape); at !== undefined;) {
      outer.unshift(at);
      const around = byKey.get(at);
      at = around && shownContainer(around);
    }
    return outer;
  };
  // For each element only a row holds, which the canvas does not draw, the first row that holds it.
  const undrawnIn = new Map<Id, ElementShape>();
  for (const shape of scene.shapes) {
    if (unseen.shapes.has(shape.key)) continue;
    const item: ShapeItem = { kind: 'shape', id: shape.key, shape };
    if (shape.holdsContents) containers.add(shape.key);
    for (const id of shape.undrawn ?? []) if (!undrawnIn.has(id)) undrawnIn.set(id, shape);
    const container = shownContainer(shape);
    if (container === undefined) {
      top.push(item);
      continue;
    }
    const list = held.get(container);
    if (list) list.push(item);
    else held.set(container, [item]);
  }
  const notes = new Set<Id>();
  const arrows = new Set<Id>();
  for (const note of scene.notes) {
    if (unseen.free.has(note.id)) continue;
    notes.add(note.id);
    top.push({ kind: 'note', id: noteRowId(note.id), note });
  }
  for (const arrow of scene.arrows) {
    if (unseen.free.has(arrow.id)) continue;
    arrows.add(arrow.id);
    top.push({ kind: 'arrow', id: arrowRowId(arrow.id), arrow });
  }

  // The aggregated relations drawn on each shape, listed in its row after its relations; and, for
  // each relation one stands for, where its row is.
  const aggregatesOn = new Map<string, RelationLine[]>();
  const aggregatedIn = new Map<Id, string>();
  for (const line of scene.relations) {
    if (!line.aggregate || !line.ends || unseen.relations.has(line.relation)) continue;
    for (const end of [line.ends.from, line.ends.to]) {
      if (end.kind !== 'shape') continue;
      const list = aggregatesOn.get(end.key);
      if (list) list.push(line);
      else aggregatesOn.set(end.key, [line]);
      for (const id of standsFor(line)) if (!aggregatedIn.has(id)) aggregatedIn.set(id, end.key);
    }
  }

  // The relations drawn, how many are drawn from each element's first shape, and which end on each
  // relation, in the model's order.
  const drawn = new Set<Id>();
  const onElements = new Map<Id, number>();
  const onRelations = new Map<Id, Id[]>();
  for (const line of scene.relations) {
    if (line.aggregate || unseen.relations.has(line.relation)) continue;
    drawn.add(line.relation);
    const relation = index.relation(line.relation);
    if (!relation) continue;
    const ends = relation.from === relation.to ? [relation.from] : [relation.from, relation.to];
    for (const end of ends) {
      if (firstShapes.has(end)) {
        onElements.set(end, (onElements.get(end) ?? 0) + 1);
      } else if (index.relation(end)) {
        const list = onRelations.get(end);
        if (list) list.push(relation.id);
        else onRelations.set(end, [relation.id]);
      }
    }
  }

  /** The relations drawn from a shape: those of its element, when it is the element's first shape. */
  const linesFrom = (shape: ElementShape): readonly RelationLine[] =>
    firstShapes.get(shape.element) === shape && onElements.has(shape.element)
      ? drawnRelations(scene, project)
          .around(shape.element)
          .filter((line) => drawn.has(line.relation))
      : [];

  /** How many relations a shape's row holds, aggregated ones included. */
  const relationsFrom = (shape: ElementShape): number =>
    (firstShapes.get(shape.element) === shape ? (onElements.get(shape.element) ?? 0) : 0) +
    (aggregatesOn.get(shape.key)?.length ?? 0);

  /** The row of an aggregated relation, inside the row of the shape at one of its ends. */
  const aggregateItem = (rowId: string, shape: ElementShape, line: RelationLine): RelationItem => {
    const aggregate = line.aggregate as NonNullable<RelationLine['aggregate']>;
    const ends = line.ends as NonNullable<RelationLine['ends']>;
    const fromHere = ends.from.kind === 'shape' && ends.from.key === shape.key;
    const other = fromHere ? ends.to : ends.from;
    const otherShape = other.kind === 'shape' ? byKey.get(other.key) : undefined;
    const far = otherShape ? otherShape.element : other.kind === 'relation' ? other.relation : '';
    const farName = otherShape ? otherShape.name : 'an aggregated relation';
    const relationType = relationTypeOrRelatesTo(definitions, aggregate.relationType);
    const count = aggregate.relations.length;
    const [first] = aggregate.relations;
    const [fromName, toName] = fromHere ? [shape.name, farName] : [farName, shape.name];
    return {
      kind: 'relation',
      id: relationRowId(
        rowId,
        `aggregated.${aggregate.relationType}.${other.kind === 'shape' ? other.key : 'line'}`,
      ),
      relation: first as Id,
      near: shape.element,
      far,
      way: relationType.direction === 'undirected' ? 'both' : fromHere ? 'out' : 'in',
      relationType: relationType.name,
      name: `×${count}`,
      farName,
      sentence: `${count === 1 ? '1 relation' : `${count} relations`} "${relationType.name}" from ${fromName} to ${toName}, aggregated`,
      stands: aggregate.relations,
    };
  };

  /** The relations that end on a relation, inside its row: none that the row already sits inside. */
  const endingOn = (item: RelationItem): Id[] => {
    const around = new Set(item.id.split('#').slice(1));
    return (onRelations.get(item.relation) ?? []).filter((id) => !around.has(id));
  };

  const relationItem = (rowId: string, near: Id, id: Id): RelationItem | undefined => {
    const relation = index.relation(id);
    if (!relation) return undefined;
    const far = farEnd(relation, near);
    const relationType = relationTypeOrRelatesTo(definitions, relation.relationType);
    return {
      kind: 'relation',
      id: relationRowId(rowId, relation.id),
      relation: relation.id,
      near,
      far,
      way: relationType.direction === 'undirected' ? 'both' : relation.from === near ? 'out' : 'in',
      relationType: relationType.name,
      ...(relation.name ? { name: relation.name } : {}),
      farName: nameOfEnd(project, far),
      sentence: nameOfEnd(project, relation.id),
    };
  };

  /** The rows of what a row holds and does not draw, last in its row. */
  const undrawnItems = (shape: ElementShape): UndrawnItem[] =>
    (shape.undrawn ?? []).map((id) => ({
      kind: 'undrawn',
      id: undrawnRowId(shape.key, id),
      element: id,
      name: index.element(id)?.name ?? id,
      row: shape.key,
    }));

  const insides = new Map<string, readonly OutlineItem[]>();
  const inside = (item: OutlineItem): readonly OutlineItem[] => {
    if (item.kind !== 'shape' && item.kind !== 'relation') return [];
    let found = insides.get(item.id);
    if (!found) {
      if (item.kind === 'shape') {
        // A relation from an element to itself is drawn twice around its shape, and listed once.
        const relations = new Set(linesFrom(item.shape).map((line) => line.relation));
        found = [
          ...[...relations].flatMap((id) => relationItem(item.id, item.shape.element, id) ?? []),
          ...(aggregatesOn.get(item.id) ?? []).map((line) =>
            aggregateItem(item.id, item.shape, line),
          ),
          ...(held.get(item.id) ?? []),
          ...undrawnItems(item.shape),
        ];
      } else {
        found = endingOn(item).flatMap((id) => relationItem(item.id, item.relation, id) ?? []);
      }
      insides.set(item.id, found);
    }
    return found;
  };

  /** The row of a drawn relation: inside the shape of an element it ends on, or the row of a relation. */
  // A relation is listed inside the row of each relation it ends on, so any chain of relations down to
  // a shape names one of its rows. The nearest is found breadth first, visiting each relation once:
  // ends that are relations can double at every level, and a malformed file can even loop.
  const relationPlaces = new Map<Id, RowPlace | undefined>();
  const placeOfRelation = (id: Id): RowPlace | undefined => {
    if (relationPlaces.has(id)) return relationPlaces.get(id);
    const reachedThrough = new Map<Id, Id | undefined>(drawn.has(id) ? [[id, undefined]] : []);
    let place: RowPlace | undefined;
    for (const at of reachedThrough.keys()) {
      const relation = index.relation(at);
      if (!relation) continue;
      const ends = [relation.from, relation.to];
      const shape = ends.flatMap((end) => firstShapes.get(end) ?? [])[0];
      if (shape) {
        place = { id: relationRowId(shape.key, at), outer: [...outerOf(shape), shape.key] };
        for (let inner = reachedThrough.get(at); inner !== undefined;) {
          place = { id: relationRowId(place.id, inner), outer: [...place.outer, place.id] };
          inner = reachedThrough.get(inner);
        }
        break;
      }
      for (const end of ends) {
        if (drawn.has(end) && !reachedThrough.has(end)) reachedThrough.set(end, at);
      }
    }
    relationPlaces.set(id, place);
    return place;
  };

  return {
    top,
    inside,
    countInside: (item) => {
      switch (item.kind) {
        case 'shape':
          return (
            relationsFrom(item.shape) +
            (held.get(item.id)?.length ?? 0) +
            (item.shape.undrawn?.length ?? 0)
          );
        case 'relation':
          return endingOn(item).length;
        default:
          return 0;
      }
    },
    idOf: (item) => item.id,
    openAtFirst: (item) => item.kind === 'shape' && item.shape.holdsContents,
    openAtFirstOf: (id) => containers.has(id),
    placeOf: (selectable) => {
      switch (selectable.kind) {
        case 'element': {
          const shape = firstShapes.get(selectable.id);
          if (!shape) {
            // An element only a row holds: its row inside that row's.
            const row = undrawnIn.get(selectable.id);
            return (
              row && {
                id: undrawnRowId(row.key, selectable.id),
                outer: [...outerOf(row), row.key],
              }
            );
          }
          if (unseen.shapes.has(shape.key)) return undefined;
          return { id: shape.key, outer: outerOf(shape) };
        }
        case 'relation': {
          const aggregated = drawn.has(selectable.id) ? undefined : aggregatedIn.get(selectable.id);
          if (aggregated === undefined) return placeOfRelation(selectable.id);
          // The row of the aggregated relation that stands for it.
          const shape = byKey.get(aggregated) as ElementShape;
          const row = inside({ kind: 'shape', id: shape.key, shape }).find(
            (each) => each.kind === 'relation' && each.stands?.includes(selectable.id),
          );
          return row && { id: row.id, outer: [...outerOf(shape), shape.key] };
        }
        case 'free-shape':
          if (notes.has(selectable.id)) return { id: noteRowId(selectable.id), outer: [] };
          if (arrows.has(selectable.id)) return { id: arrowRowId(selectable.id), outer: [] };
          return undefined;
      }
    },
    shapeOf: (element) => firstShapes.get(element),
  };
}

/** What selecting a row selects: what it stands for, or every relation an aggregated one stands for. */
export function selectablesOf(item: OutlineItem): Selectable[] {
  if (item.kind === 'relation' && item.stands) {
    return item.stands.map((id): Selectable => ({ kind: 'relation', id }));
  }
  return [selectableOf(item)];
}

/**
 * What a shape's row says after its name: its component's name, and on a collapsed container that it
 * is collapsed and how many shapes it holds.
 */
export function shapeNoteOf(item: ShapeItem): string {
  const { shape } = item;
  return shape.collapsed === undefined
    ? shape.componentName
    : `${shape.componentName}, collapsed: ${shape.collapsed.contents} inside`;
}

/** What a row stands for, as something that can be selected. */
export function selectableOf(item: OutlineItem): Selectable {
  switch (item.kind) {
    case 'shape':
      return { kind: 'element', id: item.shape.element };
    case 'relation':
      return { kind: 'relation', id: item.relation };
    case 'note':
      return { kind: 'free-shape', id: item.note.id };
    case 'arrow':
      return { kind: 'free-shape', id: item.arrow.id };
    case 'undrawn':
      return { kind: 'element', id: item.element };
  }
}

/** Whether what a row stands for is selected; every shape of a selected element is. */
export function isItemSelected(selection: Selection, item: OutlineItem): boolean {
  switch (item.kind) {
    case 'shape':
      return selection.elements.has(item.shape.element);
    case 'relation':
      return item.stands
        ? item.stands.every((id) => selection.relations.has(id))
        : selection.relations.has(item.relation);
    case 'note':
      return selection.freeShapes.has(item.note.id);
    case 'arrow':
      return selection.freeShapes.has(item.arrow.id);
    case 'undrawn':
      return selection.elements.has(item.element);
  }
}

/** The text a row starts with, which typing a few letters matches: a relation's starts with its far end. */
export function textOf(item: OutlineItem): string {
  switch (item.kind) {
    case 'shape':
      return item.shape.name;
    case 'relation':
      return item.farName;
    case 'note':
      return 'Note';
    case 'arrow':
      return 'Arrow';
    case 'undrawn':
      return item.name;
  }
}

/**
 * The key the canvas reveals a row's shape by: a shape's key, a relation's or a free shape's id, and
 * for what a row holds without drawing it, the row's key.
 */
export function revealKeyOf(item: OutlineItem): string {
  switch (item.kind) {
    case 'shape':
      return item.shape.key;
    case 'relation':
      return item.relation;
    case 'note':
      return item.note.id;
    case 'arrow':
      return item.arrow.id;
    case 'undrawn':
      return item.row;
  }
}

/** A row of World's tree: a place of an element in the model's containment. */
export interface WorldItem {
  /** The elements from World down to this one, joined by `/`. */
  id: string;
  placement: Placement;
}

export interface WorldTree extends TreeItems<WorldItem> {
  /** The first row of an element, and the rows around it. */
  placeOf(element: Id): RowPlace | undefined;
}

/** World's tree, from the model's containment. */
export function worldTreeOf(placements: readonly Placement[]): WorldTree {
  const firstRows = new Map<Id, string>();
  const insides = new Map<string, WorldItem[]>();
  const make = (placement: Placement, outer: string | undefined): WorldItem => {
    const id = outer === undefined ? placement.element : `${outer}/${placement.element}`;
    if (!firstRows.has(placement.element)) firstRows.set(placement.element, id);
    insides.set(
      id,
      placement.contents.map((content) => make(content, id)),
    );
    return { id, placement };
  };
  const top = placements.map((placement) => make(placement, undefined));
  return {
    top,
    inside: (item) => insides.get(item.id) ?? [],
    countInside: (item) => item.placement.contents.length,
    idOf: (item) => item.id,
    placeOf: (element) => {
      const id = firstRows.get(element);
      return id === undefined ? undefined : { id, outer: outerIdsOf(id) };
    },
  };
}

/** The id of a relation's row: the id of the row it sits inside, then the relation's. */
function relationRowId(outer: string, relation: Id): string {
  return `${outer}#${relation}`;
}

/**
 * The id of the row of an element a row holds: the path to it, as a shape's key would be, which no
 * shape has, since a row draws none of what it holds.
 */
function undrawnRowId(row: string, element: Id): string {
  return `${row}/${element}`;
}

function noteRowId(id: Id): string {
  return `note:${id}`;
}

function arrowRowId(id: Id): string {
  return `arrow:${id}`;
}

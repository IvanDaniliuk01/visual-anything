/**
 * The trees of the model panel, as rows. The outline mirrors the open view as the canvas draws it:
 * World's shapes at the top and each container's shapes inside it, one row per anchored shape, so that
 * an element with several containers has a row inside each; the view's free shapes come last. Inside
 * the row of the shape an element's relations are drawn from come that element's relations, before
 * the shapes it holds, clockwise from the top as the canvas steps through them: "communicates with →
 * Appointments API". Inside the row of a relation come the relations that end on it, in the model's
 * order, so that a relation between two relations has a row inside each. World's tree follows the
 * model's containment instead.
 */
import {
  definitionsOf,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type Placement,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ModelFile, PackageFile } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import { drawnRelations, farEnd } from '../canvas/navigation';
import type { ArrowShape, ElementShape, NoteShape, RelationLine, Scene } from '../canvas/scene';
import type { Selectable, Selection } from '../editor/selection';
import { outerIdsOf, type TreeItems } from './tree';

export type OutlineItem = ShapeItem | RelationItem | NoteItem | ArrowItem;

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
 * is asked for only once the row of a shape with relations opens.
 */
export function outlineOf(scene: Scene, project: ProjectSnapshot): Outline {
  const inputs: OutlineInputs = {
    relations: scene.relations,
    notes: scene.notes,
    arrows: scene.arrows,
    model: project.model,
    packages: project.packages,
  };
  const kept = outlines.get(scene.shapes);
  if (kept && sameInputs(kept.inputs, inputs)) return kept.outline;
  const outline = buildOutline(scene, project);
  outlines.set(scene.shapes, { inputs, outline });
  return outline;
}

function sameInputs(a: OutlineInputs, b: OutlineInputs): boolean {
  return (
    a.relations === b.relations &&
    a.notes === b.notes &&
    a.arrows === b.arrows &&
    a.model === b.model &&
    a.packages === b.packages
  );
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

function buildOutline(scene: Scene, project: ProjectSnapshot): Outline {
  const index = modelIndexOf(project);
  const definitions = definitionsOf(project.packages);
  const top: OutlineItem[] = [];
  const held = new Map<string, ShapeItem[]>();
  const containers = new Set<string>();
  const firstShapes = firstShapesOf(scene.shapes);
  for (const shape of scene.shapes) {
    const item: ShapeItem = { kind: 'shape', id: shape.key, shape };
    if (shape.holdsContents) containers.add(shape.key);
    if (shape.containerShape === undefined) {
      top.push(item);
      continue;
    }
    const list = held.get(shape.containerShape);
    if (list) list.push(item);
    else held.set(shape.containerShape, [item]);
  }
  const notes = new Set<Id>();
  const arrows = new Set<Id>();
  for (const note of scene.notes) {
    notes.add(note.id);
    top.push({ kind: 'note', id: noteRowId(note.id), note });
  }
  for (const arrow of scene.arrows) {
    arrows.add(arrow.id);
    top.push({ kind: 'arrow', id: arrowRowId(arrow.id), arrow });
  }

  // The relations drawn, how many are drawn from each element's first shape, and which end on each
  // relation, in the model's order.
  const drawn = new Set<Id>();
  const onElements = new Map<Id, number>();
  const onRelations = new Map<Id, Id[]>();
  for (const line of scene.relations) {
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
      ? drawnRelations(scene, project).around(shape.element)
      : [];

  /** How many relations a shape's row holds. */
  const relationsFrom = (shape: ElementShape): number =>
    firstShapes.get(shape.element) === shape ? (onElements.get(shape.element) ?? 0) : 0;

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
          ...(held.get(item.id) ?? []),
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
        place = { id: relationRowId(shape.key, at), outer: [...outerIdsOf(shape.key), shape.key] };
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
          return relationsFrom(item.shape) + (held.get(item.id)?.length ?? 0);
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
          return shape && { id: shape.key, outer: outerIdsOf(shape.key) };
        }
        case 'relation':
          return placeOfRelation(selectable.id);
        case 'free-shape':
          if (notes.has(selectable.id)) return { id: noteRowId(selectable.id), outer: [] };
          if (arrows.has(selectable.id)) return { id: arrowRowId(selectable.id), outer: [] };
          return undefined;
      }
    },
    shapeOf: (element) => firstShapes.get(element),
  };
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
  }
}

/** Whether what a row stands for is selected; every shape of a selected element is. */
export function isItemSelected(selection: Selection, item: OutlineItem): boolean {
  switch (item.kind) {
    case 'shape':
      return selection.elements.has(item.shape.element);
    case 'relation':
      return selection.relations.has(item.relation);
    case 'note':
      return selection.freeShapes.has(item.note.id);
    case 'arrow':
      return selection.freeShapes.has(item.arrow.id);
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
  }
}

/** The key the canvas reveals a row's shape by: a shape's key, a relation's or a free shape's id. */
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

function noteRowId(id: Id): string {
  return `note:${id}`;
}

function arrowRowId(id: Id): string {
  return `arrow:${id}`;
}

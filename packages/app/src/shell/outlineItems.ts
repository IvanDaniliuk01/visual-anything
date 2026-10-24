/**
 * The trees of the model panel, as rows. The outline mirrors the open view as the canvas draws it:
 * World's shapes at the top and each container's shapes inside it, one row per anchored shape, so that
 * an element with several containers has a row inside each; the view's free shapes come last. Inside
 * the row of the shape an element's relations are drawn from come that element's relations, before
 * the shapes it holds, clockwise from the top as the canvas steps through them: "communicates with →
 * Appointments API". World's tree follows the model's containment instead.
 */
import {
  definitionsOf,
  relationTypeOrRelatesTo,
  type Placement,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
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

/** The row of a relation, inside the row of the shape at one of its ends. */
export interface RelationItem {
  kind: 'relation';
  id: string;
  relation: Id;
  /** The shape the row sits inside, at the relation's near end. */
  shape: ElementShape;
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

/** The outline of a scene; worked out once for each scene, and each row's insides when first asked. */
export function outlineOf(scene: Scene, project: ProjectSnapshot): Outline {
  const drawn = drawnRelations(scene, project);
  const definitions = definitionsOf(project.packages);
  const top: OutlineItem[] = [];
  const held = new Map<string, ShapeItem[]>();
  const containers = new Set<string>();
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

  /** The relations drawn from a shape: those of its element, when it is the element's first shape. */
  const linesFrom = (shape: ElementShape): readonly RelationLine[] =>
    drawn.shapeOf(shape.element) === shape ? drawn.around(shape.element) : [];

  const relationItem = (shape: ElementShape, line: RelationLine): RelationItem | undefined => {
    const relation = drawn.relation(line.relation);
    if (!relation) return undefined;
    const far = farEnd(relation, shape.element);
    const relationType = relationTypeOrRelatesTo(definitions, relation.relationType);
    return {
      kind: 'relation',
      id: relationRowId(shape.key, relation.id),
      relation: relation.id,
      shape,
      far,
      way:
        relationType.direction === 'undirected'
          ? 'both'
          : relation.from === shape.element
            ? 'out'
            : 'in',
      relationType: relationType.name,
      ...(relation.name ? { name: relation.name } : {}),
      farName: nameOfEnd(project, far),
      sentence: nameOfEnd(project, relation.id),
    };
  };

  const insides = new Map<string, readonly OutlineItem[]>();
  const inside = (item: OutlineItem): readonly OutlineItem[] => {
    if (item.kind !== 'shape') return [];
    let found = insides.get(item.id);
    if (!found) {
      found = [
        ...linesFrom(item.shape).flatMap((line) => relationItem(item.shape, line) ?? []),
        ...(held.get(item.id) ?? []),
      ];
      insides.set(item.id, found);
    }
    return found;
  };

  return {
    top,
    inside,
    countInside: (item) =>
      item.kind === 'shape' ? linesFrom(item.shape).length + (held.get(item.id)?.length ?? 0) : 0,
    idOf: (item) => item.id,
    openAtFirst: (item) => item.kind === 'shape' && item.shape.holdsContents,
    openAtFirstOf: (id) => containers.has(id),
    placeOf: (selectable) => {
      switch (selectable.kind) {
        case 'element': {
          const shape = drawn.shapeOf(selectable.id);
          return shape && { id: shape.key, outer: outerIdsOf(shape.key) };
        }
        case 'relation': {
          const relation = drawn.line(selectable.id) && drawn.relation(selectable.id);
          if (!relation) return undefined;
          for (const end of [relation.from, relation.to]) {
            const shape = drawn.shapeOf(end);
            if (shape) {
              return {
                id: relationRowId(shape.key, relation.id),
                outer: [...outerIdsOf(shape.key), shape.key],
              };
            }
          }
          return undefined;
        }
        case 'free-shape':
          if (notes.has(selectable.id)) return { id: noteRowId(selectable.id), outer: [] };
          if (arrows.has(selectable.id)) return { id: arrowRowId(selectable.id), outer: [] };
          return undefined;
      }
    },
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

function relationRowId(shapeKey: string, relation: Id): string {
  return `${shapeKey}#${relation}`;
}

function noteRowId(id: Id): string {
  return `note:${id}`;
}

function arrowRowId(id: Id): string {
  return `arrow:${id}`;
}

/**
 * What the canvas says about what it selected, for screen readers: an element's name, component,
 * container and how many relations the view draws on it; a relation as the sentence it reads as, such
 * as "Booking agent communicates with Appointments API"; a free shape; or how much a selection holds.
 */
import {
  definitionsOf,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type ModelIndex,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Relation } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import type { IndexedScene } from './hit';
import { drawnRelations } from './navigation';
import type { ElementShape } from './scene';

/** Where a relation is among the relations of the element the keys step through. */
export interface RelationStep {
  element: Id;
  /** From 1. */
  position: number;
  count: number;
}

/** "Appointments API, Service, in Scheduling, 4 relations." */
export function describeShape(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  shape: ElementShape,
): string {
  const container =
    shape.containerShape === undefined ? undefined : indexed.byKey.get(shape.containerShape);
  const others = (indexed.byElement.get(shape.element)?.length ?? 1) - 1;
  const where =
    others > 0
      ? `in ${container?.name ?? 'World'} and ${counted(others, 'other container', 'other containers')}`
      : `in ${container?.name ?? 'World'}`;
  const relations = drawnRelations(indexed.scene, project).around(shape.element).length;
  return `${shape.name}, ${shape.componentName}, ${where}, ${counted(relations, 'relation', 'relations')}.`;
}

/** "Booking agent communicates with Appointments API, “HTTPS”.", and where it is when stepping. */
export function describeRelation(project: ProjectSnapshot, id: Id, step?: RelationStep): string {
  const index = modelIndexOf(project);
  const relation = index.relation(id);
  if (!relation) return 'A relation that no longer exists.';
  const named = relation.name ? `, “${relation.name}”` : '';
  const where = step
    ? `, relation ${step.position} of ${step.count} of ${nameIn(index, step.element)}`
    : '';
  return `${sentenceOf(index, project, relation)}${named}${where}.`;
}

/** The name of an end of a relation: an element's name, or the sentence a relation reads as. */
export function nameOfEnd(project: ProjectSnapshot, id: Id): string {
  const index = modelIndexOf(project);
  const relation = index.relation(id);
  return relation ? sentenceOf(index, project, relation) : nameIn(index, id);
}

/** What a selection holds: one thing described, or how many of each kind. */
export function describeSelection(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  selection: Selection,
  /** The shape the keys last reached, to say which container an element is described in. */
  current?: string,
): string {
  const { elements, relations, freeShapes } = selection;
  const total = elements.size + relations.size + freeShapes.size;
  if (total === 0) return 'Nothing is selected.';
  if (total === 1) {
    const [element] = elements;
    if (element !== undefined) {
      const shapes = indexed.byElement.get(element) ?? [];
      const shape = shapes.find((each) => each.key === current) ?? shapes[0];
      return shape ? describeShape(indexed, project, shape) : '1 element selected.';
    }
    const [relation] = relations;
    if (relation !== undefined) return describeRelation(project, relation);
    const [free] = freeShapes;
    const note = indexed.scene.notes.find((each) => each.id === free);
    return note ? asSentence(`Note: ${note.text}`) : 'Arrow.';
  }
  const parts: string[] = [];
  if (elements.size > 0) parts.push(counted(elements.size, 'element', 'elements'));
  if (relations.size > 0) parts.push(counted(relations.size, 'relation', 'relations'));
  if (freeShapes.size > 0) parts.push(counted(freeShapes.size, 'free shape', 'free shapes'));
  return `${listed(parts)} selected.`;
}

/** "Patient communicates with WhatsApp channel": the ends named one level deep only. */
function sentenceOf(index: ModelIndex, project: ProjectSnapshot, relation: Relation): string {
  const relationType = relationTypeOrRelatesTo(
    definitionsOf(project.packages),
    relation.relationType,
  );
  return `${shortNameIn(index, project, relation.from)} ${relationType.name} ${shortNameIn(index, project, relation.to)}`;
}

/** An element's name; for a relation, its type and its own name, without its ends. */
function shortNameIn(index: ModelIndex, project: ProjectSnapshot, id: Id): string {
  const relation = index.relation(id);
  if (!relation) return nameIn(index, id);
  const relationType = relationTypeOrRelatesTo(
    definitionsOf(project.packages),
    relation.relationType,
  );
  return relation.name ? `${relationType.name} “${relation.name}”` : relationType.name;
}

function nameIn(index: ModelIndex, id: Id): string {
  return index.element(id)?.name ?? id;
}

/** The text, ending with a full stop unless it already ends a sentence. */
function asSentence(text: string): string {
  const trimmed = text.trimEnd();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function counted(amount: number, one: string, many: string): string {
  if (amount === 0) return `no ${many}`;
  return `${amount} ${amount === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c". */
function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

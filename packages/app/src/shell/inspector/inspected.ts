import type { ModelIndex } from '@visual-anything/core';
import type { Arrow, Element, Note, Picture, Relation, ViewFile } from '@visual-anything/schema';
import { sizeOf, type Selection } from '../../editor/selection';

/** What the inspector shows, from what is selected. */
export type Inspected =
  | { kind: 'nothing' }
  | { kind: 'element'; element: Element }
  | { kind: 'relation'; relation: Relation }
  | { kind: 'note'; note: Note }
  | { kind: 'arrow'; arrow: Arrow }
  | { kind: 'picture'; picture: Picture }
  /** Several things, or one that is no longer there. */
  | { kind: 'several' };

/** What the inspector shows: one element, relation or free shape in detail, or how many are selected. */
export function inspectedOf(
  selection: Selection,
  index: ModelIndex,
  view: ViewFile | undefined,
): Inspected {
  const size = sizeOf(selection);
  if (size === 0) return { kind: 'nothing' };
  if (size === 1) {
    const [elementId] = selection.elements;
    const [relationId] = selection.relations;
    const [freeShapeId] = selection.freeShapes;
    const element = elementId === undefined ? undefined : index.element(elementId);
    if (element) return { kind: 'element', element };
    const relation = relationId === undefined ? undefined : index.relation(relationId);
    if (relation) return { kind: 'relation', relation };
    const shape = view?.freeShapes.find((each) => each.id === freeShapeId);
    if (shape?.kind === 'note') return { kind: 'note', note: shape };
    if (shape?.kind === 'arrow') return { kind: 'arrow', arrow: shape };
    if (shape?.kind === 'picture') return { kind: 'picture', picture: shape };
  }
  return { kind: 'several' };
}

/** A key for what is inspected in detail, to tell when it changes. */
export function inspectedKey(inspected: Inspected): string | undefined {
  switch (inspected.kind) {
    case 'element':
      return `element:${inspected.element.id}`;
    case 'relation':
      return `relation:${inspected.relation.id}`;
    case 'note':
      return `free-shape:${inspected.note.id}`;
    case 'arrow':
      return `free-shape:${inspected.arrow.id}`;
    case 'picture':
      return `free-shape:${inspected.picture.id}`;
    default:
      return undefined;
  }
}

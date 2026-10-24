/**
 * What is selected in the open view: elements, relations and free shapes, by id. Selecting an element
 * selects every one of its shapes, one inside each of its containers.
 */
import type { Id } from '@visual-anything/schema';

export interface Selection {
  readonly elements: ReadonlySet<Id>;
  readonly relations: ReadonlySet<Id>;
  readonly freeShapes: ReadonlySet<Id>;
}

/** Something that can be selected. */
export type Selectable =
  { kind: 'element'; id: Id } | { kind: 'relation'; id: Id } | { kind: 'free-shape'; id: Id };

export const EMPTY_SELECTION: Selection = {
  elements: new Set(),
  relations: new Set(),
  freeShapes: new Set(),
};

/** A selection holding exactly these. */
export function selectionOf(items: readonly Selectable[]): Selection {
  return {
    elements: new Set(items.filter((item) => item.kind === 'element').map((item) => item.id)),
    relations: new Set(items.filter((item) => item.kind === 'relation').map((item) => item.id)),
    freeShapes: new Set(items.filter((item) => item.kind === 'free-shape').map((item) => item.id)),
  };
}

/** Whether nothing is selected. */
export function isEmpty(selection: Selection): boolean {
  return (
    selection.elements.size === 0 &&
    selection.relations.size === 0 &&
    selection.freeShapes.size === 0
  );
}

/** How many things are selected. */
export function sizeOf(selection: Selection): number {
  return selection.elements.size + selection.relations.size + selection.freeShapes.size;
}

/** Whether something is selected. */
export function isSelected(selection: Selection, item: Selectable): boolean {
  return setOf(selection, item.kind).has(item.id);
}

/** The selection with something added if it was not selected, or taken out if it was. */
export function toggle(selection: Selection, item: Selectable): Selection {
  const next = new Set(setOf(selection, item.kind));
  if (next.has(item.id)) next.delete(item.id);
  else next.add(item.id);
  return withSet(selection, item.kind, next);
}

/** Both selections together. */
export function union(a: Selection, b: Selection): Selection {
  return {
    elements: new Set([...a.elements, ...b.elements]),
    relations: new Set([...a.relations, ...b.relations]),
    freeShapes: new Set([...a.freeShapes, ...b.freeShapes]),
  };
}

/** The selection without what no longer exists. */
export function prune(
  selection: Selection,
  exists: { element(id: Id): boolean; relation(id: Id): boolean; freeShape(id: Id): boolean },
): Selection {
  const elements = [...selection.elements].filter((id) => exists.element(id));
  const relations = [...selection.relations].filter((id) => exists.relation(id));
  const freeShapes = [...selection.freeShapes].filter((id) => exists.freeShape(id));
  if (
    elements.length === selection.elements.size &&
    relations.length === selection.relations.size &&
    freeShapes.length === selection.freeShapes.size
  ) {
    return selection;
  }
  return {
    elements: new Set(elements),
    relations: new Set(relations),
    freeShapes: new Set(freeShapes),
  };
}

/** Whether two selections hold the same things. */
export function sameSelection(a: Selection, b: Selection): boolean {
  const same = (x: ReadonlySet<Id>, y: ReadonlySet<Id>) =>
    x.size === y.size && [...x].every((id) => y.has(id));
  return (
    same(a.elements, b.elements) &&
    same(a.relations, b.relations) &&
    same(a.freeShapes, b.freeShapes)
  );
}

function setOf(selection: Selection, kind: Selectable['kind']): ReadonlySet<Id> {
  return kind === 'element'
    ? selection.elements
    : kind === 'relation'
      ? selection.relations
      : selection.freeShapes;
}

function withSet(selection: Selection, kind: Selectable['kind'], set: ReadonlySet<Id>): Selection {
  return kind === 'element'
    ? { ...selection, elements: set }
    : kind === 'relation'
      ? { ...selection, relations: set }
      : { ...selection, freeShapes: set };
}

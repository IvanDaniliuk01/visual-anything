/**
 * Where a scenario's steps happen in a view: which containers the view shows collapsed, what each
 * element sits inside there, and which elements a relation reaches.
 */
import type { Id, ViewFile } from '@visual-anything/schema';
import { nestingTypesInView } from '../containers';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';

/**
 * The containers a view shows collapsed, each once, in the order it lists them: the elements of its
 * `collapsed` list, leaving out World, which holds everything, and ids that are no element.
 */
export function collapsedIn(project: ProjectSnapshot, view: ViewFile): ReadonlySet<Id> {
  // Read as data: a view file of an older program has no list.
  const listed: unknown = (view as { collapsed?: unknown }).collapsed;
  const collapsed = new Set<Id>();
  if (!Array.isArray(listed)) return collapsed;
  const index = modelIndexOf(project);
  for (const id of listed) {
    if (typeof id !== 'string' || id === index.world.id) continue;
    if (index.element(id)) collapsed.add(id);
  }
  return collapsed;
}

/** What each element sits inside in a view, through the view's nesting relation types. */
export interface ViewContainment {
  /**
   * Every container an element sits inside, directly or not, through any of its containers. Only a
   * containment cycle, which the core forbids, would put an element inside itself.
   */
  enclosing(element: Id): ReadonlySet<Id>;
}

/** Containment as a view draws it: from the relations of its nesting relation types between elements. */
export function containmentInView(project: ProjectSnapshot, view: ViewFile): ViewContainment {
  const nesting = new Set(nestingTypesInView(project, view));
  const index = modelIndexOf(project);
  const containers = new Map<Id, Id[]>();
  if (nesting.size > 0) {
    for (const relation of project.model.relations) {
      const { from: element, to: container } = relation;
      if (!nesting.has(relation.relationType) || element === container) continue;
      if (!index.element(element) || !index.element(container)) continue;
      const list = containers.get(element);
      if (!list) containers.set(element, [container]);
      else if (!list.includes(container)) list.push(container);
    }
  }
  const known = new Map<Id, ReadonlySet<Id>>();
  return {
    enclosing(element) {
      const kept = known.get(element);
      if (kept) return kept;
      const found = new Set<Id>();
      const stack = [...(containers.get(element) ?? [])];
      while (stack.length > 0) {
        const container = stack.pop() as Id;
        if (found.has(container)) continue;
        found.add(container);
        stack.push(...(containers.get(container) ?? []));
      }
      known.set(element, found);
      return found;
    },
  };
}

/**
 * The elements a relation ends on, each once, in the order they are reached: its own ends when they
 * are elements, and the ends of a relation it ends on. Nothing for a relation that is not in the model.
 */
export function endsOf(project: ProjectSnapshot, relation: Id): Id[] {
  const index = modelIndexOf(project);
  const ends: Id[] = [];
  const visited = new Set<Id>();
  const visit = (id: Id): void => {
    if (index.element(id)) {
      if (!ends.includes(id)) ends.push(id);
      return;
    }
    const found = index.relation(id);
    if (!found || visited.has(id)) return;
    visited.add(id);
    visit(found.from);
    visit(found.to);
  };
  visit(relation);
  return ends;
}

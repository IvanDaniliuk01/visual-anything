/**
 * Where the shapes of a view with a scope sit (ADR-0040): a shape whose container is out of scope sits
 * in its nearest container that shows, or directly in World. The scene, layout, positions, the
 * stacking order and changes of container all ask here, so that they agree on where every shape sits.
 *
 * Nearest is along containment: an element sits in a container that shows when a chain of the view's
 * nesting relations leads from it to that container through containers that are all out of scope. It
 * sits directly in World when no such chain leads to any container that shows. A position kept for a
 * container left out stays in the view's file and is not used.
 */
import type { Id, Relation, ViewFile } from '@visual-anything/schema';
import { nestingTypesInView } from './containers';
import { shownByScope } from './scope';
import type { ProjectSnapshot } from './snapshot';
import { modelIndexOf } from './state';

/** Where the shapes of a view sit, worked out once for each state of the project and the view. */
export interface ShapesInView {
  /**
   * The containers an element's shapes sit directly in, each once, in model order: empty when it
   * sits directly in World; undefined for an element the view does not show, and for World.
   */
  containersOf(element: Id): readonly Id[] | undefined;
  /** The elements whose shapes sit directly in a container, or in World when it is absent, in model order. */
  contentsOf(container: Id | undefined): readonly Id[];
  /**
   * The nesting relations that put an element's shape in a container that shows: its relation to
   * that container, and its relations to containers out of scope through which it sits there. None
   * for World, where an element sits when nothing that shows holds it.
   */
  placing(element: Id, container: Id | undefined): readonly Relation[];
}

const cache = new WeakMap<ViewFile, { state: ProjectSnapshot; placed: ShapesInView }>();

/** Where the shapes of a view sit, through its scope: see the module's comment. */
export function shapesInView(state: ProjectSnapshot, view: ViewFile): ShapesInView {
  const cached = cache.get(view);
  if (cached && cached.state.model === state.model && cached.state.packages === state.packages) {
    if (cached.state.project === state.project) return cached.placed;
  }
  const placed = place(state, view);
  cache.set(view, { state, placed });
  return placed;
}

/** What `reach` gives for a chain that ends in World, which holds an element that nothing holds. */
const WORLD = Symbol('World');
type Reached = Id | typeof WORLD;

function place(state: ProjectSnapshot, view: ViewFile): ShapesInView {
  const shown = shownByScope(state, view);
  const index = modelIndexOf(state);
  const worldId = state.model.world.id;
  const types = new Set(nestingTypesInView(state, view));
  const isElement = (id: Id) => id !== worldId && index.element(id) !== undefined;

  // Each element's own nesting relations to other elements, in model order.
  const holders = new Map<Id, Relation[]>();
  for (const relation of state.model.relations) {
    if (!types.has(relation.relationType) || relation.from === relation.to) continue;
    if (!isElement(relation.from) || !isElement(relation.to)) continue;
    const list = holders.get(relation.from);
    if (list) list.push(relation);
    else holders.set(relation.from, [relation]);
  }

  // What a chain through a container out of scope reaches: the containers that show, or World.
  const reached = new Map<Id, readonly Reached[]>();
  const visiting = new Set<Id>();
  const reach = (container: Id): readonly Reached[] => {
    const known = reached.get(container);
    if (known) return known;
    // A containment cycle, which the core forbids, reaches nothing more.
    if (visiting.has(container)) return [];
    visiting.add(container);
    const found = new Set<Reached>();
    const relations = holders.get(container) ?? [];
    if (relations.length === 0) found.add(WORLD);
    for (const relation of relations) {
      if (shown.element(relation.to)) found.add(relation.to);
      else for (const each of reach(relation.to)) found.add(each);
    }
    visiting.delete(container);
    const result = [...found];
    reached.set(container, result);
    return result;
  };

  const rankOf = new Map<Id, number>();
  state.model.elements.forEach((element, at) => {
    if (!rankOf.has(element.id)) rankOf.set(element.id, at);
  });
  const byRank = (a: Id, b: Id) => (rankOf.get(a) ?? 0) - (rankOf.get(b) ?? 0);

  const containers = new Map<Id, readonly Id[]>();
  const contents = new Map<Id, Id[]>();
  const inWorld: Id[] = [];
  for (const id of shown.elements) {
    if (id === worldId || containers.has(id)) continue;
    const found = new Set<Id>();
    for (const relation of holders.get(id) ?? []) {
      if (shown.element(relation.to)) found.add(relation.to);
      else for (const each of reach(relation.to)) if (each !== WORLD) found.add(each);
    }
    const list = [...found].sort(byRank);
    containers.set(id, list);
    if (list.length === 0) inWorld.push(id);
    for (const container of list) {
      const inside = contents.get(container);
      if (inside) inside.push(id);
      else contents.set(container, [id]);
    }
  }

  return {
    containersOf: (element) => containers.get(element),
    contentsOf: (container) =>
      container === undefined || container === worldId ? inWorld : (contents.get(container) ?? []),
    placing: (element, container) => {
      if (container === undefined || container === worldId) return [];
      if (!shown.element(container)) return [];
      return (holders.get(element) ?? []).filter(
        (relation) =>
          relation.to === container ||
          (!shown.element(relation.to) && reach(relation.to).includes(container)),
      );
    },
  };
}

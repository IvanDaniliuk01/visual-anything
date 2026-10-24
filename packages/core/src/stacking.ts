/**
 * The stacking order: in which order a view draws the shapes that sit directly in one container, or
 * directly in World. A view keeps, by container, a list of element ids from back to front; the shapes
 * a list does not name come after the ones it names, in model order, so a new shape comes in front and
 * a view without lists draws everything in model order. A list names only what it must.
 */
import type { Element, Id, ViewFile } from '@visual-anything/schema';
import { nestingTypesInView } from './containers';
import { BULK, type Collection, type Operation } from './operations';
import type { ProjectSnapshot } from './snapshot';
import { modelIndexOf } from './state';

/** The key of a stacking list: the container's id, or World's id for the shapes directly in World. */
export function stackingKey(worldId: Id, container: Id | undefined): Id {
  return container === undefined ? worldId : container;
}

const ranks = new WeakMap<readonly Element[], Map<Id, number>>();

/** Where each element comes in the model, worked out once per list of elements. */
function modelRanks(elements: readonly Element[]): Map<Id, number> {
  let byId = ranks.get(elements);
  if (!byId) {
    byId = new Map();
    elements.forEach((element, at) => {
      if (!byId?.has(element.id)) byId?.set(element.id, at);
    });
    ranks.set(elements, byId);
  }
  return byId;
}

/** Where an element comes in the project's model; after everything when it is not there. */
export function modelRankOf(state: ProjectSnapshot): (id: Id) => number {
  const byId = modelRanks(state.model.elements);
  return (id) => byId.get(id) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The elements whose shapes sit directly inside `container` in a view, or directly in World when it
 * is absent or World, in model order. Inside a container: the elements with a relation of one of the
 * view's nesting relation types to it. In World: the elements with no such relation to another one.
 */
export function contentsInView(
  state: ProjectSnapshot,
  view: ViewFile,
  container: Id | undefined,
): Id[] {
  const { world, elements, relations } = state.model;
  const types = new Set(nestingTypesInView(state, view));
  const index = modelIndexOf(state);
  const isElement = (id: Id) => id !== world.id && index.element(id) !== undefined;
  if (container === undefined || container === world.id) {
    const held = new Set<Id>();
    for (const relation of relations) {
      if (!types.has(relation.relationType) || relation.from === relation.to) continue;
      if (isElement(relation.from) && isElement(relation.to)) held.add(relation.from);
    }
    const seen = new Set<Id>();
    return elements
      .map((element) => element.id)
      .filter((id) => {
        if (id === world.id || held.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }
  if (!isElement(container)) return [];
  const inside = new Set<Id>();
  for (const relation of index.relationsOn(container)) {
    if (relation.to !== container || relation.from === container) continue;
    if (types.has(relation.relationType) && isElement(relation.from)) inside.add(relation.from);
  }
  const rankOf = modelRankOf(state);
  return [...inside].sort((a, b) => rankOf(a) - rankOf(b));
}

/** Items in stacking order, back to front: those `stored` names, in its order, then the others in the order given. */
export function orderByStacking<T>(
  items: readonly T[],
  idOf: (item: T) => Id,
  stored: readonly Id[] | undefined,
): T[] {
  if (!stored || stored.length === 0) return [...items];
  const place = new Map<Id, number>();
  stored.forEach((id, at) => {
    if (!place.has(id)) place.set(id, at);
  });
  const listed: { item: T; at: number }[] = [];
  const others: T[] = [];
  for (const item of items) {
    const at = place.get(idOf(item));
    if (at === undefined) others.push(item);
    else listed.push({ item, at });
  }
  listed.sort((a, b) => a.at - b.at);
  return [...listed.map((each) => each.item), ...others];
}

/** The list a view stores for a container, or for World; undefined when it stores none. */
export function storedStacking(view: ViewFile, key: Id): readonly Id[] | undefined {
  const order = view.stackingOrder;
  // Any string can be an id, `constructor` included, so only the map's own keys count.
  return order !== undefined && Object.hasOwn(order, key) ? order[key] : undefined;
}

/** The order a view draws the shapes directly in a container, or in World, back to front, with live ids only. */
export function stackingOrderOf(state: ProjectSnapshot, viewId: Id, container?: Id): Id[] {
  const view = state.views.find((each) => each.id === viewId);
  if (!view) return [];
  const key = stackingKey(state.model.world.id, container);
  return orderByStacking(
    contentsInView(state, view, container),
    (id) => id,
    storedStacking(view, key),
  );
}

/**
 * The list to store for an order, back to front: the shortest one that gives it. The shapes a list
 * leaves out come after it in model order, so it must name everything before the last stretch that is
 * already in model order.
 */
export function stackingListFor(order: readonly Id[], rankOf: (id: Id) => number): Id[] {
  let start = order.length;
  while (start > 0) {
    const before = order[start - 1] as Id;
    const after = order[start];
    if (after !== undefined && rankOf(before) >= rankOf(after)) break;
    start -= 1;
  }
  return order.slice(0, start);
}

/**
 * The operations that turn a stored list into the next one. The ids that keep their relative order
 * stay, as many as can, and the others are removed, then inserted where the next list wants them;
 * above BULK changes, the whole list is replaced in one operation.
 */
export function stackingOperations(
  collection: Collection,
  stored: readonly Id[],
  next: readonly Id[],
): Operation[] {
  if (stored.length === next.length && stored.every((id, at) => id === next[at])) return [];
  const kept = keptIds(stored, next);
  const changes = stored.length + next.length - 2 * kept.size;
  if (changes > BULK) return [{ op: 'replace-all', collection, items: [...next] }];
  const operations: Operation[] = [];
  for (const id of stored) {
    if (!kept.has(id)) operations.push({ op: 'remove', collection, key: id });
  }
  next.forEach((id, at) => {
    if (!kept.has(id)) operations.push({ op: 'insert', collection, index: at, item: id });
  });
  return operations;
}

/** The ids of the longest run that both lists hold in the same order. */
function keptIds(stored: readonly Id[], next: readonly Id[]): Set<Id> {
  const placeInNext = new Map(next.map((id, at) => [id, at]));
  const sequence = stored.filter((id) => placeInNext.has(id));
  // Patience sorting over the places in the next list, keeping the way back to rebuild the run.
  const tails: number[] = [];
  const before: number[] = [];
  sequence.forEach((id, at) => {
    const place = placeInNext.get(id) as number;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((placeInNext.get(sequence[tails[middle] as number] as Id) as number) < place) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    before[at] = low > 0 ? (tails[low - 1] as number) : -1;
    tails[low] = at;
  });
  const kept = new Set<Id>();
  for (let at = tails.at(-1) ?? -1; at >= 0; at = before[at] as number) {
    kept.add(sequence[at] as Id);
  }
  return kept;
}

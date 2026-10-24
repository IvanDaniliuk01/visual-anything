/**
 * The model's order: the order of `elements` in the model file. It is the order of rows, and the
 * order in which views draw the shapes their stacking lists leave out. Changing it never changes how
 * a view draws its shapes: where it would, the view's stacking lists are rewritten in the same action
 * (ADR 0021, clarified). Only rows, whose order is the model's, follow it.
 */
import type { Id, ViewFile } from '@visual-anything/schema';
import { appearanceOf } from '../definitions';
import { nestingTypesInView } from '../containers';
import { BULK } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import {
  contentsInView,
  modelRankOf,
  orderByStacking,
  stackingKey,
  stackingListFor,
  stackingOperations,
  storedStacking,
} from '../stacking';
import { definitionsIn, modelIndexOf } from '../state';
import { count, nameOf, reject, requireList, type Draft } from './draft';
import type { ReorderElementsCommand } from './types';

export function reorderElements(draft: Draft, command: ReorderElementsCommand): string {
  const ids = requireList(command.elements, 'elements');
  if (ids.length === 0) reject('invalid-command', 'No elements were given to move.');
  const worldId = draft.index.world.id;
  const moving = new Set<Id>();
  for (const id of ids) {
    if (id === worldId) {
      reject('world-not-allowed', 'World holds everything and has no place in the model’s order.', [
        id,
      ]);
    }
    const element = draft.element(id);
    if (moving.has(id)) reject('invalid-command', `"${element.name}" is given twice.`, [id]);
    moving.add(id);
  }
  const before = command.before;
  if (before !== undefined) {
    if (before === worldId) {
      reject('world-not-allowed', 'World has no place in the model’s order.', [before]);
    }
    const element = draft.element(before);
    if (moving.has(before)) {
      reject('invalid-command', `"${element.name}" is moved, so the others cannot go before it.`, [
        before,
      ]);
    }
  }

  const old = draft.state;
  const elements = old.model.elements;
  const byId = new Map(elements.map((element) => [element.id, element]));
  const staying = elements.filter((element) => !moving.has(element.id));
  const at = before === undefined ? staying.length : staying.findIndex((e) => e.id === before);
  const next = staying.toSpliced(at, 0, ...ids.map((id) => byId.get(id)!));
  if (next.every((element, place) => element === elements[place]))
    return labelOf(draft, ids, before);

  const collection = { name: 'elements' as const };
  if (ids.length > BULK) {
    draft.apply({ op: 'replace-all', collection, items: next });
  } else {
    for (const id of ids) {
      draft.apply({ op: 'remove', collection, key: id });
      const list = draft.state.model.elements;
      const index = before === undefined ? list.length : list.findIndex((e) => e.id === before);
      draft.apply({ op: 'insert', collection, index, item: byId.get(id)! });
    }
  }
  keepDrawings(draft, old, ids);
  return labelOf(draft, ids, before);
}

/**
 * Rewrites, in every view, the stacking lists of the containers (and of World) that hold `moved`
 * directly, so that each draws its shapes in the order it drew them in `old`. Containers that draw
 * their contents as rows are left alone: their order is the model's.
 */
export function keepDrawings(draft: Draft, old: ProjectSnapshot, moved: readonly Id[]): void {
  for (const view of draft.state.views) {
    for (const key of holdersIn(draft.state, view, moved)) {
      const drawn = (state: ProjectSnapshot) =>
        orderByStacking(
          contentsInView(state, view, key === state.model.world.id ? undefined : key),
          (id) => id,
          storedStacking(view, key),
        );
      const wanted = drawn(old);
      const now = drawn(draft.state);
      if (wanted.length === now.length && wanted.every((id, at) => id === now[at])) continue;
      writeOrder(draft, view, key, wanted);
    }
  }
}

/**
 * Brings a new element to the front among the shapes beside it in every view, as a new element is
 * drawn, when its place in the model's order would put it behind some of them.
 */
export function bringNewToFront(draft: Draft, element: Id): void {
  for (const view of draft.state.views) {
    for (const key of holdersIn(draft.state, view, [element])) {
      const contents = contentsInView(
        draft.state,
        view,
        key === draft.state.model.world.id ? undefined : key,
      );
      const now = orderByStacking(contents, (id) => id, storedStacking(view, key));
      if (now.at(-1) === element) continue;
      writeOrder(draft, view, key, [...now.filter((id) => id !== element), element]);
    }
  }
}

/** Stores, for a container of a view or for World, the shortest list that draws `order`. */
function writeOrder(draft: Draft, view: ViewFile, key: Id, order: readonly Id[]): void {
  const current = draft.state.views.find((each) => each.id === view.id) ?? view;
  const collection = { name: 'stackingOrder' as const, view: view.id, container: key };
  const operations = stackingOperations(
    collection,
    storedStacking(current, key) ?? [],
    stackingListFor(order, modelRankOf(draft.state)),
  );
  for (const operation of operations) draft.apply(operation);
}

/**
 * The stacking keys of what directly holds each element in a view: its containers there, through the
 * view's nesting relation types, or World when it has none; leaving out containers that draw their
 * contents as rows.
 */
function holdersIn(state: ProjectSnapshot, view: ViewFile, elements: readonly Id[]): Set<Id> {
  const index = modelIndexOf(state);
  const definitions = definitionsIn(state);
  const types = new Set(nestingTypesInView(state, view));
  const worldId = state.model.world.id;
  const keys = new Set<Id>();
  for (const id of elements) {
    const containers = index
      .relationsOn(id)
      .filter(
        (relation) =>
          relation.from === id &&
          relation.to !== id &&
          types.has(relation.relationType) &&
          relation.to !== worldId &&
          index.element(relation.to) !== undefined,
      )
      .map((relation) => relation.to);
    if (containers.length === 0) keys.add(stackingKey(worldId, undefined));
    for (const container of containers) {
      const element = index.element(container);
      if (element && !appearanceOf(element, definitions).contentsAsRows) keys.add(container);
    }
  }
  return keys;
}

function labelOf(draft: Draft, ids: readonly Id[], before: Id | undefined): string {
  const moved =
    ids.length === 1 ? `"${nameOf(draft.index, ids[0] as Id)}"` : count(ids.length, 'element');
  return before === undefined
    ? `Move ${moved} to the end`
    : `Move ${moved} before "${nameOf(draft.index, before)}"`;
}

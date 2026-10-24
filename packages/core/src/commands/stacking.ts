/** The command that changes which shapes a view draws in front of which. */
import type { Id, ViewFile } from '@visual-anything/schema';
import {
  contentsInView,
  modelRankOf,
  orderByStacking,
  stackingKey,
  stackingListFor,
  stackingOperations,
  storedStacking,
} from '../stacking';
import { count, reject, requireList, type Draft } from './draft';
import type { RestackCommand, StackingPlace } from './types';

export function restack(draft: Draft, command: RestackCommand): string {
  const view = draft.view(command.view);
  const moves = requireList(command.moves, 'moves');
  if (moves.length === 0) reject('invalid-command', 'No moves were given.');
  const worldId = draft.index.world.id;
  const contents = new Map<Id, Id[]>();
  const contentsOf = (key: Id): Id[] => {
    let ids = contents.get(key);
    if (!ids) {
      ids = contentsInView(draft.state, view, key === worldId ? undefined : key);
      contents.set(key, ids);
    }
    return ids;
  };
  const orders = new Map<Id, { order: Id[]; before: readonly Id[] }>();
  const seen = new Set<string>();
  const names: { element: string; reference?: string }[] = [];

  for (const move of moves) {
    const element = draft.element(move.shape.element);
    if (element.id === worldId) {
      reject('world-not-allowed', 'World has no shape; it is the canvas itself.', [element.id]);
    }
    const container =
      move.shape.container === undefined || move.shape.container === worldId
        ? undefined
        : draft.element(move.shape.container);
    const key = stackingKey(worldId, container?.id);
    const live = contentsOf(key);
    if (!live.includes(element.id)) {
      reject('unknown-position', whereNot(element.name, container?.name, view), [element.id]);
    }
    const pair = JSON.stringify([key, element.id]);
    if (seen.has(pair))
      reject('invalid-command', `"${element.name}" is moved twice.`, [element.id]);
    seen.add(pair);
    const reference = referenceOf(move.to);
    if (reference !== undefined) {
      if (reference === element.id) {
        reject('invalid-command', `"${element.name}" cannot go in front of or behind itself.`, [
          element.id,
        ]);
      }
      if (!live.includes(reference)) {
        const name = draft.index.element(reference)?.name ?? reference;
        reject('unknown-position', whereNot(name, container?.name, view), [reference]);
      }
    }
    let entry = orders.get(key);
    if (!entry) {
      const order = orderByStacking(live, (id) => id, storedStacking(view, key));
      entry = { order: [...order], before: order };
      orders.set(key, entry);
    }
    place(entry.order, element.id, move.to);
    names.push({
      element: element.name,
      ...(reference === undefined ? {} : { reference: draft.index.element(reference)?.name }),
    });
  }

  const rankOf = modelRankOf(draft.state);
  for (const [key, { order, before }] of orders) {
    if (order.every((id, at) => id === before[at])) continue;
    const collection = { name: 'stackingOrder' as const, view: view.id, container: key };
    const stored = storedStacking(view, key) ?? [];
    for (const operation of stackingOperations(
      collection,
      stored,
      stackingListFor(order, rankOf),
    )) {
      draft.apply(operation);
    }
  }
  return labelOf(
    moves.map((move) => move.to),
    names,
    view,
  );
}

/** The shape another one goes just in front of or behind; undefined for the front and the back. */
function referenceOf(to: StackingPlace): Id | undefined {
  if (to === 'front' || to === 'back') return undefined;
  if (typeof to === 'object' && to !== null) {
    const keys = Object.keys(to);
    if (keys.length === 1 && 'inFrontOf' in to && typeof to.inFrontOf === 'string') {
      return to.inFrontOf;
    }
    if (keys.length === 1 && 'behind' in to && typeof to.behind === 'string') return to.behind;
  }
  reject('invalid-command', 'A move goes to "front", "back", { inFrontOf } or { behind }.');
}

/** Moves an id within an order, back to front. */
function place(order: Id[], id: Id, to: StackingPlace): void {
  order.splice(order.indexOf(id), 1);
  if (to === 'front') order.push(id);
  else if (to === 'back') order.unshift(id);
  else if ('inFrontOf' in to) order.splice(order.indexOf(to.inFrontOf) + 1, 0, id);
  else order.splice(order.indexOf(to.behind), 0, id);
}

/** Says that a shape does not sit where a command says it does. */
export function whereNot(element: string, container: string | undefined, view: ViewFile): string {
  return container === undefined
    ? `"${element}" does not sit directly in World in the view "${view.name}".`
    : `"${element}" does not sit inside "${container}" in the view "${view.name}".`;
}

function labelOf(
  places: readonly StackingPlace[],
  names: readonly { element: string; reference?: string | undefined }[],
  view: ViewFile,
): string {
  const kindOf = (to: StackingPlace) =>
    to === 'front' || to === 'back' ? to : 'inFrontOf' in to ? 'inFrontOf' : 'behind';
  const [first] = names;
  const [to] = places;
  if (places.length === 1 && first && to !== undefined) {
    switch (kindOf(to)) {
      case 'front':
        return `Bring "${first.element}" to the front in "${view.name}"`;
      case 'back':
        return `Send "${first.element}" to the back in "${view.name}"`;
      case 'inFrontOf':
        return `Bring "${first.element}" in front of "${first.reference ?? ''}" in "${view.name}"`;
      case 'behind':
        return `Send "${first.element}" behind "${first.reference ?? ''}" in "${view.name}"`;
    }
  }
  const kinds = new Set(places.map(kindOf));
  const shapes = count(places.length, 'shape');
  if (kinds.size === 1) {
    switch ([...kinds][0]) {
      case 'front':
        return `Bring ${shapes} to the front in "${view.name}"`;
      case 'back':
        return `Send ${shapes} to the back in "${view.name}"`;
      case 'inFrontOf':
        return `Bring ${shapes} forward in "${view.name}"`;
      case 'behind':
        return `Send ${shapes} backward in "${view.name}"`;
    }
  }
  return `Change the stacking order of ${shapes} in "${view.name}"`;
}

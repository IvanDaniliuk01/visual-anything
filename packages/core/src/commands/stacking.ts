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
  const contents = new Map<Id, { ids: Id[]; has: Set<Id> }>();
  const contentsOf = (key: Id) => {
    let found = contents.get(key);
    if (!found) {
      const ids = contentsInView(draft.state, view, key === worldId ? undefined : key);
      found = { ids, has: new Set(ids) };
      contents.set(key, found);
    }
    return found;
  };
  const orders = new Map<Id, { order: Order; before: readonly Id[] }>();
  const seen = new Set<string>();
  const names: { element: string; reference?: string }[] = [];

  for (const move of moves) {
    if (typeof move.shape !== 'object' || move.shape === null) {
      reject('invalid-command', 'Each move of restack names its shape: { "element": id }.');
    }
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
    if (!live.has.has(element.id)) {
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
      if (!live.has.has(reference)) {
        const name = draft.index.element(reference)?.name ?? reference;
        reject('unknown-position', whereNot(name, container?.name, view), [reference]);
      }
    }
    let entry = orders.get(key);
    if (!entry) {
      const order = orderByStacking(live.ids, (id) => id, storedStacking(view, key));
      entry = { order: new Order(order), before: order };
      orders.set(key, entry);
    }
    entry.order.move(element.id, move.to);
    names.push({
      element: element.name,
      ...(reference === undefined ? {} : { reference: draft.index.element(reference)?.name }),
    });
  }

  const rankOf = modelRankOf(draft.state);
  for (const [key, entry] of orders) {
    const order = entry.order.ids();
    if (order.every((id, at) => id === entry.before[at])) continue;
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

/**
 * An order of ids, back to front, linked both ways, so that a command moving thousands of shapes
 * moves each one in constant time.
 */
class Order {
  private readonly before = new Map<Id, Id | undefined>();
  private readonly after = new Map<Id, Id | undefined>();
  private back: Id | undefined;
  private front: Id | undefined;

  constructor(ids: readonly Id[]) {
    for (const id of ids) this.insertBehind(id, undefined);
  }

  /** Moves an id that is in the order. */
  move(id: Id, to: StackingPlace): void {
    this.unlink(id);
    if (to === 'front') this.insertBehind(id, undefined);
    else if (to === 'back') this.insertBehind(id, this.back);
    else if ('inFrontOf' in to) this.insertBehind(id, this.after.get(to.inFrontOf));
    else this.insertBehind(id, to.behind);
  }

  ids(): Id[] {
    const ids: Id[] = [];
    for (let at = this.back; at !== undefined; at = this.after.get(at)) ids.push(at);
    return ids;
  }

  private unlink(id: Id): void {
    const before = this.before.get(id);
    const after = this.after.get(id);
    if (before === undefined) this.back = after;
    else this.after.set(before, after);
    if (after === undefined) this.front = before;
    else this.before.set(after, before);
  }

  /** Puts an id just behind another, or at the front when there is none. */
  private insertBehind(id: Id, next: Id | undefined): void {
    const before = next === undefined ? this.front : this.before.get(next);
    this.before.set(id, before);
    this.after.set(id, next);
    if (before === undefined) this.back = id;
    else this.after.set(before, id);
    if (next === undefined) this.front = id;
    else this.before.set(next, id);
  }
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

/** Commands on the model: elements and relations. */
import type { Element, Id, Relation, ShapePosition } from '@visual-anything/schema';
import { slug } from '../ids';
import { indexModel, type ModelIndex } from '../model-index';
import { BULK, positionKey } from '../operations';
import { storedStacking } from '../stacking';
import {
  choiceWarnings,
  endName,
  limitWarnings,
  previewDelete,
  wouldFormCycle,
  type DeletePreview,
} from '../rules';
import { bringNewToFront } from './order';
import {
  changedAppearance,
  changedRelationAppearance,
  checkDetailResolves,
  checkedAppearanceOrNone,
  checkedRelationAppearance,
} from './traits';
import {
  changedAttributes,
  compact,
  count,
  nameOf,
  reject,
  Rejection,
  requireList,
  requireName,
  type Draft,
} from './draft';
import type {
  CreateElementCommand,
  CreateRelationCommand,
  DeleteCommand,
  UpdateElementCommand,
  UpdateRelationCommand,
} from './types';
import { putCollapsed } from './collapse';
import { putPositions } from './views';

export function createElement(draft: Draft, command: CreateElementCommand): string {
  const { element } = command;
  const name = requireName(element.name, 'An element');
  const component = draft.component(element.component);
  const worldId = draft.index.world.id;
  if (command.before !== undefined) {
    if (command.before === worldId) {
      reject('world-not-allowed', 'World has no place in the model’s order.', [command.before]);
    }
    draft.element(command.before);
  }
  const id = draft.idFor(element.id, slug(name, 'element'));
  const attributes = changedAttributes(undefined, element.attributes, undefined);
  const appearance =
    element.appearance === undefined
      ? undefined
      : checkedAppearanceOrNone(element.appearance, `"${name}"`);
  checkDetailResolves(appearance, component.attributes, attributes, draft.definitions, `"${name}"`);
  const created: Element = compact({
    id,
    component: element.component,
    name,
    description: element.description,
    attributes,
    appearance,
  });
  const index =
    command.before === undefined
      ? draft.state.model.elements.length
      : draft.state.model.elements.findIndex((each) => each.id === command.before);
  draft.apply({ op: 'insert', collection: { name: 'elements' }, index, item: created });
  draft.created.push(id);
  draft.warnings.push(...choiceWarnings(created, component.attributes));

  for (const { container, relationType } of requireList(command.containers, 'containers')) {
    createRelation(draft, {
      type: 'create-relation',
      relation: { relationType, from: id, to: container },
    });
  }
  const byView = new Map<Id, ShapePosition[]>();
  for (const { view, ...position } of requireList(command.positions, 'positions')) {
    const list = byView.get(view) ?? [];
    list.push({ ...position, element: id });
    byView.set(view, list);
  }
  for (const [view, positions] of byView) putPositions(draft, view, positions);
  // Placed before other elements in the model's order, it would be drawn behind them.
  if (command.before !== undefined) bringNewToFront(draft, id);
  return `Create "${name}"`;
}

export function updateElement(draft: Draft, command: UpdateElementCommand): string {
  const current = draft.element(command.id);
  const { changes } = command;
  const next: Element = { ...current };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'An element');
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) next.description = changes.description;
  if (changes.component !== undefined) {
    draft.component(changes.component);
    next.component = changes.component;
  }
  if (changes.appearance !== undefined && changes.appearanceTraits !== undefined) {
    reject(
      'invalid-command',
      'An element’s appearance is replaced whole or changed trait by trait, not both at once.',
      [current.id],
    );
  }
  const of = `"${next.name}"`;
  if (changes.appearance === null) delete next.appearance;
  else if (changes.appearance !== undefined) {
    const appearance = checkedAppearanceOrNone(changes.appearance, of, current.appearance);
    if (appearance === undefined) delete next.appearance;
    else next.appearance = appearance;
  } else if (changes.appearanceTraits !== undefined) {
    const appearance = changedAppearance(current.appearance, changes.appearanceTraits, of);
    if (appearance === undefined) delete next.appearance;
    else next.appearance = appearance;
  }
  const attributes = changedAttributes(
    current.attributes,
    changes.attributes,
    changes.removeAttributes,
  );
  if (attributes === undefined) delete next.attributes;
  else next.attributes = attributes;
  const component = draft.definitions.component(next.component);
  if (
    component !== undefined &&
    (changes.appearance !== undefined || changes.appearanceTraits !== undefined)
  ) {
    checkDetailResolves(
      next.appearance,
      component.attributes,
      next.attributes,
      draft.definitions,
      of,
    );
  }
  if (
    component !== undefined &&
    (changes.attributes !== undefined || changes.component !== undefined)
  ) {
    draft.warnings.push(...choiceWarnings(next, component.attributes));
  }

  if (current.id === draft.index.world.id) {
    draft.apply({ op: 'set-world', world: next });
  } else {
    draft.apply({ op: 'replace', collection: { name: 'elements' }, item: next });
  }
  if (changes.component !== undefined) {
    for (const relation of draft.index.relationsOn(current.id)) {
      draft.warnings.push(...limitWarnings(relation, draft.index, draft.definitions));
    }
  }
  if (changes.name !== undefined && Object.keys(changes).length === 1) {
    return `Rename "${current.name}" to "${next.name}"`;
  }
  return onlyAppearance(changes)
    ? `${next.appearance === undefined ? 'Reset' : 'Change'} the appearance of "${next.name}"`
    : `Edit "${next.name}"`;
}

/** Whether the only changes a command makes are to an appearance, whole or trait by trait. */
function onlyAppearance(changes: object): boolean {
  const named = Object.entries(changes).filter(([, value]) => value !== undefined);
  return (
    named.length > 0 && named.every(([key]) => key === 'appearance' || key === 'appearanceTraits')
  );
}

export function deleteTargets(draft: Draft, command: DeleteCommand): string {
  const elements = requireList(command.elements, 'elements');
  const relations = requireList(command.relations, 'relations');
  const preview = previewDelete(draft.state, { elements, relations });
  if (preview.problems.length > 0) throw new Rejection(preview.problems);
  if (preview.elements.length === 0 && preview.relations.length === 0) {
    reject('invalid-command', 'Nothing to delete was given.');
  }
  const index = draft.index;
  const label =
    preview.elements.length === 1 && preview.relations.length === preview.cascaded.length
      ? `Delete "${nameOf(index, preview.elements[0] as Id)}"`
      : preview.elements.length === 0 && preview.relations.length === 1
        ? `Delete the relation "${relationLabel(index, preview.relations[0] as Id)}"`
        : `Delete ${deletedThings(preview.elements.length, preview.relations.length)}`;

  applyDeletion(draft, preview);
  return label;
}

/**
 * Deletes what a preview lists: the positions, what stacking lists name, the relations, then the
 * elements. A stacking list whose container goes is dropped whole; the others lose single ids, or
 * are rewritten in one operation when that is a large change.
 */
export function applyDeletion(draft: Draft, preview: DeletePreview): void {
  // A large deletion rewrites each list once: one operation per item would copy the list each time.
  const byView = new Map<Id, Set<string>>();
  for (const position of preview.positions) {
    const keys = byView.get(position.view) ?? new Set<string>();
    keys.add(positionKey(position));
    byView.set(position.view, keys);
  }
  for (const [view, keys] of byView) {
    const collection = { name: 'positions' as const, view };
    if (keys.size > BULK) {
      const kept = draft
        .view(view)
        .positions.filter((position) => !keys.has(positionKey(position)));
      draft.apply({ op: 'replace-all', collection, items: kept });
    } else {
      for (const key of keys) draft.apply({ op: 'remove', collection, key });
    }
  }
  const deleted = new Set(preview.elements);
  const lists = new Map<string, { view: Id; container: Id; ids: Id[] }>();
  for (const entry of preview.stacking) {
    const key = JSON.stringify([entry.view, entry.container]);
    const list = lists.get(key) ?? { view: entry.view, container: entry.container, ids: [] };
    list.ids.push(entry.element);
    lists.set(key, list);
  }
  for (const { view, container, ids } of lists.values()) {
    const collection = { name: 'stackingOrder' as const, view, container };
    if (deleted.has(container)) {
      draft.apply({ op: 'replace-all', collection, items: [] });
    } else if (ids.length > BULK) {
      const stored = storedStacking(draft.view(view), container) ?? [];
      const gone = new Set(ids);
      draft.apply({ op: 'replace-all', collection, items: stored.filter((id) => !gone.has(id)) });
    } else {
      for (const id of ids) draft.apply({ op: 'remove', collection, key: id });
    }
  }
  for (const viewId of new Set(preview.collapsed.map((entry) => entry.view))) {
    const view = draft.view(viewId);
    putCollapsed(
      draft,
      view,
      (view.collapsed ?? []).filter((id) => !deleted.has(id)),
    );
  }
  removeFromModel(draft, 'relations', preview.relations);
  removeFromModel(draft, 'elements', preview.elements);
}

/** Removes ids from the model's elements or relations: one by one, or in one rewrite when many. */
function removeFromModel(draft: Draft, name: 'elements' | 'relations', ids: readonly Id[]): void {
  if (ids.length <= BULK) {
    for (const id of ids) draft.apply({ op: 'remove', collection: { name }, key: id });
    return;
  }
  const gone = new Set(ids);
  const items =
    name === 'elements'
      ? draft.state.model.elements.filter((element) => !gone.has(element.id))
      : draft.state.model.relations.filter((relation) => !gone.has(relation.id));
  draft.apply({ op: 'replace-all', collection: { name }, items });
}

export function createRelation(draft: Draft, command: CreateRelationCommand): string {
  const { relation } = command;
  const type = draft.relationType(relation.relationType);
  draft.end(relation.from);
  draft.end(relation.to);
  checkNesting(draft, draft.index, relation);
  const id = draft.idFor(relation.id, slug(type.name, 'relation'));
  const name = relation.name === undefined ? undefined : requireName(relation.name, 'A relation');
  const of = `the relation "${name ?? `${nameOf(draft.index, relation.from)} → ${nameOf(draft.index, relation.to)}`}"`;
  const created: Relation = compact({
    id,
    relationType: relation.relationType,
    from: relation.from,
    to: relation.to,
    name,
    description: relation.description,
    attributes: changedAttributes(undefined, relation.attributes, undefined),
    appearance:
      relation.appearance === undefined
        ? undefined
        : checkedRelationAppearance(relation.appearance, of),
  });
  draft.apply({
    op: 'insert',
    collection: { name: 'relations' },
    index: draft.state.model.relations.length,
    item: created,
  });
  draft.created.push(id);
  draft.warnings.push(...limitWarnings(created, draft.index, draft.definitions));
  return `Add the relation "${relationLabel(draft.index, id)}"`;
}

export function updateRelation(draft: Draft, command: UpdateRelationCommand): string {
  const current = draft.relation(command.id);
  const { changes } = command;
  const next: Relation = { ...current };
  if (changes.relationType !== undefined) {
    draft.relationType(changes.relationType);
    next.relationType = changes.relationType;
  }
  for (const end of ['from', 'to'] as const) {
    const value = changes[end];
    if (value === undefined) continue;
    draft.end(value);
    if (value === current.id || endsOnRelation(draft.index, value, current.id)) {
      reject(
        'invalid-command',
        `The relation "${relationLabel(draft.index, current.id)}" cannot end on itself, directly or through the relations that end on it.`,
        [current.id],
      );
    }
    next[end] = value;
  }
  if (changes.name === null) delete next.name;
  else if (changes.name !== undefined) next.name = requireName(changes.name, 'A relation');
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) next.description = changes.description;
  const attributes = changedAttributes(
    current.attributes,
    changes.attributes,
    changes.removeAttributes,
  );
  if (attributes === undefined) delete next.attributes;
  else next.attributes = attributes;
  if (changes.appearance !== undefined && changes.appearanceTraits !== undefined) {
    reject(
      'invalid-command',
      'A relation’s appearance is replaced whole or changed trait by trait, not both at once.',
      [current.id],
    );
  }
  const of = `the relation "${relationLabel(draft.index, current.id)}"`;
  const appearance =
    changes.appearance === null
      ? undefined
      : changes.appearance !== undefined
        ? checkedRelationAppearance(changes.appearance, of, current.appearance)
        : changes.appearanceTraits !== undefined
          ? changedRelationAppearance(current.appearance, changes.appearanceTraits, of)
          : current.appearance;
  if (appearance === undefined) delete next.appearance;
  else next.appearance = appearance;

  const others = indexModel(
    {
      ...draft.state.model,
      relations: draft.state.model.relations.filter((each) => each.id !== current.id),
    },
    draft.definitions.nestingRelationTypes,
  );
  checkNesting(draft, others, next);
  draft.apply({ op: 'replace', collection: { name: 'relations' }, item: next });
  if (
    changes.relationType !== undefined ||
    changes.from !== undefined ||
    changes.to !== undefined
  ) {
    draft.warnings.push(...limitWarnings(next, draft.index, draft.definitions));
  }
  return onlyAppearance(changes)
    ? `${next.appearance === undefined ? 'Reset' : 'Change'} the appearance of the relation "${relationLabel(draft.index, current.id)}"`
    : `Edit the relation "${relationLabel(draft.index, current.id)}"`;
}

/**
 * Checks a relation whose type nests: both ends are elements, World sits inside nothing, and
 * containment forms no cycle in the model indexed without it.
 */
function checkNesting(
  draft: Draft,
  index: ModelIndex,
  relation: { relationType: Id; from: Id; to: Id },
): void {
  if (!draft.definitions.relationType(relation.relationType)?.nests) return;
  for (const end of [relation.from, relation.to]) {
    if (!index.element(end)) {
      reject(
        'nesting-end-not-element',
        `A nesting relation places one element inside another, but "${endName(end, index)}" is a relation.`,
        [end],
      );
    }
  }
  if (relation.from === index.world.id) {
    reject('world-not-allowed', 'World cannot sit inside anything.', [relation.from]);
  }
  if (wouldFormCycle(index, relation.from, relation.to)) {
    reject(
      'containment-cycle',
      `Placing "${endName(relation.from, index)}" inside "${endName(relation.to, index)}" would make containment form a cycle.`,
      [relation.from, relation.to],
    );
  }
}

/** Whether `id` is a relation that ends on `target`, directly or through the relations it ends on. */
function endsOnRelation(index: ModelIndex, id: Id, target: Id): boolean {
  const stack = [id];
  const seen = new Set<Id>();
  while (stack.length > 0) {
    const current = stack.pop() as Id;
    if (seen.has(current)) continue;
    seen.add(current);
    const relation = index.relation(current);
    if (!relation) continue;
    if (relation.from === target || relation.to === target) return true;
    stack.push(relation.from, relation.to);
  }
  return false;
}

/**
 * A relation in words: its name, or its ends, as in "Booking agent → Appointments API". An end that is
 * a relation is put in parentheses: "Contract → (Client → API)".
 */
export function relationLabel(index: ModelIndex, id: Id, depth = 0): string {
  const relation = index.relation(id);
  if (!relation) return nameOf(index, id);
  if (relation.name !== undefined) return relation.name;
  const end = (each: Id) =>
    index.relation(each) && depth < 3
      ? `(${relationLabel(index, each, depth + 1)})`
      : nameOf(index, each);
  return `${end(relation.from)} → ${end(relation.to)}`;
}

function deletedThings(elements: number, relations: number): string {
  if (elements === 0) return count(relations, 'relation');
  if (relations === 0) return count(elements, 'element');
  return `${count(elements, 'element')} and ${count(relations, 'relation')}`;
}

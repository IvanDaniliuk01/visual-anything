/** Commands on the model: elements and relations. */
import type { Element, Id, Relation, ShapePosition } from '@visual-anything/schema';
import { slug } from '../ids';
import { indexModel, type ModelIndex } from '../model-index';
import { BULK, positionKey } from '../operations';
import { storedStacking } from '../stacking';
import {
  endName,
  limitWarnings,
  previewDelete,
  wouldFormCycle,
  type DeletePreview,
} from '../rules';
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
import { putPositions } from './views';

export function createElement(draft: Draft, command: CreateElementCommand): string {
  const { element } = command;
  const name = requireName(element.name, 'An element');
  draft.component(element.component);
  const id = draft.idFor(element.id, slug(name, 'element'));
  const created: Element = compact({
    id,
    component: element.component,
    name,
    description: element.description,
    attributes: changedAttributes(undefined, element.attributes, undefined),
    appearance: element.appearance,
  });
  draft.apply({
    op: 'insert',
    collection: { name: 'elements' },
    index: draft.state.model.elements.length,
    item: created,
  });
  draft.created.push(id);

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
  if (changes.appearance === null) delete next.appearance;
  else if (changes.appearance !== undefined) next.appearance = changes.appearance;
  const attributes = changedAttributes(
    current.attributes,
    changes.attributes,
    changes.removeAttributes,
  );
  if (attributes === undefined) delete next.attributes;
  else next.attributes = attributes;

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
  return changes.name !== undefined && Object.keys(changes).length === 1
    ? `Rename "${current.name}" to "${next.name}"`
    : `Edit "${next.name}"`;
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
  for (const position of preview.positions) {
    draft.apply({
      op: 'remove',
      collection: { name: 'positions', view: position.view },
      key: positionKey(position),
    });
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
  for (const id of preview.relations) {
    draft.apply({ op: 'remove', collection: { name: 'relations' }, key: id });
  }
  for (const id of preview.elements) {
    draft.apply({ op: 'remove', collection: { name: 'elements' }, key: id });
  }
}

export function createRelation(draft: Draft, command: CreateRelationCommand): string {
  const { relation } = command;
  const type = draft.relationType(relation.relationType);
  draft.end(relation.from);
  draft.end(relation.to);
  checkNesting(draft, draft.index, relation);
  const id = draft.idFor(relation.id, slug(type.name, 'relation'));
  const created: Relation = compact({
    id,
    relationType: relation.relationType,
    from: relation.from,
    to: relation.to,
    name: relation.name === undefined ? undefined : requireName(relation.name, 'A relation'),
    description: relation.description,
    attributes: changedAttributes(undefined, relation.attributes, undefined),
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
  return `Edit the relation "${relationLabel(draft.index, current.id)}"`;
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

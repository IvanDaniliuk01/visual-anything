/**
 * The command that duplicates elements (ADR 0103): Paste as duplicates and Duplicate in the app, and
 * Claude's `duplicate_elements`. A duplicate is a new element with what its original holds; the same
 * element shown in another view is not a duplicate, and needs only `add-to-view`.
 */
import type { Element, Id, Relation, ShapePosition } from '@visual-anything/schema';
import { nestingTypeFor, nestingTypesInView } from '../containers';
import { appearanceOf } from '../definitions';
import { isId } from '../ids';
import { shownByScope } from '../scope';
import { shapesInView } from '../scope-placement';
import { count, reject, requireList, requireNumber, type Draft } from './draft';
import { createElement, createRelation } from './model';
import { putScope } from './scopes';
import type { DuplicateElementsCommand, PositionChange } from './types';
import { putPositions, updateView } from './views';

/** What a duplicate landing where its original sits adds to its name, unless the command says. */
export const COPY_SUFFIX = ' (copy)';

export function duplicateElements(draft: Draft, command: DuplicateElementsCommand): string {
  const view = draft.view(command.view);
  const worldId = draft.index.world.id;
  const given = requireList(command.elements, 'elements');
  if (given.length === 0) reject('invalid-command', 'Nothing to duplicate was given.');
  const seen = new Set<Id>();
  for (const id of given) {
    if (typeof id !== 'string' || !isId(id)) {
      reject('invalid-id', `${JSON.stringify(id) ?? 'undefined'} is not a valid id.`);
    }
    if (id === worldId) {
      reject('world-not-allowed', 'World cannot be duplicated: it holds the whole model.', [id]);
    }
    const element = draft.element(id);
    if (seen.has(id)) reject('invalid-command', `"${element.name}" is given twice.`, [id]);
    seen.add(id);
  }
  if (command.beside === true && command.container !== undefined) {
    reject(
      'invalid-command',
      'Duplicates land beside their originals or in a container, not both.',
    );
  }
  const into =
    command.beside === true || command.container === undefined || command.container === worldId
      ? undefined
      : draft.element(command.container);
  // Each given element's places, by the container they are relative to; '' for any container.
  const places = new Map<Id, Map<string, { x: number; y: number }>>();
  for (const place of requireList(command.positions, 'positions')) {
    if (!seen.has(place.element)) {
      reject(
        'invalid-command',
        `A place is given for "${String(place.element)}", which is not duplicated.`,
        [place.element],
      );
    }
    const container: unknown = place.container;
    if (container !== undefined && (typeof container !== 'string' || !isId(container))) {
      reject('invalid-id', `${JSON.stringify(container) ?? 'undefined'} is not a valid id.`);
    }
    const own = places.get(place.element) ?? new Map<string, { x: number; y: number }>();
    own.set(command.beside === true ? (container ?? '') : '', {
      x: requireNumber(place.x, 'x'),
      y: requireNumber(place.y, 'y'),
    });
    places.set(place.element, own);
  }
  const suffix = command.suffix ?? COPY_SUFFIX;
  if (typeof suffix !== 'string') reject('invalid-command', 'A suffix is a text.');

  const index = draft.index;
  const definitions = draft.definitions;
  const nesting = definitions.nestingRelationTypes;
  const viewNesting = new Set(nestingTypesInView(draft.state, view));

  // What is duplicated: the given elements and everything they hold, at any depth.
  const copied = new Set<Id>(given);
  const waiting = [...given];
  for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
    for (const relation of index.relationsOn(next)) {
      if (relation.to !== next || !nesting.has(relation.relationType)) continue;
      if (copied.has(relation.from) || index.element(relation.from) === undefined) continue;
      copied.add(relation.from);
      waiting.push(relation.from);
    }
  }
  const inCopied = (relation: Relation) =>
    nesting.has(relation.relationType) && copied.has(relation.to);
  // Those that sit in no other duplicate land; the others land inside their containers' duplicates.
  const landing = given.filter(
    (id) => !index.relationsOn(id).some((relation) => relation.from === id && inCopied(relation)),
  );

  // Where each landing one goes, and the view's nesting relation types the action adds.
  const landsIn = new Map<Id, { container: Id; relationType: Id }[]>();
  const added: Id[] = [];
  for (const id of landing) {
    const original = draft.element(id);
    if (command.beside === true) {
      landsIn.set(
        id,
        index
          .relationsOn(id)
          .filter((relation) => relation.from === id && viewNesting.has(relation.relationType))
          .map((relation) => ({ container: relation.to, relationType: relation.relationType })),
      );
      continue;
    }
    if (into === undefined) {
      landsIn.set(id, []);
      continue;
    }
    const choice = nestingTypeFor(draft.state, view, original.component, into.id);
    if (choice === undefined) {
      reject(
        'not-nesting',
        `No nesting relation type can put "${original.name}" inside "${into.name}".`,
        [id, into.id],
      );
    }
    if (choice.addToView && !added.includes(choice.relationType)) added.push(choice.relationType);
    landsIn.set(id, [{ container: into.id, relationType: choice.relationType }]);
  }
  if (added.length > 0) {
    updateView(draft, {
      type: 'update-view',
      id: view.id,
      changes: { nestingRelationTypes: [...nestingTypesInView(draft.state, view), ...added] },
    });
  }

  /** Whether an original sits in a container, or directly in World, where its duplicate lands. */
  const sitsIn = (id: Id, container: Id | undefined) => {
    const holding = index.relationsOn(id).filter((relation) => relation.from === id);
    return container === undefined
      ? !holding.some((relation) => viewNesting.has(relation.relationType))
      : holding.some((relation) => relation.to === container && nesting.has(relation.relationType));
  };

  // The duplicates, the given elements' first, then what they hold in the model's order.
  const shownBefore = shownByScope(draft.state, draft.view(view.id));
  const order = [
    ...given,
    ...draft.state.model.elements
      .map((element) => element.id)
      .filter((id) => copied.has(id) && !seen.has(id)),
  ];
  const duplicates = new Map<Id, Id>();
  for (const id of order) {
    const original = draft.element(id);
    const lands = landsIn.get(id);
    const named =
      lands !== undefined &&
      (lands.length === 0
        ? sitsIn(id, undefined)
        : lands.some((each) => sitsIn(id, each.container)));
    duplicates.set(
      id,
      duplicateOf(draft, original, named ? `${original.name}${suffix}` : original.name),
    );
  }

  // The relations among what is duplicated, in the model's order; one that ends on a relation once
  // that relation is duplicated.
  const relations = new Map<Id, Id>();
  const endOf = (end: Id) => duplicates.get(end) ?? relations.get(end);
  const touched = new Set<Id>();
  let pending: Relation[] = draft.state.model.relations.filter(
    (relation) => copied.has(relation.from) || copied.has(relation.to),
  );
  for (const relation of pending) touched.add(relation.id);
  while (pending.length > 0) {
    const next: Relation[] = [];
    let grew = false;
    for (const relation of pending) {
      const from = endOf(relation.from);
      const to = endOf(relation.to);
      if (from === undefined || to === undefined) {
        next.push(relation);
        continue;
      }
      createRelation(draft, {
        type: 'create-relation',
        relation: {
          relationType: relation.relationType,
          from,
          to,
          ...(relation.name === undefined ? {} : { name: relation.name }),
          ...(relation.description === undefined ? {} : { description: relation.description }),
          ...(relation.attributes === undefined ? {} : { attributes: relation.attributes }),
          ...(relation.appearance === undefined ? {} : { appearance: relation.appearance }),
        },
      });
      relations.set(relation.id, draft.created[draft.created.length - 1] as Id);
      grew = true;
      // The relations that end on it may now have both their ends.
      for (const on of index.relationsOn(relation.id)) {
        if (touched.has(on.id)) continue;
        touched.add(on.id);
        next.push(on);
      }
    }
    if (!grew) break;
    pending = next;
  }
  // The relations that land them.
  for (const [id, lands] of landsIn) {
    for (const { container, relationType } of lands) {
      createRelation(draft, {
        type: 'create-relation',
        relation: { relationType, from: duplicates.get(id) as Id, to: container },
      });
    }
  }

  // The view shows the duplicates that land, and those whose originals it showed.
  const current = draft.view(view.id);
  if (current.scope !== undefined) {
    const shown = shownByScope(draft.state, current);
    const more = order
      .filter((id) => landsIn.has(id) || shownBefore.element(id))
      .map((id) => duplicates.get(id) as Id)
      .filter((id) => !shown.element(id));
    if (more.length > 0) {
      putScope(draft, current, {
        ...current.scope,
        added: [...(current.scope.added ?? []), ...more],
      });
    }
  }

  // Their places: those given for the ones that land, and their originals' inside their duplicates.
  const placed = draft.view(view.id);
  const sits = shapesInView(draft.state, placed);
  const stored = new Map<string, ShapePosition>();
  const firstOf = new Map<Id, ShapePosition>();
  for (const position of placed.positions) {
    stored.set(`${position.element}\u0000${position.container ?? ''}`, position);
    if (!firstOf.has(position.element)) firstOf.set(position.element, position);
  }
  const rows = (container: Id | undefined) => {
    const element = container === undefined ? undefined : draft.index.element(container);
    return element !== undefined && appearanceOf(element, definitions).contentsAsRows === true;
  };
  const positions: PositionChange[] = [];
  for (const [id, own] of places) {
    if (!landsIn.has(id)) continue;
    const element = duplicates.get(id) as Id;
    const containers = sits.containersOf(element) ?? [];
    for (const container of containers.length === 0 ? [undefined] : containers) {
      if (rows(container)) continue;
      // With `beside`, the place given for this container, else the one for any.
      const place = own.get(container ?? '') ?? own.get('');
      if (place === undefined) continue;
      const original =
        stored.get(`${id}\u0000${(command.beside === true ? container : undefined) ?? ''}`) ??
        firstOf.get(id);
      positions.push({
        ...sizeOf(original),
        element,
        ...(container === undefined ? {} : { container }),
        ...place,
      });
    }
  }
  for (const position of placed.positions) {
    if (landsIn.has(position.element) || position.container === undefined) continue;
    const element = duplicates.get(position.element);
    const container = duplicates.get(position.container);
    if (element === undefined || container === undefined) continue;
    if (!(sits.containersOf(element) ?? []).includes(container) || rows(container)) continue;
    positions.push({ ...position, element, container });
  }
  if (positions.length > 0) putPositions(draft, view.id, positions);

  const [only] = given;
  return given.length === 1 && only !== undefined
    ? `Duplicate "${index.element(only)?.name ?? only}"`
    : `Duplicate ${count(given.length, 'element')}`;
}

/** A new element with an original's component, attributes, description and appearance. */
function duplicateOf(draft: Draft, original: Element, name: string): Id {
  createElement(draft, {
    type: 'create-element',
    element: {
      component: original.component,
      name,
      ...(original.description === undefined ? {} : { description: original.description }),
      ...(original.attributes === undefined ? {} : { attributes: original.attributes }),
      ...(original.appearance === undefined ? {} : { appearance: original.appearance }),
    },
  });
  return draft.created[draft.created.length - 1] as Id;
}

/** The size, turn and mirroring a shape's position keeps, without its place. */
function sizeOf(position: ShapePosition | undefined): Partial<PositionChange> {
  if (position === undefined) return {};
  const { width, height, rotation, flip } = position;
  return {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(rotation === undefined ? {} : { rotation }),
    ...(flip === undefined ? {} : { flip }),
  };
}

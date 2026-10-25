/** Commands on views: the views themselves, where their shapes sit, and their free shapes. */
import type { FreeShape, Id, ShapePosition, ViewFile } from '@visual-anything/schema';
import { slug } from '../ids';
import { nestingTypesInView } from '../containers';
import { appearanceOf } from '../definitions';
import {
  BULK,
  keyOf,
  positionKey,
  type Collection,
  type Item,
  type ViewProperties,
} from '../operations';
import {
  compact,
  count,
  nameOf,
  reject,
  requireList,
  requireName,
  requireNumber,
  sameJson,
  type Draft,
} from './draft';
import { checkedColor } from './traits';
import type {
  CreateFreeShapeCommand,
  CreateViewCommand,
  DeleteFreeShapesCommand,
  DeleteViewCommand,
  NewFreeShape,
  RemovePositionsCommand,
  SetPositionsCommand,
  UpdateFreeShapeCommand,
  UpdateViewCommand,
} from './types';

export function createView(draft: Draft, command: CreateViewCommand): string {
  const { view } = command;
  const name = requireName(view.name, 'A view');
  const nesting = view.nestingRelationTypes ?? [...draft.definitions.nestingRelationTypes];
  checkNestingTypes(draft, nesting);
  const id = draft.idFor(view.id, slug(name, 'view'));
  const created: ViewFile = compact({
    id,
    name,
    description: view.description,
    perspective: perspectiveOf(view.perspective),
    nestingRelationTypes: [...nesting],
    positions: [],
    freeShapes: [],
  });
  draft.apply({
    op: 'insert',
    collection: { name: 'views' },
    index: draft.state.views.length,
    item: created,
  });
  draft.created.push(id);
  return `Create the view "${name}"`;
}

export function updateView(draft: Draft, command: UpdateViewCommand): string {
  const current = viewProperties(draft.view(command.id));
  const { changes } = command;
  const next = { ...current };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'A view');
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) next.description = changes.description;
  if (changes.perspective !== undefined) next.perspective = perspectiveOf(changes.perspective);
  if (changes.nestingRelationTypes !== undefined) {
    checkNestingTypes(draft, changes.nestingRelationTypes);
    next.nestingRelationTypes = [...changes.nestingRelationTypes];
  }
  draft.apply({ op: 'set-view', view: current.id, properties: next });
  return `Edit the view "${next.name}"`;
}

export function deleteView(draft: Draft, command: DeleteViewCommand): string {
  const view = draft.view(command.id);
  const users = draft.state.scenarios.filter((scenario) => scenario.view === view.id);
  if (users.length > 0) {
    reject(
      'in-use',
      `The view "${view.name}" cannot be deleted: ${users.map((each) => `"${each.name}"`).join(', ')} play over it.`,
      users.map((each) => each.id),
    );
  }
  draft.apply({ op: 'remove', collection: { name: 'views' }, key: view.id });
  return `Delete the view "${view.name}"`;
}

export function setPositions(draft: Draft, command: SetPositionsCommand): string {
  const view = draft.view(command.view);
  const positions = requireList(command.positions, 'positions');
  if (positions.length === 0) reject('invalid-command', 'No positions were given.');
  putPositions(draft, view.id, positions);
  const first = positions[0] as ShapePosition;
  return positions.length === 1
    ? `Move "${nameOf(draft.index, first.element)}" in "${view.name}"`
    : `Move ${count(positions.length, 'shape')} in "${view.name}"`;
}

/**
 * Sets positions in a view, replacing the ones with the same element and container. A position with
 * a container needs the element to sit in it under one of the view's nesting relation types.
 */
export function putPositions(draft: Draft, viewId: Id, positions: readonly ShapePosition[]): void {
  const view = draft.view(viewId);
  // The same rule as the canvas: the types the view lists that a package in use defines and that nest.
  const nesting = new Set(nestingTypesInView(draft.state, view));
  const keys = new Set<string>();
  const checked = positions.map((position) => {
    const element = draft.element(position.element);
    if (element.id === draft.index.world.id) {
      reject('world-not-allowed', 'World has no shape; it is the canvas itself.', [element.id]);
    }
    if (position.container !== undefined) {
      const container = draft.element(position.container);
      const inside = draft.index
        .relationsOn(element.id)
        .some(
          (relation) =>
            relation.from === element.id &&
            relation.to === container.id &&
            nesting.has(relation.relationType),
        );
      if (!inside) {
        reject(
          'unknown-position',
          `"${element.name}" does not sit inside "${container.name}" in the view "${view.name}".`,
          [element.id, container.id],
        );
      }
      if (appearanceOf(container, draft.definitions).contentsAsRows) {
        reject(
          'position-of-row',
          `"${element.name}" is a row of "${container.name}", which places its rows in the model's order; a row has no position of its own.`,
          [element.id, container.id],
        );
      }
    }
    const key = positionKey(position);
    if (keys.has(key)) reject('invalid-command', `The position of "${key}" is given twice.`);
    keys.add(key);
    return compact({
      element: element.id,
      container: position.container,
      x: requireNumber(position.x, 'x'),
      y: requireNumber(position.y, 'y'),
      width:
        position.width === undefined ? undefined : requireNumber(position.width, 'A width', true),
      height:
        position.height === undefined
          ? undefined
          : requireNumber(position.height, 'A height', true),
      pinned: position.pinned ? true : undefined,
    });
  });
  upsert(draft, { name: 'positions', view: view.id }, view.positions, checked);
}

export function removePositions(draft: Draft, command: RemovePositionsCommand): string {
  const view = draft.view(command.view);
  const asked = requireList(command.positions, 'positions');
  if (asked.length === 0) reject('invalid-command', 'No positions were given.');
  const existing = new Set(view.positions.map(positionKey));
  const keys = new Set<string>();
  for (const position of asked) {
    const key = positionKey(position);
    if (!existing.has(key)) {
      reject('unknown-position', `The view "${view.name}" stores no position for "${key}".`, [
        position.element,
      ]);
    }
    keys.add(key);
  }
  const collection: Collection = { name: 'positions', view: view.id };
  if (keys.size > BULK) {
    const items = view.positions.filter((position) => !keys.has(positionKey(position)));
    draft.apply({ op: 'replace-all', collection, items });
  } else {
    for (const key of keys) draft.apply({ op: 'remove', collection, key });
  }
  const first = asked[0] as { element: Id };
  return keys.size === 1
    ? `Let layout place "${nameOf(draft.index, first.element)}" in "${view.name}"`
    : `Let layout place ${count(keys.size, 'shape')} in "${view.name}"`;
}

export function createFreeShape(draft: Draft, command: CreateFreeShapeCommand): string {
  const view = draft.view(command.view);
  const taken = new Set(view.freeShapes.map((shape) => shape.id));
  const id = draft.idFor(command.shape.id, command.shape.kind ?? 'shape', (each) =>
    taken.has(each),
  );
  const shape = checkedFreeShape({ ...command.shape, id }, view.name);
  draft.apply({
    op: 'insert',
    collection: { name: 'freeShapes', view: view.id },
    index: view.freeShapes.length,
    item: shape,
  });
  draft.created.push(id);
  return `Add ${shape.kind === 'note' ? 'a note' : 'an arrow'} to "${view.name}"`;
}

export function updateFreeShape(draft: Draft, command: UpdateFreeShapeCommand): string {
  const view = draft.view(command.view);
  const current = view.freeShapes.find((each) => each.id === command.shape?.id);
  const shape = checkedFreeShape(command.shape, view.name, current);
  if (current === undefined) {
    reject('unknown-free-shape', `The view "${view.name}" has no free shape "${shape.id}".`, [
      shape.id,
    ]);
  }
  draft.apply({ op: 'replace', collection: { name: 'freeShapes', view: view.id }, item: shape });
  const colorsOnly =
    current.kind === shape.kind &&
    !sameJson(current, shape) &&
    sameJson(withoutColors(current), withoutColors(shape));
  if (colorsOnly) {
    return shape.kind === 'note'
      ? `Change the colors of a note in "${view.name}"`
      : `Change the color of an arrow in "${view.name}"`;
  }
  return `Edit ${shape.kind === 'note' ? 'a note' : 'an arrow'} in "${view.name}"`;
}

/** A free shape without its colors, to tell a change of color from any other change. */
function withoutColors(shape: FreeShape): object {
  return Object.fromEntries(
    Object.entries(shape).filter(([key]) => key !== 'fill' && key !== 'stroke'),
  );
}

export function deleteFreeShapes(draft: Draft, command: DeleteFreeShapesCommand): string {
  const view = draft.view(command.view);
  const ids = new Set(requireList(command.ids, 'ids'));
  if (ids.size === 0) reject('invalid-command', 'No free shapes were given.');
  for (const id of ids) {
    if (!view.freeShapes.some((each) => each.id === id)) {
      reject('unknown-free-shape', `The view "${view.name}" has no free shape "${id}".`, [id]);
    }
    draft.apply({ op: 'remove', collection: { name: 'freeShapes', view: view.id }, key: id });
  }
  return `Delete ${count(ids.size, 'free shape')} from "${view.name}"`;
}

/** Inserts new items at the end of a list and replaces the ones with the same key, in one go. */
function upsert<T extends Item>(
  draft: Draft,
  collection: Collection,
  current: readonly T[],
  items: readonly T[],
): void {
  const keyOfItem = (item: T) => keyOf(collection, item);
  if (items.length > BULK) {
    const byKey = new Map(items.map((item) => [keyOfItem(item), item]));
    const next: T[] = current.map((item) => byKey.get(keyOfItem(item)) ?? item);
    const existing = new Set(current.map(keyOfItem));
    for (const item of items) if (!existing.has(keyOfItem(item))) next.push(item);
    draft.apply({ op: 'replace-all', collection, items: next });
    return;
  }
  const existing = new Set(current.map(keyOfItem));
  let length = current.length;
  for (const item of items) {
    if (existing.has(keyOfItem(item))) {
      draft.apply({ op: 'replace', collection, item });
    } else {
      draft.apply({ op: 'insert', collection, index: length, item });
      length += 1;
    }
  }
}

/** A view without its shapes and their stacking order: what `set-view` replaces. */
export function viewProperties(view: ViewFile): ViewProperties {
  const properties: Partial<ViewFile> = { ...view };
  delete properties.positions;
  delete properties.freeShapes;
  delete properties.stackingOrder;
  return properties as ViewProperties;
}

function checkNestingTypes(draft: Draft, ids: readonly Id[]): void {
  const seen = new Set<Id>();
  for (const id of requireList(ids, 'nesting relation types')) {
    const type = draft.relationType(id);
    if (!type.nests) {
      reject('not-nesting', `The relation type "${type.name}" does not nest.`, [id]);
    }
    if (seen.has(id)) {
      reject('invalid-command', `The nesting relation type "${type.name}" is given twice.`, [id]);
    }
    seen.add(id);
  }
}

function perspectiveOf(perspective: { name: string; description?: string } | undefined) {
  return compact({
    name: requireName(perspective?.name, 'A perspective'),
    description: perspective?.description,
  });
}

/**
 * A free shape a command sets, checked, with the colors of its own: a note's fill and stroke and an
 * arrow's stroke, kept in the spelling `stored`, the shape as it is, gives the same color (ADR-0035).
 */
function checkedFreeShape(
  shape: FreeShape | NewFreeShape,
  viewName: string,
  stored?: FreeShape,
): FreeShape {
  const color = (value: unknown, trait: string, of: string, kept: unknown) =>
    value === undefined ? undefined : checkedColor(value, trait, of, kept);
  if (shape.kind === 'note') {
    if (typeof shape.text !== 'string') reject('invalid-command', 'A note needs text.');
    const of = `a note in "${viewName}"`;
    const before = stored?.kind === 'note' ? stored : undefined;
    return compact({
      kind: 'note',
      id: (shape as FreeShape).id,
      x: requireNumber(shape.x, 'x'),
      y: requireNumber(shape.y, 'y'),
      width: requireNumber(shape.width, 'A width', true),
      height: requireNumber(shape.height, 'A height', true),
      text: shape.text,
      fill: color(shape.fill, 'fill', of, before?.fill),
      stroke: color(shape.stroke, 'stroke', of, before?.stroke),
    });
  }
  if (shape.kind === 'arrow') {
    const of = `an arrow in "${viewName}"`;
    if ((shape as { fill?: unknown }).fill !== undefined) {
      reject('invalid-appearance', `An arrow has no fill; give ${of} a stroke instead.`);
    }
    const before = stored?.kind === 'arrow' ? stored : undefined;
    return compact({
      kind: 'arrow',
      id: (shape as FreeShape).id,
      from: { x: requireNumber(shape.from?.x, 'x'), y: requireNumber(shape.from?.y, 'y') },
      to: { x: requireNumber(shape.to?.x, 'x'), y: requireNumber(shape.to?.y, 'y') },
      stroke: color(shape.stroke, 'stroke', of, before?.stroke),
    });
  }
  reject('invalid-command', 'A free shape is a note or an arrow.');
}

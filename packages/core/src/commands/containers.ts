/**
 * The command that puts shapes inside a container, or takes them out, as dropping them on the canvas
 * does, and its preview. Containment is part of the model: leaving a container deletes the relations
 * that placed the element there, with what ends on them, and entering one creates a relation.
 */
import type { Element, Id, Relation, ShapePosition } from '@visual-anything/schema';
import { leavingRelations, nestingTypeFor, nestingTypesInView } from '../containers';
import { randomIds, slug } from '../ids';
import type { ModelIndex } from '../model-index';
import { problem, type Problem } from '../problems';
import { limitWarnings, previewDelete, wouldFormCycle, type DeletePreview } from '../rules';
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
import { Draft, Rejection, count, reject, requireList, requireNumber } from './draft';
import { applyDeletion } from './model';
import { whereNot } from './stacking';
import type { ChangeContainerCommand } from './types';
import { putPositions } from './views';

/** What a change of container deletes, and whether the core would refuse it. */
export interface ContainerChangePreview extends DeletePreview {
  /** The nesting relations it deletes. */
  leaving: Id[];
  /** Those of them that have a name, a description or attributes of their own. */
  withData: Id[];
}

interface CheckedShape {
  element: Element;
  from: Id | undefined;
  at: { x: number; y: number; width?: number; height?: number } | undefined;
  pinned: boolean;
}

export function changeContainer(draft: Draft, command: ChangeContainerCommand): string {
  const view = draft.view(command.view);
  const shapes = requireList(command.shapes, 'shapes');
  if (shapes.length === 0) reject('invalid-command', 'No shapes were given.');
  const worldId = draft.index.world.id;
  const to =
    command.to === undefined || command.to === worldId ? undefined : draft.element(command.to);
  const viewTypes = nestingTypesInView(draft.state, view);
  let given: { id: Id; name: string } | undefined;
  if (command.relationType !== undefined) {
    const type = draft.relationType(command.relationType);
    if (!type.nests)
      reject('not-nesting', `The relation type "${type.name}" does not nest.`, [type.id]);
    if (!viewTypes.includes(type.id)) {
      reject('not-nesting', `The view "${view.name}" is not arranged by "${type.name}".`, [
        type.id,
      ]);
    }
    given = { id: type.id, name: type.name };
  }

  const before = draft.state;
  const contents = new Map<Id, Set<Id>>();
  const contentsOf = (key: Id): Set<Id> => {
    let ids = contents.get(key);
    if (!ids) {
      ids = new Set(contentsInView(before, view, key === worldId ? undefined : key));
      contents.set(key, ids);
    }
    return ids;
  };
  const pairs = new Set<string>();
  const placed = new Set<Id>();
  const checked: CheckedShape[] = shapes.map((shape) => {
    const element = draft.element(shape.element);
    if (element.id === worldId) {
      reject('world-not-allowed', 'World has no shape; it is the canvas itself.', [element.id]);
    }
    const from =
      shape.from === undefined || shape.from === worldId ? undefined : draft.element(shape.from);
    if (!contentsOf(stackingKey(worldId, from?.id)).has(element.id)) {
      reject('unknown-position', whereNot(element.name, from?.name, view), [element.id]);
    }
    const pair = JSON.stringify([from?.id ?? null, element.id]);
    if (pairs.has(pair)) {
      reject(
        'invalid-command',
        from === undefined
          ? `"${element.name}" is given twice from World.`
          : `"${element.name}" is given twice from "${from.name}".`,
        [element.id],
      );
    }
    pairs.add(pair);
    let at: CheckedShape['at'];
    if (shape.at !== undefined) {
      if (placed.has(element.id)) {
        reject('invalid-command', `The position of "${element.name}" is given twice.`, [
          element.id,
        ]);
      }
      placed.add(element.id);
      at = {
        x: requireNumber(shape.at.x, 'x'),
        y: requireNumber(shape.at.y, 'y'),
        ...(shape.at.width === undefined
          ? {}
          : { width: requireNumber(shape.at.width, 'A width', true) }),
        ...(shape.at.height === undefined
          ? {}
          : { height: requireNumber(shape.at.height, 'A height', true) }),
      };
    }
    if (to !== undefined && element.id === to.id) {
      reject('containment-cycle', `"${element.name}" cannot go inside itself.`, [element.id]);
    }
    if (shape.pinned !== undefined && typeof shape.pinned !== 'boolean') {
      reject('invalid-command', `Whether "${element.name}" is pinned is true or false.`, [
        element.id,
      ]);
    }
    return { element, from: from?.id, at, pinned: shape.pinned ?? true };
  });

  // The elements, in the order they first come; one enters when a shape of it leaves where it sits.
  const elements: Element[] = [];
  const leaving = new Map<Id, Relation[]>();
  for (const shape of checked) {
    if (!elements.some((element) => element.id === shape.element.id)) elements.push(shape.element);
    if (shape.from === to?.id) continue;
    const list = leaving.get(shape.element.id) ?? [];
    for (const relation of leavingRelations(before, view, shape.element.id, shape.from)) {
      if (!list.some((each) => each.id === relation.id)) list.push(relation);
    }
    leaving.set(shape.element.id, list);
  }
  const entering = elements.filter((element) => leaving.has(element.id));
  if (to !== undefined && entering.length > 0 && viewTypes.length === 0) {
    reject(
      'not-nesting',
      `The view "${view.name}" is arranged by no relation type that nests, so nothing can be put inside anything in it.`,
      [view.id],
    );
  }

  // Leave: the relations that placed them, with what cascades.
  const left = [...leaving.values()].flat();
  if (left.length > 0) {
    const preview = previewDelete(draft.state, { relations: left.map((relation) => relation.id) });
    if (preview.problems.length > 0) throw new Rejection(preview.problems);
    applyDeletion(draft, preview);
  }

  // Enter: one relation per element that does not sit inside already, with no cycle.
  const created: Relation[] = [];
  if (to !== undefined) {
    const index = draft.index;
    const shown = new Set(viewTypes);
    const generated = new Set<Id>();
    for (const element of entering) {
      const inside = index
        .relationsOn(element.id)
        .some(
          (relation) =>
            relation.from === element.id &&
            relation.to === to.id &&
            shown.has(relation.relationType),
        );
      if (inside) continue;
      if (wouldFormCycle(index, element.id, to.id)) {
        reject('containment-cycle', cycleMessage(draft, index, element, to, shown, view.name), [
          element.id,
          to.id,
        ]);
      }
      const typeId = given?.id ?? nestingTypeFor(before, view, leaving.get(element.id) ?? []);
      if (typeId === undefined) {
        reject(
          'not-nesting',
          `The view "${view.name}" is arranged by no relation type that nests, so nothing can be put inside anything in it.`,
          [view.id],
        );
      }
      const type = draft.relationType(typeId);
      if (!type.nests)
        reject('not-nesting', `The relation type "${type.name}" does not nest.`, [type.id]);
      const id = draft.newId(slug(type.name, 'relation'), (candidate) => generated.has(candidate));
      generated.add(id);
      created.push({ id, relationType: type.id, from: element.id, to: to.id });
    }
    for (const relation of created) {
      draft.apply({
        op: 'insert',
        collection: { name: 'relations' },
        index: draft.state.model.relations.length,
        item: relation,
      });
      draft.created.push(relation.id);
    }
    for (const relation of created) {
      draft.warnings.push(...limitWarnings(relation, draft.index, draft.definitions));
    }
  }

  // Positions: where the shapes go, pinned unless the program chose the place.
  const inWorld = new Set(contentsInView(draft.state, view, undefined));
  const positions: ShapePosition[] = checked.flatMap(({ element, at, pinned }) => {
    if (at === undefined) return [];
    if (to === undefined && !inWorld.has(element.id)) return [];
    return [
      {
        element: element.id,
        ...(to === undefined ? {} : { container: to.id }),
        ...at,
        ...(pinned ? { pinned: true } : {}),
      },
    ];
  });
  if (positions.length > 0) putPositions(draft, view.id, positions);

  // Front: what entered comes in front of what was there, in the order given.
  const key = stackingKey(worldId, to?.id);
  const live = contentsInView(draft.state, view, to?.id);
  const shown = new Set(live);
  const front = entering.map((element) => element.id).filter((id) => shown.has(id));
  if (front.length > 0) {
    const current = draft.view(view.id);
    const stored = storedStacking(current, key) ?? [];
    const entered = new Set(front);
    const order = orderByStacking(live, (id) => id, stored).filter((id) => !entered.has(id));
    order.push(...front);
    const collection = { name: 'stackingOrder' as const, view: view.id, container: key };
    const next = stackingListFor(order, modelRankOf(draft.state));
    for (const operation of stackingOperations(collection, stored, next)) draft.apply(operation);
  }

  return labelOf(checked, entering, to, view.name, (id) => draft.index.element(id)?.name ?? id);
}

/** Says why an element cannot go inside a container: the container already sits inside it. */
function cycleMessage(
  draft: Draft,
  index: ModelIndex,
  element: Element,
  to: Element,
  shown: ReadonlySet<Id>,
  viewName: string,
): string {
  // The first relation on the way from the container up to the element names the relation type.
  const nesting = draft.definitions.nestingRelationTypes;
  const queue: { id: Id; first: Relation | undefined }[] = [{ id: to.id, first: undefined }];
  const seen = new Set<Id>([to.id]);
  let through: Relation | undefined;
  while (queue.length > 0 && through === undefined) {
    const { id, first } = queue.shift() as { id: Id; first: Relation | undefined };
    for (const relation of index.relationsOn(id)) {
      if (relation.from !== id || !nesting.has(relation.relationType)) continue;
      const step = first ?? relation;
      if (relation.to === element.id) {
        through = step;
        break;
      }
      if (!seen.has(relation.to)) {
        seen.add(relation.to);
        queue.push({ id: relation.to, first: step });
      }
    }
  }
  const typeName = through
    ? (draft.definitions.relationType(through.relationType)?.name ?? through.relationType)
    : undefined;
  const base = `"${element.name}" cannot go inside "${to.name}", which is inside "${element.name}" in the model`;
  if (!through || typeName === undefined) return `${base}.`;
  return shown.has(through.relationType)
    ? `${base} through "${typeName}".`
    : `${base} through "${typeName}", which the view "${viewName}" does not show.`;
}

function labelOf(
  shapes: readonly CheckedShape[],
  entering: readonly Element[],
  to: Element | undefined,
  viewName: string,
  nameOf: (id: Id) => string,
): string {
  const elements = [...new Map(shapes.map((shape) => [shape.element.id, shape.element])).values()];
  if (entering.length === 0) {
    const [only] = elements;
    return elements.length === 1 && only
      ? `Move "${only.name}" in "${viewName}"`
      : `Move ${count(elements.length, 'element')} in "${viewName}"`;
  }
  const fromsOf = (element: Element) => [
    ...new Set(
      shapes.filter((shape) => shape.element.id === element.id).map((shape) => shape.from),
    ),
  ];
  if (elements.length === 1) {
    const element = elements[0] as Element;
    const froms = fromsOf(element);
    const [from] = froms;
    if (to !== undefined) {
      if (froms.length === 1 && from === undefined)
        return `Put "${element.name}" inside "${to.name}"`;
      if (froms.length === 1 && from !== undefined) {
        return `Move "${element.name}" from "${nameOf(from)}" into "${to.name}"`;
      }
      return `Move "${element.name}" into "${to.name}"`;
    }
    if (froms.length === 1 && from !== undefined)
      return `Take "${element.name}" out of "${nameOf(from)}"`;
    return `Take "${element.name}" out of its containers`;
  }
  const allFroms = new Set(shapes.map((shape) => shape.from));
  const [onlyFrom] = allFroms;
  const amount = count(elements.length, 'element');
  if (to !== undefined) {
    return allFroms.size === 1 && onlyFrom === undefined
      ? `Put ${amount} inside "${to.name}"`
      : `Move ${amount} into "${to.name}"`;
  }
  return allFroms.size === 1 && onlyFrom !== undefined
    ? `Take ${amount} out of "${nameOf(onlyFrom)}"`
    : `Take ${amount} out of their containers`;
}

/**
 * What a change of container would delete, and the problems that would stop it: the command itself
 * runs on a throwaway draft, so the preview and the command never disagree.
 */
export function previewChangeContainer(
  state: ProjectSnapshot,
  command: ChangeContainerCommand,
): ContainerChangePreview {
  const problems: Problem[] = [];
  try {
    changeContainer(new Draft(state, randomIds()), command);
  } catch (error) {
    if (error instanceof Rejection) problems.push(...error.problems);
    else if (error instanceof TypeError) {
      problems.push(problem('invalid-command', `The command is not well formed: ${error.message}`));
    } else throw error;
  }
  const view = state.views.find((each) => each.id === command.view);
  const worldId = state.model.world.id;
  const to = command.to === undefined || command.to === worldId ? undefined : command.to;
  const leaving: Relation[] = [];
  if (view && Array.isArray(command.shapes)) {
    for (const shape of command.shapes) {
      const from = shape.from === undefined || shape.from === worldId ? undefined : shape.from;
      if (from === to) continue;
      for (const relation of leavingRelations(state, view, shape.element, from)) {
        if (!leaving.some((each) => each.id === relation.id)) leaving.push(relation);
      }
    }
  }
  const deletion = previewDelete(state, { relations: leaving.map((relation) => relation.id) });
  return {
    ...deletion,
    leaving: leaving.map((relation) => relation.id),
    withData: leaving
      .filter(
        (relation) =>
          relation.name !== undefined ||
          relation.description !== undefined ||
          (relation.attributes !== undefined && Object.keys(relation.attributes).length > 0),
      )
      .map((relation) => relation.id),
    problems: [
      ...problems,
      ...deletion.problems.filter(
        (each) => !problems.some((known) => known.message === each.message),
      ),
    ],
  };
}

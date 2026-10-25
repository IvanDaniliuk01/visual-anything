/**
 * Dropping shapes onto a shape that draws its contents as rows, as a table draws its columns (ADR
 * 0023). Such a shape takes a drop at once, empty or not, and a row under the pointer stands for it:
 * a row draws nothing of what it holds, so it never takes a drop of its own.
 *
 * - **What it takes.** An element can be one of its rows when a nesting relation type in use accepts
 *   the two ends by its limits. Where some nesting relation type names the container's component, or
 *   one it derives from, in its `to` limit, only those count: a table takes columns, through "is
 *   column of", and refuses a Service, though "is part of" sets no limits. Anything else is refused,
 *   and the caption says what the container takes.
 * - **Where it lands.** Among the rows, at the place the pointer is: before the row whose upper half
 *   it is over, after one whose lower half it is over, first over the header, last under the rows or
 *   on a collapsed one. A row's place is its place in the model's order, so the drop moves the
 *   elements there in the model.
 * - **One action.** The view starts nesting by the relation type that holds the rows when it does
 *   not yet; the relations that placed the elements where they were go, as a change of container
 *   takes them (asking first, through its preview, when more goes with them); one relation of that
 *   type puts each inside, with no position and no stacking order, since rows have neither; and they
 *   take their place in the model's order. Whatever else is selected moves along.
 *
 * Pure, so that it can be tested without a canvas.
 */
import {
  componentOrEssence,
  definitionsIn,
  leavingRelations,
  modelIndexOf,
  nestingTypeFor,
  nestingTypesInView,
  type ChangeContainerCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import { fill } from '../i18n/translate';
import type { Point, Rect } from './geometry';
import { moveParts } from './gestures';
import type { IndexedScene } from './hit';
import { rowsInView } from './rowCommands';
import { ROWS_HEADER, ROW_HEIGHT } from './rows';
import type { ElementShape } from './scene';

/** The nesting relation type that makes an element a row of a container, and whether the view must start nesting by it. */
export interface RowNesting {
  relationType: Id;
  addToView: boolean;
}

/** Where a drop onto a shape that draws rows puts the moving elements among its rows. */
export interface RowSlot {
  /** Their place among the rows, from 0; as many as there are rows puts them last. */
  at: number;
  /** How many rows the shape holds now. */
  count: number;
  /** The row they go before; absent, they go after the last. */
  before?: Id;
  /** The row just before their place; absent, they go first. */
  after?: Id;
  /** For each moving element, the nesting relation type that makes it a row there. */
  nesting: readonly ({ element: Id } & RowNesting)[];
}

/**
 * The shape that takes a drop when the pointer is over `shape`, when that is about rows: a shape that
 * draws rows takes it itself, and a row stands for its container. `undefined` for any other shape.
 */
export function rowsTargetOf(indexed: IndexedScene, shape: ElementShape): ElementShape | undefined {
  if (shape.rowCount !== undefined) return shape;
  if (shape.row === undefined || shape.containerShape === undefined) return undefined;
  return indexed.byKey.get(shape.containerShape);
}

/**
 * The nesting relation type that makes an element of `component` a row of `container` in a view, or
 * why none can: the relation types that name the container's component in their `to` limit, when any
 * does, else every nesting relation type in use, of which those whose limits accept the two ends;
 * among them, the one the core would choose for the two (`nestingTypeFor`), else the first the view
 * nests by, else the first.
 */
export function rowNestingFor(
  project: ProjectSnapshot,
  viewId: Id,
  component: Id,
  container: Id,
): RowNesting | { reason: string } {
  const view = project.views.find((each) => each.id === viewId);
  const holder = modelIndexOf(project).element(container);
  if (!view || !holder) return { reason: t('Nothing can be put inside it in this view') };
  const definitions = definitionsIn(project);
  const lineageOf = (id: Id) => componentOrEssence(definitions, id).lineage;
  const from = lineageOf(component);
  const to = lineageOf(holder.component);
  const limitsOf = (id: Id) => definitions.relationType(id)?.limits ?? {};
  const accepts = (limit: readonly Id[] | undefined, lineage: readonly Id[]) =>
    limit === undefined || limit.some((id) => lineage.includes(id));
  const nesting = [...definitions.nestingRelationTypes];
  const naming = nesting.filter((id) => {
    const limit = limitsOf(id).to;
    return limit !== undefined && accepts(limit, to);
  });
  const candidates = (naming.length > 0 ? naming : nesting).filter((id) => {
    const limits = limitsOf(id);
    return accepts(limits.from, from) && accepts(limits.to, to);
  });
  const inView = nestingTypesInView(project, view);
  const choice = nestingTypeFor(project, view, component, container);
  if (choice && candidates.includes(choice.relationType)) return choice;
  const best = candidates.find((id) => inView.includes(id)) ?? candidates[0];
  if (best !== undefined) return { relationType: best, addToView: !inView.includes(best) };
  return { reason: refusal(project, naming, holder.name) };
}

/**
 * The nesting relation type that makes a new element of `component` a row of `holder`, where the
 * palette adds it, when `holder` draws its contents as rows in the view drawn; or why it cannot be one.
 * `undefined` when `holder` is no such shape, and the usual rules apply.
 */
export function rowNestingForAdd(
  indexed: IndexedScene | undefined,
  project: ProjectSnapshot,
  viewId: Id,
  component: Id,
  holder: Id | undefined,
): RowNesting | { reason: string } | undefined {
  if (holder === undefined || indexed?.byElement.get(holder)?.[0]?.rowCount === undefined) {
    return undefined;
  }
  return rowNestingFor(project, viewId, component, holder);
}

/** Why an element cannot be a row of a container: what the relation types that name it take. */
function refusal(project: ProjectSnapshot, naming: readonly Id[], target: string): string {
  const definitions = definitionsIn(project);
  const [first] = naming;
  const type = first === undefined ? undefined : definitions.relationType(first);
  if (!type) return t('No relation type that nests can make it a row of "{target}"', { target });
  const allowed = [...new Set(type.limits.from ?? [])].map((id) =>
    t.definition(id, componentOrEssence(definitions, id).name),
  );
  const last = allowed.pop();
  return t('Only a {allowed} can be a row of "{target}", through "{type}"', {
    allowed:
      last === undefined
        ? ''
        : allowed.length === 0
          ? last
          : t('{first} or {last}', { first: allowed.join(', '), last }),
    target,
    type: t.definition(type.id, type.name),
  });
}

/**
 * Where a drop at `point` onto `target`, a shape that draws rows, puts the moving elements, and the
 * nesting relation type that makes each a row; or why one of them cannot be.
 */
export function rowSlotAt(
  project: ProjectSnapshot,
  viewId: Id,
  target: ElementShape,
  moving: readonly Id[],
  point: Point,
): RowSlot | { reason: string } {
  const nesting: ({ element: Id } & RowNesting)[] = [];
  const index = modelIndexOf(project);
  // Worked out once for each component, however many of its elements move.
  const byComponent = new Map<Id, RowNesting | { reason: string }>();
  for (const element of new Set(moving)) {
    const component = index.element(element)?.component;
    if (component === undefined) continue;
    let found = byComponent.get(component);
    if (!found) {
      found = rowNestingFor(project, viewId, component, target.element);
      byComponent.set(component, found);
    }
    if ('reason' in found) return found;
    nesting.push({ element, ...found });
  }
  const view = project.views.find((each) => each.id === viewId) as ViewFile;
  // The rows it holds once the view nests by the relation types that hold them, as the drop makes it.
  const added = nesting.filter((each) => each.addToView).map((each) => each.relationType);
  const rows = rowsInView(
    project,
    added.length === 0
      ? view
      : { ...view, nestingRelationTypes: [...nestingTypesInView(project, view), ...added] },
    target.element,
  );
  const count = rows.length;
  // A collapsed one shows no rows, nor one the view does not nest by yet: what is dropped goes last.
  const drawn = target.collapsed === undefined ? (target.rowCount ?? 0) : 0;
  const at =
    drawn === 0
      ? count
      : Math.max(
          0,
          Math.min(count, Math.round((point.y - target.rect.y - ROWS_HEADER) / ROW_HEIGHT)),
        );
  const before = rows[at];
  const after = at === 0 ? undefined : rows[at - 1];
  return {
    at,
    count,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    nesting,
  };
}

/**
 * The bar that shows where a drop puts the new rows: across the shape, on the line between the rows
 * they land between, under the header for the first; none on a collapsed one, which shows no rows.
 */
export function slotBar(target: ElementShape, slot: RowSlot): Rect | undefined {
  if (target.collapsed !== undefined) return undefined;
  const at = Math.min(slot.at, target.rowCount ?? 0);
  const { x, y, width } = target.rect;
  return {
    x: x + 2,
    y: y + ROWS_HEADER + at * ROW_HEIGHT,
    width: Math.max(0, width - 4),
    height: 0,
  };
}

/** Whether two places among the rows are the same, for the caption to stay as it is. */
export function sameSlot(a: RowSlot | undefined, b: RowSlot | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.at === b.at && a.count === b.count);
}

/** What the caption says of where the drop puts them among the rows. */
export function slotText(project: ProjectSnapshot, slot: RowSlot): string {
  const nameOf = (id: Id) => modelIndexOf(project).element(id)?.name ?? id;
  if (slot.before !== undefined) return t('Before "{row}"', { row: nameOf(slot.before) });
  return slot.count === 0 ? t('As its first row') : t('After its last row');
}

/** The name of the nesting relation type that makes the dropped elements rows, when the caption says it. */
export function slotTypeName(
  project: ProjectSnapshot,
  viewId: Id,
  slot: RowSlot,
): string | undefined {
  const [first] = slot.nesting;
  const view = project.views.find((each) => each.id === viewId);
  if (first === undefined || !view) return undefined;
  if (!first.addToView && nestingTypesInView(project, view).length < 2) return undefined;
  const definitions = definitionsIn(project);
  return t.definition(
    first.relationType,
    definitions.relationType(first.relationType)?.name ?? first.relationType,
  );
}

/** The command a drop onto a shape that draws rows sends; see the module's comment. */
export function rowDropCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  movers: readonly { element: Id; from?: Id }[],
  target: ElementShape,
  slot: RowSlot,
  delta: Point,
  label: (change: ChangeContainerCommand) => string,
): { command: Command; change: ChangeContainerCommand; label: string } | undefined {
  const view = project.views.find((each) => each.id === viewId);
  if (!view || movers.length === 0) return undefined;
  const commands: Command[] = [];
  const added = [
    ...new Set(slot.nesting.filter((each) => each.addToView).map((each) => each.relationType)),
  ];
  if (added.length > 0) {
    commands.push({
      type: 'update-view',
      id: viewId,
      changes: { nestingRelationTypes: [...nestingTypesInView(project, view), ...added] },
    });
  }
  const typeOf = new Map(slot.nesting.map((each) => [each.element, each.relationType]));
  if (movers.some((mover) => !typeOf.has(mover.element))) return undefined;
  // What placed them where they were goes, with what ends on it, as a change of container does.
  const leaving = new Set<Id>();
  for (const mover of movers) {
    for (const relation of leavingRelations(project, view, mover.element, mover.from)) {
      leaving.add(relation.id);
    }
  }
  if (leaving.size > 0) commands.push({ type: 'delete', relations: [...leaving] });
  // Then one relation of the type that holds rows puts each inside, unless one already does. A row
  // has no stacking order, so nothing is brought to the front, as a change of container would.
  const shown = new Set([...nestingTypesInView(project, view), ...added]);
  const index = modelIndexOf(project);
  for (const mover of movers) {
    const inside = index
      .relationsOn(mover.element)
      .some(
        (relation) =>
          relation.from === mover.element &&
          relation.to === target.element &&
          shown.has(relation.relationType) &&
          !leaving.has(relation.id),
      );
    if (inside) continue;
    commands.push({
      type: 'create-relation',
      relation: {
        relationType: typeOf.get(mover.element) as Id,
        from: mover.element,
        to: target.element,
      },
    });
  }
  const reorder = reorderInto(project, movers, slot);
  if (reorder) commands.push(reorder);
  // The change as one, for its preview, which asks before what goes with it, and for its name.
  const change: ChangeContainerCommand = {
    type: 'change-container',
    view: viewId,
    to: target.element,
    shapes: movers.map((mover) => ({
      element: mover.element,
      ...(mover.from === undefined ? {} : { from: mover.from }),
    })),
  };
  const base = label(change);
  const rest = moveParts(indexed, project, viewId, selection, delta, new Set(typeOf.keys()));
  if (rest) commands.push(...rest.commands);
  const named = rest
    ? fill(
        rest.shapes === 1
          ? '{base}, and move {n} other shape'
          : '{base}, and move {n} other shapes',
        { base, n: rest.shapes },
      )
    : base;
  const command: Command =
    commands.length === 1 ? (commands[0] as Command) : { type: 'batch', label: named, commands };
  return { command, change, label: named };
}

/**
 * The move in the model's order that puts the dropped elements at their place among the rows, in the
 * order they come in the model; none when they are there already.
 */
function reorderInto(
  project: ProjectSnapshot,
  movers: readonly { element: Id }[],
  slot: RowSlot,
): Command | undefined {
  const order = new Map(project.model.elements.map((element, at) => [element.id, at]));
  const moving = [...new Set(movers.map((mover) => mover.element))].sort(
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  );
  // The rows on either side of the place are next to each other in the model's order, so no other
  // row sits between them: elements already between them are at their place.
  const low = slot.after === undefined ? undefined : order.get(slot.after);
  const high = slot.before === undefined ? undefined : order.get(slot.before);
  const inPlace = moving.every((id) => {
    const at = order.get(id) ?? 0;
    return (low === undefined || at > low) && (high === undefined || at < high);
  });
  if (inPlace) return undefined;
  if (slot.before !== undefined) {
    return { type: 'reorder-elements', elements: moving, before: slot.before };
  }
  // Last: just after the last row, rather than at the end of the whole model.
  const movingSet = new Set(moving);
  const next =
    low === undefined
      ? undefined
      : project.model.elements.slice(low + 1).find((element) => !movingSet.has(element.id))?.id;
  return {
    type: 'reorder-elements',
    elements: moving,
    ...(next === undefined ? {} : { before: next }),
  };
}

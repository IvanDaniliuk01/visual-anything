/**
 * Dropping shapes into and out of containers. While shapes are dragged, a plan made once at the start
 * says what moves and where it may not go; on each pointer move, the aim says what a release would do
 * there, which the canvas outlines and the caption says; on release, the drop command puts the moving
 * elements inside the container under the pointer, or takes them out of theirs, and moves the rest.
 *
 * Shapes that hold contents take a drop at once, anywhere in their rectangle, since their contents are
 * laid out there, or anywhere in their own outline when they have one (ADR 0066). Shapes that hold
 * nothing take one only after the pointer rests on them for a while,
 * so that dragging across them does not put shapes inside them by accident. A shape dragged within its
 * container stays in it, which grows, until it no longer overlaps it.
 *
 * Pure, so that it can be tested without a canvas; the controller keeps the timer and the drag.
 */
import {
  definitionsIn,
  leavingRelations,
  modelIndexOf,
  nestingTypeFor,
  nestingTypesInView,
  type ChangeContainerCommand,
  type Command,
  type ContainerChangePreview,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Relation } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import { fill } from '../i18n/translate';
import { IS_APPLE } from '../live/platform';
import { centerOf, holdsPoint, type Point, type Rect } from './geometry';
import { carriedKeys, moveParts, movingShapes } from './gestures';
import { holdsAsDrawn, type IndexedScene } from './hit';
import { drawnBoundsOf, nameTagOf } from './nameTags';
import type { Overlay } from './renderer';
import {
  rowDropCommand,
  rowSlotAt,
  rowsTargetOf,
  slotBar,
  slotText,
  slotTypeName,
  type RowSlot,
} from './rowDrop';
import { carriedRouteCommands, droppedInto } from './routing/commands';
import { contentsOriginOf, drawingOfScene, type ElementShape } from './scene';
import { overlaps } from './spatial';
import { laidOutRect } from './overlays/decorate';
import { coversRect, drawingRank } from './stacking';

/** How long, in milliseconds, the pointer rests on a shape that holds nothing before it takes a drop. */
export const REST_TO_ARM = 500;
/** How far, in screen pixels, the pointer may move while resting. */
export const REST_TOLERANCE = 8;

/** A shape a drop moves, once for each element and container. */
export interface DropMover {
  shape: ElementShape;
  /** The container its shape sits in; absent directly in World. */
  from?: Id;
  /** The key of the container shape it sits in; absent directly in World. */
  fromShape?: string;
}

/** What a drag moves, and where it may not go: made once, when the drag starts. */
export interface DropPlan {
  project: ProjectSnapshot;
  viewId: Id;
  /**
   * The moving shapes. Copies of one element inside copies of one container count once, through the
   * grabbed copy when it is one of them, else the first.
   */
  moving: readonly DropMover[];
  /** The moving shape that is, or carries, the shape the drag grabbed. */
  grabbedShape: DropMover;
  /** The keys of the moving shapes and of everything inside them, which are not drawn in place. */
  carried: ReadonlySet<string>;
  /**
   * The moving elements and everything inside them in the model, through every nesting relation type:
   * putting the moving shapes inside any of these would form a cycle.
   */
  blocked: ReadonlySet<Id>;
  /** Why the drag only moves, whatever is under the pointer: an element sits in several containers. */
  onlyMoves?: string;
  /** Whether resting on a shape that holds nothing makes it take the drop. */
  armable: (leaf: ElementShape) => boolean;
  /** How far the moving shapes reach left of and above the grabbed one. */
  reach: Point;
}

/**
 * What releasing the dragged shapes would do now. Going into a shape that draws rows, `rows` says
 * where among its rows they land (`rowDrop.ts`).
 */
export type DropAim =
  | { kind: 'stay' }
  | { kind: 'into'; target: ElementShape; rows?: RowSlot }
  | { kind: 'out' }
  | { kind: 'pending'; leaf: ElementShape; fallback: DropAim }
  | { kind: 'refused'; target: ElementShape; reason: string }
  | { kind: 'only-moves'; reason?: string };

/** The caption that says what a release would do: a line, and the details below it. */
export interface DropCaption {
  text: string;
  detail?: string;
}

/** A drop's command, the change of container in it, and how the history names it. */
export interface Drop {
  command: Command;
  change?: ChangeContainerCommand;
  label: string;
}

/**
 * The plan for a drag that grabbed `grabbed`, or `undefined` when the drag only moves shapes: in a view
 * that puts nothing inside containers, or when the grabbed shape does not move.
 */
export function planDrop(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  grabbed: ElementShape,
): DropPlan | undefined {
  const view = project.views.find((each) => each.id === viewId);
  if (!view || nestingTypesInView(project, view).length === 0) return undefined;
  const all = movingShapes(indexed, selection);
  const holdsGrabbed = (shape: ElementShape) =>
    grabbed.key === shape.key || grabbed.key.startsWith(`${shape.key}/`);

  const byPlace = new Map<string, DropMover>();
  for (const shape of all) {
    const place = JSON.stringify([shape.element, shape.container ?? null]);
    const known = byPlace.get(place);
    if (known && !holdsGrabbed(shape)) continue;
    byPlace.set(place, {
      shape,
      ...(shape.container === undefined ? {} : { from: shape.container }),
      ...(shape.containerShape === undefined ? {} : { fromShape: shape.containerShape }),
    });
  }
  const moving = [...byPlace.values()];
  const grabbedShape = moving.find((mover) => holdsGrabbed(mover.shape));
  if (!grabbedShape) return undefined;

  const index = modelIndexOf(project);
  const blocked = new Set<Id>();
  const waiting = moving.map((mover) => mover.shape.element);
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    if (blocked.has(id)) continue;
    blocked.add(id);
    waiting.push(...index.contentsOf(id));
  }

  let onlyMoves: string | undefined;
  for (const element of new Set(moving.map((mover) => mover.shape.element))) {
    const memberships = new Set(
      (indexed.byElement.get(element) ?? []).map((shape) => shape.container ?? ''),
    );
    if (memberships.size > 1) {
      onlyMoves = t('"{name}" sits in {count} containers in this view', {
        name: index.element(element)?.name ?? element,
        count: memberships.size,
      });
      break;
    }
  }

  const leavesOnly = moving.every((mover) => !mover.shape.holdsContents);
  const { rect } = grabbedShape.shape;
  return {
    project,
    viewId,
    moving,
    grabbedShape,
    carried: carriedKeys(indexed, all),
    blocked,
    ...(onlyMoves === undefined ? {} : { onlyMoves }),
    armable: (leaf) =>
      leavesOnly || (rect.width <= leaf.rect.width && rect.height <= leaf.rect.height),
    reach: {
      x: lowest(moving.map((mover) => mover.shape.rect.x)) - rect.x,
      y: lowest(moving.map((mover) => mover.shape.rect.y)) - rect.y,
    },
  };
}

/**
 * What releasing the dragged shapes at `point`, moved by `delta`, would do. `armed` is the key of the
 * shape that holds nothing the pointer rested on long enough; `exact` says which shapes count by their
 * drawn outline, as for hit testing; with `alt` held, the drag only moves.
 */
export function dropAimAt(
  indexed: IndexedScene,
  plan: DropPlan,
  point: Point,
  delta: Point,
  armed: string | undefined,
  exact: (shape: ElementShape) => boolean,
  alt = false,
): DropAim {
  if (alt) return { kind: 'only-moves' };
  if (plan.onlyMoves !== undefined) return { kind: 'only-moves', reason: plan.onlyMoves };

  let pending: ElementShape | undefined;
  let found: DropAim | undefined;
  const under = indexed.shapes.at(point);
  for (let each = under.length - 1; each >= 0 && found === undefined; each--) {
    const shape = indexed.scene.shapes[under[each] as number] as ElementShape;
    if (!takesDropAt(shape, point, exact(shape))) continue;
    if (plan.carried.has(shape.key)) continue;
    // A shape that draws rows takes a drop at once, and a row stands for it (ADR 0023).
    const rows = rowsTargetOf(indexed, shape);
    if (rows) {
      if (!plan.carried.has(rows.key)) found = rowsAim(plan, rows, point);
      continue;
    }
    if (!shape.holdsContents) {
      if (plan.armable(shape) && !plan.blocked.has(shape.element)) {
        if (armed === shape.key) found = { kind: 'into', target: shape };
        else pending ??= shape;
      }
      continue;
    }
    if (plan.blocked.has(shape.element)) {
      found = { kind: 'refused', target: shape, reason: refusalOf(plan, shape) };
    } else if (shape.element === plan.grabbedShape.from) {
      found = { kind: 'stay' };
    } else {
      found = { kind: 'into', target: shape };
    }
  }
  found ??= outsideAim(indexed, plan, delta);
  if (pending && !(found.kind === 'into' && found.target.key === pending.key)) {
    return { kind: 'pending', leaf: pending, fallback: found };
  }
  return found;
}

/**
 * Whether a shape under the pointer, its rectangle there, takes a drop at that point as the canvas
 * draws it: a shape with its own outline by that outline, a container's too (ADR 0066), so that a
 * point in a hole or beside the outline goes to what lies behind; any other shape that holds
 * contents by its rectangle, where its contents are laid out; any other leaf by its kind's outline.
 */
export function takesDropAt(shape: ElementShape, point: Point, exact: boolean): boolean {
  // A name tag is part of its shape (ADR 0066's clarification of 2026-10-27).
  if (shape.outline || nameTagOf(shape)) return holdsAsDrawn(shape, point, exact);
  return shape.holdsContents || !exact || holdsPoint(shape.kind, shape.rect, point);
}

/**
 * The topmost shape, not dragged, that is drawn after the place the grabbed shape lands in and covers
 * where it lands, if any. Shapes going into a container land at the front of its contents; others keep
 * their place among the shapes beside them; shapes taken out land at the front of World.
 */
export function landingCover(
  indexed: IndexedScene,
  plan: DropPlan,
  aim: DropAim,
  delta: Point,
): ElementShape | undefined {
  const settled = settle(aim);
  // Rows have no positions: what becomes one lands among them, behind nothing.
  if (settled.kind === 'out' || (settled.kind === 'into' && settled.rows)) return undefined;
  const { shape } = plan.grabbedShape;
  let place: ElementShape;
  let landing: Rect;
  if (settled.kind === 'into') {
    place = settled.target;
    const target = settled.target.rect;
    const origin = originIn(indexed);
    const left = shape.rect.x + plan.reach.x + delta.x - target.x;
    const top = shape.rect.y + plan.reach.y + delta.y - target.y;
    landing = {
      ...shape.rect,
      x: shape.rect.x + delta.x + Math.max(0, origin.x - left),
      y: shape.rect.y + delta.y + Math.max(0, origin.y - top),
    };
  } else {
    place = shape;
    landing = { ...shape.rect, x: shape.rect.x + delta.x, y: shape.rect.y + delta.y };
  }

  let cover: { shape: ElementShape; rank: number } | undefined;
  // From the place it lands in out to World, one contents index at each container on the way.
  for (let here: ElementShape | undefined = place; here;) {
    const rank = drawingRank(indexed, here);
    for (const other of indexed.contentsIndex(here.containerShape ?? '').query(landing)) {
      if (other.key === here.key || plan.carried.has(other.key)) continue;
      const otherRank = drawingRank(indexed, other);
      if (otherRank <= rank || (cover && otherRank <= cover.rank)) continue;
      if (coversRect(indexed, other, landing)) cover = { shape: other, rank: otherRank };
    }
    here = here.containerShape === undefined ? undefined : indexed.byKey.get(here.containerShape);
  }
  return cover?.shape;
}

/**
 * The outlines a drop draws: the container it goes into and its copies, the one it leaves, and so on,
 * each around its shape with its name tag (ADR 0066's clarification of 2026-10-27).
 */
export function dropOverlay(indexed: IndexedScene, plan: DropPlan, aim: DropAim): Overlay['drop'] {
  const from = plan.grabbedShape.fromShape;
  const leavingShape = from === undefined ? undefined : indexed.byKey.get(from);
  const leaving = leavingShape ? { leaving: drawnBoundsOf(leavingShape) } : {};
  switch (aim.kind) {
    case 'into': {
      const copies = (indexed.byElement.get(aim.target.element) ?? [])
        .filter((copy) => copy.key !== aim.target.key)
        .map(drawnBoundsOf);
      const slot = aim.rows && slotBar(aim.target, aim.rows);
      return {
        into: drawnBoundsOf(aim.target),
        ...(copies.length > 0 ? { copies } : {}),
        ...leaving,
        ...(slot ? { slot } : {}),
      };
    }
    case 'out':
      return leaving;
    case 'pending':
      return { pending: drawnBoundsOf(aim.leaf), ...leaving };
    case 'refused':
      return { refused: drawnBoundsOf(aim.target) };
    default:
      return undefined;
  }
}

/**
 * What the caption says about an aim: what a release would do, and the details below it. Nothing for a
 * drop that only moves the shapes and lands in front of what is there.
 */
export function dropCaption(
  project: ProjectSnapshot,
  plan: DropPlan,
  aim: DropAim,
  cover: ElementShape | undefined,
): DropCaption | undefined {
  const own = captionOf(project, plan, aim);
  const behind = cover && t('Lands behind "{name}"', { name: cover.name });
  if (!own) return behind ? { text: behind } : undefined;
  const parts = own.detail === undefined ? [] : [own.detail];
  if (behind) parts.push(behind);
  if (aim.kind === 'into' || aim.kind === 'pending') {
    const typeName =
      aim.kind === 'into' && aim.rows
        ? slotTypeName(project, plan.viewId, aim.rows)
        : nestingTypeName(project, plan);
    if (typeName !== undefined) parts.push(typeName);
  }
  if (aim.kind === 'into' || aim.kind === 'out' || aim.kind === 'pending') {
    parts.push(IS_APPLE ? t('⌥: move only') : t('Alt: move only'));
  }
  return parts.length > 0 ? { text: own.text, detail: parts.join(' · ') } : { text: own.text };
}

/**
 * The command a release sends when it puts the moving shapes inside a container or takes them out of
 * theirs, with everything else selected moved along in the same action; `undefined` for any other aim,
 * which only moves the shapes (`moveCommand`).
 */
export function dropCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  plan: DropPlan,
  aim: DropAim,
  delta: Point,
): Drop | undefined {
  const settled = settle(aim);
  if (settled.kind === 'into' && settled.rows) {
    return rowDropCommand(
      indexed,
      project,
      viewId,
      selection,
      plan.moving.map((mover) => ({
        element: mover.shape.element,
        ...(mover.from === undefined ? {} : { from: mover.from }),
      })),
      settled.target,
      settled.rows,
      delta,
      (change) => containerChangeLabel(project, viewId, change),
    );
  }
  let change: ChangeContainerCommand | undefined;
  if (settled.kind === 'into')
    change = intoChange(plan, settled.target, delta, viewId, originIn(indexed));
  else if (settled.kind === 'out') change = outChange(indexed, plan, delta, viewId);
  if (!change || change.shapes.length === 0) return undefined;

  const label = containerChangeLabel(project, viewId, change);
  const placed = new Set(change.shapes.map((each) => each.element));
  const rest = moveParts(indexed, project, viewId, selection, delta, placed);
  // After the change, the bend points of relations whose two ends go in, relative to their container.
  const moving = movingShapes(indexed, selection);
  const routes = carriedRouteCommands(
    indexed,
    project,
    viewId,
    carriedKeys(indexed, moving),
    { x: Math.round(delta.x), y: Math.round(delta.y) },
    droppedInto(
      indexed,
      project,
      change,
      moving,
      settled.kind === 'into' ? settled.target : undefined,
    ),
  );
  if (!rest && routes.length > 0) {
    return { command: { type: 'batch', label, commands: [change, ...routes] }, change, label };
  }
  if (!rest) return { command: change, change, label };
  const batchLabel = fill(
    rest.shapes === 1 ? '{base}, and move {n} other shape' : '{base}, and move {n} other shapes',
    { base: label, n: rest.shapes },
  );
  return {
    command: { type: 'batch', label: batchLabel, commands: [change, ...rest.commands, ...routes] },
    change,
    label: batchLabel,
  };
}

/**
 * The change that takes a shape out of the container it sits in, one container out: into that container's
 * own container, through its first copy, or directly in World; beside the container it leaves. No one
 * chose that place by hand, so it is not pinned: layout may still move the shape.
 */
export function takeOutCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  shape: ElementShape,
): ChangeContainerCommand | undefined {
  if (shape.container === undefined || !project.views.some((view) => view.id === viewId)) {
    return undefined;
  }
  const holder = indexed.byElement.get(shape.container)?.[0];
  if (!holder) return undefined;
  const to = holder.container;
  const x = holder.offset.x + holder.rect.width + 40;
  const y = holder.offset.y;
  const at = to === undefined ? { x, y } : clamped({ x, y }, originIn(indexed));
  return {
    type: 'change-container',
    view: viewId,
    ...(to === undefined ? {} : { to }),
    shapes: [
      {
        element: shape.element,
        from: shape.container,
        at: { x: Math.round(at.x), y: Math.round(at.y), ...shape.storedSize },
        pinned: false,
      },
    ],
  };
}

/**
 * The shape a shape could be put directly inside, from the shape menu: the topmost that holds contents
 * and whose rectangle holds its centre, other than itself, what is inside it, and the container it
 * sits in, and that would not form a cycle.
 */
export function putInsideTarget(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  shape: ElementShape,
): ElementShape | undefined {
  if (!project.views.some((view) => view.id === viewId)) return undefined;
  const blocked = new Set<Id>();
  const index = modelIndexOf(project);
  const waiting = [shape.element];
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    if (blocked.has(id)) continue;
    blocked.add(id);
    waiting.push(...index.contentsOf(id));
  }
  const under = indexed.shapes.at(centerOf(shape.rect));
  for (let each = under.length - 1; each >= 0; each--) {
    const target = indexed.scene.shapes[under[each] as number] as ElementShape;
    if (!target.holdsContents) continue;
    if (target.key === shape.key || target.key.startsWith(`${shape.key}/`)) continue;
    if (target.element === shape.container || blocked.has(target.element)) continue;
    return target;
  }
  return undefined;
}

/**
 * The change that puts a shape inside a target where it is now, below the target's name. The place
 * there is pinned only when the shape was pinned where it is, since the program chose it otherwise.
 */
export function putInsideCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  shape: ElementShape,
  target: ElementShape,
): ChangeContainerCommand {
  // Where layout put it, whatever size an overlay draws it at (ADR 0055).
  const at = clamped(
    {
      x: Math.round(laidOutRect(shape).x - target.rect.x),
      y: Math.round(laidOutRect(shape).y - target.rect.y),
    },
    originIn(indexed),
  );
  return {
    type: 'change-container',
    view: viewId,
    to: target.element,
    shapes: [
      {
        element: shape.element,
        ...(shape.container === undefined ? {} : { from: shape.container }),
        at: { ...at, ...shape.storedSize },
        pinned: shape.positioned === 'pinned',
      },
    ],
  };
}

/**
 * The change that moves a shape into a container chosen by name, or directly in World when `to` is
 * absent, with no position: one stored there before is used, or the container places it.
 */
export function moveToCommand(
  viewId: Id,
  shape: { element: Id; container?: Id },
  to: Id | undefined,
): ChangeContainerCommand {
  return {
    type: 'change-container',
    view: viewId,
    ...(to === undefined ? {} : { to }),
    shapes: [
      {
        element: shape.element,
        ...(shape.container === undefined ? {} : { from: shape.container }),
      },
    ],
  };
}

/** How the history names a change of container, as the core does, in English as the core does. */
export function containerChangeLabel(
  project: ProjectSnapshot,
  viewId: Id,
  change: ChangeContainerCommand,
): string {
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const worldId = project.model.world.id;
  const inWorld = (id: Id | undefined) => (id === undefined || id === worldId ? undefined : id);
  const view = project.views.find((each) => each.id === viewId)?.name ?? viewId;
  const to = inWorld(change.to);
  const shapes = change.shapes.map((shape) => ({
    element: shape.element,
    from: inWorld(shape.from),
  }));
  const elements = [...new Set(shapes.map((shape) => shape.element))];
  const fromsOf = (element: Id) =>
    new Set(shapes.filter((shape) => shape.element === element).map((shape) => shape.from));
  const entering = elements.filter((element) =>
    shapes.some((shape) => shape.element === element && shape.from !== to),
  );
  const [only] = elements;
  if (entering.length === 0) {
    return elements.length === 1 && only !== undefined
      ? fill('Move "{element}" in "{view}"', { element: nameOf(only), view })
      : fill('Move {n} elements in "{view}"', { n: elements.length, view });
  }
  if (elements.length === 1 && only !== undefined) {
    const element = nameOf(only);
    const froms = [...fromsOf(only)];
    const [from] = froms;
    if (to !== undefined) {
      const container = nameOf(to);
      if (froms.length === 1 && from === undefined) {
        return fill('Put "{element}" inside "{container}"', { element, container });
      }
      if (froms.length === 1 && from !== undefined) {
        return fill('Move "{element}" from "{from}" into "{container}"', {
          element,
          from: nameOf(from),
          container,
        });
      }
      return fill('Move "{element}" into "{container}"', { element, container });
    }
    if (froms.length === 1 && from !== undefined) {
      return fill('Take "{element}" out of "{from}"', { element, from: nameOf(from) });
    }
    return fill('Take "{element}" out of its containers', { element });
  }
  const allFroms = new Set(shapes.map((shape) => shape.from));
  const [onlyFrom] = allFroms;
  const n = elements.length;
  if (to !== undefined) {
    return allFroms.size === 1 && onlyFrom === undefined
      ? fill('Put {n} elements inside "{container}"', { n, container: nameOf(to) })
      : fill('Move {n} elements into "{container}"', { n, container: nameOf(to) });
  }
  return allFroms.size === 1 && onlyFrom !== undefined
    ? fill('Take {n} elements out of "{from}"', { n, from: nameOf(onlyFrom) })
    : fill('Take {n} elements out of their containers', { n });
}

/**
 * The confirm button of the dialog that asks before a change of container: Take out for World, Put
 * inside from World, and Move otherwise.
 */
export function confirmLabelOf(
  project: ProjectSnapshot,
  change: ChangeContainerCommand,
): 'Take out' | 'Put inside' | 'Move' {
  const worldId = project.model.world.id;
  if (change.to === undefined || change.to === worldId) return 'Take out';
  return change.shapes.every((shape) => shape.from === undefined || shape.from === worldId)
    ? 'Put inside'
    : 'Move';
}

/**
 * Whether a change of container asks first: when relations end on a relation it deletes, a scenario
 * step uses one, or one has a name, a description or attributes of its own.
 */
export function needsConfirmation(preview: ContainerChangePreview): boolean {
  return (
    preview.cascaded.length > 0 || preview.brokenSteps.length > 0 || preview.withData.length > 0
  );
}

/**
 * What a drop onto a shape that draws rows would do: make the moving elements rows of it, at the
 * place under the pointer, or nothing, when one of them cannot be a row there or would form a cycle.
 */
function rowsAim(plan: DropPlan, target: ElementShape, point: Point): DropAim {
  if (plan.blocked.has(target.element)) {
    return { kind: 'refused', target, reason: refusalOf(plan, target) };
  }
  const moving = plan.moving.map((mover) => mover.shape.element);
  const slot = rowSlotAt(plan.project, plan.viewId, target, moving, point);
  if ('reason' in slot) return { kind: 'refused', target, reason: slot.reason };
  return { kind: 'into', target, rows: slot };
}

/** What a release does: a pending leaf not taken yet does what is under it. */
function settle(aim: DropAim): Exclude<DropAim, { kind: 'pending' }> {
  return aim.kind === 'pending' ? settle(aim.fallback) : aim;
}

/** Where the walk under the pointer found no container: stay, or leave the container once clear of it. */
function outsideAim(indexed: IndexedScene, plan: DropPlan, delta: Point): DropAim {
  const { shape, fromShape } = plan.grabbedShape;
  const container = fromShape === undefined ? undefined : indexed.byKey.get(fromShape);
  if (!container) return { kind: 'stay' };
  return overlaps(moved(shape.rect, delta), container.rect) ? { kind: 'stay' } : { kind: 'out' };
}

/**
 * Why a container inside what moves refuses it: how it sits inside a moving element in the model, from
 * the first relation on the way up, and whether the view shows that kind of containment.
 */
function refusalOf(plan: DropPlan, target: ElementShape): string {
  const { project } = plan;
  const definitions = definitionsIn(project);
  const nesting = definitions.nestingRelationTypes;
  const index = modelIndexOf(project);
  const movers = new Set(plan.moving.map((mover) => mover.shape.element));
  const queue: { id: Id; first: Relation | undefined }[] = [
    { id: target.element, first: undefined },
  ];
  const seen = new Set<Id>([target.element]);
  let through: { relation: Relation; mover: Id } | undefined;
  while (queue.length > 0 && through === undefined) {
    const { id, first } = queue.shift() as { id: Id; first: Relation | undefined };
    for (const relation of index.relationsOn(id)) {
      if (relation.from !== id || !nesting.has(relation.relationType)) continue;
      const step = first ?? relation;
      if (movers.has(relation.to)) {
        through = { relation: step, mover: relation.to };
        break;
      }
      if (!seen.has(relation.to)) {
        seen.add(relation.to);
        queue.push({ id: relation.to, first: step });
      }
    }
  }
  if (!through) return t('"{name}" moves with the shapes dragged', { name: target.name });
  const { relation, mover } = through;
  const type = t.definition(
    relation.relationType,
    definitions.relationType(relation.relationType)?.name ?? relation.relationType,
  );
  const view = project.views.find((each) => each.id === plan.viewId);
  const shown =
    view !== undefined && nestingTypesInView(project, view).includes(relation.relationType);
  const values = { name: target.name, mover: index.element(mover)?.name ?? mover, type };
  return shown
    ? t('"{name}" is part of "{mover}" in the model through "{type}"', values)
    : t(
        '"{name}" is part of "{mover}" in the model through "{type}", which this view does not show',
        values,
      );
}

/** The caption's own line and detail for an aim, before what every caption adds. */
function captionOf(
  project: ProjectSnapshot,
  plan: DropPlan,
  aim: DropAim,
): { text: string; detail?: string } | undefined {
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  switch (aim.kind) {
    case 'stay':
      return undefined;
    case 'into': {
      const target = aim.target.name;
      const count = plan.moving.length;
      const froms = new Set(plan.moving.map((mover) => mover.from));
      const [from] = froms;
      if (aim.rows) {
        // What becomes a row lands among the rows, where the caption says.
        const out =
          froms.size === 1 && from !== undefined
            ? [t('Out of "{from}"', { from: nameOf(from) })]
            : [];
        return {
          text:
            count === 1
              ? t('Make it a row of "{target}"', { target })
              : t('Make {count} elements rows of "{target}"', { count, target }),
          detail: [slotText(project, aim.rows), ...out].join(' · '),
        };
      }
      if (froms.size === 1 && from === undefined) {
        return {
          text:
            count === 1
              ? t('Put inside "{target}"', { target })
              : t('Put {count} elements inside "{target}"', { count, target }),
        };
      }
      const text =
        count === 1
          ? t('Move into "{target}"', { target })
          : t('Move {count} elements into "{target}"', { count, target });
      if (froms.size === 1 && from !== undefined) {
        return { text, detail: t('Out of "{from}"', { from: nameOf(from) }) };
      }
      return { text, detail: t('Out of their containers') };
    }
    case 'out': {
      const leaving = plan.moving.filter((mover) => mover.from !== undefined);
      const froms = new Set(leaving.map((mover) => mover.from as Id));
      const [from] = froms;
      if (froms.size === 1 && from !== undefined) {
        return {
          text:
            leaving.length === 1
              ? t('Take out of "{from}"', { from: nameOf(from) })
              : t('Take {count} elements out of "{from}"', {
                  count: leaving.length,
                  from: nameOf(from),
                }),
        };
      }
      return {
        text: t('Take {count} elements out of their containers', { count: leaving.length }),
      };
    }
    case 'pending': {
      const fallback = captionOf(project, plan, aim.fallback)?.text;
      const then = fallback === undefined ? t('move only') : lowerFirst(fallback);
      return {
        text: t('Hold still to put inside "{name}"', { name: aim.leaf.name }),
        detail: t('Release now: {then}', { then }),
      };
    }
    case 'refused':
      return {
        text: t('Cannot put inside "{name}"', { name: aim.target.name }),
        detail: aim.reason,
      };
    case 'only-moves':
      return aim.reason === undefined
        ? { text: t('Moves only') }
        : { text: t('Moves only'), detail: aim.reason };
  }
}

/** The name of the nesting relation type a drop into a container creates, when the view has several. */
function nestingTypeName(project: ProjectSnapshot, plan: DropPlan): string | undefined {
  const view = project.views.find((each) => each.id === plan.viewId);
  if (!view || nestingTypesInView(project, view).length < 2) return undefined;
  const { shape, from } = plan.grabbedShape;
  const type = nestingTypeFor(project, view, leavingRelations(project, view, shape.element, from));
  if (type === undefined) return undefined;
  return t.definition(type, definitionsIn(project).relationType(type)?.name ?? type);
}

/** The change that puts every moving shape inside a target, where it is dropped, below its name. */
function intoChange(
  plan: DropPlan,
  target: ElementShape,
  delta: Point,
  viewId: Id,
  origin: Readonly<Point>,
): ChangeContainerCommand {
  const places = plan.moving.map((mover) => ({
    mover,
    x: Math.round(laidOutRect(mover.shape).x + delta.x - target.rect.x),
    y: Math.round(laidOutRect(mover.shape).y + delta.y - target.rect.y),
  }));
  const shift = {
    x: Math.max(0, origin.x - lowest(places.map((place) => place.x))),
    y: Math.max(0, origin.y - lowest(places.map((place) => place.y))),
  };
  return {
    type: 'change-container',
    view: viewId,
    to: target.element,
    shapes: places.map(({ mover, x, y }) => ({
      element: mover.shape.element,
      ...(mover.from === undefined ? {} : { from: mover.from }),
      at: { x: x + shift.x, y: y + shift.y, ...mover.shape.storedSize },
    })),
  };
}

/** The change that takes out of their containers the moving shapes that no longer overlap them. */
function outChange(
  indexed: IndexedScene,
  plan: DropPlan,
  delta: Point,
  viewId: Id,
): ChangeContainerCommand {
  const shapes = plan.moving.flatMap((mover) => {
    const container =
      mover.fromShape === undefined ? undefined : indexed.byKey.get(mover.fromShape);
    const landing = moved(mover.shape.rect, delta);
    if (mover.from === undefined || !container || overlaps(landing, container.rect)) return [];
    const place = moved(laidOutRect(mover.shape), delta);
    return [
      {
        element: mover.shape.element,
        from: mover.from,
        at: { x: Math.round(place.x), y: Math.round(place.y), ...mover.shape.storedSize },
      },
    ];
  });
  return { type: 'change-container', view: viewId, shapes };
}

function moved(rect: Rect, delta: Point): Rect {
  return { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
}

/** A place inside a container, kept below its name and off its left side, from `origin`. */
function clamped(at: Point, origin: Readonly<Point>): Point {
  return { x: Math.max(origin.x, at.x), y: Math.max(origin.y, at.y) };
}

/**
 * Where contents start in a container of this scene: its drawing's container padding in, under its
 * header (`contentsOriginOf`, ADR 0086), as layout places them.
 */
function originIn(indexed: IndexedScene): Readonly<Point> {
  return contentsOriginOf(drawingOfScene(indexed.scene));
}

/** The smallest of some numbers, without spreading thousands of them into arguments. */
function lowest(values: readonly number[]): number {
  let least = Infinity;
  for (const value of values) if (value < least) least = value;
  return least;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

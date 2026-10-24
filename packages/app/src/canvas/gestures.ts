/**
 * What the canvas's gestures do to the project, as commands: moving shapes, creating an element where
 * it is dropped, and relating one element to another. Pure, so that it can be tested without a canvas.
 */
import {
  appearanceOf,
  definitionsOf,
  limitWarnings,
  modelIndexOf,
  nestingTypesInView,
  positionKey,
  type Command,
  type CreateElementCommand,
  type ProjectSnapshot,
  type ResolvedRelationType,
} from '@visual-anything/core';
import type { Arrow, FreeShape, Id, Note, ShapePosition } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import type { Point } from './geometry';
import type { IndexedScene } from './hit';
import type { ElementShape } from './scene';
import { coversRect } from './stacking';

/**
 * The command that moves the selection by `delta`, in scene units, or `undefined` when nothing moves.
 * Every shape of a selected element moves, inside its own container; a shape whose container moves too
 * is carried along and keeps its place in it. Moved shapes are pinned: layout keeps them where they are.
 * The elements in `except` are left out, for a command that places them otherwise, such as a drop
 * into a container.
 */
export function moveCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  delta: Point,
  except?: ReadonlySet<Id>,
): Command | undefined {
  const parts = moveParts(indexed, project, viewId, selection, delta, except);
  if (!parts) return undefined;
  const { commands, shapes, viewName } = parts;
  if (commands.length <= 1) return commands[0];
  return { type: 'batch', label: `Move ${shapes} shapes in "${viewName}"`, commands };
}

/**
 * The commands that make up a move, as `moveCommand` would send them: the positions of the moving
 * shapes in one command, then one for each free shape; with how many shapes they move.
 */
export function moveParts(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  delta: Point,
  except?: ReadonlySet<Id>,
): { commands: Command[]; shapes: number; viewName: string } | undefined {
  const dx = Math.round(delta.x);
  const dy = Math.round(delta.y);
  if (dx === 0 && dy === 0) return undefined;
  const view = project.views.find((each) => each.id === viewId);
  if (!view) return undefined;

  // Copies of a container share their contents' positions, so each is written once.
  const positions = new Map<string, ShapePosition>();
  for (const shape of movingShapes(indexed, selection)) {
    if (except?.has(shape.element)) continue;
    const position: ShapePosition = {
      element: shape.element,
      ...(shape.container === undefined ? {} : { container: shape.container }),
      x: Math.round(shape.offset.x + dx),
      y: Math.round(shape.offset.y + dy),
      ...shape.storedSize,
      pinned: true,
    };
    const key = positionKey(position);
    if (!positions.has(key)) positions.set(key, position);
  }
  const freeShapes = view.freeShapes
    .filter((shape) => selection.freeShapes.has(shape.id))
    .map((shape) => moved(shape, dx, dy));

  const commands: Command[] = [];
  if (positions.size > 0) {
    commands.push({ type: 'set-positions', view: view.id, positions: [...positions.values()] });
  }
  for (const shape of freeShapes)
    commands.push({ type: 'update-free-shape', view: view.id, shape });
  if (commands.length === 0) return undefined;
  return { commands, shapes: positions.size + freeShapes.length, viewName: view.name };
}

/**
 * The element shapes a move takes along: every shape of every selected element, except the ones
 * inside a shape that moves too, which its container carries.
 */
export function movingShapes(indexed: IndexedScene, selection: Selection): ElementShape[] {
  const selected = [...selection.elements].flatMap((id) => indexed.byElement.get(id) ?? []);
  const keys = new Set(selected.map((shape) => shape.key));
  return selected.filter((shape) => !insideAnyOf(shape.key, keys));
}

/**
 * Every key of the shapes a move draws in a new place: the moving shapes and everything inside them,
 * found by going down from each moving shape, so the cost is what moves, however large the scene.
 */
export function carriedKeys(indexed: IndexedScene, moving: readonly ElementShape[]): Set<string> {
  const carried = new Set<string>();
  const waiting = moving.map((shape) => shape.key);
  for (let key = waiting.pop(); key !== undefined; key = waiting.pop()) {
    if (carried.has(key)) continue;
    carried.add(key);
    for (const content of indexed.contentsOf.get(key) ?? []) waiting.push(content.key);
  }
  return carried;
}

function insideAnyOf(key: string, keys: ReadonlySet<string>): boolean {
  const parts = key.split('/');
  for (let length = parts.length - 1; length > 0; length--) {
    if (keys.has(parts.slice(0, length).join('/'))) return true;
  }
  return false;
}

function moved(shape: FreeShape, dx: number, dy: number): FreeShape {
  if (shape.kind === 'note') {
    const note: Note = { ...shape, x: shape.x + dx, y: shape.y + dy };
    return note;
  }
  const arrow: Arrow = {
    ...shape,
    from: { x: shape.from.x + dx, y: shape.from.y + dy },
    to: { x: shape.to.x + dx, y: shape.to.y + dy },
  };
  return arrow;
}

/**
 * The command that creates an element of a component at a point: inside the given shape, through
 * the first nesting relation type that arranges the view, or directly in World. Its position is
 * stored but not pinned, since no one chose it by hand: layout may arrange it, and moving it pins it.
 */
export function createAtCommand(
  project: ProjectSnapshot,
  viewId: Id,
  componentId: Id,
  at: Point,
  inside: ElementShape | undefined,
): Command | undefined {
  const view = project.views.find((each) => each.id === viewId);
  const component = definitionsOf(project.packages).component(componentId);
  if (!view || !component) return undefined;
  const nesting = nestingTypesInView(project, view)[0];
  const container = nesting === undefined ? undefined : inside;
  const origin = container ? { x: container.rect.x, y: container.rect.y } : { x: 0, y: 0 };
  return {
    type: 'create-element',
    element: { component: componentId, name: component.name },
    ...(container && nesting !== undefined
      ? { containers: [{ container: container.element, relationType: nesting }] }
      : {}),
    positions: [
      {
        view: view.id,
        ...(container ? { container: container.element } : {}),
        x: Math.round(at.x - origin.x),
        y: Math.round(at.y - origin.y),
      },
    ],
  };
}

/**
 * The command that creates an element of a component inside a container, through the first nesting
 * relation type that arranges the view, with no position: the shape lands where the container places
 * new contents, below the ones it holds. `undefined` in World, or in a view that nests nothing.
 */
export function createInsideCommand(
  project: ProjectSnapshot,
  viewId: Id,
  componentId: Id,
  container: Id,
): CreateElementCommand | undefined {
  const view = project.views.find((each) => each.id === viewId);
  const component = definitionsOf(project.packages).component(componentId);
  if (!view || !component || container === project.model.world.id) return undefined;
  const relationType = nestingTypesInView(project, view)[0];
  if (relationType === undefined) return undefined;
  return {
    type: 'create-element',
    element: { component: componentId, name: component.name },
    containers: [{ container, relationType }],
  };
}

/** How far, in scene units, a shape added beside another sits from it, and from the next one along. */
export const BESIDE_GAP = 40;
/** How many places, going right, an element added beside a shape tries before it settles for the first. */
export const BESIDE_TRIES = 100;

/**
 * The command that creates an element of a component beside a shape, in the container that shape
 * sits in, or directly in World: `BESIDE_GAP` to the right of it, top edges level, then further right
 * by its own width and the gap until it overlaps no shape there, so that elements added one after
 * another make a row. After `BESIDE_TRIES` places it stays in the first. Its position is stored but
 * not pinned, as the program chose it.
 *
 * The shapes there that only the stand-in row placed would move below the new one, which has a
 * position, so the same action stores theirs where they are drawn, not pinned either: nothing there
 * moves. `undefined` for an unknown view or component.
 */
export function createBesideCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  componentId: Id,
  beside: ElementShape,
): Command | undefined {
  const view = project.views.find((each) => each.id === viewId);
  const definitions = definitionsOf(project.packages);
  const component = definitions.component(componentId);
  if (!view || !component) return undefined;
  const { container } = beside;
  const create =
    container === undefined
      ? ({
          type: 'create-element',
          element: { component: componentId, name: component.name },
        } satisfies CreateElementCommand)
      : createInsideCommand(project, viewId, componentId, container);
  if (!create) return undefined;
  const { width, height } = appearanceOf({ component: componentId }, definitions);
  const at = besidePlace(indexed, beside, { width, height });
  const command: CreateElementCommand = {
    ...create,
    positions: [{ view: view.id, ...(container === undefined ? {} : { container }), ...at }],
  };

  const kept = (indexed.contentsOf.get(beside.containerShape ?? '') ?? [])
    .filter((shape) => shape.positioned === 'placed')
    .map((shape): ShapePosition => ({
      element: shape.element,
      ...(shape.container === undefined ? {} : { container: shape.container }),
      x: Math.round(shape.offset.x),
      y: Math.round(shape.offset.y),
    }));
  if (kept.length === 0) return command;
  return {
    type: 'batch',
    label: `Create "${component.name}"`,
    commands: [{ type: 'set-positions', view: view.id, positions: kept }, command],
  };
}

/**
 * Where a shape of `size` goes beside `beside`, relative to the container `beside` sits in: the first
 * place to its right where it overlaps no shape there, with what sticks out of it.
 */
function besidePlace(
  indexed: IndexedScene,
  beside: ElementShape,
  size: { width: number; height: number },
): Point {
  const origin = { x: beside.rect.x - beside.offset.x, y: beside.rect.y - beside.offset.y };
  const first = {
    x: Math.round(beside.offset.x + beside.rect.width + BESIDE_GAP),
    y: Math.round(beside.offset.y),
  };
  const siblings = indexed.contentsIndex(beside.containerShape ?? '');
  for (let tried = 0; tried < BESIDE_TRIES; tried++) {
    const at = { x: first.x + tried * (size.width + BESIDE_GAP), y: first.y };
    const rect = { x: origin.x + at.x, y: origin.y + at.y, ...size };
    if (!siblings.query(rect).some((sibling) => coversRect(indexed, sibling, rect))) return at;
  }
  return first;
}

/** A relation type offered when relating two ends, and whether its limits accept them. */
export interface RelationChoice {
  relationType: ResolvedRelationType;
  /** Whether the ends keep within the relation type's limits; one that does not is still allowed. */
  fits: boolean;
}

/**
 * The relation types that can relate `from` to `to`: those whose limits accept the two ends first,
 * nesting relation types last, each group in package order.
 */
export function relationChoices(project: ProjectSnapshot, from: Id, to: Id): RelationChoice[] {
  const definitions = definitionsOf(project.packages);
  const index = modelIndexOf(project);
  const choices = [...definitions.relationTypes.keys()].flatMap((id) => {
    const relationType = definitions.relationType(id);
    if (!relationType) return [];
    if (relationType.nests && !(index.element(from) && index.element(to))) return [];
    const fits = limitWarnings({ relationType: id, from, to }, index, definitions).length === 0;
    return [{ relationType, fits }];
  });
  const rank = (choice: RelationChoice) => (choice.relationType.nests ? 2 : choice.fits ? 0 : 1);
  return choices.sort((a, b) => rank(a) - rank(b));
}

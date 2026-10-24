/**
 * What the canvas's gestures do to the project, as commands: moving shapes, creating an element where
 * it is dropped, and relating one element to another. Pure, so that it can be tested without a canvas.
 */
import {
  definitionsOf,
  limitWarnings,
  modelIndexOf,
  type Command,
  type ProjectSnapshot,
  type ResolvedRelationType,
} from '@visual-anything/core';
import type { Arrow, FreeShape, Id, Note, ShapePosition } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import type { Point } from './geometry';
import type { IndexedScene } from './hit';
import type { ElementShape } from './scene';

/**
 * The command that moves the selection by `delta`, in scene units, or `undefined` when nothing moves.
 * Every shape of a selected element moves, inside its own container; a shape whose container moves too
 * is carried along and keeps its place in it. Moved shapes are pinned: layout keeps them where they are.
 */
export function moveCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  delta: Point,
): Command | undefined {
  const dx = Math.round(delta.x);
  const dy = Math.round(delta.y);
  if (dx === 0 && dy === 0) return undefined;
  const view = project.views.find((each) => each.id === viewId);
  if (!view) return undefined;

  const moving = movingShapes(indexed, selection);
  const positions: ShapePosition[] = moving.map((shape) => ({
    element: shape.element,
    ...(shape.container === undefined ? {} : { container: shape.container }),
    x: Math.round(shape.offset.x + dx),
    y: Math.round(shape.offset.y + dy),
    ...shape.storedSize,
    pinned: true,
  }));
  const freeShapes = view.freeShapes
    .filter((shape) => selection.freeShapes.has(shape.id))
    .map((shape) => moved(shape, dx, dy));

  const commands: Command[] = [];
  if (positions.length > 0) commands.push({ type: 'set-positions', view: view.id, positions });
  for (const shape of freeShapes)
    commands.push({ type: 'update-free-shape', view: view.id, shape });
  if (commands.length <= 1) return commands[0];
  return {
    type: 'batch',
    label: `Move ${positions.length + freeShapes.length} shapes in "${view.name}"`,
    commands,
  };
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
 * Every key of the shapes a move draws in a new place: the moving shapes and everything inside them.
 * A shape is carried when one of the shapes it sits in moves, which its key tells: one look-up per
 * container on its way out to World, however many shapes move.
 */
export function carriedKeys(indexed: IndexedScene, moving: readonly ElementShape[]): Set<string> {
  const movers = new Set(moving.map((shape) => shape.key));
  const carried = new Set(movers);
  for (const shape of indexed.scene.shapes) {
    if (insideAnyOf(shape.key, movers)) carried.add(shape.key);
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
 * the view's first nesting relation type, or directly in World. Its position is stored but not
 * pinned, since no one chose it by hand: layout may arrange it, and moving it pins it.
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
  const nesting = view.nestingRelationTypes[0];
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

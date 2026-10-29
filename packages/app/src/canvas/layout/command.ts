/**
 * A layout's result as one undoable action: `set-positions` for every shape it moved, unpinned, so
 * that layout may move them again (ADR-0009, ADR-0015). A result is checked against the view as it is
 * when it comes back, since the view may have changed while the worker ran: a shape that is gone, or
 * that someone pinned meanwhile, keeps its place.
 */
import {
  modelIndexOf,
  positionKey,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ShapePosition } from '@visual-anything/schema';
import type { ElementShape, Scene } from '../scene';
import type { LayoutScope } from './input';
import type { LaidOutShape } from './types';

/** The action that stores a layout, with how many shapes it moves. */
export interface LayoutAction {
  command: Command;
  moved: number;
  /** The keys of the shapes it moves, as the scene now names them. */
  keys: ReadonlySet<string>;
}

/** The action that stores where a layout of `scope` put shapes; undefined when it moves nothing. */
export function layoutCommand(
  project: ProjectSnapshot,
  viewId: Id,
  scene: Scene,
  scope: LayoutScope,
  laidOut: readonly LaidOutShape[],
): LayoutAction | undefined {
  const view = project.views.find((each) => each.id === viewId);
  if (!view) return undefined;
  // Every copy of a container shares its contents' positions: the first shape stands for them all.
  const shapes = new Map<string, ElementShape>();
  const copies = new Map<string, string[]>();
  for (const shape of scene.shapes) {
    const key = positionKey(shape);
    if (!shapes.has(key)) shapes.set(key, shape);
    const keys = copies.get(key);
    if (keys) keys.push(shape.key);
    else copies.set(key, [shape.key]);
  }

  const positions = new Map<string, ShapePosition>();
  const placedNew: ShapePosition[] = [];
  const keys = new Set<string>();
  for (const each of laidOut) {
    const key = positionKey(each);
    const shape = shapes.get(key);
    if (!shape || positions.has(key) || shape.positioned === 'pinned') continue;
    // Placing new shapes moves only them, and the stored shapes beside a container that grew.
    const aside = each.aside === true && shape.positioned === 'stored';
    if (scope.kind === 'new' && shape.positioned !== 'placed' && !aside) continue;
    const unchanged =
      shape.positioned === 'stored' && shape.offset.x === each.x && shape.offset.y === each.y;
    if (unchanged) continue;
    const position: ShapePosition = {
      element: each.element,
      ...(each.container === undefined ? {} : { container: each.container }),
      x: each.x,
      y: each.y,
      ...shape.storedSize,
    };
    positions.set(key, position);
    if (!aside) placedNew.push(position);
    for (const copy of copies.get(key) ?? []) keys.add(copy);
  }
  if (positions.size === 0) return undefined;

  // The label names what was laid out, not what moved aside for it.
  const label = labelOf(
    project,
    view.name,
    scope,
    placedNew.length > 0 ? placedNew : [...positions.values()],
  );
  return {
    command: {
      type: 'batch',
      label,
      commands: [{ type: 'set-positions', view: view.id, positions: [...positions.values()] }],
    },
    moved: positions.size,
    keys,
  };
}

/** How the history names a layout. */
function labelOf(
  project: ProjectSnapshot,
  viewName: string,
  scope: LayoutScope,
  positions: readonly ShapePosition[],
): string {
  const nameOf = (id: Id) => modelIndexOf(project).element(id)?.name ?? id;
  switch (scope.kind) {
    case 'view':
      return `Lay out "${viewName}"`;
    case 'contents':
      return `Lay out the contents of "${nameOf(scope.container)}"`;
    case 'expand':
      return `Lay out what expanded in "${viewName}"`;
    case 'new': {
      const [first] = positions;
      return positions.length === 1 && first
        ? `Lay out "${nameOf(first.element)}" in "${viewName}"`
        : `Lay out ${positions.length} new shapes in "${viewName}"`;
    }
  }
}

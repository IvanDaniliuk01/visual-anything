/**
 * What one layout works from, taken from the scene the canvas draws: its shapes, which of them layout
 * may move, the relations drawn between them, and the notes and arrows in World. One pass over the
 * scene, on the main thread; everything else happens in the layout worker.
 */
import {
  appearanceOf,
  definitionsOf,
  modelIndexOf,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { ESSENCE_ID } from '@visual-anything/schema';
import { boundsOf, type Rect } from '../geometry';
import type { ElementShape, Scene } from '../scene';
import { connectionPointsOf } from './ports';
import type { LayoutEdge, LayoutInput, LayoutShape } from './types';

/**
 * Which shapes one layout may move; pinned shapes never move (ADR-0009):
 * - `view`: every shape of the view that is not pinned;
 * - `contents`: the shapes inside a container, at every depth, that are not pinned; the container
 *   stays where it is;
 * - `new`: the shapes without a position, in each container, or World, where one of the shapes with
 *   these keys sits without a position. Every shape with a position stays where it is.
 */
export type LayoutScope =
  | { kind: 'view' }
  | { kind: 'contents'; container: Id }
  | { kind: 'new'; keys: ReadonlySet<string> };

const IN_WORLD = '';

/** What a layout of `scope` works from; undefined when it would move nothing. */
export function layoutInput(
  scene: Scene,
  project: ProjectSnapshot,
  scope: LayoutScope,
): LayoutInput | undefined {
  const all = scene.shapes;
  let shapes: readonly ElementShape[] = all;
  let free: (shape: ElementShape) => boolean;
  switch (scope.kind) {
    case 'view':
      free = (shape) => shape.positioned !== 'pinned';
      break;
    case 'contents': {
      const at = all.findIndex((shape) => shape.element === scope.container && shape.holdsContents);
      const first = all[at];
      if (!first) return undefined;
      // A container's contents follow it in the scene, at every depth: its first copy and them.
      const prefix = `${first.key}/`;
      let end = at + 1;
      while (end < all.length && (all[end] as ElementShape).key.startsWith(prefix)) end += 1;
      shapes = all.slice(at, end);
      free = (shape) => shape !== first && shape.positioned !== 'pinned';
      break;
    }
    case 'new': {
      const levels = new Set<string>();
      for (const shape of all) {
        if (shape.positioned === 'placed' && scope.keys.has(shape.key)) {
          levels.add(shape.container ?? IN_WORLD);
        }
      }
      if (levels.size === 0) return undefined;
      free = (shape) => shape.positioned === 'placed' && levels.has(shape.container ?? IN_WORLD);
      break;
    }
  }

  const definitions = definitionsOf(project.packages);
  const index = modelIndexOf(project);
  const appearance = (element: Id) =>
    appearanceOf(index.element(element) ?? { component: ESSENCE_ID }, definitions);
  const indexes = new Map<string, number>();
  let anyFree = false;
  const laid = shapes.map((shape, at): LayoutShape => {
    indexes.set(shape.key, at);
    const isFree = free(shape);
    anyFree ||= isFree;
    const parent =
      shape.containerShape === undefined ? undefined : indexes.get(shape.containerShape);
    const own = shape.holdsContents || isFree ? appearance(shape.element) : undefined;
    const points = isFree ? connectionPointsOf(own) : undefined;
    return {
      key: shape.key,
      element: shape.element,
      parent: parent ?? -1,
      free: isFree,
      x: shape.offset.x,
      y: shape.offset.y,
      width: shape.rect.width,
      height: shape.rect.height,
      ...(shape.storedSize?.width === undefined ? {} : { storedWidth: shape.storedSize.width }),
      ...(shape.storedSize?.height === undefined ? {} : { storedHeight: shape.storedSize.height }),
      ...(shape.holdsContents && own ? { baseWidth: own.width, baseHeight: own.height } : {}),
      ...(points ? { points } : {}),
    };
  });
  if (!anyFree) return undefined;

  const edges: LayoutEdge[] = [];
  for (const line of scene.relations) {
    const ends = line.ends;
    if (ends?.from.kind !== 'shape' || ends.to.kind !== 'shape') continue;
    const from = indexes.get(ends.from.key);
    const to = indexes.get(ends.to.key);
    if (from !== undefined && to !== undefined) edges.push({ relation: line.relation, from, to });
  }

  const obstacles: Rect[] = scope.kind === 'contents' ? [] : worldObstacles(scene);
  return { shapes: laid, edges, obstacles };
}

/** The notes and arrows of the view, which sit directly in World. */
function worldObstacles(scene: Scene): Rect[] {
  return [
    ...scene.notes.map((note) => note.rect),
    ...scene.arrows.flatMap(
      (arrow) =>
        boundsOf([], [arrow.from, arrow.to, arrow.arrowhead.left, arrow.arrowhead.right]) ?? [],
    ),
  ];
}

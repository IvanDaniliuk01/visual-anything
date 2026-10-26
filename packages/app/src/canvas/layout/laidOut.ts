/**
 * What a layout Claude asked for laid out, as the canvas fits it once it is done (ADR-0029's
 * clarification of 2026-10-26): the whole view, or the containers whose contents it arranged, as the
 * scene draws them now.
 */
import type { Rect } from '../geometry';
import type { Scene } from '../scene';
import type { LayoutScope } from './input';

/**
 * The rectangle holding what these layouts laid out in `scene`: the view's bounds for a layout of the
 * view, and else every shape of each container they arranged, with what sticks out of it; undefined
 * when the scene draws none of it.
 */
export function laidOutBounds(scene: Scene, scopes: readonly LayoutScope[]): Rect | undefined {
  if (scopes.some((scope) => scope.kind === 'view')) return scene.bounds;
  const containers = new Set(
    scopes.flatMap((scope) => (scope.kind === 'contents' ? [scope.container] : [])),
  );
  let bounds: Rect | undefined;
  for (const shape of scene.shapes) {
    if (!containers.has(shape.element)) continue;
    bounds = bounds === undefined ? shape.extent : union(bounds, shape.extent);
  }
  return bounds;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

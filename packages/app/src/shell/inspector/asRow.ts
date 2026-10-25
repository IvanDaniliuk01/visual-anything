/**
 * Whether the open view draws an element as a row of its container (ADR 0023): a band as wide as the
 * container, in its own fill, with no border, no shape and no position of its own.
 */
import type { Id } from '@visual-anything/schema';
import { indexScene } from '../../canvas/hit';
import type { ElementShape, Scene } from '../../canvas/scene';

/** The shapes the open view draws of an element: none when it draws none, or has no scene to index. */
export function shapesInView(scene: Scene | undefined, element: Id): readonly ElementShape[] {
  if (!scene) return [];
  try {
    // The same index the canvas draws from, since `indexScene` keeps one for each scene.
    return indexScene(scene).byElement.get(element) ?? [];
  } catch {
    return [];
  }
}

/** Whether the open view draws an element, and draws every shape of it as a row. */
export function drawnOnlyAsRows(scene: Scene | undefined, element: Id): boolean {
  const shapes = shapesInView(scene, element);
  return shapes.length > 0 && shapes.every((shape) => shape.row !== undefined);
}

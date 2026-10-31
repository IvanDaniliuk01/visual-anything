/**
 * The space's budget (ADR 0076): while its camera moves and what it draws passes 2,000,000
 * triangles, the solids farthest from the camera are drawn as their boxes, as few as bring the rest
 * within the mark; once the camera rests, the whole is drawn again.
 */
import type { Id, SpaceBounds, SpaceCamera } from '@visual-anything/schema';
import { spaceEye } from '../../../space/camera';

/** The most triangles a frame draws while the camera moves before the farthest solids are boxes. */
export const SPACE_TRIANGLE_BUDGET = 2_000_000;

/** How long the camera stays still, in milliseconds, before it rests and the whole is drawn. */
export const SPACE_REST_MS = 200;

/** The triangles a box takes. */
const BOX_TRIANGLES = 12;

/** A solid that may be drawn as its box: its element, its triangles, and its bounds in the space. */
export interface BoxableSolid {
  element: Id;
  triangles: number;
  bounds: SpaceBounds;
}

/**
 * The elements whose solids are drawn as their boxes from this camera: none within the budget, and
 * otherwise the farthest first, until what is left is within it.
 */
export function boxedFrom(
  solids: readonly BoxableSolid[],
  camera: SpaceCamera,
  budget = SPACE_TRIANGLE_BUDGET,
): Set<Id> {
  let total = 0;
  for (const solid of solids) total += solid.triangles;
  const boxed = new Set<Id>();
  if (total <= budget) return boxed;
  const eye = spaceEye(camera);
  const farthest = solids
    .map((solid) => {
      const { min, max } = solid.bounds;
      const distance = Math.hypot(
        (min.x + max.x) / 2 - eye.x,
        (min.y + max.y) / 2 - eye.y,
        (min.z + max.z) / 2 - eye.z,
      );
      return { solid, distance };
    })
    .sort((a, b) => b.distance - a.distance);
  for (const { solid } of farthest) {
    if (total <= budget) break;
    if (solid.triangles <= BOX_TRIANGLES) continue;
    boxed.add(solid.element);
    total -= solid.triangles - BOX_TRIANGLES;
  }
  return boxed;
}

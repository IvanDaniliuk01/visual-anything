/**
 * Place in physical space and Take out of physical space, in the physical-space panel (ADR 0076), each
 * one `set-poses`, and so one undoable action, whatever the count:
 * - **Place** poses each selected element that is not in the space in its first container that is,
 *   else in World, at the point the panel's camera turns around, turned as that container is. When the
 *   panel shows an element that is in physical space under World, that point is carried into World's
 *   coordinates; when it shows one that is not, the element is placed at World's origin, which the
 *   panel does not show.
 * - **Take out** takes the pose away from each selected element posed in the space; anchored parts
 *   and the element the panel shows have none to take.
 */
import {
  modelIndexOf,
  spaceMath,
  spaceOf,
  type ProjectSnapshot,
  type SetPosesCommand,
  type Space,
} from '@visual-anything/core';
import type { Id, Pose, SpacePoint } from '@visual-anything/schema';

/** Where Place puts one element: what it is posed in, and whether the panel shows it there. */
export interface Placed {
  element: Id;
  /** The container it is posed in, or World. */
  in: Id;
  /** False when it is placed at World's origin, outside what the panel shows. */
  shown: boolean;
}

/** The selected elements Place in physical space would place: those not in the space. */
export function placeable(
  project: ProjectSnapshot,
  space: Pick<Space, 'entries' | 'faint'>,
  selected: ReadonlySet<Id>,
): Id[] {
  const index = modelIndexOf(project);
  return [...selected].filter(
    (element) =>
      element !== index.world.id &&
      index.element(element) !== undefined &&
      !space.entries.has(element) &&
      !space.faint.has(element),
  );
}

/** The selected elements Take out of physical space would take out: those posed in the space. */
export function removable(space: Pick<Space, 'entries'>, selected: ReadonlySet<Id>): Id[] {
  return [...selected].filter((element) => space.entries.get(element)?.how === 'posed');
}

/**
 * The `set-poses` that places `elements` at `target`, a point in the coordinates the panel shows, and
 * where each goes; none when there is nothing to place.
 */
export function placeCommand(
  project: ProjectSnapshot,
  space: Space,
  elements: readonly Id[],
  target: SpacePoint,
): { command: SetPosesCommand; placed: Placed[] } | undefined {
  if (elements.length === 0) return undefined;
  const index = modelIndexOf(project);
  const world = index.world.id;
  // The target in World's coordinates, when the panel shows World or something in it.
  let inWorld: SpacePoint | undefined;
  if (space.root === world) inWorld = target;
  else {
    const shown = spaceOf(project).entries.get(space.root);
    if (shown) inWorld = spaceMath.transformPoint(shown.matrix, target);
  }
  const poses: SetPosesCommand['poses'] = [];
  const placed: Placed[] = [];
  for (const element of elements) {
    const container = index.containersOf(element).find((each) => space.entries.has(each));
    const holder = container === undefined ? undefined : space.entries.get(container);
    let pose: Pose;
    if (container !== undefined && holder) {
      const at = spaceMath.transformPoint(spaceMath.inverseRigid(holder.matrix), target);
      pose = container === world ? { at: rounded(at) } : { in: container, at: rounded(at) };
      placed.push({ element, in: container, shown: true });
    } else {
      pose = { at: rounded(inWorld ?? { x: 0, y: 0, z: 0 }) };
      placed.push({ element, in: world, shown: inWorld !== undefined && space.root === world });
    }
    poses.push({ element, pose });
  }
  return { command: { type: 'set-poses', poses }, placed };
}

/** The `set-poses` that takes the poses of `elements` away; none when there is nothing to take. */
export function takeOutCommand(elements: readonly Id[]): SetPosesCommand | undefined {
  if (elements.length === 0) return undefined;
  return { type: 'set-poses', poses: elements.map((element) => ({ element, pose: null })) };
}

/** A point to the micrometre. */
function rounded(point: SpacePoint): SpacePoint {
  const round = (value: number) => {
    const kept = Math.round(value * 1e6) / 1e6;
    return Object.is(kept, -0) ? 0 : kept;
  };
  return { x: round(point.x), y: round(point.y), z: round(point.z) };
}

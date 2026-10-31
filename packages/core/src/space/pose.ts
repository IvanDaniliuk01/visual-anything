/**
 * Poses (ADR 0076): where an element is in physical space and which way it faces, measured from one
 * of its containers or from World. Commands refuse a pose that is not one (`invalid-pose`); opening
 * only warns, and a pose whose `in` stopped being a container is kept and not used
 * (`pose-not-in-container`).
 */
import type { Element, Id, Pose, Rotation } from '@visual-anything/schema';
import { reject } from '../commands/draft';
import type { ModelIndex } from '../model-index';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';

/** How far from World's origin, in meters either way along an axis, a pose can put an element. */
export const MAX_POSE_COORDINATE = 1_000_000;

/** How far from unit length a rotation can be; within it, it is stored normalized. */
export const ROTATION_TOLERANCE = 1e-6;

/** What is wrong with a pose's own values, without its `in`; `undefined` when nothing is. */
export function poseValueProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'is not a pose';
  const pose = value as Record<string, unknown>;
  for (const key of Object.keys(pose)) {
    if (key !== 'in' && key !== 'at' && key !== 'rotation')
      return `has "${key}", which a pose has not`;
  }
  if (pose.in !== undefined && typeof pose.in !== 'string') return 'names no container in "in"';
  const at = pointProblem(pose.at);
  if (at !== undefined) return at;
  if (pose.rotation !== undefined) {
    const rotation = rotationProblem(pose.rotation);
    if (rotation !== undefined) return rotation;
  }
  return undefined;
}

function pointProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return 'has no place in "at"';
  const point = value as Record<string, unknown>;
  for (const key of Object.keys(point)) {
    if (key !== 'x' && key !== 'y' && key !== 'z')
      return `has "${key}" in "at", which a place has not`;
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    const coordinate = point[axis];
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) {
      return `has no finite ${axis} in "at"`;
    }
    if (Math.abs(coordinate) > MAX_POSE_COORDINATE) {
      return `puts ${axis} past 1,000 km from its container`;
    }
  }
  return undefined;
}

function rotationProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return 'has no quaternion in "rotation"';
  const rotation = value as Record<string, unknown>;
  for (const key of Object.keys(rotation)) {
    if (!['x', 'y', 'z', 'w'].includes(key)) {
      return `has "${key}" in "rotation", which a quaternion has not`;
    }
  }
  for (const part of ['x', 'y', 'z', 'w'] as const) {
    const each = rotation[part];
    if (typeof each !== 'number' || !Number.isFinite(each))
      return `has no finite ${part} in "rotation"`;
  }
  const { x, y, z, w } = rotation as unknown as Rotation;
  if (Math.abs(Math.hypot(x, y, z, w) - 1) > ROTATION_TOLERANCE) {
    return 'has a rotation that is not of unit length';
  }
  return undefined;
}

/**
 * A pose a command sets for `element`, checked and as it is stored: its rotation normalized, and `in`
 * left out for World. Refused (`invalid-pose`) when it is not one, or when `in` is not one of the
 * element's containers as `index` has them.
 */
export function checkedPose(value: unknown, element: Element, index: ModelIndex): Pose {
  const pose = checkedPoseValues(value, element, index.world.id);
  requirePoseIn(pose, element, index);
  return pose;
}

/** A pose's own values checked and as they are stored, before its `in` is checked. */
export function checkedPoseValues(value: unknown, element: Element, worldId: Id): Pose {
  if (element.id === worldId) {
    reject('world-not-allowed', 'World is where physical space is measured from; it has no pose.', [
      worldId,
    ]);
  }
  const wrong = poseValueProblem(value);
  if (wrong !== undefined) {
    reject('invalid-pose', `The pose of "${element.name}" ${wrong}.`, [element.id]);
  }
  const pose = value as Pose;
  const container = pose.in === worldId ? undefined : pose.in;
  return {
    ...(container === undefined ? {} : { in: container }),
    at: { x: plain(pose.at.x), y: plain(pose.at.y), z: plain(pose.at.z) },
    ...(pose.rotation === undefined ? {} : { rotation: unitRotation(pose.rotation) }),
  };
}

/** Refuses (`invalid-pose`) a pose whose `in` is not one of the element's containers. */
export function requirePoseIn(pose: Pose, element: Element, index: ModelIndex): void {
  if (poseIsUsable(pose, element.id, index)) return;
  const container = pose.in as Id;
  const named = index.element(container)?.name;
  const what = `The pose of "${element.name}"`;
  reject(
    'invalid-pose',
    named === undefined
      ? `${what} is measured from "${container}", which is not an element.`
      : `${what} is measured from "${named}", which is not one of its containers.`,
    [element.id, container],
  );
}

/** A rotation within the tolerance of unit length, made unit length. */
function unitRotation(rotation: Rotation): Rotation {
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  return {
    x: plain(rotation.x / length),
    y: plain(rotation.y / length),
    z: plain(rotation.z / length),
    w: plain(rotation.w / length),
  };
}

/** A number as a file writes it: no negative zero. */
function plain(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/** Whether a pose is measured from World, by leaving `in` out or naming it, or from a container. */
export function poseIsUsable(pose: Pose, element: Id, index: ModelIndex): boolean {
  return (
    pose.in === undefined ||
    pose.in === index.world.id ||
    index.containersOf(element).includes(pose.in)
  );
}

/**
 * What opening warns of a project's poses: one that is not one (`invalid-pose`), and one whose `in`
 * is not one of its element's containers (`pose-not-in-container`), each kept as it is.
 */
export function poseWarnings(state: ProjectSnapshot): Problem[] {
  const warnings: Problem[] = [];
  let index: ModelIndex | undefined;
  for (const element of state.model.elements) {
    const pose = element.pose;
    if (pose === undefined) continue;
    const wrong = poseValueProblem(pose);
    if (wrong !== undefined) {
      warnings.push(
        problem('invalid-pose', `The pose of "${element.name}" ${wrong}.`, [element.id]),
      );
      continue;
    }
    index ??= modelIndexOf(state);
    if (!poseIsUsable(pose, element.id, index)) warnings.push(notInContainer(element, pose, index));
  }
  return warnings;
}

function notInContainer(element: Element, pose: Pose, index: ModelIndex): Problem {
  const container = pose.in as Id;
  const named = index.element(container)?.name;
  return problem(
    'pose-not-in-container',
    `The pose of "${element.name}" is measured from ${named === undefined ? `"${container}", which is gone` : `"${named}", which no longer holds it`}; it is kept, and "${element.name}" is not in physical space until it is posed again.`,
    [element.id, container],
  );
}

/**
 * The `pose-not-in-container` warnings an action brings (ADR 0076): poses its result cannot use that
 * the project before could, as when the containment that made `in` a container is deleted.
 */
export function newPoseWarnings(before: ProjectSnapshot, after: ProjectSnapshot): Problem[] {
  if (before.model === after.model) return [];
  const posed = after.model.elements.filter((each) => each.pose !== undefined);
  if (posed.length === 0) return [];
  const afterIndex = modelIndexOf(after);
  const beforeIndex = modelIndexOf(before);
  const warnings: Problem[] = [];
  for (const element of posed) {
    const pose = element.pose as Pose;
    if (poseValueProblem(pose) !== undefined || poseIsUsable(pose, element.id, afterIndex))
      continue;
    const was = beforeIndex.element(element.id)?.pose;
    if (was !== undefined && was.in === pose.in && !poseIsUsable(was, element.id, beforeIndex))
      continue;
    warnings.push(notInContainer(element, pose, afterIndex));
  }
  return warnings;
}

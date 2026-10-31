/**
 * What the inspector's Pose section works from (ADR 0076): whether an element is in physical space
 * and how, and the poses its controls send, each as one `update-element`.
 *
 * - An element anchored to a part of its container's solid is where its part is; a pose it has is
 *   kept and not used, and it cannot be posed here.
 * - A posed element is posed in one of its containers or in World. Choosing another keeps its place
 *   (`poseIn`) when both are in physical space under World; otherwise its numbers stay as they are,
 *   measured from the new one.
 * - A pose whose `in` stopped being a container is kept and not used; Pose in World where it was puts
 *   it where it was in World, when what it was posed in still is in physical space, or else at
 *   World's origin, turned as it was.
 * - Place in physical space poses an element in its first container in physical space, under World
 *   or under what the panel shows, else in World, at the origin.
 */
import {
  degreesOfRotation,
  modelIndexOf,
  poseIn,
  poseIsUsable,
  rotationFromDegrees,
  solidsIn,
  spaceMath,
  spaceOf,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id, Pose, PosePoint, Rotation } from '@visual-anything/schema';

/** How an element is in physical space, or why it is not, as the Pose section says it. */
export type PoseStatus =
  /** World, which physical space is measured from. */
  | { kind: 'world' }
  /** Drawn as a named part of a container's solid: where that part is, from the container. */
  | {
      kind: 'anchored';
      /** The container whose solid holds its part. */
      in: Id;
      part: string;
      /** The solid's name, or its id when no package defines it. */
      solid: string;
      /** Where its part is, in the container's coordinates. */
      at: PosePoint;
      /** The pose it has, kept and not used. */
      pose?: Pose;
    }
  /** Posed in a container or in World (`in` is then World's id). */
  | {
      kind: 'posed';
      pose: Pose;
      in: Id;
      /** Whether it is in physical space under World, as when what it is posed in is. */
      inWorld: boolean;
    }
  /** A pose whose `in` is not one of its containers now: kept and not used. */
  | { kind: 'unusable'; pose: Pose; in: Id }
  /** No pose, and no part. */
  | { kind: 'none' };

/** Where an element is in physical space, or why it is not. */
export function poseStatusOf(project: ProjectSnapshot, element: Element): PoseStatus {
  const index = modelIndexOf(project);
  const world = index.world.id;
  if (element.id === world) return { kind: 'world' };
  const anchored = anchoredStatus(project, element);
  if (anchored) return anchored;
  const pose = element.pose;
  if (pose === undefined) return { kind: 'none' };
  if (!poseIsUsable(pose, element.id, index)) {
    return { kind: 'unusable', pose, in: pose.in ?? world };
  }
  return {
    kind: 'posed',
    pose,
    in: pose.in ?? world,
    inWorld: spaceOf(project).entries.has(element.id),
  };
}

/** The part of a container's solid an element is drawn as, when it is anchored to one. */
function anchoredStatus(
  project: ProjectSnapshot,
  element: Element,
): Extract<PoseStatus, { kind: 'anchored' }> | undefined {
  const index = modelIndexOf(project);
  // Under World first, which is worked out already; else from each container, as what it shows.
  const roots = [undefined, ...index.containersOf(element.id)];
  for (const root of roots) {
    const entry = spaceOf(project, undefined, root).entries.get(element.id);
    if (entry === undefined) continue;
    if (entry.how !== 'anchored' || entry.in === undefined || entry.part === undefined) {
      if (root === undefined) return undefined;
      continue;
    }
    const definition = solidsIn(project).solid(entry.part.solid)?.definition;
    const point = definition?.parts[entry.part.index]?.point ?? { x: 0, y: 0, z: 0 };
    return {
      kind: 'anchored',
      in: entry.in,
      part: entry.part.name,
      solid: definition?.name ?? entry.part.solid,
      at: { x: point.x, y: point.y, z: point.z },
      ...(element.pose === undefined ? {} : { pose: element.pose }),
    };
  }
  return undefined;
}

/** What a pose can be measured from: World, then the element's containers, in the model's order. */
export function poseContainersOf(project: ProjectSnapshot, element: Id): Id[] {
  const index = modelIndexOf(project);
  return [index.world.id, ...index.containersOf(element)];
}

/** A pose as it is sent: World left out of `in`, and a rotation that turns nothing left out. */
function sent(container: Id | undefined, world: Id, at: PosePoint, rotation?: Rotation): Pose {
  const turned = rotation !== undefined && !turnsNothing(rotation);
  return {
    ...(container === undefined || container === world ? {} : { in: container }),
    at,
    ...(turned ? { rotation } : {}),
  };
}

function turnsNothing(rotation: Rotation): boolean {
  const near = (value: number) => Math.abs(value) < 1e-12;
  return near(rotation.x) && near(rotation.y) && near(rotation.z);
}

/**
 * The pose that measures an element from `container` instead: where it is kept (`poseIn`) when it
 * and the container are in physical space under World; otherwise its numbers, from the container.
 */
export function poseMeasuredFrom(
  project: ProjectSnapshot,
  element: Id,
  pose: Pose,
  container: Id,
): { pose: Pose; kept: boolean } {
  const world = project.model.world.id;
  const kept = poseIn(project, element, container === world ? undefined : container);
  return kept
    ? { pose: kept, kept: true }
    : { pose: sent(container, world, pose.at, pose.rotation), kept: false };
}

/** The pose with one coordinate of its place changed, in meters. */
export function poseWithAt(pose: Pose, axis: 'x' | 'y' | 'z', meters: number): Pose {
  return { ...pose, at: { ...pose.at, [axis]: meters } };
}

/** The degrees about X, then Y, then Z, about fixed axes, that a pose turns by. */
export function degreesOfPose(pose: Pose): { x: number; y: number; z: number } {
  return pose.rotation === undefined ? { x: 0, y: 0, z: 0 } : degreesOfRotation(pose.rotation);
}

/** The pose turned by `degrees` about one axis, the other two as they were; no turn left out. */
export function poseWithDegrees(pose: Pose, axis: 'x' | 'y' | 'z', degrees: number): Pose {
  const turn = { ...degreesOfPose(pose), [axis]: degrees };
  const rest: Pose = { ...(pose.in === undefined ? {} : { in: pose.in }), at: pose.at };
  const zero = (value: number) => Math.abs(value % 360) < 1e-9;
  return zero(turn.x) && zero(turn.y) && zero(turn.z)
    ? rest
    : { ...rest, rotation: rotationFromDegrees(turn.x, turn.y, turn.z) };
}

const ORIGIN: PosePoint = { x: 0, y: 0, z: 0 };

/**
 * Place in physical space: the element posed at the origin of its first container that is in
 * physical space, under World or under what the panel shows (`shown`), else of World.
 */
export function placedPose(project: ProjectSnapshot, element: Id, shown?: Id): Pose {
  const index = modelIndexOf(project);
  const world = index.world.id;
  const inWorld = spaceOf(project).entries;
  const inShown =
    shown === undefined || shown === world ? undefined : spaceOf(project, undefined, shown).entries;
  const container = index
    .containersOf(element)
    .find((each) => inWorld.has(each) || (inShown?.has(each) ?? false));
  return sent(container, world, ORIGIN);
}

/**
 * Pose in World where it was, for a pose whose `in` stopped being a container: where it was in World
 * while what it was posed in is in physical space under World, or else World's origin, turned as it
 * was.
 */
export function poseInWorldWhereItWas(
  project: ProjectSnapshot,
  pose: Pose,
): { pose: Pose; known: boolean } {
  const world = project.model.world.id;
  const holder = pose.in === undefined ? undefined : spaceOf(project).entries.get(pose.in);
  if (holder === undefined) {
    return { pose: sent(undefined, world, ORIGIN, pose.rotation), known: false };
  }
  const { at, rotation } = spaceMath.decompose(
    spaceMath.multiply(holder.matrix, spaceMath.matrixOf(pose.at, pose.rotation)),
  );
  const where = { x: round(at.x), y: round(at.y), z: round(at.z) };
  return { pose: sent(undefined, world, where, rotation), known: true };
}

/** A coordinate to the nanometer, as `poseIn` keeps one. */
function round(value: number): number {
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * The joints the physical-space panel moves by hand (ADR 0090): a slider for each joint among what it
 * shows, whose range is its limits, in degrees for a joint that turns and meters for one that slides.
 * Dragging gives the panel positions over the joints' own, which `spaceOf` composes down the chain and
 * which nothing stores; "Keep these positions" stores them as one action of the person's, one batch of
 * `update-element` changes to each joint's `position`; "Back to stored positions" lets them go,
 * gliding back over a moment unless motion is reduced, when the chain jumps.
 */
import {
  definitionsIn,
  jointMotionOf,
  modelIndexOf,
  type Command,
  type JointMotion,
  type ProjectSnapshot,
  type Space,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** How long the joints glide back to their stored positions, in milliseconds. */
export const JOINT_GLIDE = 240;

/** The range a joint that turns with no limits is given, either way, in degrees. */
const TURN_RANGE = 180;
/** The range a joint that slides with no limits is given, either way, in meters. */
const SLIDE_RANGE = 1;

/** A joint the panel shows a slider for. */
export interface ShownJoint {
  readonly element: Id;
  readonly name: string;
  readonly kind: JointMotion['kind'];
  /** Degrees for a joint that turns, meters for one that slides. */
  readonly unit: 'degrees' | 'meters';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Its stored position, or 0, drawn within its limits. */
  readonly stored: number;
}

/** Positions given over the joints' own, by joint. */
export type JointPositions = ReadonlyMap<Id, number>;

/** No positions given: every joint at its own. */
export const NO_POSITIONS: JointPositions = new Map();

/**
 * The joints among what a space shows, in the order it reached them, that move: of the Joint or a
 * component derived from it, neither fixed nor without an axis it can read.
 */
export function jointsShown(project: ProjectSnapshot, space: Pick<Space, 'entries'>): ShownJoint[] {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  const found: ShownJoint[] = [];
  for (const id of space.entries.keys()) {
    const element = index.element(id);
    const motion = element && jointMotionOf(element, definitions);
    if (!element || !motion) continue;
    const slides = motion.kind === 'prismatic';
    const range = slides ? SLIDE_RANGE : TURN_RANGE;
    const limited = motion.kind !== 'continuous';
    const min = limited && motion.lower !== undefined ? motion.lower : -range;
    const max = limited && motion.upper !== undefined ? motion.upper : range;
    found.push({
      element: id,
      name: element.name,
      kind: motion.kind,
      unit: slides ? 'meters' : 'degrees',
      min: Math.min(min, max),
      max: Math.max(min, max),
      step: slides ? 0.001 : 1,
      stored: motion.position,
    });
  }
  return found;
}

/** The position a slider shows for a joint: the one given, or else its stored one. */
export function positionOf(joint: ShownJoint, positions: JointPositions): number {
  return positions.get(joint.element) ?? joint.stored;
}

/** The positions given that differ from the joints' stored ones, by joint. */
export function changedPositions(
  joints: readonly ShownJoint[],
  positions: JointPositions,
): JointPositions {
  const changed = new Map<Id, number>();
  for (const joint of joints) {
    const given = positions.get(joint.element);
    if (given !== undefined && given !== joint.stored) changed.set(joint.element, given);
  }
  return changed;
}

/** The label the history gives "Keep these positions", which the history panel translates. */
export const KEEP_POSITIONS_LABEL = 'Keep the joints’ positions';

/**
 * The command that stores the positions given that differ from the joints' own: one batch, one
 * action, of each joint's `position`; none when nothing differs.
 */
export function keepPositionsCommand(
  joints: readonly ShownJoint[],
  positions: JointPositions,
): Command | undefined {
  const changed = changedPositions(joints, positions);
  if (changed.size === 0) return undefined;
  return {
    type: 'batch',
    label: KEEP_POSITIONS_LABEL,
    commands: [...changed].map(([id, position]) => ({
      type: 'update-element' as const,
      id,
      changes: { attributes: { position } },
    })),
  };
}

/**
 * The positions part of the way from those given back to the joints' stored ones, `share` from 0,
 * where they are given, to 1, where they are stored, eased in and out.
 */
export function positionsBetween(
  joints: readonly ShownJoint[],
  from: JointPositions,
  share: number,
): JointPositions {
  const eased = share <= 0 ? 0 : share >= 1 ? 1 : share * share * (3 - 2 * share);
  const between = new Map<Id, number>();
  for (const joint of joints) {
    const given = from.get(joint.element);
    if (given === undefined) continue;
    between.set(joint.element, given + (joint.stored - given) * eased);
  }
  return between;
}

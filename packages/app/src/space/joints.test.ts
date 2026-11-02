// @vitest-environment node
/**
 * The joints the physical-space panel moves by hand (ADR 0090), on the robot-arm sample: a slider for
 * each joint it shows, ranged by its limits; positions given move what each joint carries and nothing
 * else, without storing anything; "Keep these positions" is one batch, one undoable action, of each
 * changed joint's `position`; gliding back reaches the stored positions. The sample's axes are written
 * in its solid's axes, +Y up, so that each joint turns the arm as a robot's would.
 */
import {
  applyOperations,
  executeCommand,
  pointInSpace,
  spaceOf,
  type ProjectSnapshot,
  type Space,
} from '@visual-anything/core';
import type { SpacePoint } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import {
  KEEP_POSITIONS_LABEL,
  NO_POSITIONS,
  changedPositions,
  jointsShown,
  keepPositionsCommand,
  positionOf,
  positionsBetween,
} from './joints';

const project = loadSample('robot-arm');
const world = (positions?: ReadonlyMap<string, number>, of: ProjectSnapshot = project): Space =>
  spaceOf(of, undefined, undefined, positions);
const at = (space: Space, element: string) => pointInSpace(space, element) as SpacePoint;
const distance = (a: SpacePoint, b: SpacePoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Where a joint turns about in World: its part's node origin, in the arm's frame (ADR 0090). */
const pivotOf = (space: Space, joint: string): SpacePoint => {
  const origin = project.packages
    .flatMap((file) => file.solids ?? [])
    .flatMap((solid) => solid.parts)
    .find((part) => part.name === joint)?.origin as SpacePoint;
  const m = space.entries.get('arm')?.matrix ?? [];
  const [a = 0, b = 0, c = 0, , d = 0, e = 0, f = 0, , g = 0, h = 0, i = 0, , x = 0, y = 0, z = 0] =
    m;
  return {
    x: a * origin.x + d * origin.y + g * origin.z + x,
    y: b * origin.x + e * origin.y + h * origin.z + y,
    z: c * origin.x + f * origin.y + i * origin.z + z,
  };
};

describe('the joints the panel shows', () => {
  it('gives a slider to each joint it shows, in the order it reaches them, ranged by its limits', () => {
    const joints = jointsShown(project, world());
    expect(joints.map((joint) => joint.element)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `joint-${n}`),
    );
    expect(joints[0]).toEqual({
      element: 'joint-1',
      name: 'Joint 1',
      kind: 'revolute',
      unit: 'degrees',
      min: -170,
      max: 170,
      step: 1,
      stored: 0,
    });
    // A joint that turns without end turns a whole turn either way.
    expect(joints[5]).toMatchObject({ kind: 'continuous', min: -180, max: 180 });
    // What the panel does not show has no slider.
    expect(jointsShown(project, { entries: new Map() })).toEqual([]);
  });

  it('shows the position given, or else the stored one, and names only those that differ', () => {
    const joints = jointsShown(project, world());
    const given = new Map([
      ['joint-2', 30],
      ['joint-3', 0],
    ]);
    expect(positionOf(joints[1] as (typeof joints)[number], given)).toBe(30);
    expect(positionOf(joints[0] as (typeof joints)[number], given)).toBe(0);
    expect([...changedPositions(joints, given)]).toEqual([['joint-2', 30]]);
    expect(keepPositionsCommand(joints, new Map([['joint-3', 0]]))).toBeUndefined();
  });

  it('keeps the positions as one batch, one action that one undo takes back', () => {
    const joints = jointsShown(project, world());
    const command = keepPositionsCommand(
      joints,
      new Map([
        ['joint-2', 30],
        ['joint-3', -45],
      ]),
    );
    expect(command).toMatchObject({ type: 'batch', label: KEEP_POSITIONS_LABEL });
    const outcome = executeCommand(project, command as NonNullable<typeof command>, {
      author: 'user',
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.problems));
    const kept = outcome.state;
    const attributes = (state: ProjectSnapshot, id: string) =>
      state.model.elements.find((each) => each.id === id)?.attributes;
    expect(attributes(kept, 'joint-2')?.position).toBe(30);
    expect(attributes(kept, 'joint-3')?.position).toBe(-45);
    // Stored, the chain is where the positions given drew it.
    const given = world(
      new Map([
        ['joint-2', 30],
        ['joint-3', -45],
      ]),
    );
    expect(at(world(undefined, kept), 'gripper')).toEqual(at(given, 'gripper'));
    // One undo takes both back.
    const undone = applyOperations(kept, outcome.inverse).state;
    expect(attributes(undone, 'joint-2')?.position).toBeUndefined();
    expect(attributes(undone, 'joint-3')?.position).toBeUndefined();
  });

  it('glides from the positions given back to the stored ones, eased, ending on them', () => {
    const joints = jointsShown(project, world());
    const from = new Map([['joint-2', 60]]);
    expect(positionsBetween(joints, from, 0).get('joint-2')).toBe(60);
    expect(positionsBetween(joints, from, 0.5).get('joint-2')).toBeCloseTo(30, 9);
    expect(positionsBetween(joints, from, 1).get('joint-2')).toBe(0);
    expect(positionsBetween(joints, from, 0.25).get('joint-2')).toBeGreaterThan(45);
    expect(positionsBetween(joints, NO_POSITIONS, 0.5).size).toBe(0);
  });
});

describe('the robot-arm sample’s joints', () => {
  const rest = world();

  it('moves what a joint carries and nothing above it, and stores nothing', () => {
    const moved = world(new Map([['joint-2', 40]]));
    // The gripper, which the shoulder carries, moves; the base and the shoulder's own body stay.
    expect(distance(at(moved, 'gripper'), at(rest, 'gripper'))).toBeGreaterThan(0.2);
    expect(at(moved, 'base')).toEqual(at(rest, 'base'));
    expect(at(moved, 'joint-2')).toEqual(at(rest, 'joint-2'));
    expect(at(moved, 'link-1')).toEqual(at(rest, 'link-1'));
    // The wrist camera, mounted on link 6, goes with it.
    expect(distance(at(moved, 'wrist-camera'), at(rest, 'wrist-camera'))).toBeGreaterThan(0.2);
    // Nothing was stored.
    expect(project.model.elements.find((each) => each.id === 'joint-2')?.attributes?.position).toBe(
      undefined,
    );
  });

  it('turns the shoulder, the elbow and the wrist in the arm’s own plane, about horizontal axes', () => {
    for (const joint of ['joint-2', 'joint-3', 'joint-5']) {
      const moved = world(new Map([[joint, 30]]));
      const pivot = pivotOf(rest, joint);
      const before = at(rest, 'gripper');
      const after = at(moved, 'gripper');
      // Across the arm's plane, nothing moves; the gripper keeps its distance from the pivot.
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(distance(after, pivot)).toBeCloseTo(distance(before, pivot), 9);
      expect(distance(after, before)).toBeGreaterThan(0.02);
    }
    // A positive shoulder leans the arm forward, toward +Z, where the bins are, and lowers the gripper.
    const leaning = at(world(new Map([['joint-2', 30]])), 'gripper');
    expect(leaning.z).toBeGreaterThan(at(rest, 'gripper').z);
    expect(leaning.y).toBeLessThan(at(rest, 'gripper').y);
  });

  it('turns the base about the vertical, keeping every height', () => {
    const turned = world(new Map([['joint-1', 90]]));
    for (const element of ['link-2', 'joint-3', 'gripper', 'wrist-camera']) {
      expect(at(turned, element).y).toBeCloseTo(at(rest, element).y, 9);
    }
    // A quarter turn swings the gripper, ahead of the base, to its side.
    const gripper = at(turned, 'gripper');
    expect(Math.abs(gripper.x - at(rest, 'base').x)).toBeGreaterThan(0.4);
  });

  it('rolls the wrist about the forearm, keeping the gripper ahead of it', () => {
    for (const joint of ['joint-4', 'joint-6']) {
      const rolled = world(new Map([[joint, 90]]));
      // Along the forearm, toward +Z, the gripper stays as far ahead.
      expect(at(rolled, 'gripper').z).toBeCloseTo(at(rest, 'gripper').z, 9);
    }
  });
});

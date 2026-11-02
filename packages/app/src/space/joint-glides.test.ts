// @vitest-environment node
/**
 * The joints' glides of the physical-space panel (ADR 0090), on the robot-arm sample: a glide moves
 * the panel's `joints` from where they are to where a step puts them, on the store's frames, eased,
 * ending on them exactly; a slider moving meanwhile stops it; the time a tour's step takes grows with
 * the farthest joint's travel, up to a cap; and the tour "Pick a part" moves the gripper's point from
 * bin A to bin B.
 */
import { pointInSpace, spaceOf, tourEase } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { withJoints } from './joint-glides';
import {
  JOINT_STEP_TIME,
  MAX_JOINT_STEP_TIME,
  jointStepGlide,
  positionsOfSaved,
  savedJointsBetween,
  storedPosition,
} from './joints';
import { SpacePanelStore } from './store';

const project = loadSample('robot-arm');

function setUp() {
  let time = 0;
  const frames: (() => void)[] = [];
  const store = new SpacePanelStore({
    frames: { request: (callback) => frames.push(callback), cancel: () => undefined },
    windowWidth: () => 1600,
    now: () => time,
  });
  const run = (at: number) => {
    time = at;
    const due = frames.splice(0);
    for (const frame of due) frame();
  };
  return { store, run };
}

const options = (duration: number) => ({
  duration,
  ease: tourEase,
  stored: (joint: string) => storedPosition(project, joint),
});

describe('the joints’ glides', () => {
  it('glide from where the joints are to where a step puts them, ending on them', () => {
    const { store, run } = setUp();
    store.open('workcell', { joints: { 'joint-1': -30 } });
    store.joints.glide('workcell', { 'joint-1': 30, 'joint-2': 20 }, options(400));
    expect(store.joints.gliding('workcell')).toBe(true);
    run(200);
    const half = store.state('workcell')?.joints;
    expect(half?.['joint-1']).toBeCloseTo(0, 9);
    expect(half?.['joint-2']).toBeCloseTo(10, 9);
    run(400);
    expect(store.state('workcell')?.joints).toEqual({ 'joint-1': 30, 'joint-2': 20 });
    expect(store.joints.gliding('workcell')).toBe(false);
  });

  it('go back to the stored positions when the step gives none, and jump with no time', () => {
    const { store, run } = setUp();
    store.open('workcell', { joints: { 'joint-1': 40 } });
    store.joints.glide('workcell', undefined, options(0));
    expect(store.state('workcell')).toEqual({});
    store.set('workcell', { joints: { 'joint-1': 40 } });
    store.joints.glide('workcell', undefined, options(100));
    run(100);
    expect(store.state('workcell')).toEqual({});
  });

  it('stop when a slider moves a joint meanwhile, keeping its position', () => {
    const { store, run } = setUp();
    store.open('workcell', {});
    store.joints.glide('workcell', { 'joint-1': 90 }, options(400));
    run(100);
    const space = store.state('workcell');
    if (!space) throw new Error('open');
    store.set('workcell', withJoints(space, { ...space.joints, 'joint-1': 5 }));
    run(200);
    expect(store.state('workcell')?.joints).toEqual({ 'joint-1': 5 });
    expect(store.joints.gliding('workcell')).toBe(false);
  });

  it('take longer the farther the farthest joint travels, up to a cap', () => {
    expect(jointStepGlide(project, undefined, undefined)).toBe(0);
    expect(jointStepGlide(project, { 'joint-1': 10 }, { 'joint-1': 10 })).toBe(0);
    expect(jointStepGlide(project, undefined, { 'joint-1': 30 })).toBe(JOINT_STEP_TIME + 150);
    expect(
      jointStepGlide(project, { 'joint-1': -34 }, { 'joint-1': 34, 'joint-2': 10 }),
    ).toBeCloseTo(JOINT_STEP_TIME + (150 * 68) / 30, 9);
    expect(jointStepGlide(project, undefined, { 'joint-6': 3000 })).toBe(MAX_JOINT_STEP_TIME);
  });

  it('pass through the stored position of a joint one end leaves out', () => {
    expect(savedJointsBetween({ 'joint-1': 40 }, undefined, 0.5, () => 0)).toEqual({
      'joint-1': 20,
    });
    expect(savedJointsBetween({ 'joint-1': 40 }, undefined, 1, () => 0)).toBeUndefined();
  });
});

describe('the tour "Pick a part"', () => {
  it('moves the gripper’s point from over bin A down to the part, then over bin B and into it', () => {
    const tour = project.tours.find((each) => each.id === 'pick-a-part');
    const workcell = project.views.find((each) => each.id === 'workcell');
    if (!tour || !workcell) throw new Error('The sample has its tour and its workcell view.');
    const gripperAt = (stepId: string) => {
      const step = tour.steps.find((each) => each.id === stepId);
      const positions = positionsOfSaved(step?.viewState.space?.joints);
      return pointInSpace(spaceOf(project, workcell, undefined, positions), 'gripper');
    };
    const rest = spaceOf(project, workcell);
    const at = (id: string) => {
      const m = rest.entries.get(id)?.matrix ?? [];
      return { x: m[12] ?? NaN, y: m[13] ?? NaN, z: m[14] ?? NaN };
    };
    const near = (a: { x: number; z: number } | undefined, b: { x: number; z: number }) =>
      Math.hypot((a?.x ?? NaN) - b.x, (a?.z ?? NaN) - b.z);
    const piece = at('workpiece');
    const binB = at('bin-b');
    const restGripper = pointInSpace(rest, 'gripper');
    // At rest the gripper is far from both bins; the steps bring it over each, within 8 cm.
    expect(near(restGripper, piece)).toBeGreaterThan(0.3);
    for (const step of ['reach-bin-a', 'grip', 'lift']) {
      expect(near(gripperAt(step), piece), step).toBeLessThan(0.08);
    }
    for (const step of ['over-bin-b', 'place']) {
      expect(near(gripperAt(step), binB), step).toBeLessThan(0.08);
    }
    // Gripping and placing go down; lifting comes back up.
    expect(gripperAt('grip')?.y ?? NaN).toBeLessThan((gripperAt('reach-bin-a')?.y ?? NaN) - 0.1);
    expect(gripperAt('lift')?.y ?? NaN).toBeCloseTo(gripperAt('reach-bin-a')?.y ?? NaN, 9);
    expect(gripperAt('place')?.y ?? NaN).toBeLessThan((gripperAt('over-bin-b')?.y ?? NaN) - 0.1);
    // Back to rest gives no positions: the arm stands as it is stored.
    expect(gripperAt('back-to-rest')).toEqual(restGripper);
  });
});

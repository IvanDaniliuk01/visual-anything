/**
 * Poses (ADR 0076): `pose` in `create-element` and `update-element`, `set-poses`, what they refuse
 * (`invalid-pose`), how they store a pose, and the `pose-not-in-container` warning of opening and of
 * an action that takes the containment away.
 */
import type { PackageFile, Pose, ProjectFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command, type CommandOutcome } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds } from '../test/fixtures';
import { MAX_POSE_COORDINATE } from './pose';

const INSIDE = 'lab.inside';

const LAB: PackageFile = {
  id: 'lab',
  name: 'Lab',
  components: [{ id: 'lab.thing', name: 'Thing', derivesFrom: 'essence' }],
  relationTypes: [{ id: INSIDE, name: 'is inside', derivesFrom: 'relates-to', nests: true }],
};

const PROJECT: ProjectFile = { schemaVersion: 1, name: 'Lab', packages: ['lab'] };

/** A hall holding a bench, and a lamp outside both. */
function lab(): ProjectSnapshot {
  return {
    project: PROJECT,
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'hall', component: 'lab.thing', name: 'Hall' },
        { id: 'bench', component: 'lab.thing', name: 'Bench' },
        { id: 'lamp', component: 'lab.thing', name: 'Lamp' },
      ],
      relations: [{ id: 'bench-in-hall', relationType: INSIDE, from: 'bench', to: 'hall' }],
    },
    packages: [LAB],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

function run(state: ProjectSnapshot, command: Command): CommandOutcome {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(state: ProjectSnapshot, command: Command) {
  const outcome = run(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join('\n'));
  return outcome;
}

function refused(state: ProjectSnapshot, command: Command): { code: string; message: string } {
  const outcome = run(state, command);
  if (outcome.ok) throw new Error('The command was not refused.');
  const [first] = outcome.problems;
  return { code: first?.code ?? '', message: first?.message ?? '' };
}

const poseOf = (state: ProjectSnapshot, id: string) =>
  state.model.elements.find((each) => each.id === id)?.pose;

const setPose = (id: string, pose: unknown): Command =>
  ({ type: 'update-element', id, changes: { pose } }) as Command;

describe('pose in update-element', () => {
  it('poses an element in World, leaving `in` out', () => {
    const outcome = ok(lab(), setPose('lamp', { at: { x: 1, y: 2, z: 3 } }));
    expect(poseOf(outcome.state, 'lamp')).toEqual({ at: { x: 1, y: 2, z: 3 } });
    expect(outcome.label).toBe('Pose "Lamp"');
  });

  it('stores World named by its id as `in` left out', () => {
    const outcome = ok(lab(), setPose('lamp', { in: 'world', at: { x: 1, y: 0, z: 0 } }));
    expect(poseOf(outcome.state, 'lamp')).toEqual({ at: { x: 1, y: 0, z: 0 } });
  });

  it('poses an element in one of its containers', () => {
    const pose: Pose = { in: 'hall', at: { x: 0, y: 0.8, z: -2 } };
    expect(poseOf(ok(lab(), setPose('bench', pose)).state, 'bench')).toEqual(pose);
  });

  it('refuses an `in` that is not one of its containers', () => {
    expect(refused(lab(), setPose('lamp', { in: 'hall', at: { x: 0, y: 0, z: 0 } }))).toEqual({
      code: 'invalid-pose',
      message: 'The pose of "Lamp" is measured from "Hall", which is not one of its containers.',
    });
    expect(
      refused(lab(), setPose('lamp', { in: 'nowhere', at: { x: 0, y: 0, z: 0 } })).message,
    ).toBe('The pose of "Lamp" is measured from "nowhere", which is not an element.');
  });

  it('refuses numbers that are not finite, and a coordinate past 1,000 km', () => {
    for (const x of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_POSE_COORDINATE + 1,
      -MAX_POSE_COORDINATE - 1,
    ]) {
      expect(refused(lab(), setPose('lamp', { at: { x, y: 0, z: 0 } })).code).toBe('invalid-pose');
    }
    const far = { at: { x: MAX_POSE_COORDINATE, y: -MAX_POSE_COORDINATE, z: 0 } };
    expect(poseOf(ok(lab(), setPose('lamp', far)).state, 'lamp')).toEqual(far);
  });

  it('stores a rotation within a millionth of unit length normalized, and refuses one past it', () => {
    const near = { x: 0, y: 0, z: 0, w: 1 + 5e-7 };
    expect(
      poseOf(ok(lab(), setPose('lamp', { at: { x: 0, y: 0, z: 0 }, rotation: near })).state, 'lamp')
        ?.rotation,
    ).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    const off = { x: 0, y: 0, z: 0, w: 1 + 2e-6 };
    expect(refused(lab(), setPose('lamp', { at: { x: 0, y: 0, z: 0 }, rotation: off }))).toEqual({
      code: 'invalid-pose',
      message: 'The pose of "Lamp" has a rotation that is not of unit length.',
    });
  });

  it('refuses what is not a pose', () => {
    for (const pose of [
      'here',
      [],
      { at: { x: 0, y: 0 } },
      { at: { x: '1', y: 0, z: 0 } },
      { at: { x: 0, y: 0, z: 0 }, scale: 2 },
      { at: { x: 0, y: 0, z: 0, w: 1 } },
      { in: 3, at: { x: 0, y: 0, z: 0 } },
      { at: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    ]) {
      expect(refused(lab(), setPose('lamp', pose)).code).toBe('invalid-pose');
    }
  });

  it('refuses a pose for World', () => {
    expect(refused(lab(), setPose('world', { at: { x: 0, y: 0, z: 0 } })).code).toBe(
      'world-not-allowed',
    );
  });

  it('takes a pose out with null, and undo puts it back', () => {
    const posed = ok(lab(), setPose('lamp', { at: { x: 1, y: 0, z: 0 } })).state;
    const out = ok(posed, setPose('lamp', null));
    expect(poseOf(out.state, 'lamp')).toBeUndefined();
    expect(out.label).toBe('Take "Lamp" out of physical space');
    expect(poseOf(applyOperations(out.state, out.inverse).state, 'lamp')).toEqual({
      at: { x: 1, y: 0, z: 0 },
    });
  });
});

describe('pose in create-element', () => {
  it('poses a new element in a container made in the same command', () => {
    const outcome = ok(lab(), {
      type: 'create-element',
      element: {
        component: 'lab.thing',
        name: 'Stool',
        pose: { in: 'hall', at: { x: 1, y: 0, z: 1 } },
      },
      containers: [{ container: 'hall', relationType: INSIDE }],
    });
    const [id] = outcome.created;
    expect(poseOf(outcome.state, id as string)).toEqual({ in: 'hall', at: { x: 1, y: 0, z: 1 } });
  });

  it('refuses a pose in what is not one of its containers, and makes nothing', () => {
    const before = lab();
    const outcome = run(before, {
      type: 'create-element',
      element: {
        component: 'lab.thing',
        name: 'Stool',
        pose: { in: 'hall', at: { x: 0, y: 0, z: 0 } },
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problems[0]?.code).toBe('invalid-pose');
  });
});

describe('set-poses', () => {
  it('sets and takes out several poses as one action', () => {
    const posed = ok(lab(), setPose('lamp', { at: { x: 5, y: 0, z: 0 } })).state;
    const outcome = ok(posed, {
      type: 'set-poses',
      poses: [
        { element: 'bench', pose: { in: 'hall', at: { x: 0, y: 0, z: 1 } } },
        { element: 'hall', pose: { at: { x: 10, y: 0, z: 0 } } },
        { element: 'lamp', pose: null },
      ],
    });
    expect(poseOf(outcome.state, 'bench')).toEqual({ in: 'hall', at: { x: 0, y: 0, z: 1 } });
    expect(poseOf(outcome.state, 'hall')).toEqual({ at: { x: 10, y: 0, z: 0 } });
    expect(poseOf(outcome.state, 'lamp')).toBeUndefined();
    expect(outcome.label).toBe('Pose 3 elements');
    const undone = applyOperations(outcome.state, outcome.inverse).state;
    expect(undone.model).toEqual(posed.model);
  });

  it('names its one element', () => {
    expect(
      ok(lab(), {
        type: 'set-poses',
        poses: [{ element: 'lamp', pose: { at: { x: 0, y: 0, z: 0 } } }],
      }).label,
    ).toBe('Pose "Lamp"');
  });

  it('changes nothing for poses as they are', () => {
    const posed = ok(lab(), setPose('lamp', { at: { x: 5, y: 0, z: 0 } })).state;
    expect(
      ok(posed, {
        type: 'set-poses',
        poses: [{ element: 'lamp', pose: { at: { x: 5, y: 0, z: 0 } } }],
      }).operations,
    ).toEqual([]);
    expect(
      ok(lab(), { type: 'set-poses', poses: [{ element: 'lamp', pose: null }] }).operations,
    ).toEqual([]);
  });

  it('refuses nothing to pose, an element twice, an unknown element, and any bad pose', () => {
    expect(refused(lab(), { type: 'set-poses', poses: [] }).code).toBe('invalid-command');
    const at = { x: 0, y: 0, z: 0 };
    expect(
      refused(lab(), {
        type: 'set-poses',
        poses: [
          { element: 'lamp', pose: { at } },
          { element: 'lamp', pose: null },
        ],
      }).code,
    ).toBe('invalid-command');
    expect(
      refused(lab(), { type: 'set-poses', poses: [{ element: 'gone', pose: { at } }] }).code,
    ).toBe('unknown-element');
    const outcome = run(lab(), {
      type: 'set-poses',
      poses: [
        { element: 'hall', pose: { at } },
        { element: 'lamp', pose: { in: 'hall', at } },
      ],
    });
    expect(outcome.ok).toBe(false);
  });
});

describe('pose-not-in-container', () => {
  it('is warned when an action takes away the containment `in` stands on, and the pose is kept', () => {
    const posed = ok(lab(), setPose('bench', { in: 'hall', at: { x: 0, y: 0, z: 1 } })).state;
    const outcome = ok(posed, { type: 'delete', relations: ['bench-in-hall'] });
    expect(poseOf(outcome.state, 'bench')).toEqual({ in: 'hall', at: { x: 0, y: 0, z: 1 } });
    expect(outcome.warnings.map((each) => each.code)).toContain('pose-not-in-container');
    expect(
      checkProject(outcome.state).warnings.find((each) => each.code === 'pose-not-in-container')
        ?.message,
    ).toBe(
      'The pose of "Bench" is measured from "Hall", which no longer holds it; it is kept, and "Bench" is not in physical space until it is posed again.',
    );
    // An action that changes nothing of it does not warn again.
    const later = ok(outcome.state, setPose('lamp', { at: { x: 0, y: 0, z: 0 } }));
    expect(later.warnings.map((each) => each.code)).not.toContain('pose-not-in-container');
  });

  it('is warned on open for a pose whose values are not one', () => {
    const state = lab();
    const opened: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        elements: state.model.elements.map((each) =>
          each.id === 'lamp' ? { ...each, pose: { at: { x: 2e6, y: 0, z: 0 } } } : each,
        ),
      },
    };
    const { errors, warnings } = checkProject(opened);
    expect(errors).toEqual([]);
    expect(warnings.map((each) => each.code)).toContain('invalid-pose');
  });
});

/**
 * Property tests of physical space (ADR 0076), after random sequences of commands that pose, take
 * out, nest, move and delete: an element is in physical space at most once and where its chain of
 * poses puts it, as a plain fixed point works it out; poses never form a cycle; `spaceOf` equals
 * working it out afresh; and posing an element in another container where it is keeps every place.
 */
import fc from 'fast-check';
import type { Id, Pose } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';
import { sequentialIds } from '../test/fixtures';
import { commandFor, intent, propertyProject, type Intent } from '../test/random-commands';
import { IDENTITY, matrixOf, multiply, transformPoint, type Matrix } from './math';
import { poseIsUsable, poseValueProblem } from './pose';
import { poseIn, spaceOf } from './space';

/** The project after the commands the intents stand for, those refused left out. */
function after(wishes: readonly Intent[]): ProjectSnapshot {
  let state = propertyProject();
  const newId = sequentialIds();
  for (const wish of wishes) {
    const command = commandFor(state, wish);
    if (command === undefined) continue;
    const outcome = executeCommand(state, command, { newId });
    if (outcome.ok) state = outcome.state;
  }
  return state;
}

const sequences = fc.array(intent, { minLength: 20, maxLength: 60 });

/**
 * What is in physical space under a root and where, as a fixed point over poses works it out: the
 * root, then whatever is posed in what is already there, until nothing more is.
 */
function plainSpace(state: ProjectSnapshot, root: Id): Map<Id, Matrix> {
  const model = modelIndexOf(state);
  const world = state.model.world.id;
  const placed = new Map<Id, Matrix>([[root, IDENTITY]]);
  for (let grew = true; grew;) {
    grew = false;
    for (const element of state.model.elements) {
      const pose = element.pose;
      if (pose === undefined || placed.has(element.id)) continue;
      if (!poseIsUsable(pose, element.id, model)) continue;
      const holder = placed.get(pose.in ?? world);
      if (holder === undefined) continue;
      placed.set(element.id, multiply(holder, matrixOf(pose.at, pose.rotation)));
      grew = true;
    }
  }
  return placed;
}

const origin = { x: 0, y: 0, z: 0 };

function expectSamePlaces(actual: ReadonlyMap<Id, Matrix>, expected: ReadonlyMap<Id, Matrix>) {
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
  for (const [id, matrix] of expected) {
    const a = transformPoint(actual.get(id) ?? [], { x: 1, y: 2, z: 3 });
    const b = transformPoint(matrix, { x: 1, y: 2, z: 3 });
    for (const axis of ['x', 'y', 'z'] as const) expect(a[axis]).toBeCloseTo(b[axis], 6);
  }
}

const matricesOf = (space: ReturnType<typeof spaceOf>) =>
  new Map([...space.entries].map(([id, entry]) => [id, entry.matrix]));

describe('physical space after random commands', () => {
  it('holds each element at most once, where its poses put it, under World and under any element', () => {
    fc.assert(
      fc.property(sequences, fc.nat(), (wishes, at) => {
        const state = after(wishes);
        const world = state.model.world.id;
        expectSamePlaces(matricesOf(spaceOf(state)), plainSpace(state, world));
        const roots = state.model.elements.map((each) => each.id);
        const root = roots.length === 0 ? world : (roots[at % roots.length] as Id);
        expectSamePlaces(matricesOf(spaceOf(state, undefined, root)), plainSpace(state, root));
      }),
      { numRuns: 60 },
    );
  });

  it('never stores a pose that is not one, and poses never form a cycle', () => {
    fc.assert(
      fc.property(sequences, (wishes) => {
        const state = after(wishes);
        const model = modelIndexOf(state);
        const poses = new Map<Id, Pose>();
        for (const element of state.model.elements) {
          if (element.pose === undefined) continue;
          expect(poseValueProblem(element.pose)).toBeUndefined();
          if (poseIsUsable(element.pose, element.id, model)) poses.set(element.id, element.pose);
        }
        for (const start of poses.keys()) {
          const seen = new Set<Id>();
          for (let at: Id | undefined = start; at !== undefined; at = poses.get(at)?.in) {
            expect(seen.has(at)).toBe(false);
            seen.add(at);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('works out the same space as a fresh copy of the project does', () => {
    fc.assert(
      fc.property(sequences, (wishes) => {
        const state = after(wishes);
        // Worked out once, so that a second call reads what is kept.
        spaceOf(state);
        const kept = spaceOf(state);
        const fresh = spaceOf(structuredClone(state));
        expect(kept).toEqual(fresh);
      }),
      { numRuns: 60 },
    );
  });

  it('keeps every place when an element is posed where it is in another of its containers', () => {
    fc.assert(
      fc.property(sequences, fc.nat(), fc.nat(), (wishes, which, to) => {
        const state = after(wishes);
        const before = spaceOf(state);
        const posed = [...before.entries.values()].filter((each) => each.how === 'posed');
        const entry = posed[which % Math.max(1, posed.length)];
        if (entry === undefined) return;
        const model = modelIndexOf(state);
        const candidates = [undefined, ...model.containersOf(entry.element)].filter(
          (each) => each === undefined || before.entries.has(each),
        );
        const container = candidates[to % candidates.length];
        const pose = poseIn(state, entry.element, container);
        expect(pose).toBeDefined();
        const outcome = executeCommand(state, {
          type: 'update-element',
          id: entry.element,
          changes: { pose: pose },
        });
        if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join('\n'));
        const now = spaceOf(outcome.state);
        expect([...now.entries.keys()].sort()).toEqual([...before.entries.keys()].sort());
        for (const [id, each] of before.entries) {
          const a = transformPoint(now.entries.get(id)?.matrix ?? [], origin);
          const b = transformPoint(each.matrix, origin);
          for (const axis of ['x', 'y', 'z'] as const) expect(a[axis]).toBeCloseTo(b[axis], 6);
        }
      }),
      { numRuns: 80 },
    );
  });
});

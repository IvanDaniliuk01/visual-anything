import fc from 'fast-check';
import type { Id, JsonValue, Step } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import type { NewStep } from '../commands/types';
import { modelIndexOf } from '../state';
import {
  deleteStep,
  describeStep,
  moveStep,
  recordRelation,
  repairStep,
  setStepData,
  takeOutOfStep,
} from './recording';
import { scenarioProject, step, theScenario, withSteps } from './test/fixtures';

const project = scenarioProject();
const index = modelIndexOf(project);
const exists = (id: Id) => index.relation(id) !== undefined;

const two = [step('call', 'client-calls-api'), step('read', 'api-reads-db')];

describe('recordRelation', () => {
  it('starts the first step with the first relation clicked', () => {
    expect(
      recordRelation([], { relation: 'client-calls-api', simultaneous: false }, exists),
    ).toEqual({
      steps: [{ description: '', relations: ['client-calls-api'] }],
      at: 0,
      change: 'new-step',
    });
  });

  it('starts the first step with Shift too, since there is no step to add to', () => {
    const recorded = recordRelation([], { relation: 'api-reads-db', simultaneous: true }, exists);
    expect(recorded.change).toBe('new-step');
    expect(recorded.steps).toEqual([{ description: '', relations: ['api-reads-db'] }]);
  });

  it('adds a step after the current one for each click, so that relations are recorded in order', () => {
    const recorded = recordRelation(
      two,
      { relation: 'api-calls-worker', simultaneous: false, at: 0 },
      exists,
    );
    expect(recorded.at).toBe(1);
    expect(recorded.steps).toEqual([
      two[0],
      { description: '', relations: ['api-calls-worker'] },
      two[1],
    ]);
  });

  it('adds after the last step when there is no current one', () => {
    const recorded = recordRelation(two, { relation: 'api-reads-db', simultaneous: false }, exists);
    expect(recorded.at).toBe(2);
    expect(recorded.steps.at(-1)).toEqual({ description: '', relations: ['api-reads-db'] });
  });

  it('records the same relation again as a step of its own, as a reply goes back along a call', () => {
    const recorded = recordRelation(
      two,
      { relation: 'api-reads-db', simultaneous: false, at: 1 },
      exists,
    );
    expect(recorded.steps.map((each) => each.relations)).toEqual([
      ['client-calls-api'],
      ['api-reads-db'],
      ['api-reads-db'],
    ]);
  });

  it('adds a relation clicked with Shift to the current step, as simultaneous', () => {
    const recorded = recordRelation(
      two,
      { relation: 'api-calls-worker', simultaneous: true, at: 1 },
      exists,
    );
    expect(recorded).toEqual({
      steps: [two[0], { ...two[1], relations: ['api-reads-db', 'api-calls-worker'] }],
      at: 1,
      change: 'added',
    });
  });

  it('takes a relation clicked with Shift out of the current step when it is in it already', () => {
    const both = [step('book', 'api-reads-db', 'api-calls-worker')];
    const recorded = recordRelation(
      both,
      { relation: 'api-reads-db', simultaneous: true, at: 0 },
      exists,
    );
    expect(recorded).toEqual({
      steps: [{ ...both[0], relations: ['api-calls-worker'] }],
      at: 0,
      change: 'removed',
    });
  });

  it('never leaves a step without relations', () => {
    const recorded = recordRelation(
      two,
      { relation: 'api-reads-db', simultaneous: true, at: 1 },
      exists,
    );
    expect(recorded.change).toBe('unchanged');
    expect(recorded.steps).toEqual(two);
  });

  it('fixes a broken step that a relation is added to: what no longer exists leaves it', () => {
    const broken = [step('lost', 'gone', 'api-reads-db')];
    const recorded = recordRelation(
      broken,
      { relation: 'api-calls-worker', simultaneous: true, at: 0 },
      exists,
    );
    expect(recorded.steps).toEqual([
      { ...broken[0], relations: ['api-reads-db', 'api-calls-worker'] },
    ]);
  });

  it('keeps a broken step as it is when a new step is recorded beside it', () => {
    const broken = [step('lost', 'gone')];
    const recorded = recordRelation(
      broken,
      { relation: 'api-reads-db', simultaneous: false, at: 0 },
      exists,
    );
    expect(recorded.steps[0]).toBe(broken[0]);
  });
});

describe('step edits', () => {
  it('describes a step', () => {
    expect(describeStep(two, 1, 'The API reads the DB again.')).toEqual([
      two[0],
      { ...two[1], description: 'The API reads the DB again.' },
    ]);
  });

  it('sets and removes what a step takes in and produces', () => {
    const withData = setStepData(two, 0, 'dataIn', { patient: 'p-1' });
    expect(withData[0]).toEqual({ ...two[0], dataIn: { patient: 'p-1' } });
    const produced = setStepData(withData, 0, 'dataOut', [1, 2]);
    expect(produced[0]).toMatchObject({ dataIn: { patient: 'p-1' }, dataOut: [1, 2] });
    expect(setStepData(produced, 0, 'dataIn', undefined)[0]).toEqual({
      ...two[0],
      dataOut: [1, 2],
    });
    expect(setStepData(two, 0, 'dataIn', null)[0]).toEqual({ ...two[0], dataIn: null });
  });

  it('takes a relation out of a step, unless it is the step’s last', () => {
    const both = [step('book', 'api-reads-db', 'api-calls-worker')];
    expect(takeOutOfStep(both, 0, 'api-reads-db', exists)).toEqual([
      { ...both[0], relations: ['api-calls-worker'] },
    ]);
    expect(takeOutOfStep(two, 0, 'client-calls-api', exists)).toBeUndefined();
  });

  it('repairs a broken step: what no longer exists leaves it, and a relation may take its place', () => {
    const broken = [step('lost', 'gone-1', 'api-reads-db', 'gone-2')];
    expect(repairStep(broken, 0, exists)).toEqual([{ ...broken[0], relations: ['api-reads-db'] }]);
    expect(repairStep(broken, 0, exists, 'api-calls-worker')).toEqual([
      { ...broken[0], relations: ['api-reads-db', 'api-calls-worker'] },
    ]);
    const lost = [step('lost', 'gone')];
    expect(repairStep(lost, 0, exists)).toBeUndefined();
    expect(repairStep(lost, 0, exists, 'api-reads-db')).toEqual([
      { ...lost[0], relations: ['api-reads-db'] },
    ]);
  });

  it('moves a step, and deletes one', () => {
    const three = [...two, step('delegate', 'api-calls-worker')];
    expect(moveStep(three, 2, 0).map((each) => each.id)).toEqual(['delegate', 'call', 'read']);
    expect(moveStep(three, 0, 9).map((each) => each.id)).toEqual(['read', 'delegate', 'call']);
    expect(deleteStep(three, 1).map((each) => each.id)).toEqual(['call', 'delegate']);
  });

  it('leaves the steps as they are for a step that is not there', () => {
    expect(describeStep(two, 5, 'x')).toEqual(two);
    expect(deleteStep(two, -1)).toEqual(two);
    expect(takeOutOfStep(two, 7, 'api-reads-db', exists)).toBeUndefined();
  });
});

/** Every relation of the fixture that a step can use, and two that are gone. */
const RELATIONS = [
  'client-calls-api',
  'api-reads-db',
  'api-calls-worker',
  'worker-reads-blob',
  'contract-governs-call',
  'gone-1',
  'gone-2',
];
const MODEL_RELATIONS = RELATIONS.filter(exists);

const storedSteps = fc
  .array(fc.uniqueArray(fc.constantFrom(...RELATIONS), { minLength: 1, maxLength: 3 }), {
    maxLength: 8,
  })
  .map((lists) => lists.map((relations, at) => step(`s${at}`, ...relations)));

/** Sends steps as the app does, and gives what the core kept, or why it refused them. */
function sent(stored: Step[], steps: NewStep[]) {
  const start = withSteps(project, stored);
  return executeCommand(start, {
    type: 'update-scenario',
    id: theScenario(start).id,
    changes: { steps },
  });
}

describe('recording and editing, for any steps', () => {
  it('changes only the step clicked into, and the core accepts the result', () => {
    fc.assert(
      fc.property(
        storedSteps,
        fc.constantFrom(...MODEL_RELATIONS),
        fc.boolean(),
        fc.option(fc.integer({ min: -1, max: 9 }), { nil: undefined }),
        (stored, relation, simultaneous, at) => {
          const recorded = recordRelation(stored, { relation, simultaneous, at }, exists);
          const { steps, change } = recorded;
          const grew = change === 'new-step';
          expect(steps).toHaveLength(stored.length + (grew ? 1 : 0));
          expect(recorded.at).toBeGreaterThanOrEqual(0);
          expect(recorded.at).toBeLessThan(steps.length);
          // Every other step is kept exactly, so the broken ones stay as they were.
          const others = steps.filter((_, position) => position !== recorded.at);
          const before = grew ? stored : stored.filter((_, position) => position !== recorded.at);
          expect(others).toEqual(before);
          const touched = steps[recorded.at]!;
          if (change === 'removed') expect(touched.relations).not.toContain(relation);
          else if (change !== 'unchanged') expect(touched.relations).toContain(relation);
          expect(touched.relations.length).toBeGreaterThan(0);

          const outcome = sent(stored, steps);
          expect(outcome.ok).toBe(true);
          if (!outcome.ok) return;
          const kept = theScenario(outcome.state).steps;
          expect(kept.map((each) => each.relations)).toEqual(steps.map((each) => each.relations));
          stored.forEach((each) => {
            if (steps.includes(each)) expect(kept).toContainEqual(each);
          });
        },
      ),
    );
  });

  it('keeps every step it does not edit, and the core accepts every edit', () => {
    const edit = fc.oneof(
      fc.record({ kind: fc.constant('describe' as const), text: fc.string() }),
      fc.record({ kind: fc.constant('data' as const), value: fc.jsonValue() }),
      fc.record({ kind: fc.constant('take-out' as const), pick: fc.nat() }),
      fc.record({
        kind: fc.constant('repair' as const),
        by: fc.option(fc.constantFrom(...MODEL_RELATIONS), { nil: undefined }),
      }),
      fc.record({ kind: fc.constant('move' as const), to: fc.integer({ min: -1, max: 9 }) }),
      fc.record({ kind: fc.constant('delete' as const) }),
    );
    fc.assert(
      fc.property(storedSteps, fc.nat(), edit, (stored, pick, change) => {
        if (stored.length === 0) return;
        const at = pick % stored.length;
        const target = stored[at]!;
        let steps: NewStep[] | undefined;
        switch (change.kind) {
          case 'describe':
            steps = describeStep(stored, at, change.text);
            break;
          case 'data':
            steps = setStepData(stored, at, 'dataOut', change.value as JsonValue);
            break;
          case 'take-out':
            steps = takeOutOfStep(
              stored,
              at,
              target.relations[change.pick % target.relations.length]!,
              exists,
            );
            break;
          case 'repair':
            steps = repairStep(stored, at, exists, change.by);
            break;
          case 'move':
            steps = moveStep(stored, at, change.to);
            break;
          case 'delete':
            steps = deleteStep(stored, at);
            break;
        }
        if (!steps) return;
        // Every step it does not edit is kept exactly, in the same order.
        const untouched = stored.filter((each) => each !== target);
        expect(steps.filter((each) => untouched.includes(each as Step))).toEqual(untouched);
        expect(steps.every((each) => each.relations.length > 0)).toBe(true);
        const outcome = sent(stored, steps);
        expect(outcome.ok).toBe(true);
      }),
    );
  });
});

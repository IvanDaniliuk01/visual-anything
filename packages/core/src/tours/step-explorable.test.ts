import type { ExplorableParameter, TourStep } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import {
  readParameterText,
  repairedStepExplorable,
  stepExplorableValues,
  withStepExplorable,
  withStepParameter,
} from './step-explorable';
import { tourExplorableProblems } from './steps';

function run(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command, { newId: sequentialIds(), author: 'user' });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const PARAMETERS: ExplorableParameter[] = [
  { name: 'a', kind: 'number', min: -5, max: 5, default: 1 },
  { name: 'n', kind: 'integer', min: 0, max: 10, default: 2 },
  { name: 'grid', kind: 'boolean', default: true },
  { name: 'mode', kind: 'choice', choices: ['curve', 'roots'], default: 'curve' },
];

function project(): ProjectSnapshot {
  return run(testProject(), {
    type: 'define-explorable',
    package: 'test',
    explorable: { id: 'test.parabola', name: 'Parabola', parameters: PARAMETERS },
    text: '<p>parabola</p>',
  });
}

const STEP: TourStep = {
  id: 'step-1',
  viewState: { view: 'overview' },
  caption: { title: 'The vertex' },
};

describe('a tour step’s explorable, as its editor changes it', () => {
  it('shows an explorable with its defaults, then none', () => {
    const shown = withStepExplorable(STEP, 'test.parabola');
    expect(shown.explorable).toEqual({ id: 'test.parabola' });
    expect(stepExplorableValues(project(), shown)).toEqual({
      a: 1,
      n: 2,
      grid: true,
      mode: 'curve',
    });
    const none = withStepExplorable(shown, undefined);
    expect('explorable' in none).toBe(false);
    expect(stepExplorableValues(project(), none)).toBeUndefined();
  });

  it('keeps the values set when the same explorable is chosen again, and drops them for another', () => {
    const set = withStepParameter(withStepExplorable(STEP, 'test.parabola'), 'a', 3);
    expect(withStepExplorable(set, 'test.parabola').explorable).toEqual({
      id: 'test.parabola',
      parameters: { a: 3 },
    });
    expect(withStepExplorable(set, 'test.other').explorable).toEqual({ id: 'test.other' });
  });

  it('sets a value, and takes it back to the default', () => {
    let step = withStepExplorable(STEP, 'test.parabola');
    step = withStepParameter(step, 'a', -2.5);
    step = withStepParameter(step, 'mode', 'roots');
    expect(step.explorable?.parameters).toEqual({ a: -2.5, mode: 'roots' });
    expect(stepExplorableValues(project(), step)).toMatchObject({ a: -2.5, mode: 'roots' });
    step = withStepParameter(step, 'a', undefined);
    step = withStepParameter(step, 'mode', undefined);
    expect(step.explorable).toEqual({ id: 'test.parabola' });
  });

  it('changes nothing for a step that shows no explorable', () => {
    expect(withStepParameter(STEP, 'a', 1)).toBe(STEP);
  });

  it('repairs a broken step: what is no longer declared or taken goes, the rest stays', () => {
    const state = project();
    const broken: TourStep = {
      ...STEP,
      explorable: { id: 'test.parabola', parameters: { a: 9, n: 3, gone: 1, grid: 'yes' } },
    };
    expect(tourExplorableProblems(state, broken)).toHaveLength(3);
    const repaired = repairedStepExplorable(state, broken);
    expect(repaired.explorable).toEqual({ id: 'test.parabola', parameters: { n: 3 } });
    expect(tourExplorableProblems(state, repaired)).toEqual([]);
  });

  it('repairs a step whose explorable is gone by showing none', () => {
    const broken: TourStep = { ...STEP, explorable: { id: 'test.gone', parameters: { a: 1 } } };
    const repaired = repairedStepExplorable(project(), broken);
    expect('explorable' in repaired).toBe(false);
    expect(tourExplorableProblems(project(), repaired)).toEqual([]);
  });

  it('leaves a step that is not broken as it is', () => {
    const fine = withStepParameter(withStepExplorable(STEP, 'test.parabola'), 'n', 4);
    expect(repairedStepExplorable(project(), fine)).toBe(fine);
  });

  it('gives only the values its parameters take, whatever a repair is given', () => {
    const state = project();
    const value = fc.oneof(
      fc.double({ noNaN: false }),
      fc.integer(),
      fc.boolean(),
      fc.string({ maxLength: 10 }),
    );
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom('a', 'n', 'grid', 'mode', 'x'), value), (set) => {
        const step: TourStep = { ...STEP, explorable: { id: 'test.parabola', parameters: set } };
        expect(tourExplorableProblems(state, repairedStepExplorable(state, step))).toEqual([]);
      }),
    );
  });
});

describe('what a person types for a number', () => {
  const [a, n] = PARAMETERS as [ExplorableParameter, ExplorableParameter];

  it('reads a number within its range, with a comma or a point', () => {
    expect(readParameterText(a, '2.5')).toEqual({ ok: true, value: 2.5 });
    expect(readParameterText(a, ' -1,5 ')).toEqual({ ok: true, value: -1.5 });
    expect(readParameterText(n, '7')).toEqual({ ok: true, value: 7 });
  });

  it('refuses what is not one, out of range, or not whole where it must be', () => {
    for (const [parameter, text] of [
      [a, ''],
      [a, 'two'],
      [a, '6'],
      [a, 'Infinity'],
      [n, '2.5'],
      [n, '-1'],
    ] as const) {
      const read = readParameterText(parameter, text);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.problem).toMatch(/takes/);
    }
  });
});

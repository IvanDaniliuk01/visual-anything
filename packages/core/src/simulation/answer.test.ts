import { describe, expect, it } from 'vitest';
import { checkSimulateAnswer } from './answer';
import { QUEUE } from '../test/simulation';
import { SIMULATION_LIMITS } from './limits';

const MARKABLE = new Set(['q1', 'r1', 'e1']);

function check(answer: unknown) {
  return checkSimulateAnswer(QUEUE, answer, MARKABLE);
}

describe('checkSimulateAnswer', () => {
  it('keeps a tick’s values in their declared order, its marks once each, its state and done', () => {
    const checked = check({
      values: { saturated: false, queue: 12, phase: 'calm' },
      marks: ['r1', 'q1', 'r1'],
      state: { queue: 12, waiting: [1, 2] },
      done: 'The queue emptied.',
    });
    expect(checked).toEqual({
      kind: 'tick',
      tick: { values: { queue: 12, phase: 'calm', saturated: false }, marks: ['r1', 'q1'] },
      state: { queue: 12, waiting: [1, 2] },
      stateSize: JSON.stringify({ queue: 12, waiting: [1, 2] }).length,
      done: 'The queue emptied.',
    });
    if (checked.kind === 'tick')
      expect(Object.keys(checked.tick.values)).toEqual(['queue', 'phase', 'saturated']);
  });

  it('lets a tick leave values out, answer no state and say done with true or nothing', () => {
    expect(check({ values: {} })).toEqual({
      kind: 'tick',
      tick: { values: {}, marks: [] },
      state: undefined,
      stateSize: 0,
    });
    expect(check({ values: {}, done: true })).toMatchObject({ kind: 'tick', done: true });
    expect(check({ values: {}, done: false })).not.toHaveProperty('done');
  });

  it('stops at a number past its limits, a string not among its choices, or a number not finite', () => {
    expect(check({ values: { queue: 5001 } })).toEqual({
      kind: 'limit',
      value: 'queue',
      limit: 'max',
      limitValue: 5000,
      got: 5001,
    });
    expect(check({ values: { queue: -1 } })).toEqual({
      kind: 'limit',
      value: 'queue',
      limit: 'min',
      limitValue: 0,
      got: -1,
    });
    expect(check({ values: { queue: Number.POSITIVE_INFINITY } })).toMatchObject({
      kind: 'limit',
      limit: 'finite',
    });
    expect(check({ values: { queue: Number.NaN } })).toMatchObject({
      kind: 'limit',
      limit: 'finite',
    });
    expect(check({ values: { phase: 'frantic' } })).toEqual({
      kind: 'limit',
      value: 'phase',
      limit: 'choices',
      got: 'frantic',
    });
  });

  it('drops what is not a tick, with the reason', () => {
    const reasons = [
      [null, 'it is not an object with its values'],
      [[], 'it is not an object with its values'],
      [{ values: 3 }, 'its values are not an object of values by name'],
      [{ values: {}, extra: 1 }, 'it has "extra", which a tick has not'],
      [{ values: { latency: 3 } }, 'it answers "latency", which the simulation does not declare'],
      [{ values: { queue: '3' } }, 'the value of "queue" is not a number'],
      [{ values: { phase: 3 } }, 'the value of "phase" is not a string'],
      [{ values: { saturated: 1 } }, 'the value of "saturated" is not true or false'],
      [{ values: {}, marks: 'q1' }, 'its marks are not a list of ids'],
      [
        { values: {}, marks: ['elsewhere'] },
        'it marks "elsewhere", which is not the element or around it',
      ],
      [
        { values: {}, done: 3 },
        'its done is not true, false or a sentence of at most 200 characters',
      ],
    ] as const;
    for (const [answer, reason] of reasons)
      expect(check(answer)).toEqual({ kind: 'dropped', reason });
  });

  it('drops states and strings past their caps, and states that are not plain data', () => {
    expect(check({ values: {}, state: 'x'.repeat(SIMULATION_LIMITS.stateText) })).toMatchObject({
      kind: 'dropped',
    });
    expect(check({ values: {}, state: new Map() })).toMatchObject({ kind: 'dropped' });
    expect(check({ values: {}, state: { x: Number.NaN } })).toMatchObject({ kind: 'dropped' });
    expect(check({ values: { phase: 'c'.repeat(201) } })).toMatchObject({ kind: 'dropped' });
    expect(check({ values: {}, marks: Array.from({ length: 65 }, () => 'q1') })).toMatchObject({
      kind: 'dropped',
    });
  });

  it('keeps a copy of the state, sharing nothing with what was answered', () => {
    const state = { list: [1] };
    const checked = check({ values: {}, state });
    state.list.push(2);
    expect(checked).toMatchObject({ state: { list: [1] } });
  });
});

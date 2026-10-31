import { describe, expect, it } from 'vitest';
import { QUEUE } from '../test/simulation';
import { play, stepOf } from '../test/simulation-step';
import { checkSimulateAnswer } from './answer';
import { defaultParameters } from './parameters';
import { SimulationRun, isFailure } from './run';

function runOf(over: Partial<ConstructorParameters<typeof SimulationRun>[0]> = {}): SimulationRun {
  return new SimulationRun({
    element: 'q1',
    hash: 'h',
    parameters: defaultParameters(QUEUE),
    seed: 1,
    ticks: 50,
    ...over,
  });
}

const MARKABLE = new Set(['q1']);
const tick = (values: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  checkSimulateAnswer(QUEUE, { values, ...extra }, MARKABLE);

describe('SimulationRun', () => {
  it('plays its ticks, shows the last one, and stops having played them', () => {
    const run = runOf({ ticks: 3 });
    expect(run.record(0, tick({ queue: 1 }))).toBeUndefined();
    expect(run.record(1, tick({ queue: 2 }))).toBeUndefined();
    expect(run.record(2, tick({ queue: 3 }))).toEqual({ kind: 'ticks', tick: 2 });
    expect(run.length).toBe(3);
    expect(run.shown).toBe(2);
    expect(run.tickAt(1)?.values).toEqual({ queue: 2 });
    expect(() => run.record(3, tick({ queue: 4 }))).toThrow('The run stopped at tick 2.');
  });

  it('keeps the tick that ends the behavior, and says what it said', () => {
    const run = runOf();
    run.record(0, tick({ queue: 0 }, { done: 'Emptied.' }));
    expect(run.stop).toEqual({ kind: 'done', tick: 0, message: 'Emptied.' });
    expect(run.length).toBe(1);
  });

  it('stops cleanly at a limit, keeping the ticks before it and not the one past it', () => {
    const run = runOf();
    run.record(0, tick({ queue: 4000 }));
    const stop = run.record(1, tick({ queue: 6000 }));
    expect(stop).toEqual({
      kind: 'limit',
      tick: 1,
      value: 'queue',
      limit: 'max',
      bound: 5000,
      got: 6000,
    });
    expect(run.length).toBe(1);
    expect(run.shown).toBe(0);
    expect(isFailure(stop!)).toBe(false);
  });

  it('counts only the code’s failures as failures', () => {
    const dropped = runOf();
    expect(dropped.record(0, tick({ latency: 1 }))).toMatchObject({ kind: 'failed', tick: 0 });
    expect(isFailure(dropped.stop!)).toBe(true);
    const slow = runOf();
    expect(slow.fail({ kind: 'time' })).toEqual({
      kind: 'failed',
      tick: 0,
      failure: { kind: 'time' },
    });
    expect(isFailure({ kind: 'full', tick: 3 })).toBe(false);
    expect(isFailure({ kind: 'changed', tick: 3 })).toBe(false);
  });

  it('refuses a tick out of order', () => {
    expect(() => runOf().record(1, tick({}))).toThrow('The run works out tick 0, not 1.');
  });

  it('stops when what it keeps for going back is full', () => {
    const run = runOf({ budget: { keptText: 40 } });
    run.record(0, tick({ queue: 1, phase: 'calm' }));
    expect(run.record(1, tick({ queue: 2, phase: 'calm' }))).toEqual({ kind: 'full', tick: 1 });
    expect(run.keptText).toBeLessThanOrEqual(40);
  });

  it('ends when the model changes, keeping what it held', () => {
    const run = runOf();
    play(QUEUE, run, 5);
    expect(run.modelChanged()).toEqual({ kind: 'changed', tick: 5 });
    expect(run.length).toBe(5);
  });

  it('goes back to any tick it holds, and no further', () => {
    const run = runOf();
    play(QUEUE, run, 10);
    expect(run.goTo(4)).toBe(4);
    expect(run.goTo(99)).toBe(9);
    expect(run.goTo(-3)).toBe(0);
    expect(run.goTo(Number.NaN)).toBe(0);
  });

  it('runs from here: drops the ticks after the one shown, and plays on to the same ticks', () => {
    const whole = runOf();
    play(QUEUE, whole);
    const run = runOf();
    play(QUEUE, run);
    run.goTo(20);
    const resume = run.fromHere();
    expect(resume.tick).toBe(21);
    expect(run.length).toBe(21);
    expect(run.stop).toBeUndefined();
    play(QUEUE, run);
    for (let t = 0; t < whole.length; t++) expect(run.tickAt(t)).toEqual(whole.tickAt(t));
  });

  it('plays as many again after it played its ticks, up to the most a run plays', () => {
    const run = runOf({ ticks: 4 });
    play(QUEUE, run);
    run.more();
    expect(run.ticks).toBe(8);
    expect(run.stop).toBeUndefined();
    play(QUEUE, run);
    expect(run.length).toBe(8);
    expect(runOf({ ticks: 1e9 }).ticks).toBe(10_000);
    expect(runOf({ ticks: 0 }).ticks).toBe(1);
  });

  it('thins its states past their budget, keeping every hundredth and the last', () => {
    const run = runOf({ ticks: 450, budget: { stateKeptText: 2000 } });
    play(QUEUE, run);
    const kept = run.keptStates();
    expect(kept.at(-1)).toBe(449);
    for (const each of kept.slice(0, -1)) expect(each % 100).toBe(0);
    expect(run.resumePoint().tick).toBe(450);
  });

  it('works a past tick out again from the nearest kept state, the same as the first time', () => {
    const run = runOf({ ticks: 450, budget: { stateKeptText: 2000 } });
    play(QUEUE, run);
    run.goTo(250);
    const resume = run.fromHere();
    expect(resume.tick).toBe(201);
    const again = stepOf(QUEUE, run, 201, resume.state);
    expect(again.kind === 'tick' && again.tick).toEqual(run.tickAt(201));
  });
});

/**
 * Property tests of simulation runs (ADR 0085), with a stand-in for package code that draws its
 * chance from the tick's generator: runs repeat; a tick worked out again from a kept state equals
 * the first time, however the run was thinned and wherever it ran from; no run holds a tick past
 * its stop; and a run never keeps more than its budget.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QUEUE } from '../test/simulation';
import { play } from '../test/simulation-step';
import { checkParameters, type RunParameters } from './parameters';
import { SimulationRun, type RunBudget } from './run';

const parameters = fc
  .record({ arrivals: fc.integer({ min: 0, max: 100 }), workers: fc.integer({ min: 1, max: 32 }) })
  .map((chosen) => {
    const checked = checkParameters(QUEUE, chosen);
    if (!checked.ok) throw new Error(checked.reason);
    return checked.value;
  });

const budget: fc.Arbitrary<RunBudget> = fc.record({
  keptText: fc.integer({ min: 200, max: 40_000 }),
  stateKeptText: fc.integer({ min: 50, max: 20_000 }),
  stateEvery: fc.integer({ min: 1, max: 60 }),
});

const start: fc.Arbitrary<Start> = fc.record({
  parameters,
  seed: fc.nat({ max: 0xffff_ffff }),
  ticks: fc.integer({ min: 1, max: 400 }),
  budget,
});

interface Start {
  parameters: RunParameters;
  seed: number;
  ticks: number;
  budget: RunBudget;
}

function runOf(value: Start): SimulationRun {
  return new SimulationRun({ element: 'q1', hash: 'h', ...value });
}

function ticksOf(run: SimulationRun): unknown[] {
  return Array.from({ length: run.length }, (_, tick) => run.tickAt(tick));
}

describe('simulation runs', () => {
  it('repeat: the same parameters, seed and budget give the same ticks and the same stop', () => {
    fc.assert(
      fc.property(start, (value) => {
        const first = runOf(value);
        const second = runOf(value);
        play(QUEUE, first);
        play(QUEUE, second);
        expect(ticksOf(second)).toEqual(ticksOf(first));
        expect(second.stop).toEqual(first.stop);
      }),
      { numRuns: 60 },
    );
  });

  it('work a past tick out again from a kept state the same as the first time', () => {
    fc.assert(
      fc.property(start, fc.array(fc.nat(), { minLength: 1, maxLength: 4 }), (value, shows) => {
        const whole = runOf(value);
        play(QUEUE, whole);
        const run = runOf(value);
        play(QUEUE, run);
        // Run from several past ticks in turn: each time the ticks played again match the first.
        for (const show of shows) {
          if (run.length === 0) break;
          run.goTo(show % run.length);
          run.fromHere();
          play(QUEUE, run, whole.length);
          const held = Math.min(run.length, whole.length);
          for (let tick = 0; tick < held; tick++)
            expect(run.tickAt(tick)).toEqual(whole.tickAt(tick));
        }
      }),
      { numRuns: 60 },
    );
  });

  it('never hold a tick past their stop, and never keep more than their budget', () => {
    fc.assert(
      fc.property(start, (value) => {
        const run = runOf(value);
        play(QUEUE, run);
        const stop = run.stop;
        expect(stop).toBeDefined();
        if (!stop) return;
        const kept = stop.kind === 'done' || stop.kind === 'ticks' ? stop.tick + 1 : stop.tick;
        expect(run.length).toBe(kept);
        expect(run.length).toBeLessThanOrEqual(run.ticks);
        expect(run.keptText).toBeLessThanOrEqual(value.budget.keptText);
        // Once thinned, a run keeps the states of every stateEvery-th tick and of the last alone.
        const states = run.keptStates();
        if (run.length > 0) expect(states.at(-1)).toBe(run.length - 1);
        if (states.length < run.length) {
          for (const each of states.slice(0, -1)) expect(each % value.budget.stateEvery).toBe(0);
        }
      }),
      { numRuns: 80 },
    );
  });
});

import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { definitionsOf } from '../definitions';
import { QUEUE } from '../test/simulation';
import { simulationOf, simulationProblems, ticksOf } from './definition';
import { checkParameters, chosenParameters, defaultParameters } from './parameters';

const QUEUES: PackageFile = {
  id: 'queues',
  name: 'Queues',
  version: '1.0.0',
  components: [
    { id: 'queues.queue', name: 'Work queue', derivesFrom: 'essence', simulation: QUEUE },
    { id: 'queues.inbox', name: 'Inbox', derivesFrom: 'queues.queue' },
    {
      id: 'queues.lane',
      name: 'Lane',
      derivesFrom: 'queues.queue',
      simulation: { parameters: [QUEUE.parameters[0]!], values: [QUEUE.values[0]!] },
    },
    { id: 'queues.plain', name: 'Plain', derivesFrom: 'essence' },
  ],
  relationTypes: [],
};

describe('simulationOf', () => {
  const definitions = definitionsOf([QUEUES]);

  it('reads a component’s own simulation, with the package that declares it', () => {
    expect(simulationOf(definitions, 'queues.queue')).toEqual({
      definition: QUEUE,
      declaredBy: 'queues.queue',
      package: 'queues',
    });
  });

  it('inherits the nearest simulation whole, and a redefinition replaces it whole', () => {
    expect(simulationOf(definitions, 'queues.inbox')?.declaredBy).toBe('queues.queue');
    const lane = simulationOf(definitions, 'queues.lane');
    expect(lane?.declaredBy).toBe('queues.lane');
    expect(lane?.definition.parameters.map((each) => each.name)).toEqual(['arrivals']);
  });

  it('finds none for a component without one, or one no package defines', () => {
    expect(simulationOf(definitions, 'queues.plain')).toBeUndefined();
    expect(simulationOf(definitions, 'nowhere.thing')).toBeUndefined();
  });

  it('plays 100 ticks unless the simulation says', () => {
    expect(ticksOf(QUEUE)).toBe(500);
    expect(ticksOf({ parameters: QUEUE.parameters, values: QUEUE.values })).toBe(100);
  });
});

describe('simulationProblems', () => {
  it('finds none in a sound simulation', () => {
    expect(simulationProblems(QUEUE)).toEqual([]);
  });

  it('finds names declared twice, defaults that do not fit, and parts on the wrong type', () => {
    const problems = simulationProblems({
      parameters: [
        { name: 'rate', type: 'number', default: 200, min: 0, max: 100 },
        { name: 'rate', type: 'boolean', default: 'yes', min: 1 },
        { name: 'mode', type: 'choice', default: 'c' },
        { name: 'flip', type: 'number', default: 1, min: 5, max: 2 },
      ],
      values: [
        { name: 'q', type: 'string', min: 0, unit: 'x' },
        { name: 'q', type: 'number', choices: ['a'] },
      ],
    });
    expect(problems).toEqual([
      'The parameter "rate" is declared twice.',
      'The simulated value "q" is declared twice.',
      'The default of the parameter "rate" is above its highest, 100.',
      'The parameter "rate" has a range or a step, which only a number has.',
      'The default of the parameter "rate" is not true or false.',
      'The parameter "mode" is a choice without its choices.',
      'The default of the parameter "mode" is not one of its choices.',
      'The parameter "flip" has a lowest value above its highest.',
      'The default of the parameter "flip" is below its lowest, 5.',
      'The simulated value "q" has limits, which only a number has.',
      'The simulated value "q" has a unit, which only a number has.',
      'The simulated value "q" has choices, which only a string has.',
    ]);
  });
});

describe('parameters', () => {
  it('start from the defaults', () => {
    expect(defaultParameters(QUEUE)).toEqual({
      arrivals: 10,
      workers: 4,
      bursts: false,
      policy: 'fifo',
    });
    expect(checkParameters(QUEUE, undefined)).toEqual({
      ok: true,
      value: defaultParameters(QUEUE),
    });
  });

  it('take the values chosen in place of the defaults', () => {
    expect(checkParameters(QUEUE, { arrivals: 40, policy: 'priority' })).toEqual({
      ok: true,
      value: { arrivals: 40, workers: 4, bursts: false, policy: 'priority' },
    });
  });

  it('refuse a value out of range, of the wrong type or not declared, never bringing it in range', () => {
    expect(checkParameters(QUEUE, { arrivals: 101 })).toEqual({
      ok: false,
      reason: 'The parameter "arrivals" is above its highest, 100.',
    });
    expect(checkParameters(QUEUE, { workers: 0 })).toEqual({
      ok: false,
      reason: 'The parameter "workers" is below its lowest, 1.',
    });
    expect(checkParameters(QUEUE, { arrivals: Number.NaN })).toEqual({
      ok: false,
      reason: 'The parameter "arrivals" is not a number.',
    });
    expect(checkParameters(QUEUE, { bursts: 'yes' })).toEqual({
      ok: false,
      reason: 'The parameter "bursts" is not true or false.',
    });
    expect(checkParameters(QUEUE, { policy: 'lifo' })).toEqual({
      ok: false,
      reason: 'The parameter "policy" is not one of its choices.',
    });
    expect(checkParameters(QUEUE, { speed: 1 })).toEqual({
      ok: false,
      reason: 'The simulation has no parameter "speed".',
    });
    expect(checkParameters(QUEUE, [1])).toEqual({
      ok: false,
      reason: 'The parameters are not an object of values by name.',
    });
  });

  it('keep only those that differ from their defaults, by name, for a view state', () => {
    const value = { arrivals: 40, workers: 4, bursts: true, policy: 'fifo' };
    const chosen = chosenParameters(QUEUE, value);
    expect(chosen).toEqual({ arrivals: 40, bursts: true });
    expect(Object.keys(chosen)).toEqual(['arrivals', 'bursts']);
  });
});

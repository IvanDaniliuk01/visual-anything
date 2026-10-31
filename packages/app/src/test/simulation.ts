/**
 * A simulating project for the app's tests (ADR 0085): the core's test project, its services
 * simulating a queue under load whose latency is also an attribute of theirs, and the stand-in for
 * the code worker answering its ticks.
 */
import {
  definitionsIn,
  simulationOf,
  type ComponentSimulation,
  type ProjectSnapshot,
  type SimulateInput,
} from '@visual-anything/core';
import type { SimulationDefinition } from '@visual-anything/schema';
import { testProject } from '../../../core/src/test/fixtures';
import { StandInSimulation, type StandInOptions, type StandInTick } from '../simulation/stand-in';
import { SimulationStore } from '../simulation/store';

/** A queue under load: its length, with its limit, and the latency it gives, an attribute too. */
export const LOAD: SimulationDefinition = {
  description: 'A queue under load.',
  parameters: [
    { name: 'arrivals', type: 'number', default: 6, min: 0, max: 20, step: 1, unit: 'items/s' },
    { name: 'workers', type: 'number', default: 4, min: 1, max: 8, step: 1 },
    { name: 'bursts', type: 'boolean', default: false },
    { name: 'policy', type: 'choice', default: 'fifo', choices: ['fifo', 'priority'] },
  ],
  values: [
    { name: 'queue', type: 'number', min: 0, max: 50, unit: 'items' },
    { name: 'latency', type: 'number', min: 0, unit: 'ms' },
    { name: 'phase', type: 'string', choices: ['calm', 'busy'] },
  ],
  tick: { length: 2, unit: 's' },
  ticks: 20,
};

/** The core's test project, its services simulating `LOAD`. */
export function simulatingProject(): ProjectSnapshot {
  const state = testProject();
  state.packages = state.packages.map((pkg) => ({
    ...pkg,
    components: pkg.components.map((each) =>
      each.id === 'test.service' ? { ...each, simulation: LOAD } : each,
    ),
  }));
  return state;
}

/**
 * The queue grows by the arrivals past what the workers take, each tick, without chance; its
 * latency follows it. Even ticks mark the API and its read of the database.
 */
export const LOAD_TICK: StandInTick = (input: SimulateInput) => {
  const { parameters, state, tick } = input.context;
  const before = typeof state === 'number' ? state : 0;
  const queue = Math.max(
    0,
    before + (parameters.arrivals as number) - (parameters.workers as number),
  );
  return {
    values: { queue, latency: 20 + queue * 10, phase: queue > 10 ? 'busy' : 'calm' },
    state: queue,
    marks: tick % 2 === 0 ? ['api', 'api-reads-db'] : [],
  };
};

/** A store over the stand-in, with the project and the services' simulation. */
export function simulationHarness(tickOf: StandInTick = LOAD_TICK, options?: StandInOptions) {
  const project = simulatingProject();
  const worker = new StandInSimulation(project, tickOf, options);
  const store = new SimulationStore(worker);
  const simulation = simulationOf(definitionsIn(project), 'test.service') as ComponentSimulation;
  return { project, worker, store, simulation };
}

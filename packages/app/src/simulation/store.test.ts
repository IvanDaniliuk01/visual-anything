/**
 * The tab's simulation runs (ADR 0085), against the stand-in for the code worker: opening a run,
 * playing it at a speed, going back, changing parameters and the seed, running from here, the stops,
 * and what a view state carries.
 */
import {
  definitionsIn,
  simulationOf,
  type ComponentSimulation,
  type ProjectSnapshot,
  type SimulateInput,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { testProject } from '../../../core/src/test/fixtures';
import { QUEUE } from '../../../core/src/test/simulation';
import { StandInSimulation, type StandInStep } from './stand-in';
import { SimulationStore } from './store';

/** The test project, its services simulating a work queue. */
function project(): ProjectSnapshot {
  const state = testProject();
  state.packages = state.packages.map((pkg) => ({
    ...pkg,
    components: pkg.components.map((each) =>
      each.id === 'test.service' ? { ...each, simulation: QUEUE } : each,
    ),
  }));
  return state;
}

/** A queue: arrivals drawn from the tick's generator, workers' work out, the queue between. */
const queue: StandInStep = (input: SimulateInput, random) => {
  const { parameters, state, tick } = input.context;
  const before = typeof state === 'number' ? state : 0;
  const arrivals = Math.floor(random() * (parameters.arrivals as number) * 2);
  const next = Math.max(0, before + arrivals - (parameters.workers as number) * 2);
  return { values: { queue: next }, state: next, marks: tick % 2 === 0 ? ['api-reads-db'] : [] };
};

function setUp(
  step: StandInStep = queue,
  options?: ConstructorParameters<typeof StandInSimulation>[2],
) {
  const state = project();
  const worker = new StandInSimulation(state, step, options);
  const store = new SimulationStore(worker);
  const simulation = simulationOf(definitionsIn(state), 'test.service') as ComponentSimulation;
  return { state, worker, store, simulation };
}

function queueAt(store: SimulationStore, tick?: number): unknown {
  const shown = store.get('api');
  return shown?.ticks[tick ?? shown.shown]?.values.queue;
}

describe('SimulationStore', () => {
  it('opens a run paused at tick 0, with its defaults, once the worker answers it', () => {
    const { worker, store, simulation } = setUp();
    expect(store.open('api', simulation)).toEqual({ ok: true });
    worker.work();
    const shown = store.get('api');
    expect(shown).toMatchObject({ playing: false, shown: 0, seed: 1, planned: 500 });
    expect(shown?.parameters).toEqual({ arrivals: 10, workers: 4, bursts: false, policy: 'fifo' });
    expect(shown?.ticks.length).toBe(1);
    expect(store.simulated().get('api')?.get('queue')).toEqual({
      value: queueAt(store),
      package: 'test',
    });
    expect(store.marks().get('api')).toEqual(['api-reads-db']);
  });

  it('refuses parameters its simulation refuses, opening nothing', () => {
    const { store, simulation } = setUp();
    expect(store.open('api', simulation, { parameters: { arrivals: 1000 } })).toEqual({
      ok: false,
      reason: 'The parameter "arrivals" is above its highest, 100.',
    });
    expect(store.get('api')).toBeUndefined();
  });

  it('plays at its speed, frame by frame, keeping the fraction of a tick', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation);
    worker.work();
    store.play('api', 20);
    worker.work();
    store.frame(1000);
    expect(store.get('api')?.shown).toBe(0);
    store.frame(1025);
    expect(store.get('api')?.shown).toBe(0);
    store.frame(1050);
    expect(store.get('api')?.shown).toBe(1);
    store.frame(1500);
    expect(store.get('api')?.shown).toBe(10);
    store.pause('api');
    store.frame(3000);
    expect(store.get('api')?.shown).toBe(10);
  });

  it('asks the worker for more ahead while it plays, never more than its ticks', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation);
    store.play('api', 60);
    worker.work();
    const held = store.get('api')?.ticks.length ?? 0;
    expect(held).toBeGreaterThan(100);
    expect(held).toBeLessThanOrEqual(500);
    store.play('api', 'max');
    worker.work();
    store.frame(0);
    expect(store.get('api')?.ticks.length).toBe(500);
    expect(store.get('api')?.shown).toBe(499);
    expect(store.get('api')?.stop).toEqual({ kind: 'ticks', tick: 499 });
    expect(store.playing).toBe(false);
  });

  it('plays as many again once it played its ticks', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation);
    store.play('api', 'max');
    worker.work();
    store.frame(0);
    store.play('api', 'max');
    worker.work();
    store.frame(1);
    expect(store.get('api')).toMatchObject({ planned: 1000, shown: 999 });
  });

  it('goes back and forward through the ticks it holds, and works the next one out', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation);
    store.play('api', 'max');
    worker.work();
    store.frame(0);
    store.goTo('api', 40);
    expect(store.get('api')).toMatchObject({ shown: 40, playing: false });
    store.back('api');
    expect(store.get('api')?.shown).toBe(39);
    store.forward('api');
    expect(store.get('api')?.shown).toBe(40);
  });

  it('works the next tick out when stepping forward past what it holds', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation);
    worker.work();
    store.forward('api');
    worker.work();
    expect(store.get('api')?.shown).toBe(1);
  });

  it('changing a parameter plays the run again up to the tick shown, the same moment under new values', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation);
    store.play('api', 'max');
    worker.work();
    store.frame(0);
    store.goTo('api', 30);
    expect(store.setParameters('api', { workers: 1 })).toEqual({ ok: true });
    worker.work();
    expect(store.get('api')?.shown).toBe(30);
    expect(store.get('api')?.parameters.workers).toBe(1);
    // The same run, opened afresh with those parameters, shows the same at that tick.
    const fresh = setUp();
    fresh.store.open('api', fresh.simulation, { parameters: { workers: 1 }, tick: 30 });
    fresh.worker.work();
    expect(queueAt(fresh.store)).toBe(queueAt(store));
    expect(store.setParameters('api', { workers: 99 })).toMatchObject({ ok: false });
  });

  it('repeats: the same seed gives the same ticks, another seed others', () => {
    const one = setUp();
    one.store.open('api', one.simulation, { seed: 9, tick: 60 });
    one.worker.work();
    const two = setUp();
    two.store.open('api', two.simulation, { seed: 9, tick: 60 });
    two.worker.work();
    expect(two.store.get('api')?.ticks).toEqual(one.store.get('api')?.ticks);
    one.store.setSeed('api', 10);
    one.worker.work();
    expect(one.store.get('api')?.shown).toBe(60);
    expect(one.store.get('api')?.ticks).not.toEqual(two.store.get('api')?.ticks);
  });

  it('runs from here: drops the ticks after the one shown, and plays on to the same ticks', () => {
    const { worker, store, simulation } = setUp(queue, { sliceTicks: 7 });
    store.open('api', simulation);
    store.play('api', 'max');
    worker.work();
    store.frame(0);
    const before = store.get('api')?.ticks;
    store.goTo('api', 120);
    store.fromHere('api');
    expect(store.get('api')?.ticks.length).toBe(121);
    worker.work();
    store.frame(1);
    expect(store.get('api')?.ticks).toEqual(before);
  });

  it('stops cleanly past a limit, keeping the ticks before it, and says why', () => {
    const flood: StandInStep = ({ context }) => ({ values: { queue: context.tick * 1000 } });
    const { worker, store, simulation } = setUp(flood);
    store.open('api', simulation);
    store.play('api', 'max');
    worker.work();
    store.frame(0);
    expect(store.get('api')).toMatchObject({
      shown: 5,
      playing: false,
      stop: { kind: 'limit', tick: 6, value: 'queue', limit: 'max', bound: 5000, got: 6000 },
    });
    expect(store.get('api')?.ticks.length).toBe(6);
    expect(worker.failures).toEqual([]);
  });

  it('stops when the code fails, counting the failure', () => {
    const failing: StandInStep = ({ context }) => {
      if (context.tick === 3) throw new Error('boom');
      return { values: { queue: 1 } };
    };
    const { worker, store, simulation } = setUp(failing);
    store.open('api', simulation);
    store.play('api', 'max');
    worker.work();
    store.frame(0);
    expect(store.get('api')?.stop).toMatchObject({ kind: 'failed', tick: 3 });
    expect(worker.failures).toHaveLength(1);
  });

  it('ends a run when the element or what lies around it changes', () => {
    const { state, worker, store, simulation } = setUp();
    store.open('api', simulation);
    worker.work();
    const edited = {
      ...state,
      model: {
        ...state.model,
        elements: state.model.elements.map((each) =>
          each.id === 'api' ? { ...each, name: 'Gateway' } : each,
        ),
      },
    };
    worker.refresh(edited);
    expect(store.get('api')?.stop).toEqual({ kind: 'changed', tick: 1 });
  });

  it('says why it cannot run: no worker, code not approved, or nothing to simulate', () => {
    const none = setUp(queue, { running: false });
    none.store.open('api', none.simulation);
    expect(none.store.get('api')?.unavailable).toBe('not-approved');
    const off = setUp(queue, { unavailable: { test: 'off' } });
    off.store.open('api', off.simulation);
    expect(off.store.get('api')?.unavailable).toBe('off');
    const db = setUp();
    db.store.open('db', db.simulation);
    expect(db.store.get('db')?.unavailable).toBe('no-simulation');
  });

  it('starts its runs again when the worker restarts, showing the same tick', () => {
    const { state, worker, store, simulation } = setUp();
    store.open('api', simulation, { tick: 25 });
    worker.work();
    const before = store.get('api')?.ticks[25];
    worker.restart(state);
    worker.work();
    expect(store.get('api')?.shown).toBe(25);
    expect(store.get('api')?.ticks[25]).toEqual(before);
  });

  it('says what a view state carries: the parameters chosen, the seed and the tick shown', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation, { parameters: { arrivals: 40 }, seed: 3, tick: 12 });
    worker.work();
    expect(store.saved('api')).toEqual({
      element: 'api',
      parameters: { arrivals: 40 },
      seed: 3,
      tick: 12,
    });
    store.reset('api');
    worker.work();
    expect(store.saved('api')).toEqual({ element: 'api', parameters: { arrivals: 40 }, seed: 3 });
  });

  it('closes a run, and the worker forgets it', () => {
    const { worker, store, simulation } = setUp();
    store.open('api', simulation);
    worker.work();
    // Read before it closes, as the canvas reads them, they are not kept after.
    expect(store.simulated().size).toBe(1);
    expect(store.marks().size).toBe(1);
    store.close('api');
    expect(store.get('api')).toBeUndefined();
    expect(worker.driver.elements()).toEqual([]);
    expect(store.simulated().size).toBe(0);
    expect(store.marks().size).toBe(0);
  });

  it('keeps the values of a run whose tick shown stayed, while another moves', () => {
    // The client has no read of the database to mark.
    const { worker, store, simulation } = setUp((input, random) => ({
      ...(queue(input, random) as object),
      marks: [],
    }));
    store.open('api', simulation);
    store.open('client', simulation);
    worker.work();
    const before = store.simulated();
    store.forward('client');
    worker.work();
    const after = store.simulated();
    expect(after).not.toBe(before);
    expect(after.get('api')).toBe(before.get('api'));
    expect(after.get('client')).not.toBe(before.get('client'));
  });
});

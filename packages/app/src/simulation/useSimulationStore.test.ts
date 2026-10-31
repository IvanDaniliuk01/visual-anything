/**
 * The tab's simulation store as the shell keeps it (ADR 0085): it plays one frame at a time only
 * while a run plays, closes the runs of deleted elements, opens a redefined one again, opens again
 * what could not run once its code is approved, and keeps hearing a host lent again.
 */
import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { CodeStore, type PackageCodeView } from '../code/context';
import { LOAD, simulationHarness } from '../test/simulation';
import { LentSimulationPort } from './port';
import { SimulationStore } from './store';
import { keepInStep, openAgainWhenStanding, playFrames, type Frames } from './useSimulationStore';

/** Frames played by hand. */
function handFrames() {
  const waiting = new Map<number, (now: number) => void>();
  let next = 1;
  const frames: Frames = {
    request: (callback) => {
      waiting.set(next, callback);
      return next++;
    },
    cancel: (handle) => {
      waiting.delete(handle);
    },
  };
  return {
    frames,
    get waiting() {
      return waiting.size;
    },
    play(now: number) {
      const callbacks = [...waiting.values()];
      waiting.clear();
      for (const callback of callbacks) callback(now);
    },
  };
}

describe('playing frames', () => {
  it('asks for frames only while a run plays, and moves the run on in each', () => {
    const { worker, store, simulation } = simulationHarness();
    const hand = handFrames();
    const stop = playFrames(store, hand.frames);
    store.open('api', simulation);
    worker.work();
    expect(hand.waiting).toBe(0);
    store.play('api', 20);
    worker.work();
    expect(hand.waiting).toBe(1);
    hand.play(1000);
    hand.play(1100);
    worker.work();
    expect(store.get('api')?.shown).toBe(2);
    store.pause('api');
    hand.play(1200);
    expect(hand.waiting).toBe(0);
    stop();
  });

  it('stops asking once taken away', () => {
    const { worker, store, simulation } = simulationHarness();
    const hand = handFrames();
    const stop = playFrames(store, hand.frames);
    store.open('api', simulation);
    worker.work();
    store.play('api');
    stop();
    expect(hand.waiting).toBe(0);
  });
});

describe('keeping runs in step with the project', () => {
  it('closes the run of an element deleted, and of one that simulates nothing now', () => {
    const { project, worker, store, simulation } = simulationHarness();
    store.open('api', simulation);
    store.open('client', simulation);
    worker.work();
    const without: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements
          .filter((each) => each.id !== 'api')
          .map((each) => (each.id === 'client' ? { ...each, component: 'test.box' } : each)),
      },
    };
    keepInStep(store, without, definitionsIn(without));
    expect(store.list()).toEqual([]);
    expect(worker.requests.filter((each) => each.kind === 'simulation/close')).toHaveLength(2);
  });

  it('opens a redefined simulation again, with what it chose when the new one takes it', () => {
    const { project, worker, store, simulation } = simulationHarness();
    store.open('api', simulation, { parameters: { arrivals: 9 }, seed: 3, tick: 2 });
    worker.work();
    const redefined: ProjectSnapshot = {
      ...project,
      packages: project.packages.map((pkg) => ({
        ...pkg,
        components: pkg.components.map((each) =>
          each.id === 'test.service' ? { ...each, simulation: { ...LOAD, ticks: 40 } } : each,
        ),
      })),
    };
    keepInStep(store, redefined, definitionsIn(redefined));
    worker.work();
    expect(store.get('api')).toMatchObject({ seed: 3, shown: 2, planned: 40 });
    expect(store.get('api')?.parameters.arrivals).toBe(9);
  });
});

describe('opening again what could not run', () => {
  it('opens a run again once its package’s code stands otherwise, and not before', () => {
    const { worker, store, simulation } = simulationHarness(undefined, { running: false });
    const code = new CodeStore();
    code.set({
      packages: packagesStanding('unapproved'),
      elements: new Map(),
      drawings: new Map(),
    });
    const stop = openAgainWhenStanding(store, code);
    store.open('api', simulation, { tick: 3 });
    expect(store.get('api')?.unavailable).toBe('not-approved');
    worker.running = true;
    // Its code stands as it stood: nothing opens again.
    code.set({
      packages: packagesStanding('unapproved'),
      elements: new Map(),
      drawings: new Map(),
    });
    expect(store.get('api')?.unavailable).toBe('not-approved');
    // The person approves the code: the run opens again, at the tick it was to show.
    code.set({ packages: packagesStanding('approved'), elements: new Map(), drawings: new Map() });
    worker.work();
    expect(store.get('api')?.unavailable).toBeUndefined();
    expect(store.get('api')?.shown).toBe(3);
    stop();
  });
});

describe('the port lent to the store', () => {
  it('hears the host lent, and none once it is taken back', () => {
    const { worker, simulation } = simulationHarness();
    const port = new LentSimulationPort();
    const store = new SimulationStore(port);
    const back = port.lend(worker);
    store.open('api', simulation);
    worker.work();
    expect(store.get('api')?.ticks.length).toBe(1);
    back();
    expect(port.simulate({ kind: 'simulation/close', element: 'api' })).toBe(false);
    // Lent again, as StrictMode mounts the shell's effects twice, it hears the host again.
    port.lend(worker);
    store.reset('api');
    worker.work();
    expect(store.get('api')?.ticks.length).toBe(1);
  });
});

function packagesStanding(state: 'approved' | 'unapproved'): Map<string, PackageCodeView> {
  const view = {
    code: { package: 'test', name: 'Test' },
    status: state === 'approved' ? { state, granted: [] } : { state },
  } as unknown as PackageCodeView;
  return new Map([['test', view]]);
}

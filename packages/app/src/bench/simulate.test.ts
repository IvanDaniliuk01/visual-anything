/**
 * The simulation benchmark's own pieces (`?simulate`, M12): its project, whose 100 simulating
 * elements' overlay reads their simulated values; its package code, which runs in the sandbox as the
 * plain function the driver in the page calls; and every phase, briefly, in both modes, on a canvas in
 * jsdom with the driver in the page, which shows that they run and report, not how fast, which the
 * benchmark's page measures in a browser with the code worker.
 */
import {
  SIMULATION_LIMITS,
  checkSimulateAnswer,
  codeHash,
  definitionsIn,
  hookInputOf,
  markableOf,
  simulateInputAt,
  simulationOf,
  tickRandom,
  type HookInput,
} from '@visual-anything/core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import { loadNodeEngine } from '../code/engine-node';
import { CodeSandbox } from '../code/sandbox';
import { NO_LIVE_VALUES } from '../live-values/book';
import { liveSceneOf } from '../live-values/details';
import { AttributeLookup } from '../live-values/lookup';
import { t } from '../i18n';
import { SimulationStore } from '../simulation/store';
import { benchCanvas } from '../test/benchCanvas';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import type { BenchMode } from './frames';
import {
  InPageSimulation,
  RoutedSimulationPort,
  TICK_SHOWN_MARK,
  measureSimulate,
  type SimulateBench,
  type SimulatePlan,
} from './simulate';
import {
  BENCH_CODE,
  LOAD_FILL,
  SIMULATED_COMPONENT,
  SIMULATED_VALUE,
  SIMULATE_PACKAGE,
  SIMULATING,
  approvedBenchPackage,
  benchTick,
  syntheticSimulations,
} from './simulateProject';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
});

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Waits for the driver in the page to work its slices. */
const settle = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe('the simulation benchmark’s project', () => {
  const made = syntheticSimulations({ elements: 10_000 });
  const { project } = made;
  const definitions = definitionsIn(project);

  it('has 100 of 10,000 elements simulating, spread over the view, each with a line to mark', () => {
    expect(project.model.elements).toHaveLength(10_000);
    expect(made.simulating).toHaveLength(SIMULATING);
    expect(new Set(made.simulating).size).toBe(SIMULATING);
    const simulating = project.model.elements.filter(
      (element) => element.component === SIMULATED_COMPONENT,
    );
    expect(simulating.map((element) => element.id)).toEqual(made.simulating);
    // Spread over the view: from its first systems to its last.
    const systems = new Set(made.simulating.map((id) => id.split('-')[1]));
    expect(systems.size).toBeGreaterThan(50);
    const simulation = simulationOf(definitions, SIMULATED_COMPONENT);
    expect(simulation?.package).toBe(SIMULATE_PACKAGE);
    for (const id of made.simulating) {
      const input = hookInputOf(project, id) as HookInput;
      const lines = input.context.relations.filter(
        (each) => each.relationType !== 'systems.is-part-of',
      );
      expect(lines.length, id).toBeGreaterThan(0);
    }
  });

  it('colors shapes by an overlay whose attribute is a simulated value the component defines', () => {
    const view = project.views.find((each) => each.id === made.view);
    expect(view?.overlays).toEqual([LOAD_FILL]);
    expect(LOAD_FILL.attribute).toBe(SIMULATED_VALUE);
    const simulation = simulationOf(definitions, SIMULATED_COMPONENT);
    expect(simulation?.definition.values.map((each) => each.name)).toContain(SIMULATED_VALUE);
    expect(
      definitions
        .component(SIMULATED_COMPONENT)
        ?.attributes.some((each) => each.name === SIMULATED_VALUE),
    ).toBe(true);
  });

  it('approves its package by the hash of its code, which the sandbox runs as the plain function does', () => {
    const approved = approvedBenchPackage(project);
    expect(approved.hash).toBe(codeHash(approved.code.split('\n'), approved.declared));
    expect(approved.granted).toEqual([]);
    const sandbox = new CodeSandbox(engine, { callMs: 250 });
    const loaded = sandbox.load({
      package: SIMULATE_PACKAGE,
      code: BENCH_CODE.join('\n'),
      granted: [],
    });
    expect(loaded).toMatchObject({ ok: true, hooks: ['simulate'] });
    const definition = simulationOf(definitions, SIMULATED_COMPONENT)?.definition;
    if (!definition) throw new Error('No simulation.');
    const element = made.simulating[3] as string;
    const base = hookInputOf(project, element) as HookInput;
    const markable = markableOf(base, project);
    let state: unknown;
    const marked = new Set<string>();
    try {
      for (let tick = 0; tick < 40; tick++) {
        const input = simulateInputAt(base, {
          parameters: { start: 500, swing: 120 },
          state: state as never,
          tick,
          tickLength: { length: 1, unit: 's' },
        });
        const outcome = sandbox.simulate(SIMULATE_PACKAGE, input, 9, tick);
        if (!outcome.ok) throw new Error(JSON.stringify(outcome.failure));
        expect(outcome.answer).toEqual(benchTick(input, tickRandom(9, tick)));
        const checked = checkSimulateAnswer(definition, outcome.answer, markable);
        expect(checked.kind, `tick ${tick}`).toBe('tick');
        if (checked.kind !== 'tick') break;
        for (const id of checked.tick.marks) marked.add(id);
        state = checked.state;
      }
    } finally {
      sandbox.dispose();
    }
    // The element and a relation drawn as a line, every tick.
    expect(marked.has(element)).toBe(true);
    expect(marked.size).toBeGreaterThan(1);
  });

  it('reads each run’s simulated load in the overlay, on the canvas’s scene', async () => {
    const small = syntheticSimulations({ elements: 1_000, simulating: 16 });
    const smallDefinitions = definitionsIn(small.project);
    const simulation = simulationOf(smallDefinitions, SIMULATED_COMPONENT);
    if (!simulation) throw new Error('No simulation.');
    const port = new RoutedSimulationPort([new InPageSimulation(small.project)]);
    const store = new SimulationStore(port);
    for (const [at, element] of small.simulating.entries()) {
      store.open(element, simulation, { seed: at + 1 });
      store.play(element, 'max');
    }
    await settle(50);
    store.frame(performance.now());
    const base = buildScene(small.project, small.view);
    const lookup = new AttributeLookup(NO_LIVE_VALUES, undefined, store.simulated());
    const drawn = indexScene(liveSceneOf(base, small.project, smallDefinitions, lookup, t)).scene;
    const fillOf = (scene: typeof base, id: string) =>
      scene.shapes.find((shape) => shape.element === id)?.fill;
    const changed = small.simulating.filter((id) => fillOf(drawn, id) !== fillOf(base, id)).length;
    // Stored, every load is 0; simulated, it wanders from 500.
    expect(changed).toBeGreaterThan(small.simulating.length / 2);
    for (const id of small.simulating) {
      expect(port.received.get(id)?.length ?? 0, id).toBeGreaterThan(0);
    }
    store.closeAll();
  });
});

/** A few frames of each phase, and short rests. */
const PLAN: SimulatePlan = { still: 4, pan: 4, single: 4, rest: 0, wait: 5_000 };

describe('the simulation benchmark', () => {
  it.each<BenchMode>(['work', 'frames'])(
    'runs every phase in %s mode, saying it measured with the driver in the page, and reports them',
    async (mode) => {
      const made = syntheticSimulations({ elements: 1_000 });
      const { bench: canvas } = await benchCanvas(made.project, made.view, mode);
      const kinds: string[] = [];
      const bench: SimulateBench = {
        ...canvas,
        mode,
        simulating: made.simulating,
        engines: (kind, count) => {
          kinds.push(`${kind} ${count}`);
          if (kind === 'worker') return undefined;
          const ports = Array.from({ length: count }, () => new InPageSimulation(made.project));
          return { ports, dispose: () => ports.forEach((port) => port.dispose()) };
        },
      };
      const results = await measureSimulate(bench, PLAN);

      const engines = Math.ceil(SIMULATING / SIMULATION_LIMITS.runsAtOnce);
      expect(kinds).toEqual([`worker ${engines}`, `in-page ${engines}`]);
      expect(results.record).toMatchObject({ engine: 'in-page driver', engines, runs: SIMULATING });
      expect(results.phases.map((phase) => phase.name)).toEqual([
        '100 runs open, paused: pan, whole view',
        '100 runs at 60 ticks a second: still, whole view',
        '100 runs at 60 ticks a second: pan, whole view',
        '100 runs at 60 ticks a second: pan, names shown',
        '100 runs at as fast as it goes: still, whole view',
        '100 runs at as fast as it goes: pan, whole view',
        '100 runs at as fast as it goes: pan, names shown',
        '16 runs in one driver in the page at 60 ticks a second: still, whole view',
        '16 runs in one driver in the page at as fast as it goes: still, whole view',
      ]);
      for (const phase of results.phases) {
        expect(phase.frames.length, phase.name).toBeGreaterThan(0);
      }
      expect(results.timed.map((each) => [each.name, each.mark])).toEqual([
        [
          'A tick at 60 ticks a second, from the store receiving it to the canvas drawing it',
          TICK_SHOWN_MARK,
        ],
        [
          'A tick at as fast as it goes, from the store receiving it to the canvas drawing it',
          TICK_SHOWN_MARK,
        ],
      ]);
      expect(results.record.rates.map((each) => [each.runs, each.engines, each.speed])).toEqual([
        [SIMULATING, engines, 60],
        [SIMULATING, engines, 'max'],
        [SIMULATION_LIMITS.runsAtOnce, 1, 60],
        [SIMULATION_LIMITS.runsAtOnce, 1, 'max'],
      ]);
      // As fast as it goes, the runs went on.
      expect(results.record.rates[1]?.rates.p50).toBeGreaterThan(0);
      expect(results.notes[0]).toMatch(/could not start the code worker/);
      expect(results.notes.some((note) => note.startsWith('100 runs at once, 7 drivers'))).toBe(
        true,
      );
      expect(results.notes.some((note) => note.startsWith('The page’s own work'))).toBe(true);
    },
    120_000,
  );
});

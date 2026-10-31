/**
 * The phases of the simulation benchmark (`?simulate`, M12's "Done when", ADR 0085), on the project
 * `simulateProject.ts` makes: 100 elements simulating at once on the 10,000-element view, the view's
 * overlay reading each one's simulated `load`. The shell's React is not mounted: the page does what
 * the shell does for a run, frame by frame, with the app's own pieces:
 *
 * - the tab's `SimulationStore`, which plays the ticks held at the speed chosen, `frame` called once
 *   a frame, as `playFrames` calls it;
 * - the attribute lookup of each moment over `store.simulated()`, and the canvas's scene with its
 *   values in the overlay (`liveSceneOf`), indexed and handed to the canvas whenever a tick shown
 *   changes, as `useLookup` and `useLiveScene` make them;
 * - a tick's marks, set by `SimulationMarks` as the emphasis store's `simulation` source, which the
 *   canvas draws as highlighted shapes and travelling markers.
 *
 * Ticks are worked out by the real code worker, its package's code approved by its hash, when the
 * page can start it; otherwise by the worker's `SimulationDriver` in the page, which the notes say.
 * A tab runs at most `SIMULATION_LIMITS.runsAtOnce` (16) runs at once, which each driver keeps, so
 * the 100 runs are shared among as many code workers as that takes, 7, each with its own driver: the
 * canvas's side, one store holding every run, is what the app's would be. One worker with 16 runs, as
 * many as the app plays, is measured after them.
 *
 * Measured, at 60 ticks a second and then as fast as it goes (`max`):
 * - the canvas's frames while every run plays, the camera still, then panning at the whole view and
 *   where names show, judged by the 10,000-element marks (work mode times each frame's work, GPU
 *   included; frames mode times frames as shown);
 * - how long a tick takes from the store receiving it to the canvas drawing it, against two frames:
 *   from when it came, or from the start of the frame before the one that showed it if it came
 *   earlier, since a tick held ahead cannot show before it falls due, to the end of the frame that
 *   drew it;
 * - how many ticks a second each run reaches on the canvas: the median, the 95th percentile and the
 *   slowest of the 100.
 */
import {
  SIMULATION_LIMITS,
  definitionsIn,
  simulationOf,
  tickRandom,
  type CodeFailure,
  type ProjectSnapshot,
  type SimulateInput,
  type SimulationSpeed,
  type SimulationStop,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { panBy } from '../canvas/camera';
import { indexScene } from '../canvas/hit';
import { NAMES_FROM } from '../canvas/renderer';
import { buildScene, type Scene } from '../canvas/scene';
import { EmphasisStore } from '../editor/emphasis';
import { t } from '../i18n';
import { NO_LIVE_VALUES } from '../live-values/book';
import { liveSceneOf } from '../live-values/details';
import { AttributeLookup } from '../live-values/lookup';
import { SimulationDriver } from '../simulation/driver';
import { SimulationMarks } from '../simulation/marks';
import type { SimulationReply, SimulationRequest } from '../simulation/messages';
import { SimulationStore, type SimulationPort } from '../simulation/store';
import type { Frames } from '../simulation/useSimulationStore';
import type { BeyondBench } from './beyond';
import type { BenchMode } from './frames';
import type { FramePhase, TimedAction } from './overlays';
import { percentile } from './report';
import { SIMULATED_COMPONENT, benchTick } from './simulateProject';

/** What works ticks out: code workers, or drivers in the page. */
export type EngineKind = 'worker' | 'in-page';

/** The ports runs are shared among, each holding at most `SIMULATION_LIMITS.runsAtOnce` runs. */
export interface SimulationEngines {
  ports: SimulationPort[];
  dispose(): void;
}

/** What the phases need of the benchmark's page. */
export interface SimulateBench extends BeyondBench {
  mode: BenchMode;
  /** The elements that simulate, spread over the view. */
  simulating: readonly Id[];
  /** Starts `count` engines of a kind; none when the page cannot start them. */
  engines(kind: EngineKind, count: number): SimulationEngines | undefined;
  /**
   * How a tick's marks show: markers travelling, as by default; standing still at their ends, as
   * under reduced motion; or no marks at all. The last two tell the marks' cost apart.
   */
  marks?: MarksShown;
}

/** How a tick's marks show on the canvas while the benchmark runs. */
export type MarksShown = 'travel' | 'still' | 'none';

/** How much of each phase runs: the benchmark's, or a few steps in a test. */
export interface SimulatePlan {
  /** Frames with the camera still, and of each pan. */
  still: number;
  pan: number;
  /** Frames of each phase of one worker with 16 runs. */
  single: number;
  /** How long to wait between phases, and for every run's first tick at most, in milliseconds. */
  rest: number;
  wait: number;
}

export const SIMULATE_PLAN: SimulatePlan = {
  still: 300,
  pan: 180,
  single: 300,
  rest: 400,
  wait: 30_000,
};

/** A tick shows within two frames of its answer (M12's "Done when"). */
export const TICK_SHOWN_MARK = 2000 / 60;

/** The speeds measured: 60 ticks a second, then as fast as it goes. */
export const SPEEDS: readonly SimulationSpeed[] = [60, 'max'];

export interface SimulateResults {
  phases: FramePhase[];
  timed: TimedAction[];
  latency: number[];
  notes: string[];
  /** What worked ticks out, and how many runs each speed reached a second, for the console's record. */
  record: SimulateRecord;
}

export interface SimulateRecord {
  engine: 'code worker' | 'in-page driver';
  engines: number;
  runs: number;
  marks: MarksShown;
  rates: { runs: number; engines: number; speed: SimulationSpeed; rates: RateSummary }[];
}

export interface RateSummary {
  p50: number;
  p95: number;
  slowest: number;
  fastest: number;
  /** Runs that stopped while measured. */
  stopped: number;
  /** Why they stopped: each kind of stop, and how many runs it stopped, with the first's reason. */
  stops: Record<string, number>;
  reasons: string[];
  /** The share of the frames a playing run was shown in that it waited on the worker's next tick. */
  waited: number;
}

/** Ticks a second at a speed, and its name in the rows. */
function speedName(speed: SimulationSpeed): string {
  return speed === 'max' ? 'as fast as it goes' : `${speed} ticks a second`;
}

/**
 * Hears every port and tells the store, routing each run's requests to the port it was given; and
 * keeps when each tick of each run reached the page.
 */
export class RoutedSimulationPort implements SimulationPort {
  /** When each tick of each run came, by element, then tick. */
  readonly received = new Map<Id, number[]>();
  private readonly routes = new Map<Id, number>();
  private readonly listeners = new Set<(reply: SimulationReply) => void>();
  private readonly unhear: (() => void)[];

  constructor(
    private readonly ports: readonly SimulationPort[],
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.unhear = ports.map((port) => port.onSimulation((reply) => this.hear(reply)));
  }

  /** Sends an element's requests to the port at `index`. */
  route(element: Id, index: number): void {
    this.routes.set(element, index % this.ports.length);
  }

  simulate(request: SimulationRequest): boolean {
    const port = this.ports[this.routes.get(request.element) ?? 0];
    return port?.simulate(request) ?? false;
  }

  onSimulation(listener: (reply: SimulationReply) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    for (const each of this.unhear) each();
    this.listeners.clear();
  }

  private hear(reply: SimulationReply): void {
    if (reply.kind === 'simulation/ticks') {
      const now = this.clock();
      let times = this.received.get(reply.element);
      if (!times) {
        times = [];
        this.received.set(reply.element, times);
      }
      // Ticks from `from` on replace what was held from there.
      times.length = Math.min(times.length, reply.from);
      for (let each = 0; each < reply.ticks.length; each++) times[reply.from + each] = now;
    }
    for (const listener of [...this.listeners]) listener(reply);
  }
}

/**
 * The worker's driver run in the page, with the package code's tick as a plain function: where no
 * code worker runs, and in tests. It works ticks out in slices of `sliceMs`, one task at a time, so
 * that the page's frames go on between them, as the worker's slices take turns with its messages.
 */
export class InPageSimulation implements SimulationPort {
  private readonly driver: SimulationDriver;
  private readonly listeners = new Set<(reply: SimulationReply) => void>();
  private scheduled = false;
  private disposed = false;

  constructor(
    project: ProjectSnapshot,
    private readonly sliceMs = 4,
    private readonly later: (task: () => void) => void = (task) => setTimeout(task, 0),
  ) {
    this.driver = new SimulationDriver({
      code: () => ({ ok: true, hash: 'in-page' }),
      call: (_pkg, input: SimulateInput, seed, tick) => {
        try {
          return {
            ok: true,
            answer: benchTick(input, tickRandom(seed, tick)),
          };
        } catch (error) {
          const failure: CodeFailure = { kind: 'threw', message: String(error) };
          return { ok: false, failure };
        }
      },
    });
    this.driver.refresh(project);
  }

  simulate(request: SimulationRequest): boolean {
    if (this.disposed) return false;
    this.deliver(this.driver.receive(request));
    this.schedule();
    return true;
  }

  onSimulation(listener: (reply: SimulationReply) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private schedule(): void {
    if (this.scheduled || this.disposed || !this.driver.busy) return;
    this.scheduled = true;
    this.later(() => {
      this.scheduled = false;
      if (this.disposed) return;
      const end = performance.now() + this.sliceMs;
      this.deliver(this.driver.work(() => performance.now() >= end));
      this.schedule();
    });
  }

  private deliver(replies: SimulationReply[]): void {
    for (const reply of replies) for (const listener of [...this.listeners]) listener(reply);
  }
}

/** Frames the page runs itself, once a step: what `SimulationMarks` asks for while markers travel. */
class SteppedFrames implements Frames {
  private readonly waiting = new Map<number, (now: number) => void>();
  private next = 1;

  request(callback: (now: number) => void): number {
    const handle = this.next++;
    this.waiting.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.waiting.delete(handle);
  }

  run(now: number): void {
    const due = [...this.waiting.values()];
    this.waiting.clear();
    for (const callback of due) callback(now);
  }
}

/** The ticks a second of each run, over the frames measured. */
interface Rates {
  ticks: Map<Id, number>;
  time: Map<Id, number>;
  stopped: Map<Id, SimulationStop>;
  /** Frames a run played in, and those of them it waited on the worker's next tick in. */
  played: number;
  waited: number;
}

function noRates(): Rates {
  return { ticks: new Map(), time: new Map(), stopped: new Map(), played: 0, waited: 0 };
}

/** Why a run stopped, in a few words. */
function stopReason(stop: SimulationStop): string {
  switch (stop.kind) {
    case 'failed':
      return `failed at tick ${stop.tick}: ${stop.failure.kind}${'reason' in stop.failure ? `, ${String(stop.failure.reason)}` : ''}${'message' in stop.failure ? `, ${String(stop.failure.message)}` : ''}`;
    case 'limit':
      return `${stop.value} past its ${stop.limit} at tick ${stop.tick}`;
    default:
      return `${stop.kind} at tick ${stop.tick}`;
  }
}

export async function measureSimulate(
  bench: SimulateBench,
  plan: SimulatePlan = SIMULATE_PLAN,
): Promise<SimulateResults> {
  const project = bench.project();
  const definitions = definitionsIn(project);
  const view = project.views.find((each) => each.id === bench.view) as ViewFile;
  const simulation = simulationOf(definitions, SIMULATED_COMPONENT);
  if (!simulation) throw new Error('The benchmark’s component simulates nothing.');
  const elements = [...bench.simulating];
  const enginesWanted = Math.ceil(elements.length / SIMULATION_LIMITS.runsAtOnce);
  const notes: string[] = [];
  const phases: FramePhase[] = [];
  const timed: TimedAction[] = [];
  const { controller } = bench;
  const renderer = controller.renderer;
  const marksShown = bench.marks ?? 'travel';

  // The scene the view builds, with the overlay over stored values; the canvas's, with the lookup's.
  const base: Scene = buildScene(project, bench.view);
  let shownSimulated: unknown;
  const showValues = (store: SimulationStore): boolean => {
    const simulated = store.simulated();
    if (simulated === shownSimulated) return false;
    shownSimulated = simulated;
    const lookup = new AttributeLookup(NO_LIVE_VALUES, undefined, simulated);
    const scene = liveSceneOf(base, project, definitions, lookup, t);
    controller.update(project, bench.view, indexScene(scene), false);
    return true;
  };

  // What works ticks out: the code worker if the page can start it, else the driver in the page.
  let kind: EngineKind = 'worker';
  let engines = bench.engines('worker', enginesWanted);
  let opened = engines ? await openAll(engines) : undefined;
  if (!opened) {
    engines?.dispose();
    notes.push(
      engines
        ? `The code worker did not answer every run’s first tick within ${(plan.wait / 1000).toFixed(0)} s: measured with the worker’s driver in the page instead`
        : 'The page could not start the code worker: measured with the worker’s driver in the page instead',
    );
    kind = 'in-page';
    engines = bench.engines('in-page', enginesWanted);
    opened = engines ? await openAll(engines) : undefined;
  }
  if (!engines || !opened) throw new Error('No simulation could start on the benchmark’s page.');
  const { store, routed, marks, emphasis } = opened;
  const engine = kind === 'worker' ? 'code worker' : 'in-page driver';
  const record: SimulateRecord = {
    engine,
    engines: engines.ports.length,
    runs: elements.length,
    marks: marksShown,
    rates: [],
  };
  notes.push(
    `${elements.length} runs at once, ${engines.ports.length} ${kind === 'worker' ? 'code workers' : 'drivers in the page'} with at most ${SIMULATION_LIMITS.runsAtOnce} runs each, its package’s code ${kind === 'worker' ? 'approved by its hash and run in QuickJS' : 'run as a plain function'}; the overlay reads each run’s simulated load, and ${marksShown === 'none' ? 'no marks were drawn' : `each tick marks the element and one of its relations${marksShown === 'still' ? ', its markers standing still as under reduced motion' : ''}`}`,
  );

  /** Opens every run, paused, each in its port, and waits for every first tick. */
  async function openAll(made: SimulationEngines) {
    const port = new RoutedSimulationPort(made.ports);
    const opening = new SimulationStore(port);
    const emphasisStore = new EmphasisStore();
    const stepped = new SteppedFrames();
    const tickMarks = new SimulationMarks(opening, emphasisStore, stepped);
    tickMarks.setContext({ project, view, scene: base, reduced: marksShown === 'still' });
    const unhear =
      marksShown === 'none'
        ? () => undefined
        : emphasisStore.subscribe(() => controller.setEmphasis(emphasisStore.get()));
    for (const [at, element] of elements.entries()) {
      port.route(element, at);
      opening.open(element, simulation as NonNullable<typeof simulation>, { seed: at + 1 });
    }
    if (!(await held(opening, elements, plan.wait))) {
      tickMarks.dispose();
      unhear();
      opening.closeAll();
      opening.dispose();
      port.dispose();
      return undefined;
    }
    return {
      store: opening,
      routed: port,
      marks: tickMarks,
      emphasis: emphasisStore,
      stepped,
      unhear,
    };
  }

  /** Waits until every run holds its first tick, or cannot run; false past `wait`. */
  async function held(of: SimulationStore, runs: readonly Id[], wait: number): Promise<boolean> {
    const until = performance.now() + wait;
    while (performance.now() < until) {
      const runsShown = runs.map((element) => of.get(element));
      if (runsShown.some((run) => run?.unavailable)) return false;
      if (runsShown.every((run) => (run?.ticks.length ?? 0) > 0)) return true;
      await bench.settle(20);
    }
    return false;
  }

  const latencyOf = new Map<SimulationSpeed, number[]>();
  /** The page's own work in each frame while 100 runs played. */
  const pageWork: number[] = [];

  /**
   * One phase of frames while the runs play: each step does what the shell does in a frame, then
   * moves the camera; it keeps when each tick shown came, and how far each run went.
   */
  async function playPhase(
    name: string,
    count: number,
    runs: readonly Id[],
    speed: SimulationSpeed | undefined,
    move: ((frame: number) => void) | undefined,
    rates: Rates | undefined,
  ): Promise<void> {
    const shownBefore = new Map<Id, number>();
    for (const element of runs) shownBefore.set(element, store.get(element)?.shown ?? 0);
    const firstAt = new Map<Id, { shown: number; at: number }>();
    const lastAt = new Map<Id, { shown: number; at: number }>();
    /** In work mode, the ticks each frame showed: when they were ready, to add the frame's time. */
    const pending: { frame: number; began: number; ready: number[] }[] = [];
    const latency = speed === undefined ? [] : (latencyOf.get(speed) ?? []);
    if (speed !== undefined) latencyOf.set(speed, latency);
    let previous = performance.now();
    const phase = await bench.measure(name, count, (frame) => {
      const began = performance.now();
      store.frame(began);
      opened?.stepped.run(began);
      showValues(store);
      const ready: number[] = [];
      for (const element of runs) {
        const run = store.get(element);
        if (!run) continue;
        if (rates && run.playing) {
          rates.played += 1;
          if (run.shown >= run.ticks.length - 1 && !run.stop) rates.waited += 1;
        }
        if (run.stop && rates && !rates.stopped.has(element)) rates.stopped.set(element, run.stop);
        const point = { shown: run.shown, at: began };
        if (!firstAt.has(element)) firstAt.set(element, point);
        lastAt.set(element, point);
        if (run.shown === shownBefore.get(element)) continue;
        shownBefore.set(element, run.shown);
        const came = routed.received.get(element)?.[run.shown];
        if (came !== undefined) ready.push(Math.max(came, previous));
      }
      previous = began;
      move?.(frame);
      if (speed !== undefined) pageWork.push(performance.now() - began);
      if (ready.length === 0 || speed === undefined) return;
      if (bench.mode === 'work') pending.push({ frame, began, ready });
      else {
        renderer.afterNextFrame(() => {
          const drawn = performance.now();
          for (const each of ready) latency.push(drawn - each);
        });
      }
    });
    phases.push(phase);
    for (const { frame, began, ready } of pending) {
      const drawn = began + (phase.frames[frame] ?? 0);
      for (const each of ready) latency.push(drawn - each);
    }
    if (rates) {
      for (const element of runs) {
        const first = firstAt.get(element);
        const last = lastAt.get(element);
        if (!first || !last || last.at <= first.at) continue;
        rates.ticks.set(element, (rates.ticks.get(element) ?? 0) + last.shown - first.shown);
        rates.time.set(element, (rates.time.get(element) ?? 0) + (last.at - first.at) / 1000);
      }
    }
    await bench.settle(plan.rest);
  }

  /** Starts every run again from tick 0, waits for its first tick, and plays it at `speed`. */
  async function startAgain(runs: readonly Id[], speed: SimulationSpeed): Promise<void> {
    for (const element of runs) store.reset(element);
    await held(store, runs, plan.wait);
    for (const element of runs) store.play(element, speed);
  }

  const summarized = (rates: Rates): RateSummary => {
    const each = [...rates.ticks.keys()].map(
      (element) => (rates.ticks.get(element) ?? 0) / Math.max(1e-9, rates.time.get(element) ?? 0),
    );
    const stops: Record<string, number> = {};
    const reasons: string[] = [];
    for (const stop of rates.stopped.values()) {
      if (stops[stop.kind] === undefined) reasons.push(stopReason(stop));
      stops[stop.kind] = (stops[stop.kind] ?? 0) + 1;
    }
    return {
      p50: percentile(each, 0.5),
      p95: percentile(each, 0.95),
      slowest: each.length > 0 ? Math.min(...each) : 0,
      fastest: each.length > 0 ? Math.max(...each) : 0,
      stopped: rates.stopped.size,
      stops,
      reasons,
      waited: rates.played > 0 ? rates.waited / rates.played : 0,
    };
  };
  const rateNote = (
    runs: number,
    among: number,
    speed: SimulationSpeed,
    rates: RateSummary,
  ): string =>
    `${runs} runs at ${speedName(speed)} on ${among} ${among === 1 ? engineOne(kind) : enginesMany(kind)}: each run reached ${rates.p50.toFixed(1)} ticks a second at the median, ${rates.p95.toFixed(1)} at the 95th percentile, ${rates.slowest.toFixed(1)} at the slowest and ${rates.fastest.toFixed(1)} at the fastest; a run waited on its next tick in ${(rates.waited * 100).toFixed(1)}% of the frames it played in${speed === 'max' ? ', as it always shows the last tick held' : ''}${rates.stopped > 0 ? `; ${rates.stopped} stopped while measured (${rates.reasons.join('; ')})` : ''}`;

  const pan = (frame: number) =>
    bench.move(panBy(controller.camera, frame < count2(plan.pan) ? 6 : -6, 0));
  const panNames = (frame: number) =>
    bench.move(
      panBy(
        controller.camera,
        frame < count2(plan.pan) ? -8 : 8,
        frame < count2(plan.pan) ? -4 : 4,
      ),
    );

  // At rest: the runs open and paused, their first tick shown, as a baseline.
  controller.fitWhole();
  await bench.settle(plan.rest);
  await playPhase(
    '100 runs open, paused: pan, whole view',
    plan.pan,
    elements,
    undefined,
    pan,
    undefined,
  );

  for (const speed of SPEEDS) {
    const rates = noRates();
    controller.fitWhole();
    await bench.settle(plan.rest);
    await startAgain(elements, speed);
    const at = speedName(speed);
    // As fast as it goes, a run works its 10,000 ticks out in less than the three phases, and
    // between them too: each phase starts it again, so that none stops at its ticks meanwhile.
    const again = async () => {
      if (speed === 'max') await startAgain(elements, speed);
    };
    await playPhase(
      `100 runs at ${at}: still, whole view`,
      plan.still,
      elements,
      speed,
      undefined,
      rates,
    );
    await again();
    await playPhase(`100 runs at ${at}: pan, whole view`, plan.pan, elements, speed, pan, rates);
    bench.move(bench.cameraAt(NAMES_FROM * 1.3));
    await bench.settle(plan.rest);
    await again();
    await playPhase(
      `100 runs at ${at}: pan, names shown`,
      plan.pan,
      elements,
      speed,
      panNames,
      rates,
    );
    for (const element of elements) store.pause(element);
    const summary = summarized(rates);
    record.rates.push({
      runs: elements.length,
      engines: engines.ports.length,
      speed,
      rates: summary,
    });
    notes.push(rateNote(elements.length, engines.ports.length, speed, summary));
  }
  for (const speed of SPEEDS) {
    timed.push({
      name: `A tick at ${speedName(speed)}, from the store receiving it to the canvas drawing it`,
      times: latencyOf.get(speed) ?? [],
      mark: TICK_SHOWN_MARK,
    });
  }

  // As many runs as the app plays at once, all in one worker.
  const single = elements.slice(0, SIMULATION_LIMITS.runsAtOnce);
  for (const element of elements) store.close(element);
  for (const element of single) {
    routed.route(element, 0);
    store.open(element, simulation, { seed: elements.indexOf(element) + 1 });
  }
  controller.fitWhole();
  await held(store, single, plan.wait);
  for (const speed of SPEEDS) {
    const rates = noRates();
    await startAgain(single, speed);
    await playPhase(
      `${single.length} runs in one ${engineOne(kind)} at ${speedName(speed)}: still, whole view`,
      plan.single,
      single,
      undefined,
      undefined,
      rates,
    );
    for (const element of single) store.pause(element);
    const summary = summarized(rates);
    record.rates.push({ runs: single.length, engines: 1, speed, rates: summary });
    notes.push(rateNote(single.length, 1, speed, summary));
  }

  notes.push(
    `The page’s own work in a frame while the 100 runs played, before the canvas draws it: the store’s frame, the marks, the lookup, the scene with its values, its index and the canvas’s update: ${percentile(pageWork, 0.5).toFixed(2)} ms at the median, ${percentile(pageWork, 0.95).toFixed(2)} ms at the 95th percentile`,
  );

  // Everything closed, and the canvas as it was.
  store.closeAll();
  marks.dispose();
  opened.unhear();
  store.dispose();
  routed.dispose();
  engines.dispose();
  emphasis.set('simulation', undefined);
  controller.setEmphasis({});
  controller.update(project, bench.view, indexScene(base), false);
  return { phases, timed, latency: [], notes, record };
}

/** Half of a phase's frames, which pan one way, then back. */
function count2(frames: number): number {
  return Math.floor(frames / 2);
}

function engineOne(kind: EngineKind): string {
  return kind === 'worker' ? 'code worker' : 'driver in the page';
}

function enginesMany(kind: EngineKind): string {
  return kind === 'worker' ? 'code workers' : 'drivers in the page';
}

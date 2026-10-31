/**
 * The worker's side of simulation runs (ADR 0085): each run's record, worked out tick by tick in the
 * runner's slices, a tick from each run in turn. It runs no code itself: `host.call` calls a
 * package's `simulate` in its sandbox, with the generator of the run's seed and the tick in place of
 * `Math.random()`. A stand-in calls a plain function instead, for tests.
 *
 * A run reads the element and what lies around it once, when it starts: an edit to them, or to its
 * package's code, ends it, saying that the model changed.
 */
import {
  SIMULATION_LIMITS,
  SimulationRun,
  checkSimulateAnswer,
  hookInputOf,
  markableOf,
  simulateInputAt,
  simulationOf,
  definitionsIn,
  modelIndexOf,
  type CodeFailure,
  type HookInput,
  type ProjectSnapshot,
  type RunBudget,
  type SimulateInput,
  type SimulationStop,
  type SimulatedTick,
} from '@visual-anything/core';
import type { Id, SimulationDefinition } from '@visual-anything/schema';
import type { SimulationReply, SimulationRequest, SimulationUnavailable } from './messages';

/** What calling `simulate` once came to: its answer, unchecked, or how it failed. */
export type SimulateOutcome = { ok: true; answer: unknown } | { ok: false; failure: CodeFailure };

/** What the driver needs of the worker it runs in. */
export interface SimulationHost {
  /**
   * The code of a package, running now and exporting `simulate`, with the hash it runs by; or why
   * it cannot simulate.
   */
  code(pkg: Id): { ok: true; hash: string } | { ok: false; reason: SimulationUnavailable };
  /**
   * Calls the package's `simulate` once, with `input`, and `context.random()` and `Math.random()`
   * drawing from `tickRandom(seed, tick)`.
   */
  call(pkg: Id, input: SimulateInput, seed: number, tick: number): SimulateOutcome;
  /** Counts a failure of a package's code towards turning it off (ADR 0054). */
  failed?(pkg: Id, failure: CodeFailure): void;
}

interface Driven {
  run: SimulationRun;
  pkg: Id;
  definition: SimulationDefinition;
  base: HookInput;
  /** What the run read when it started, as JSON, to tell an edit to it. */
  baseKey: string;
  markable: ReadonlySet<Id>;
  /** How many ticks the tab wants held. */
  until: number;
  /** How many ticks the tab was told of. */
  told: number;
  /** While working back from a kept state after Run from here: the next tick and its state. */
  replay?: { tick: number; state: unknown };
  /** The stop the tab was told of. */
  stopTold?: SimulationStop;
}

export class SimulationDriver {
  private project: ProjectSnapshot | undefined;
  private readonly runs = new Map<Id, Driven>();

  constructor(
    private readonly host: SimulationHost,
    private readonly options: { budget?: Partial<RunBudget> } = {},
  ) {}

  /** Whether some run wants more ticks worked out. */
  get busy(): boolean {
    for (const driven of this.runs.values()) if (wantsMore(driven)) return true;
    return false;
  }

  /** The elements with a run, for tests and the benchmark. */
  elements(): Id[] {
    return [...this.runs.keys()];
  }

  /**
   * The project as it is now, and the packages' code as it runs now: a run whose element, what lies
   * around it, or whose code changed ends, saying that the model changed.
   */
  refresh(project: ProjectSnapshot): SimulationReply[] {
    this.project = project;
    const replies: SimulationReply[] = [];
    for (const [element, driven] of this.runs) {
      if (driven.run.stop) continue;
      const base = hookInputOf(project, element);
      const code = this.host.code(driven.pkg);
      const changed =
        !base ||
        JSON.stringify(base) !== driven.baseKey ||
        !code.ok ||
        code.hash !== driven.run.hash;
      if (!changed) continue;
      driven.run.modelChanged();
      replies.push(...this.flush(element, driven));
    }
    return replies;
  }

  /** Takes a request from the tab; answers what it can at once. */
  receive(request: SimulationRequest): SimulationReply[] {
    const { element } = request;
    switch (request.kind) {
      case 'simulation/start':
        return this.start(request);
      case 'simulation/close':
        this.runs.delete(element);
        return [];
      case 'simulation/until': {
        const driven = this.runs.get(element);
        if (driven) driven.until = Math.max(driven.until, request.until);
        return [];
      }
      case 'simulation/more': {
        const driven = this.runs.get(element);
        if (!driven) return [];
        driven.run.more();
        driven.until = Math.max(driven.until, request.until);
        return [this.ticksReply(element, driven, driven.told, [])];
      }
      case 'simulation/from-here': {
        const driven = this.runs.get(element);
        if (!driven) return [];
        driven.run.goTo(request.tick);
        const point = driven.run.fromHere();
        driven.replay = point.tick < driven.run.next ? { ...point } : undefined;
        driven.told = driven.run.length;
        driven.stopTold = undefined;
        driven.until = request.until;
        return [this.ticksReply(element, driven, driven.run.length, [])];
      }
    }
  }

  /**
   * Works ticks out, one from each run that wants more in turn, until `done()` says the slice is
   * over or none wants more; answers the ticks worked out, by run.
   */
  work(done: () => boolean): SimulationReply[] {
    let worked = true;
    while (worked && !done()) {
      worked = false;
      for (const driven of this.runs.values()) {
        if (!wantsMore(driven)) continue;
        this.step(driven);
        worked = true;
        if (done()) break;
      }
    }
    const replies: SimulationReply[] = [];
    for (const [element, driven] of this.runs) replies.push(...this.flush(element, driven));
    return replies;
  }

  private start(
    request: Extract<SimulationRequest, { kind: 'simulation/start' }>,
  ): SimulationReply[] {
    const { element } = request;
    this.runs.delete(element);
    const unavailable = (reason: SimulationUnavailable): SimulationReply[] => [
      { kind: 'simulation/unavailable', element, reason },
    ];
    const project = this.project;
    const found = project ? modelIndexOf(project).element(element) : undefined;
    if (!project || !found) return unavailable('no-simulation');
    const simulated = simulationOf(definitionsIn(project), found.component);
    const base = hookInputOf(project, element);
    if (!simulated || !base) return unavailable('no-simulation');
    if (this.runs.size >= SIMULATION_LIMITS.runsAtOnce) return unavailable('too-many');
    const code = this.host.code(simulated.package);
    if (!code.ok) return unavailable(code.reason);
    const run = new SimulationRun({
      element,
      hash: code.hash,
      parameters: request.parameters,
      seed: request.seed,
      ticks: request.ticks,
      ...(this.options.budget ? { budget: this.options.budget } : {}),
    });
    this.runs.set(element, {
      run,
      pkg: simulated.package,
      definition: simulated.definition,
      base,
      baseKey: JSON.stringify(base),
      markable: markableOf(base),
      until: request.until,
      told: 0,
    });
    return [];
  }

  /** Works out one tick of a run: one worked again after Run from here, or the next. */
  private step(driven: Driven): void {
    const { run } = driven;
    const replay = driven.replay;
    if (replay) {
      const outcome = this.call(driven, replay.tick, replay.state);
      const checked =
        outcome.ok && checkSimulateAnswer(driven.definition, outcome.answer, driven.markable);
      const same =
        checked &&
        checked.kind === 'tick' &&
        JSON.stringify(checked.tick) === JSON.stringify(run.tickAt(replay.tick));
      if (!checked || checked.kind !== 'tick' || !same) {
        driven.replay = undefined;
        this.fail(driven, outcome.ok ? AGAIN : outcome.failure);
        return;
      }
      run.restore(replay.tick, checked.state, checked.stateSize);
      const next = replay.tick + 1;
      driven.replay = next < run.next ? { tick: next, state: checked.state } : undefined;
      return;
    }
    const tick = run.next;
    const outcome = this.call(driven, tick, run.stateForNext());
    if (!outcome.ok) {
      this.fail(driven, outcome.failure);
      return;
    }
    const stop = run.record(
      tick,
      checkSimulateAnswer(driven.definition, outcome.answer, driven.markable),
    );
    if (stop?.kind === 'failed') this.host.failed?.(driven.pkg, stop.failure);
  }

  private call(driven: Driven, tick: number, state: unknown): SimulateOutcome {
    const input = simulateInputAt(driven.base, {
      parameters: driven.run.parameters,
      state: state as SimulateInput['context']['state'],
      tick,
      ...(driven.definition.tick ? { tickLength: driven.definition.tick } : {}),
    });
    return this.host.call(driven.pkg, input, driven.run.seed, tick);
  }

  private fail(driven: Driven, failure: CodeFailure): void {
    driven.run.fail(failure);
    this.host.failed?.(driven.pkg, failure);
  }

  /** The ticks a run worked out that the tab was not told of, and its stop, if any. */
  private flush(element: Id, driven: Driven): SimulationReply[] {
    const { run } = driven;
    const stop = run.stop;
    const fresh: SimulatedTick[] = [];
    for (let tick = driven.told; tick < run.length; tick++) {
      const held = run.tickAt(tick);
      if (held) fresh.push(held);
    }
    const stopNew = stop !== undefined && stop !== driven.stopTold;
    if (fresh.length === 0 && !stopNew) return [];
    const reply = this.ticksReply(element, driven, driven.told, fresh);
    driven.told = run.length;
    if (stop) driven.stopTold = stop;
    return [reply];
  }

  private ticksReply(
    element: Id,
    driven: Driven,
    from: number,
    ticks: SimulatedTick[],
  ): SimulationReply {
    const stop = driven.run.stop;
    return {
      kind: 'simulation/ticks',
      element,
      from,
      ticks,
      planned: driven.run.ticks,
      ...(stop ? { stop } : {}),
    };
  }
}

/** A tick worked out again that answered otherwise than the first time. */
const AGAIN: CodeFailure = {
  kind: 'answer',
  reason: 'it answered otherwise when a past tick was worked out again',
};

function wantsMore(driven: Driven): boolean {
  if (driven.replay) return true;
  return !driven.run.stop && driven.run.length < Math.min(driven.until, driven.run.ticks);
}

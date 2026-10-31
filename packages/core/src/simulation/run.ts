/**
 * The record of one simulation run (ADR 0085): the ticks it worked out, the states kept for going on
 * from a past tick, the tick shown, and the stop. It runs nothing itself: the app's worker and
 * Claude's tools call the code, check each answer with `checkSimulateAnswer` and record it here.
 *
 * It keeps every tick's values and marks, within `keptText`, so going back shows any tick at once.
 * It keeps every tick's state while they fit within `stateKeptText`, then only every `stateEvery`th
 * and the last, since a tick can be worked out again from the state before it: chance is seeded from
 * the run's seed and the tick. A run never holds a tick past its stop.
 *
 * Mutable, so that recording a tick costs the same at the ten-thousandth as at the first.
 */
import type { Id, JsonValue } from '@visual-anything/schema';
import type { CodeFailure } from '../code/messages';
import type { CheckedTick, LimitKind, SimulatedTick, SimulatedValue } from './answer';
import { SIMULATION_LIMITS } from './limits';
import type { RunParameters } from './parameters';

/** Why a run stopped, and at which tick. */
export type SimulationStop =
  /** The behavior ended by itself at `tick`, which is kept. */
  | { kind: 'done'; tick: number; message?: string }
  /** It played its ticks; `tick` is the last, which is kept. */
  | { kind: 'ticks'; tick: number }
  /** The tick `tick` put a value past a limit; that tick is not kept. */
  | {
      kind: 'limit';
      tick: number;
      value: string;
      limit: LimitKind;
      limitValue?: number;
      got: SimulatedValue;
    }
  /** The code failed at `tick`, which is not kept; or its state was too large to keep. */
  | { kind: 'failed'; tick: number; failure: CodeFailure }
  /** What a run keeps for going back is full; `tick` is the first not kept. */
  | { kind: 'full'; tick: number }
  /** The model changed while it ran; `tick` is the first not worked out. */
  | { kind: 'changed'; tick: number };

/** Whether a stop is the code's fault, which counts towards turning its package off (ADR 0054). */
export function isFailure(stop: SimulationStop): boolean {
  return stop.kind === 'failed';
}

/** What a run starts from. */
export interface RunStart {
  element: Id;
  /** The hash of the package code it runs (ADR 0060), so a change of code ends its link. */
  hash: string;
  parameters: RunParameters;
  seed: number;
  /** How many ticks it plays, at most `maxTicks`. */
  ticks: number;
  /** For tests: smaller budgets than the limits'. */
  budget?: Partial<RunBudget>;
}

/** How much a run keeps. */
export interface RunBudget {
  keptText: number;
  stateKeptText: number;
  stateEvery: number;
}

/** Where to work a run on from: the first tick to call, and the state it is given. */
export interface ResumePoint {
  tick: number;
  state: JsonValue | undefined;
}

export class SimulationRun {
  readonly element: Id;
  readonly hash: string;
  readonly parameters: RunParameters;
  readonly seed: number;
  #ticks: number;
  readonly #budget: RunBudget;
  readonly #kept: SimulatedTick[] = [];
  /** The state each tick answered, by tick; only some once thinned. */
  readonly #states = new Map<number, { state: JsonValue | undefined; size: number }>();
  #keptText = 0;
  #stateText = 0;
  #thinned = false;
  #shown = 0;
  #stop: SimulationStop | undefined;

  constructor(start: RunStart) {
    this.element = start.element;
    this.hash = start.hash;
    this.parameters = start.parameters;
    this.seed = start.seed >>> 0;
    this.#ticks = clampTicks(start.ticks);
    this.#budget = {
      keptText: start.budget?.keptText ?? SIMULATION_LIMITS.keptText,
      stateKeptText: start.budget?.stateKeptText ?? SIMULATION_LIMITS.stateKeptText,
      stateEvery: start.budget?.stateEvery ?? SIMULATION_LIMITS.stateEvery,
    };
  }

  /** How many ticks it plays. */
  get ticks(): number {
    return this.#ticks;
  }

  /** How many ticks it holds: ticks 0 to `length - 1`. */
  get length(): number {
    return this.#kept.length;
  }

  /** The next tick to work out, which is its length. */
  get next(): number {
    return this.#kept.length;
  }

  /** Why it stopped; undefined while it can go on. */
  get stop(): SimulationStop | undefined {
    return this.#stop;
  }

  /** The tick shown; 0 before any is held. */
  get shown(): number {
    return this.#shown;
  }

  /** How much of its budget for ticks it holds, in characters of JSON. */
  get keptText(): number {
    return this.#keptText;
  }

  /** How much of its budget for states it holds, in characters of JSON. */
  get stateText(): number {
    return this.#stateText;
  }

  /** The tick held at `tick`; undefined past its length. */
  tickAt(tick: number): SimulatedTick | undefined {
    return this.#kept[tick];
  }

  /** The ticks whose states it keeps, in order. */
  keptStates(): number[] {
    return [...this.#states.keys()].sort((a, b) => a - b);
  }

  /** What the next tick is given: the state the last tick answered. */
  stateForNext(): JsonValue | undefined {
    return this.#states.get(this.#kept.length - 1)?.state;
  }

  /**
   * Records what tick `next` answered, checked: a tick it keeps, or the stop it comes to. Shows the
   * tick it kept. Recording after a stop, or another tick than `next`, throws: that is the caller's
   * mistake, not the code's.
   */
  record(tick: number, checked: CheckedTick): SimulationStop | undefined {
    if (this.#stop) throw new Error(`The run stopped at tick ${this.#stop.tick}.`);
    if (tick !== this.next) throw new Error(`The run works out tick ${this.next}, not ${tick}.`);
    if (checked.kind === 'limit') {
      const { value, limit, got } = checked;
      return this.#stopWith({
        kind: 'limit',
        tick,
        value,
        limit,
        got,
        ...(checked.limitValue === undefined ? {} : { limitValue: checked.limitValue }),
      });
    }
    if (checked.kind === 'dropped') {
      return this.#stopWith({
        kind: 'failed',
        tick,
        failure: { kind: 'answer', reason: checked.reason },
      });
    }
    const size = tickText(checked.tick);
    if (this.#keptText + size > this.#budget.keptText) {
      return this.#stopWith({ kind: 'full', tick });
    }
    this.#kept.push(checked.tick);
    this.#keptText += size;
    this.#keepState(tick, checked.state, checked.stateSize);
    this.#shown = tick;
    if (checked.done !== undefined) {
      return this.#stopWith({
        kind: 'done',
        tick,
        ...(checked.done === true ? {} : { message: checked.done }),
      });
    }
    if (this.#kept.length >= this.#ticks) return this.#stopWith({ kind: 'ticks', tick });
    return undefined;
  }

  /** Records that the code failed at tick `next`, which it does not keep. */
  fail(failure: CodeFailure): SimulationStop {
    if (this.#stop) throw new Error(`The run stopped at tick ${this.#stop.tick}.`);
    return this.#stopWith({ kind: 'failed', tick: this.next, failure });
  }

  /** Records that the model changed, so the run cannot go on as it started. */
  modelChanged(): SimulationStop {
    return this.#stop ?? this.#stopWith({ kind: 'changed', tick: this.next });
  }

  /** Shows a tick it holds, the nearest one when asked for one it does not. */
  goTo(tick: number): number {
    const last = Math.max(0, this.#kept.length - 1);
    this.#shown = Math.min(last, Math.max(0, Math.trunc(Number.isFinite(tick) ? tick : 0)));
    return this.#shown;
  }

  /**
   * Run from here: drops the ticks after the one shown and its stop, so the run plays on from it.
   * A run that had played its ticks plays as many more, up to `maxTicks`. Answers where to work it
   * on from: the tick after the nearest kept state at or before the one shown. When that is before
   * the one shown, the ticks between are worked out again and given to `restore` before `record`
   * takes the next.
   */
  fromHere(): ResumePoint {
    const shown = this.#shown;
    const hadPlayedAll = this.#stop?.kind === 'ticks' && shown === this.#kept.length - 1;
    for (let tick = this.#kept.length - 1; tick > shown; tick--) {
      const dropped = this.#kept.pop();
      if (dropped) this.#keptText -= tickText(dropped);
      this.#dropState(tick);
    }
    this.#stop = undefined;
    if (hadPlayedAll) this.#ticks = clampTicks(this.#ticks * 2);
    return this.resumePoint();
  }

  /** Plays more ticks: as many again as it plays, up to `maxTicks`. */
  more(): void {
    if (this.#stop?.kind === 'ticks') this.#stop = undefined;
    this.#ticks = clampTicks(Math.max(this.#ticks * 2, this.#kept.length + 1));
  }

  /**
   * Where to work it on from to reach `next`: the tick after the nearest kept state, and that state.
   * At `next` itself when the last state is kept, as it always is unless `fromHere` went back.
   */
  resumePoint(): ResumePoint {
    const before = this.#kept.length - 1;
    for (let tick = before; tick >= 0; tick--) {
      const kept = this.#states.get(tick);
      if (kept) return { tick: tick + 1, state: kept.state };
    }
    return { tick: 0, state: undefined };
  }

  /**
   * Gives back the state a tick between a resume point and `next` answered, worked out again; it
   * keeps it as it would have, so that the last tick's state is kept again.
   */
  restore(tick: number, state: JsonValue | undefined, size: number): void {
    if (tick < 0 || tick >= this.#kept.length) {
      throw new Error(`The run holds no tick ${tick} to restore.`);
    }
    this.#keepState(tick, state, size);
  }

  #stopWith(stop: SimulationStop): SimulationStop {
    this.#stop = stop;
    return stop;
  }

  #keepState(tick: number, state: JsonValue | undefined, size: number): void {
    this.#dropState(tick);
    this.#states.set(tick, { state, size });
    this.#stateText += size;
    // The state of the tick before the last is needed no more once thinned, unless it is one kept.
    const before = tick - 1;
    if (this.#thinned && before >= 0 && before % this.#budget.stateEvery !== 0)
      this.#dropState(before);
    if (this.#stateText > this.#budget.stateKeptText) this.#thin(tick);
  }

  /** Keeps only the states of every `stateEvery`th tick and of the last. */
  #thin(last: number): void {
    this.#thinned = true;
    for (const tick of [...this.#states.keys()]) {
      if (tick !== last && tick % this.#budget.stateEvery !== 0) this.#dropState(tick);
    }
  }

  #dropState(tick: number): void {
    const kept = this.#states.get(tick);
    if (!kept) return;
    this.#stateText -= kept.size;
    this.#states.delete(tick);
  }
}

/** A number of ticks a run may play: from 1 to `maxTicks`. */
function clampTicks(ticks: number): number {
  const whole = Number.isFinite(ticks) ? Math.trunc(ticks) : SIMULATION_LIMITS.defaultTicks;
  return Math.min(SIMULATION_LIMITS.maxTicks, Math.max(1, whole));
}

/** How long a tick is, written as JSON, as its budget counts it. */
function tickText(tick: SimulatedTick): number {
  return JSON.stringify(tick.values).length + JSON.stringify(tick.marks).length;
}

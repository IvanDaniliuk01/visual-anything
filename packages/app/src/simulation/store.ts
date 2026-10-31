/**
 * The tab's simulation runs (ADR 0085): for each element simulating, its parameters, seed, the ticks
 * the worker answered, the tick shown, whether it plays and how fast, and its stop. Nothing here is
 * saved: runs live in the tab, like scenario choices (ADR 0031) and live values (ADR 0057).
 *
 * The worker works ticks out ahead; the store plays the ticks held at the speed chosen, one frame at
 * a time, through `frame`, and asks for more before it runs out. Going back shows a tick it holds at
 * once. Changing a parameter or the seed starts the run again from tick 0 and plays it up to the
 * tick shown, so that the same moment shows under the new parameters.
 *
 * It follows the shell's stores: `subscribe`, and a `version` that changes with every change.
 */
import {
  SIMULATION_LIMITS,
  checkParameters,
  chosenParameters,
  ticksOf,
  type ComponentSimulation,
  type ComputedReading,
  type RunParameters,
  type SimulatedTick,
  type SimulationSpeed,
  type SimulationStop,
} from '@visual-anything/core';
import type { Id, ParameterValue, SavedSimulation } from '@visual-anything/schema';
import type { SimulationReply, SimulationRequest, SimulationUnavailable } from './messages';

/** What the store needs of the code worker's host: `CodeHost` is one. */
export interface SimulationPort {
  /** Asks the worker; false when no worker runs, so no code could simulate. */
  simulate(request: SimulationRequest): boolean;
  onSimulation(listener: (reply: SimulationReply) => void): () => void;
}

/** One element's run as the tab shows it. */
export interface SimulationShown {
  element: Id;
  /** Its component's simulation, and the package that declares it. */
  simulation: ComponentSimulation;
  parameters: RunParameters;
  seed: number;
  /** How many ticks it plays. */
  planned: number;
  /** The ticks the worker answered, from tick 0. */
  ticks: readonly SimulatedTick[];
  /** The tick shown; 0 before any is held. */
  shown: number;
  /** A tick to show once it is held, after a change of parameters or of seed. */
  target?: number;
  playing: boolean;
  speed: SimulationSpeed;
  stop?: SimulationStop;
  /** Why it cannot run, when it cannot. */
  unavailable?: SimulationUnavailable;
}

/** What opening a simulation, or changing its parameters, came to. */
export type SimulationChange = { ok: true } | { ok: false; reason: string };

/** How far ahead of the tick shown the worker works, in seconds of playing at the speed chosen. */
const AHEAD_SECONDS = 2;
/** The fewest ticks ahead it works. */
const AHEAD_MIN = 50;

export class SimulationStore {
  private readonly runs = new Map<Id, SimulationShown>();
  private readonly listeners = new Set<() => void>();
  private versionNumber = 0;
  private simulatedCache: ReadonlyMap<Id, ReadonlyMap<string, ComputedReading>> | undefined;
  private marksCache: ReadonlyMap<Id, readonly Id[]> | undefined;
  /** When each playing run last moved on, and the fraction of a tick it carries. */
  private readonly clock = new Map<Id, { at: number; carry: number }>();
  /** How many ticks the worker was last asked to hold, by run. */
  private readonly asked = new Map<Id, number>();
  private readonly unhear: () => void;

  constructor(private readonly port: SimulationPort) {
    this.unhear = port.onSimulation((reply) => this.receive(reply));
  }

  get version(): number {
    return this.versionNumber;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stops hearing the worker. */
  dispose(): void {
    this.unhear();
    this.listeners.clear();
  }

  get(element: Id): SimulationShown | undefined {
    return this.runs.get(element);
  }

  /** Every run shown, in the order they were opened. */
  list(): SimulationShown[] {
    return [...this.runs.values()];
  }

  /** The tick shown of a run, when it holds it. */
  tickShown(element: Id): SimulatedTick | undefined {
    const shown = this.runs.get(element);
    return shown?.ticks[shown.shown];
  }

  /**
   * The values each run answered at its tick shown, by element and value, for the attribute lookup:
   * the same map while no tick shown changes.
   */
  simulated(): ReadonlyMap<Id, ReadonlyMap<string, ComputedReading>> {
    if (this.simulatedCache) return this.simulatedCache;
    const made = new Map<Id, ReadonlyMap<string, ComputedReading>>();
    for (const shown of this.runs.values()) {
      const tick = shown.ticks[shown.shown];
      if (!tick) continue;
      const byName = new Map<string, ComputedReading>();
      for (const [name, value] of Object.entries(tick.values)) {
        byName.set(name, { value, package: shown.simulation.package });
      }
      made.set(shown.element, byName);
    }
    this.simulatedCache = made;
    return made;
  }

  /** What each run's tick shown marks, by element: the same map while no tick shown changes. */
  marks(): ReadonlyMap<Id, readonly Id[]> {
    if (this.marksCache) return this.marksCache;
    const made = new Map<Id, readonly Id[]>();
    for (const shown of this.runs.values()) {
      const marks = shown.ticks[shown.shown]?.marks;
      if (marks && marks.length > 0) made.set(shown.element, marks);
    }
    this.marksCache = made;
    return made;
  }

  /**
   * Opens an element's simulation, paused, with the parameters, seed and tick chosen, or its
   * defaults; a run already open for it starts again. Refuses parameters its simulation refuses.
   */
  open(
    element: Id,
    simulation: ComponentSimulation,
    chosen: Omit<SavedSimulation, 'element'> = {},
  ): SimulationChange {
    const parameters = checkParameters(simulation.definition, chosen.parameters);
    if (!parameters.ok) return parameters;
    const tick = chosen.tick ?? 0;
    const planned = Math.max(
      ticksOf(simulation.definition),
      Math.min(tick + 1, SIMULATION_LIMITS.maxTicks),
    );
    const shown: SimulationShown = {
      element,
      simulation,
      parameters: parameters.value,
      seed: chosen.seed ?? SIMULATION_LIMITS.defaultSeed,
      planned,
      ticks: [],
      shown: 0,
      ...(tick > 0 ? { target: tick } : {}),
      playing: false,
      speed: this.runs.get(element)?.speed ?? 5,
    };
    this.runs.set(element, shown);
    this.restart(shown);
    this.changed();
    return { ok: true };
  }

  /** Closes an element's run, and forgets it. */
  close(element: Id): void {
    if (!this.runs.delete(element)) return;
    this.clock.delete(element);
    this.asked.delete(element);
    this.port.simulate({ kind: 'simulation/close', element });
    this.changed();
  }

  /** Closes every run. */
  closeAll(): void {
    for (const element of [...this.runs.keys()]) this.close(element);
  }

  /**
   * Changes some parameters: the run starts again from tick 0, with the same seed, and plays up to
   * the tick shown. Refuses values its simulation refuses, changing nothing.
   */
  setParameters(element: Id, values: Record<string, ParameterValue>): SimulationChange {
    const shown = this.runs.get(element);
    if (!shown) return { ok: false, reason: 'No simulation of this element is open.' };
    const parameters = checkParameters(shown.simulation.definition, {
      ...shown.parameters,
      ...values,
    });
    if (!parameters.ok) return parameters;
    this.again(shown, { parameters: parameters.value });
    return { ok: true };
  }

  /** Changes the seed: the run starts again from tick 0 and plays up to the tick shown. */
  setSeed(element: Id, seed: number): SimulationChange {
    const shown = this.runs.get(element);
    if (!shown) return { ok: false, reason: 'No simulation of this element is open.' };
    if (!Number.isInteger(seed) || seed < 0 || seed > SIMULATION_LIMITS.maxSeed) {
      return {
        ok: false,
        reason: `A seed is a whole number from 0 to ${SIMULATION_LIMITS.maxSeed}.`,
      };
    }
    this.again(shown, { seed });
    return { ok: true };
  }

  /** Plays a run on from the tick shown; one that played its ticks plays as many more. */
  play(element: Id, speed?: SimulationSpeed): void {
    const shown = this.runs.get(element);
    if (!shown || shown.unavailable) return;
    if (speed !== undefined) shown.speed = speed;
    const atEnd = shown.shown >= shown.ticks.length - 1;
    if (atEnd && shown.stop?.kind === 'ticks') {
      shown.planned = Math.min(SIMULATION_LIMITS.maxTicks, shown.planned * 2);
      shown.playing = true;
      const until = this.untilFor(shown);
      this.asked.set(element, until);
      this.port.simulate({ kind: 'simulation/more', element, until });
      delete shown.stop;
    } else if (atEnd && shown.stop) {
      return;
    }
    shown.playing = true;
    this.clock.delete(element);
    this.ask(shown);
    this.changed();
  }

  pause(element: Id): void {
    const shown = this.runs.get(element);
    if (!shown?.playing) return;
    shown.playing = false;
    this.clock.delete(element);
    this.changed();
  }

  setSpeed(element: Id, speed: SimulationSpeed): void {
    const shown = this.runs.get(element);
    if (!shown || shown.speed === speed) return;
    shown.speed = speed;
    this.ask(shown);
    this.changed();
  }

  /** Shows the tick before; pauses. */
  back(element: Id): void {
    const shown = this.runs.get(element);
    if (shown) this.goTo(element, shown.shown - 1);
  }

  /** Shows the tick after, working it out when it is not held yet; pauses. */
  forward(element: Id): void {
    const shown = this.runs.get(element);
    if (!shown) return;
    if (shown.shown + 1 < shown.ticks.length) {
      this.goTo(element, shown.shown + 1);
      return;
    }
    if (shown.stop) return;
    shown.playing = false;
    shown.target = shown.shown + 1;
    this.ask(shown);
    this.changed();
  }

  /** Shows a tick it holds, the nearest one when asked for another; pauses. */
  goTo(element: Id, tick: number): void {
    const shown = this.runs.get(element);
    if (!shown) return;
    const last = Math.max(0, shown.ticks.length - 1);
    const to = Math.min(last, Math.max(0, Math.trunc(Number.isFinite(tick) ? tick : 0)));
    shown.playing = false;
    delete shown.target;
    this.clock.delete(element);
    if (to === shown.shown) {
      this.changed();
      return;
    }
    shown.shown = to;
    this.shownChanged();
  }

  /** Run from here: drops the ticks after the one shown, and plays on from it. */
  fromHere(element: Id): void {
    const shown = this.runs.get(element);
    if (!shown || shown.ticks.length === 0) return;
    shown.ticks = shown.ticks.slice(0, shown.shown + 1);
    delete shown.stop;
    shown.playing = true;
    this.clock.delete(element);
    const until = this.untilFor(shown);
    this.asked.set(element, until);
    this.port.simulate({ kind: 'simulation/from-here', element, tick: shown.shown, until });
    this.changed();
  }

  /** Starts the run again from tick 0, with the same parameters and seed, paused. */
  reset(element: Id): void {
    const shown = this.runs.get(element);
    if (!shown) return;
    shown.playing = false;
    shown.shown = 0;
    delete shown.target;
    this.restart(shown);
    this.shownChanged();
  }

  /** The simulation a view state carries for an element's run: what it chose, and the tick shown. */
  saved(element: Id): SavedSimulation | undefined {
    const shown = this.runs.get(element);
    if (!shown) return undefined;
    const parameters = chosenParameters(shown.simulation.definition, shown.parameters);
    const tick = shown.target ?? shown.shown;
    return {
      element,
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
      ...(shown.seed === SIMULATION_LIMITS.defaultSeed ? {} : { seed: shown.seed }),
      ...(tick === 0 ? {} : { tick }),
    };
  }

  /**
   * Moves playing runs on to the time `now`, in milliseconds, as fast as their speeds go; `max` shows
   * the last tick held at every frame. Called once a frame while a run plays.
   */
  frame(now: number): void {
    let moved = false;
    for (const shown of this.runs.values()) {
      if (!shown.playing) continue;
      const last = shown.ticks.length - 1;
      let to = shown.shown;
      if (shown.speed === 'max') {
        to = Math.max(to, last);
      } else {
        const clock = this.clock.get(shown.element);
        if (!clock) {
          this.clock.set(shown.element, { at: now, carry: 0 });
          continue;
        }
        const ticks = ((now - clock.at) * shown.speed) / 1000 + clock.carry;
        const whole = Math.floor(ticks);
        const reach = Math.min(last, shown.shown + whole);
        // A run waiting on the worker keeps no fraction, so it does not leap once ticks come.
        clock.carry = reach === shown.shown + whole ? ticks - whole : 0;
        clock.at = now;
        to = Math.max(to, reach);
      }
      if (to !== shown.shown) {
        shown.shown = to;
        moved = true;
      }
      if (shown.shown >= last && shown.stop) {
        shown.playing = false;
        this.clock.delete(shown.element);
        moved = true;
      }
      this.ask(shown);
    }
    if (moved) this.shownChanged();
  }

  /** Whether some run plays, so that the shell keeps calling `frame`. */
  get playing(): boolean {
    for (const shown of this.runs.values()) if (shown.playing) return true;
    return false;
  }

  private receive(reply: SimulationReply): void {
    if (reply.kind === 'simulation/restarted') {
      for (const shown of this.runs.values()) {
        if (shown.unavailable) continue;
        if (shown.shown > 0) shown.target = Math.max(shown.target ?? 0, shown.shown);
        this.restart(shown);
      }
      this.changed();
      return;
    }
    const shown = this.runs.get(reply.element);
    if (!shown) return;
    if (reply.kind === 'simulation/unavailable') {
      shown.unavailable = reply.reason;
      shown.playing = false;
      this.changed();
      return;
    }
    const before = shown.ticks[shown.shown];
    const kept =
      shown.ticks.length > reply.from ? shown.ticks.slice(0, reply.from) : [...shown.ticks];
    shown.ticks = [...kept, ...reply.ticks];
    shown.planned = reply.planned;
    if (reply.stop) shown.stop = reply.stop;
    else delete shown.stop;
    if (shown.target !== undefined) {
      const last = shown.ticks.length - 1;
      if (shown.target <= last) {
        shown.shown = shown.target;
        delete shown.target;
      } else if (shown.stop) {
        shown.shown = Math.max(0, last);
        delete shown.target;
      }
    }
    shown.shown = Math.min(shown.shown, Math.max(0, shown.ticks.length - 1));
    if (shown.ticks[shown.shown] !== before) this.shownChanged();
    else this.changed();
  }

  /** Starts a run again from tick 0 with new parameters or seed, playing up to the tick shown. */
  private again(
    shown: SimulationShown,
    change: { parameters?: RunParameters; seed?: number },
  ): void {
    if (change.parameters) shown.parameters = change.parameters;
    if (change.seed !== undefined) shown.seed = change.seed;
    const target = shown.target ?? shown.shown;
    if (target > 0) shown.target = target;
    this.restart(shown);
    this.shownChanged();
  }

  private restart(shown: SimulationShown): void {
    shown.ticks = [];
    delete shown.stop;
    delete shown.unavailable;
    this.clock.delete(shown.element);
    const until = this.untilFor(shown);
    this.asked.set(shown.element, until);
    const sent = this.port.simulate({
      kind: 'simulation/start',
      element: shown.element,
      parameters: shown.parameters,
      seed: shown.seed,
      ticks: shown.planned,
      until,
    });
    if (!sent) {
      shown.unavailable = 'not-approved';
      shown.playing = false;
    }
  }

  /** Asks the worker for more ticks when the run nears the end of what it holds. */
  private ask(shown: SimulationShown): void {
    if (shown.stop || shown.unavailable) return;
    const until = this.untilFor(shown);
    if (until > shown.ticks.length && until > (this.asked.get(shown.element) ?? 0)) {
      this.asked.set(shown.element, until);
      this.port.simulate({ kind: 'simulation/until', element: shown.element, until });
    }
  }

  /** How many ticks the worker should hold for a run: the tick it is to show and some ahead. */
  private untilFor(shown: SimulationShown): number {
    const at = Math.max(shown.shown, shown.target ?? 0) + 1;
    const ahead =
      shown.speed === 'max' ? shown.planned : Math.max(AHEAD_MIN, shown.speed * AHEAD_SECONDS);
    return Math.min(shown.planned, at + (shown.playing || shown.target !== undefined ? ahead : 0));
  }

  private shownChanged(): void {
    this.simulatedCache = undefined;
    this.marksCache = undefined;
    this.changed();
  }

  private changed(): void {
    this.versionNumber += 1;
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * The messages between the tab and its code worker for simulation runs (ADR 0085). The worker owns
 * each run's record and works ticks out ahead, in its slices, up to the number of ticks the tab asks
 * it to hold; the tab keeps what each tick answered, so that going back shows a tick at once, and it
 * plays the ticks held at the speed chosen.
 */
import type { RunParameters, SimulatedTick, SimulationStop } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** What the tab asks of the worker for simulation runs. */
export type SimulationRequest =
  /**
   * Starts a run of an element's simulation afresh, ending any run it had, and works it out until
   * it holds `until` ticks, or stops. The parameters are already checked.
   */
  | {
      kind: 'simulation/start';
      element: Id;
      parameters: RunParameters;
      seed: number;
      /** How many ticks it plays. */
      ticks: number;
      until: number;
    }
  /** Works a run out further, until it holds `until` ticks, or stops. */
  | { kind: 'simulation/until'; element: Id; until: number }
  /**
   * Run from here: drops the ticks after `tick` and its stop, then works it out until it holds
   * `until` ticks, or stops again.
   */
  | { kind: 'simulation/from-here'; element: Id; tick: number; until: number }
  /** Plays more ticks after a run played its ticks, as many again, up to the most a run plays. */
  | { kind: 'simulation/more'; element: Id; until: number }
  /** Ends a run, and forgets it. */
  | { kind: 'simulation/close'; element: Id };

/** Why an element's simulation cannot run. */
export type SimulationUnavailable =
  /** The element is gone, or its component simulates nothing. */
  | 'no-simulation'
  /** The package that declares it has no code exporting `simulate`. */
  | 'no-code'
  /** Its package's code is not approved, or not by its present hash. */
  | 'not-approved'
  /** Its package's code is turned off after it stopped too many times in a row. */
  | 'off'
  /** The tab runs as many runs as it may at once. */
  | 'too-many';

/** What the worker tells the tab of a run. */
export type SimulationReply =
  /**
   * Ticks it worked out: `ticks` are the ticks from `from` on, each in order. A `from` below what
   * the tab holds means it ran from there, and the tab drops what it held from `from` on. With
   * `stop`, the run stopped after them.
   */
  | {
      kind: 'simulation/ticks';
      element: Id;
      from: number;
      ticks: SimulatedTick[];
      /** How many ticks it plays now, after `more`. */
      planned: number;
      stop?: SimulationStop;
    }
  /** The run cannot start, or cannot go on, and why. */
  | { kind: 'simulation/unavailable'; element: Id; reason: SimulationUnavailable }
  /**
   * The code worker stopped, and every run with it: the tab starts its runs again, which give the
   * same ticks. `CodeHost` says this itself; no worker sends it.
   */
  | { kind: 'simulation/restarted' };

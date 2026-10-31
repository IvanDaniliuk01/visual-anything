/**
 * A stand-in for the code worker's simulation runs, for tests and for building the inspector before
 * the worker simulates (ADR 0085): the driver the worker runs, with a plain function in place of a
 * package's `simulate`, answering in the same tab. `work()` plays the worker's slices.
 */
import {
  tickRandom,
  type CodeFailure,
  type ProjectSnapshot,
  type SimulateInput,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { SimulationDriver, type SimulateOutcome } from './driver';
import type { SimulationReply, SimulationRequest, SimulationUnavailable } from './messages';
import type { SimulationPort } from './store';

/** A package's `simulate`, as a plain function: `random` is the tick's generator. */
export type StandInStep = (input: SimulateInput, random: () => number) => unknown;

export interface StandInOptions {
  /** Why a package cannot simulate, by package; every other one can. */
  unavailable?: Record<Id, SimulationUnavailable>;
  /** Whether a worker runs at all: without one, nothing is asked. True when left out. */
  running?: boolean;
  /** How many ticks one slice of `work()` works out, at most. */
  sliceTicks?: number;
}

export class StandInSimulation implements SimulationPort {
  readonly driver: SimulationDriver;
  readonly failures: { pkg: Id; failure: CodeFailure }[] = [];
  /** Every request the tab made, in order. */
  readonly requests: SimulationRequest[] = [];
  private readonly listeners = new Set<(reply: SimulationReply) => void>();
  private readonly hashes = new Map<Id, string>();
  running: boolean;

  constructor(
    project: ProjectSnapshot,
    private readonly step: StandInStep,
    private readonly options: StandInOptions = {},
  ) {
    this.running = options.running ?? true;
    this.driver = new SimulationDriver({
      code: (pkg) => {
        const reason = this.options.unavailable?.[pkg];
        return reason
          ? { ok: false, reason }
          : { ok: true, hash: this.hashes.get(pkg) ?? 'stand-in' };
      },
      call: (_pkg, input, seed, tick): SimulateOutcome => {
        try {
          return { ok: true, answer: this.step(input, tickRandom(seed, tick)) };
        } catch (error) {
          return { ok: false, failure: { kind: 'threw', message: String(error) } };
        }
      },
      failed: (pkg, failure) => this.failures.push({ pkg, failure }),
    });
    this.driver.refresh(project);
  }

  simulate(request: SimulationRequest): boolean {
    if (!this.running) return false;
    this.requests.push(request);
    this.deliver(this.driver.receive(request));
    return true;
  }

  onSimulation(listener: (reply: SimulationReply) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The project changed, or a package's code did: runs that read otherwise end. */
  refresh(project: ProjectSnapshot, hashes: Record<Id, string> = {}): void {
    for (const [pkg, hash] of Object.entries(hashes)) this.hashes.set(pkg, hash);
    this.deliver(this.driver.refresh(project));
  }

  /** Plays the worker's slices until no run wants more; answers how many slices it took. */
  work(): number {
    let slices = 0;
    while (this.driver.busy) {
      let left = this.options.sliceTicks ?? Number.POSITIVE_INFINITY;
      this.deliver(this.driver.work(() => left-- <= 0));
      slices += 1;
    }
    return slices;
  }

  /** As if the worker stopped and started again: every run is gone. */
  restart(project: ProjectSnapshot): void {
    for (const element of this.driver.elements()) {
      this.driver.receive({ kind: 'simulation/close', element });
    }
    this.driver.refresh(project);
    this.deliver([{ kind: 'simulation/restarted' }]);
  }

  private deliver(replies: SimulationReply[]): void {
    for (const reply of replies) for (const listener of [...this.listeners]) listener(reply);
  }
}

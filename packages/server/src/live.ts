/**
 * The live values the local program keeps for the open project (ADR 0057, ADR 0063): the latest of
 * each target and attribute, in memory only, from Claude, from the command line and from approved
 * package code. They are never commands: nothing here touches the model, a file or the history.
 * Every open app gets them when it connects and every change to them after.
 *
 * Each sender's values go through a gate of twenty messages a second; what comes faster waits,
 * merged, and past a message's worth the oldest of it is dropped. The program says once, for each
 * sender, that it drops values, and once that it holds as many as it keeps in all.
 */
import {
  LIVE_LIMITS,
  LiveGate,
  LiveValueStore,
  checkLiveValues,
  type LiveFilter,
  type LiveKeptMessage,
  type LiveKey,
  type LiveSender,
  type LiveValue,
  type LiveValuesMessage,
  type RefusedValue,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** What the program answers live values with, but for its request id. */
export type LiveKept = Omit<LiveKeptMessage, 'type' | 'requestId'>;

export interface LiveValuesOptions {
  /** The time now, in milliseconds since 1970. */
  now: () => number;
  /** Tells every open app of a change to the live values. */
  broadcast: (message: LiveValuesMessage) => void;
  /** Tells every open app something it should know once, in English the app translates. */
  notice: (message: string) => void;
  /** Prints a line about a problem. */
  err: (line: string) => void;
  /** Runs `task` after `ms` milliseconds; `setTimeout` by default. */
  later?: (task: () => void, ms: number) => { cancel(): void };
  /** The most values kept in all; {@link LIVE_LIMITS.values} by default. */
  limit?: number;
}

/** One sender on one connection: what its values wait in, and whether it was told of drops. */
interface Gate {
  gate: LiveGate;
  sender: LiveSender;
  timer: { cancel(): void } | undefined;
  /** When the timer goes off. */
  wakeAt: number | undefined;
  told: boolean;
  refuseTarget: ((target: Id) => string | undefined) | undefined;
}

/** How many live values one message to an app carries at most. */
export const LIVE_VALUES_PER_MESSAGE = LIVE_LIMITS.valuesPerMessage;

export class LiveValues {
  readonly #options: LiveValuesOptions;
  readonly #store: LiveValueStore;
  /** The gates of each connection, by sender. */
  readonly #gates = new Map<object, Map<string, Gate>>();
  #toldFull = false;
  #closed = false;

  constructor(options: LiveValuesOptions) {
    this.#options = options;
    this.#store = new LiveValueStore(options.limit ?? LIVE_LIMITS.values);
  }

  /** How many live values it keeps. */
  get size(): number {
    return this.#store.size;
  }

  /** Every live value it keeps, oldest first. */
  all(): LiveValue[] {
    return this.#store.all();
  }

  /**
   * Takes live values a sender sent on a connection: those that are live values, of targets the model
   * holds, and that `refuseTarget` does not refuse, are kept at once or once the sender's second has
   * room. Says what it kept and what it did not.
   */
  set(
    connection: object,
    sender: LiveSender,
    list: unknown,
    options: {
      freshFor?: number;
      /** Whether a target is an element or a relation of the model now. */
      exists: (target: Id) => boolean;
      /** Why a value of this target may not come from this sender; undefined when it may. */
      refuseTarget?: (target: Id) => string | undefined;
      /** What the program calls the sender, in what it says once. */
      senderName: string;
    },
  ): LiveKept {
    const checked = checkLiveValues(list);
    const refused: RefusedValue[] = [...checked.refused];
    const unknown = new Set<Id>();
    const now = this.#options.now();
    const freshFor = options.freshFor ?? LIVE_LIMITS.freshFor;
    const stamped: LiveValue[] = [];
    // The places of the values kept, to name the ones refused by their place in what was sent.
    const places = placesOf(list, checked.dropped);
    for (const value of checked.values) {
      if (!options.exists(value.target)) {
        unknown.add(value.target);
        continue;
      }
      const reason = options.refuseTarget?.(value.target);
      if (reason !== undefined) {
        refused.push({ at: places(value.target, value.attribute), reason });
        continue;
      }
      stamped.push({ ...value, sender, arrivedAt: now, freshFor });
    }
    refused.sort((a, b) => a.at - b.at);
    if (this.#closed) {
      return { kept: 0, waiting: 0, dropped: 0, unknown: [...unknown], refused };
    }
    const gate = this.#gateOf(connection, sender, options.refuseTarget);
    const outcome = gate.gate.offer(stamped, now);
    const kept = outcome.pass.length > 0 ? this.#keep(outcome.pass) : 0;
    const dropped = checked.dropped + outcome.dropped;
    if (dropped > 0) this.#tellDropped(gate, options.senderName);
    if (outcome.wakeAt !== undefined) this.#wakeAt(gate, outcome.wakeAt, options);
    return { kept, waiting: outcome.waiting, dropped, unknown: [...unknown], refused };
  }

  /**
   * Clears the live values that match: what one sender sent, of some targets or attributes. What
   * waits to be kept and matches goes too. Gives back how many it cleared.
   */
  clear(filter: LiveFilter): number {
    const removed = this.#store.clear(filter);
    for (const gates of this.#gates.values()) {
      for (const gate of gates.values()) {
        if (filter.sender !== undefined && !sameKind(gate.sender, filter.sender)) continue;
        const targets = filter.targets === undefined ? undefined : new Set(filter.targets);
        const attributes = filter.attributes === undefined ? undefined : new Set(filter.attributes);
        gate.gate.discard(
          (value) =>
            (targets === undefined || targets.has(value.target)) &&
            (attributes === undefined || attributes.has(value.attribute)),
        );
      }
    }
    this.#tellRemoved(removed);
    return removed.length;
  }

  /** Forgets the values of targets the model no longer holds, as after a change or a reload. */
  prune(exists: (target: Id) => boolean): void {
    if (this.#store.size === 0) return;
    this.#tellRemoved(this.#store.clearTargetsNotIn(exists));
  }

  /** What an app is sent when it connects: every live value kept, a thousand to a message. */
  greeting(): LiveValuesMessage[] {
    const values = this.#store.all();
    const messages: LiveValuesMessage[] = [];
    for (let at = 0; at < values.length; at += LIVE_VALUES_PER_MESSAGE) {
      messages.push({
        type: 'live/values',
        values: values.slice(at, at + LIVE_VALUES_PER_MESSAGE),
        removed: [],
      });
    }
    return messages;
  }

  /** Forgets a connection that closed: what waits from it is dropped. */
  forget(connection: object): void {
    const gates = this.#gates.get(connection);
    if (gates === undefined) return;
    for (const gate of gates.values()) gate.timer?.cancel();
    this.#gates.delete(connection);
  }

  /** Stops every timer; later values are not kept. */
  close(): void {
    this.#closed = true;
    for (const connection of [...this.#gates.keys()]) this.forget(connection);
  }

  #gateOf(
    connection: object,
    sender: LiveSender,
    refuseTarget: ((target: Id) => string | undefined) | undefined,
  ): Gate {
    let gates = this.#gates.get(connection);
    if (gates === undefined) {
      gates = new Map();
      this.#gates.set(connection, gates);
    }
    const key = sender.kind === 'package' ? `package:${sender.package}` : sender.kind;
    let gate = gates.get(key);
    if (gate === undefined) {
      gate = {
        gate: new LiveGate(),
        sender,
        timer: undefined,
        wakeAt: undefined,
        told: false,
        refuseTarget,
      };
      gates.set(key, gate);
    }
    gate.refuseTarget = refuseTarget;
    return gate;
  }

  /** Keeps values, and tells every app; gives back how many it kept. */
  #keep(values: readonly LiveValue[]): number {
    const outcome = this.#store.set(values);
    if (outcome.dropped.length > 0 && !this.#toldFull) {
      this.#toldFull = true;
      const said = `Visual Anything keeps at most ${LIVE_LIMITS.values.toLocaleString('en-US')} live values, so it drops the oldest to make room for newer ones.`;
      this.#options.err(said);
      this.#options.notice(said);
    }
    if (outcome.kept.length > 0 || outcome.dropped.length > 0) {
      this.#options.broadcast({
        type: 'live/values',
        values: outcome.kept,
        removed: outcome.dropped,
      });
    }
    return outcome.kept.length;
  }

  #tellRemoved(removed: readonly LiveKey[]): void {
    if (removed.length === 0) return;
    for (let at = 0; at < removed.length; at += LIVE_VALUES_PER_MESSAGE) {
      this.#options.broadcast({
        type: 'live/values',
        values: [],
        removed: removed.slice(at, at + LIVE_VALUES_PER_MESSAGE),
      });
    }
  }

  #tellDropped(gate: Gate, senderName: string): void {
    if (gate.told) return;
    gate.told = true;
    const said = `Live values from ${senderName} come faster than Visual Anything takes them: it takes twenty messages a second and a thousand values a message, and drops the oldest past that.`;
    this.#options.err(said);
    this.#options.notice(said);
  }

  /** Comes back for what waits in a gate once its sender's second has room. */
  #wakeAt(
    gate: Gate,
    at: number,
    options: { exists: (target: Id) => boolean; senderName: string },
  ): void {
    if (gate.timer !== undefined && gate.wakeAt !== undefined && gate.wakeAt <= at) return;
    gate.timer?.cancel();
    gate.wakeAt = at;
    const later = this.#options.later ?? defaultLater;
    gate.timer = later(
      () => {
        gate.timer = undefined;
        gate.wakeAt = undefined;
        if (this.#closed) return;
        const outcome = gate.gate.wake(this.#options.now());
        // What waited may be of something deleted meanwhile.
        const pass = outcome.pass.filter(
          (value) =>
            options.exists(value.target) && gate.refuseTarget?.(value.target) === undefined,
        );
        if (pass.length > 0) this.#keep(pass);
        if (outcome.wakeAt !== undefined) this.#wakeAt(gate, outcome.wakeAt, options);
      },
      Math.max(0, at - this.#options.now()),
    );
  }
}

function defaultLater(task: () => void, ms: number): { cancel(): void } {
  const timer = setTimeout(task, ms);
  timer.unref?.();
  return { cancel: () => clearTimeout(timer) };
}

function sameKind(a: LiveSender, b: LiveSender): boolean {
  return a.kind === b.kind && (a.kind !== 'package' || a.package === (b as typeof a).package);
}

/**
 * The place, in what a sender sent, of the last value of a target and attribute: what a value refused
 * after its checks is named by.
 */
function placesOf(list: unknown, from: number): (target: Id, attribute: string) => number {
  let places: Map<string, number> | undefined;
  return (target, attribute) => {
    if (places === undefined) {
      places = new Map();
      if (Array.isArray(list)) {
        for (let at = from; at < list.length; at += 1) {
          const item: unknown = list[at];
          if (typeof item !== 'object' || item === null) continue;
          const { target: t, attribute: a } = item as Record<string, unknown>;
          if (typeof t === 'string' && typeof a === 'string') places.set(`${t}\u0000${a}`, at);
        }
      }
    }
    return places.get(`${target}\u0000${attribute}`) ?? 0;
  };
}

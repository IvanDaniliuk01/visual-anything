/**
 * The live values this tab knows (ADR 0057): what the local program sends, kept outside React, by
 * target and attribute. They are forgotten when the project opens anew and when the connection
 * closes, since the program forgets them when it stops.
 *
 * What reads them hears of a change at most four times a second, however fast values come, and once
 * more when a value goes stale or the age a stale value says moves on, so that the canvas fades it
 * and says how old it is without anything new arriving.
 */
import { liveAge, type LiveValue, type LiveValuesMessage } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** The live values at one moment, as React reads them: a new object whenever they change. */
export interface LiveView {
  /** Counts the changes, from 0. */
  readonly version: number;
  /** When this view was made, which ages are told against. */
  readonly now: number;
  /** The live values of a target, by attribute; undefined when it has none. */
  of(target: Id): ReadonlyMap<string, LiveValue> | undefined;
  /** The targets that have live values. */
  readonly targets: ReadonlySet<Id>;
  /** How many live values there are. */
  readonly size: number;
}

export const NO_LIVE_VALUES: LiveView = Object.freeze({
  version: 0,
  now: 0,
  of: () => undefined,
  targets: new Set<Id>(),
  size: 0,
});

/** The fewest milliseconds between two changes readers hear of. */
export const LIVE_NOTICE_MS = 250;

/** How the book keeps time; tests give their own. */
export interface BookClock {
  now(): number;
  later(task: () => void, ms: number): { cancel(): void };
}

const SYSTEM_CLOCK: BookClock = {
  now: () => Date.now(),
  later: (task, ms) => {
    const timer = setTimeout(task, ms);
    return { cancel: () => clearTimeout(timer) };
  },
};

export class LiveValueBook {
  private readonly values = new Map<Id, Map<string, LiveValue>>();
  private count = 0;
  private view: LiveView = NO_LIVE_VALUES;
  /** What the last view holds, which the next one copies but for the targets changed since. */
  private frozen = new Map<Id, ReadonlyMap<string, LiveValue>>();
  private readonly changedTargets = new Set<Id>();
  private lastNotice = Number.NEGATIVE_INFINITY;
  private timer: { cancel(): void } | undefined;
  /** When the timer goes off. */
  private timerAt = Number.POSITIVE_INFINITY;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly clock: BookClock = SYSTEM_CLOCK) {}

  /** Calls `listener` after every change readers hear of; returns what stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The live values as readers last heard of them. */
  readonly current = (): LiveView => this.view;

  /** Takes what the program sent: values new or changed, and those that are gone. */
  apply(message: LiveValuesMessage): void {
    for (const key of message.removed) {
      const values = this.values.get(key.target);
      if (values?.delete(key.attribute)) {
        this.count -= 1;
        this.changedTargets.add(key.target);
        if (values.size === 0) this.values.delete(key.target);
      }
    }
    for (const value of message.values) {
      let values = this.values.get(value.target);
      if (values === undefined) {
        values = new Map();
        this.values.set(value.target, values);
      }
      if (!values.has(value.attribute)) this.count += 1;
      values.set(value.attribute, value);
      this.changedTargets.add(value.target);
    }
    if (message.values.length > 0 || message.removed.length > 0) this.changed();
  }

  /** Forgets every live value, as when the project opens anew or the connection closes. */
  clear(): void {
    if (this.values.size === 0 && this.view.size === 0) return;
    for (const target of this.values.keys()) this.changedTargets.add(target);
    for (const target of this.frozen.keys()) this.changedTargets.add(target);
    this.values.clear();
    this.count = 0;
    this.changed();
  }

  /** Stops the timer; nothing more is heard of. */
  dispose(): void {
    this.timer?.cancel();
    this.timer = undefined;
    this.listeners.clear();
  }

  private changed(): void {
    this.schedule(this.lastNotice + LIVE_NOTICE_MS);
  }

  /** Makes sure readers hear of the book again by `at`, at the latest. */
  private schedule(at: number): void {
    if (this.timer !== undefined && this.timerAt <= at) return;
    this.timer?.cancel();
    this.timerAt = at;
    this.timer = this.clock.later(
      () => {
        this.timer = undefined;
        this.timerAt = Number.POSITIVE_INFINITY;
        this.publish();
      },
      Math.max(0, at - this.clock.now()),
    );
  }

  private publish(): void {
    const now = this.clock.now();
    this.lastNotice = now;
    // Changed values, or only time moving on: either way the view is new, with its time. What it
    // holds is copied, so that a view never changes under what reads it: only the targets changed.
    const values = this.values;
    const copied = new Map(this.frozen);
    for (const target of this.changedTargets) {
      const byAttribute = values.get(target);
      if (byAttribute === undefined) copied.delete(target);
      else copied.set(target, new Map(byAttribute));
    }
    this.changedTargets.clear();
    this.frozen = copied;
    const targets: ReadonlySet<Id> = new Set(copied.keys());
    this.view = Object.freeze({
      version: this.view.version + 1,
      now,
      of: (target: Id) => copied.get(target),
      targets,
      size: this.count,
    });
    const next = nextChangeOf(values, now);
    if (next !== undefined) this.schedule(next);
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * When what the values show next changes with time alone: the first fresh value going stale, or the
 * first stale value's age moving on to the next minute, hour or day it says.
 */
export function nextChangeOf(
  values: ReadonlyMap<Id, ReadonlyMap<string, LiveValue>>,
  now: number,
): number | undefined {
  let next = Number.POSITIVE_INFINITY;
  for (const byAttribute of values.values()) {
    for (const value of byAttribute.values()) {
      const { stale, staleAt, since, age } = liveAge(value, now);
      if (!stale) next = Math.min(next, staleAt + 1);
      else next = Math.min(next, since + nextStepOf(age));
    }
  }
  return Number.isFinite(next) ? Math.max(next, now + 1) : undefined;
}

/** The age at which what an age of `age` says next changes: the next minute, hour or day. */
function nextStepOf(age: number): number {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const step = age < hour ? minute : age < day ? hour : day;
  return (Math.floor(age / step) + 1) * step;
}

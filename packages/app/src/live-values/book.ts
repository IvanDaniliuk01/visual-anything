/**
 * The live values this tab knows (ADR 0057): what the local program sends, kept outside React, by
 * target and attribute. They are forgotten when the project opens anew and when the connection
 * closes, since the program forgets them when it stops.
 *
 * What reads them hears of a change at most four times a second, however fast values come, and once
 * more when a value goes stale or the age a stale value says moves on, so that the canvas fades it
 * and says how old it is without anything new arriving.
 *
 * Each view can say which targets read otherwise than in an earlier view of the same book: those
 * whose values changed, and those whose stale values' age, as the canvas writes it, moved on. What
 * draws them then works again on those alone (ADR 0057's clarification of W44).
 */
import { liveAge, type LiveValue, type LiveValuesMessage } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { ageStep } from './words';

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
  /**
   * The targets that read otherwise here than in `before`, an earlier view of the same book: their
   * values changed, or the age a stale one says moved on. Undefined when it cannot tell, as of a view
   * too far back; absent on a view that never can.
   */
  changedSince?(before: LiveView): ReadonlySet<Id> | undefined;
}

const NOTHING: ReadonlySet<Id> = new Set();

export const NO_LIVE_VALUES: LiveView = Object.freeze({
  version: 0,
  now: 0,
  of: () => undefined,
  targets: NOTHING,
  size: 0,
  changedSince: (before: LiveView) => (before === NO_LIVE_VALUES ? NOTHING : undefined),
});

/** How many publishes back a view can say what changed. */
const KEPT_CHANGES = 32;

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

/** How many publishes a shelf holds over the one it flattens to. */
const MOST_SHELVES = 8;

/**
 * What a view reads, frozen: the targets one publish changed, each with its values or none, over
 * what the publish before held. A publish so keeps only what changed; every few, the shelves are
 * flattened into one, so that reading one target stays a few steps.
 */
class Shelf {
  private flat: ReadonlyMap<Id, ReadonlyMap<string, LiveValue>> | undefined;

  /** A shelf over none holds every target with values, and only those. */
  constructor(
    private readonly own: ReadonlyMap<Id, ReadonlyMap<string, LiveValue> | undefined>,
    private readonly below: Shelf | undefined,
    readonly depth: number,
  ) {
    if (below === undefined) this.flat = own as ReadonlyMap<Id, ReadonlyMap<string, LiveValue>>;
  }

  /** The values of a target, by attribute; undefined when it has none. */
  get(target: Id): ReadonlyMap<string, LiveValue> | undefined {
    if (this.flat !== undefined) return this.flat.get(target);
    if (this.own.has(target)) return this.own.get(target);
    // At most a few shelves down.
    return this.below?.get(target);
  }

  /** Every target with values, and its values, worked out once, in one copy. */
  all(): ReadonlyMap<Id, ReadonlyMap<string, LiveValue>> {
    if (this.flat !== undefined) return this.flat;
    const above: Shelf[] = [this];
    let shelf = this.below;
    while (shelf !== undefined && shelf.flat === undefined) {
      above.push(shelf);
      shelf = shelf.below;
    }
    const flat = new Map(shelf?.flat);
    for (let at = above.length - 1; at >= 0; at--) {
      for (const [target, values] of (above[at] as Shelf).own) {
        if (values === undefined) flat.delete(target);
        else flat.set(target, values);
      }
    }
    this.flat = flat;
    return flat;
  }

  /** The shelf over this one with what a publish changed; flattened once it is deep. */
  over(own: ReadonlyMap<Id, ReadonlyMap<string, LiveValue> | undefined>): Shelf {
    const next = new Shelf(own, this, this.depth + 1);
    return next.depth < MOST_SHELVES ? next : new Shelf(next.all(), undefined, 0);
  }
}

export class LiveValueBook {
  private readonly values = new Map<Id, Map<string, LiveValue>>();
  private count = 0;
  private view: LiveView = NO_LIVE_VALUES;
  /** What the last view holds, which the next one keeps under the targets changed since. */
  private shelf = new Shelf(new Map(), undefined, 0);
  private readonly changedTargets = new Set<Id>();
  private lastNotice = Number.NEGATIVE_INFINITY;
  private timer: { cancel(): void } | undefined;
  /** When the timer goes off. */
  private timerAt = Number.POSITIVE_INFINITY;
  private readonly listeners = new Set<() => void>();
  /** What each of the last publishes changed, by the version it made, oldest first. */
  private readonly changes: { version: number; targets: ReadonlySet<Id> }[] = [];
  /** The step of its age each stale value said when last published; absent while fresh. */
  private readonly steps = new WeakMap<LiveValue, number>();
  /** The views this book made, so that a view can tell another book's from its own. */
  private readonly made = new WeakSet<LiveView>();

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
    for (const target of this.shelf.all().keys()) this.changedTargets.add(target);
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
    // holds is kept apart, so that a view never changes under what reads it: only the targets
    // changed are copied, over what the view before holds.
    const values = this.values;
    const own = new Map<Id, ReadonlyMap<string, LiveValue> | undefined>();
    const changed = new Set(this.changedTargets);
    for (const target of this.changedTargets) {
      const byAttribute = values.get(target);
      own.set(target, byAttribute === undefined ? undefined : new Map(byAttribute));
    }
    this.changedTargets.clear();
    const shelf = this.shelf.over(own);
    this.shelf = shelf;
    const next = this.scanAges(now, changed);
    const version = this.view.version + 1;
    this.changes.push({ version, targets: changed });
    if (this.changes.length > KEPT_CHANGES) this.changes.shift();
    let targets: ReadonlySet<Id> | undefined;
    const view: LiveView = Object.freeze({
      version,
      now,
      of: (target: Id) => shelf.get(target),
      // Worked out only when asked for: reading a target needs no list of them.
      get targets(): ReadonlySet<Id> {
        targets ??= new Set(shelf.all().keys());
        return targets;
      },
      size: this.count,
      changedSince: (before: LiveView) => this.changedBetween(before, view),
    });
    this.made.add(view);
    this.view = view;
    if (next !== undefined) this.schedule(next);
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * Adds to `changed` the targets whose stale values' age, as the canvas writes it, is not what it
   * was when last published, or that went stale; and says when what the values show next changes
   * with time alone, as `nextChangeOf` does.
   */
  private scanAges(now: number, changed: Set<Id>): number | undefined {
    let next = Number.POSITIVE_INFINITY;
    for (const [target, byAttribute] of this.values) {
      for (const value of byAttribute.values()) {
        // As `liveAge` tells it, without making anything for each value.
        const { measuredAt, arrivedAt } = value;
        const since = measuredAt !== undefined && measuredAt <= arrivedAt ? measuredAt : arrivedAt;
        const age = Math.max(0, now - since);
        const staleAt = since + value.freshFor;
        const stale = now > staleAt;
        if (!stale) {
          next = Math.min(next, staleAt + 1);
          continue;
        }
        next = Math.min(next, since + nextStepOf(age));
        const step = ageStep(age);
        if (this.steps.get(value) !== step) {
          this.steps.set(value, step);
          changed.add(target);
        }
      }
    }
    return Number.isFinite(next) ? Math.max(next, now + 1) : undefined;
  }

  /** The targets that read otherwise in `after` than in `before`; undefined when it cannot tell. */
  private changedBetween(before: LiveView, after: LiveView): ReadonlySet<Id> | undefined {
    if (before === after) return NOTHING;
    // From no values at all, as before the book published: everything there is.
    if (before === NO_LIVE_VALUES || (!this.made.has(before) && before.size === 0)) {
      return after.targets;
    }
    if (!this.made.has(before) || before.version > after.version) return undefined;
    const oldest = this.changes[0];
    if (oldest === undefined || oldest.version > before.version + 1) return undefined;
    const found = new Set<Id>();
    for (const each of this.changes) {
      if (each.version <= before.version) continue;
      if (each.version > after.version) break;
      for (const target of each.targets) found.add(target);
    }
    return found;
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

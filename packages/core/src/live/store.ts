/**
 * Where live values are kept (ADR 0057): the latest value of each target and attribute, in memory
 * only. It holds at most {@link LIVE_LIMITS.values}; a value that comes past that makes way by
 * dropping the oldest, the value that went longest without a newer one. The local program keeps one
 * store for the open project; nothing in it is ever written anywhere.
 */
import type { Id } from '@visual-anything/schema';
import { LIVE_LIMITS, liveKey, sameSender, type LiveSender, type LiveValue } from './values';

/** A live value's target and attribute: what names it in the store. */
export interface LiveKey {
  target: Id;
  attribute: string;
}

/** What to clear: every value that matches each part given. */
export interface LiveFilter {
  /** Only what this sender sent. */
  sender?: LiveSender;
  /** Only the values of these targets. */
  targets?: readonly Id[];
  /** Only the values of these attributes. */
  attributes?: readonly string[];
}

/** What setting values did: the values kept, and those dropped to make room for them. */
export interface LiveSetOutcome {
  kept: LiveValue[];
  /** The keys of older values dropped because the store was full. */
  dropped: LiveKey[];
}

export class LiveValueStore {
  /** By key, oldest first: a value set again moves to the end. */
  private readonly values = new Map<string, LiveValue>();

  constructor(private readonly limit: number = LIVE_LIMITS.values) {}

  /** How many values it holds. */
  get size(): number {
    return this.values.size;
  }

  /** Sets values, each in place of the one of its target and attribute, and drops the oldest past the cap. */
  set(values: readonly LiveValue[]): LiveSetOutcome {
    const kept: LiveValue[] = [];
    for (const value of values) {
      const key = liveKey(value.target, value.attribute);
      this.values.delete(key);
      this.values.set(key, value);
      kept.push(value);
    }
    const dropped: LiveKey[] = [];
    if (this.values.size > this.limit) {
      const over = this.values.size - this.limit;
      const keys = this.values.keys();
      const gone: string[] = [];
      for (let i = 0; i < over; i += 1) gone.push(keys.next().value as string);
      for (const key of gone) {
        const value = this.values.get(key) as LiveValue;
        this.values.delete(key);
        dropped.push({ target: value.target, attribute: value.attribute });
      }
    }
    // A value dropped as soon as it came, past the cap, was not kept after all.
    const keptNow = dropped.length === 0 ? kept : kept.filter((each) => this.has(each));
    return { kept: keptNow, dropped };
  }

  /** The value of a target's attribute, if any. */
  get(target: Id, attribute: string): LiveValue | undefined {
    return this.values.get(liveKey(target, attribute));
  }

  /** Every value it holds, oldest first. */
  all(): LiveValue[] {
    return [...this.values.values()];
  }

  /** Clears what matches the filter, and gives back the keys cleared. An empty filter clears everything. */
  clear(filter: LiveFilter = {}): LiveKey[] {
    const targets = filter.targets === undefined ? undefined : new Set(filter.targets);
    const attributes = filter.attributes === undefined ? undefined : new Set(filter.attributes);
    return this.removeWhere(
      (value) =>
        (filter.sender === undefined || sameSender(value.sender, filter.sender)) &&
        (targets === undefined || targets.has(value.target)) &&
        (attributes === undefined || attributes.has(value.attribute)),
    );
  }

  /** Clears the values whose target is no longer there, and gives back their keys. */
  clearTargetsNotIn(exists: (target: Id) => boolean): LiveKey[] {
    return this.removeWhere((value) => !exists(value.target));
  }

  private has(value: LiveValue): boolean {
    return this.values.get(liveKey(value.target, value.attribute)) === value;
  }

  private removeWhere(test: (value: LiveValue) => boolean): LiveKey[] {
    const removed: LiveKey[] = [];
    for (const [key, value] of this.values) {
      if (!test(value)) continue;
      this.values.delete(key);
      removed.push({ target: value.target, attribute: value.attribute });
    }
    return removed;
  }
}

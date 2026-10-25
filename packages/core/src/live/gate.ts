/**
 * How fast one sender's live values are taken (ADR 0057): from at most twenty messages a second. A
 * message past that waits, merged with the others that wait, the latest value of each target and
 * attribute winning, until its sender's second has room; what waits is at most a message's worth of
 * values, and past that the oldest of them are dropped. Nothing here keeps time itself: it is told
 * the time, and says when to come back.
 */
import { LIVE_LIMITS, liveKey, type LiveValue } from './values';

/** What the gate lets through now, and what waits. */
export interface GateOutcome {
  /** The values to keep now, if any. */
  pass: LiveValue[];
  /** How many values wait for their sender's second to have room. */
  waiting: number;
  /** How many waiting values were dropped to make room for newer ones. */
  dropped: number;
  /** When to come back with {@link LiveGate.wake} for what waits; absent when nothing does. */
  wakeAt?: number;
}

export class LiveGate {
  /** When each of the messages taken in the last second was taken, oldest first. */
  private readonly taken: number[] = [];
  /** What waits, by target and attribute, oldest first. */
  private readonly pending = new Map<string, LiveValue>();

  constructor(
    private readonly perSecond: number = LIVE_LIMITS.messagesPerSecond,
    private readonly mostWaiting: number = LIVE_LIMITS.valuesPerMessage,
  ) {}

  /** Takes a message's values at time `now`: through at once while the second has room, else to wait. */
  offer(values: readonly LiveValue[], now: number): GateOutcome {
    this.forget(now);
    if (this.pending.size === 0 && this.taken.length < this.perSecond) {
      this.taken.push(now);
      return { pass: [...values], waiting: 0, dropped: 0 };
    }
    let dropped = 0;
    for (const value of values) {
      const key = liveKey(value.target, value.attribute);
      this.pending.delete(key);
      this.pending.set(key, value);
    }
    while (this.pending.size > this.mostWaiting) {
      const oldest = this.pending.keys().next().value as string;
      this.pending.delete(oldest);
      dropped += 1;
    }
    return this.waitingOutcome(now, [], dropped);
  }

  /** Lets what waits through, as one message, once the second has room for it. */
  wake(now: number): GateOutcome {
    this.forget(now);
    if (this.pending.size === 0) return { pass: [], waiting: 0, dropped: 0 };
    if (this.taken.length >= this.perSecond) return this.waitingOutcome(now, [], 0);
    this.taken.push(now);
    const pass = [...this.pending.values()];
    this.pending.clear();
    return { pass, waiting: 0, dropped: 0 };
  }

  /** Drops what waits and passes the test, as when its values are cleared before their turn. */
  discard(test: (value: LiveValue) => boolean): void {
    for (const [key, value] of this.pending) if (test(value)) this.pending.delete(key);
  }

  /** How many values wait now. */
  get waiting(): number {
    return this.pending.size;
  }

  private waitingOutcome(now: number, pass: LiveValue[], dropped: number): GateOutcome {
    const oldest = this.taken[0];
    const wakeAt = this.taken.length < this.perSecond || oldest === undefined ? now : oldest + 1000;
    return { pass, waiting: this.pending.size, dropped, wakeAt };
  }

  /** Forgets the messages taken more than a second ago. */
  private forget(now: number): void {
    while (this.taken.length > 0 && (this.taken[0] as number) <= now - 1000) this.taken.shift();
  }
}

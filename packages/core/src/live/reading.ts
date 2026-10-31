/**
 * How an attribute reads (ADR 0057, ADR 0063, ADR 0085): a simulated value over a live one, a live
 * value over a computed one, a computed value over the stored one, and the stored one over its
 * definition's default. Whatever reads attributes in the app, the inspector, the detail, overlays and
 * filters, reads them through this, so that each shows the same value with the same mark.
 */
import type { Attributes, Id, JsonValue } from '@visual-anything/schema';
import type { LiveValue } from './values';

/** Where the value an attribute reads comes from. */
export type AttributeOrigin =
  /** Worked out by a simulation run shown in the tab (ADR 0085): never saved. */
  | 'simulated'
  /** From outside, while the app is open: never saved. */
  | 'live'
  /** Computed by package code: never saved. */
  | 'computed'
  /** The element's or relation's own value, in the model. */
  | 'stored'
  /** The default its component or relation type gives. */
  | 'default';

/** An attribute as it reads, with where its value comes from. */
export interface AttributeReading {
  name: string;
  value: JsonValue;
  origin: AttributeOrigin;
  /** For a live value: all of it, with its sender and when it arrived. */
  live?: LiveValue;
  /** For a computed or a simulated value: the package whose code worked it out. */
  package?: Id;
}

/** A value package code computed, with its package. */
export interface ComputedReading {
  value: JsonValue;
  package: Id;
}

/** Everything an element's or relation's attributes are read from. */
export interface AttributeSources {
  /** Its own values, as the model holds them. */
  own?: Attributes | undefined;
  /** The default its definition gives an attribute, if any. */
  defaultOf?: (name: string) => JsonValue | undefined;
  /** What package code computed for it, by attribute. */
  computed?: ReadonlyMap<string, ComputedReading> | undefined;
  /** Its live values, by attribute. */
  live?: ReadonlyMap<string, LiveValue> | undefined;
  /** The values the simulation run shown for it answered at the tick shown, by attribute. */
  simulated?: ReadonlyMap<string, ComputedReading> | undefined;
}

/** How one attribute reads; undefined when it has no value from anywhere. */
export function readAttribute(
  sources: AttributeSources,
  name: string,
): AttributeReading | undefined {
  const simulated = sources.simulated?.get(name);
  if (simulated !== undefined) {
    return { name, value: simulated.value, origin: 'simulated', package: simulated.package };
  }
  const live = sources.live?.get(name);
  if (live !== undefined) return { name, value: live.value, origin: 'live', live };
  const computed = sources.computed?.get(name);
  if (computed !== undefined) {
    return { name, value: computed.value, origin: 'computed', package: computed.package };
  }
  const own = sources.own;
  if (own !== undefined && Object.hasOwn(own, name)) {
    return { name, value: own[name] as JsonValue, origin: 'stored' };
  }
  const fallback = sources.defaultOf?.(name);
  return fallback === undefined ? undefined : { name, value: fallback, origin: 'default' };
}

/** How old a live value is at a time, and whether it is past its freshness. */
export interface LiveAge {
  /** When it counts from: when it was measured, if given and not after it arrived, else when it arrived. */
  since: number;
  /** How old it is, in milliseconds; never below 0. */
  age: number;
  /** Whether it is older than its sender said it stays fresh. */
  stale: boolean;
  /** When it goes stale, or went. */
  staleAt: number;
}

/**
 * How old a live value is at `now`. It counts from when it was measured, so that a value measured
 * long ago reads as old however soon it arrived; a time measured after it arrived, which only a clock
 * that is off can give, counts as when it arrived.
 */
export function liveAge(value: LiveValue, now: number): LiveAge {
  const since =
    value.measuredAt !== undefined && value.measuredAt <= value.arrivedAt
      ? value.measuredAt
      : value.arrivedAt;
  const age = Math.max(0, now - since);
  const staleAt = since + value.freshFor;
  return { since, age, stale: now > staleAt, staleAt };
}

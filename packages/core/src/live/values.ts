/**
 * Live values (ADR 0057, ADR 0063): attribute values that come from outside while the app is open,
 * from Claude, from the command line or from approved package code, and that the local program keeps
 * in memory only. They are never commands, never saved and never in the history. This is what one is,
 * the limits on them, and the checks every value goes through before the program keeps it: whoever
 * sends them, nothing of a value but its plain data within its cap is ever kept.
 */
import type { Id, JsonValue } from '@visual-anything/schema';
import { plainSizeOf } from '../code/answers';
import { isId } from '../ids';

export const LIVE_LIMITS = Object.freeze({
  /** The most values one message keeps; past that, the oldest in it, those first in its list, go. */
  valuesPerMessage: 1000,
  /** The messages a second one sender's values are taken from; past that, they wait, merged. */
  messagesPerSecond: 20,
  /** The most live values the program keeps in all; past that, the oldest go. */
  values: 100_000,
  /** The longest value, written as JSON, in characters. */
  valueText: 1024,
  /** How deep a value may nest. */
  depth: 16,
  /** The longest attribute name. */
  attributeName: 64,
  /** How long a value stays fresh unless its sender says otherwise, in milliseconds: a minute. */
  freshFor: 60_000,
  /** The shortest and the longest freshness a sender may state, in milliseconds. */
  freshForMin: 1_000,
  freshForMax: 7 * 24 * 60 * 60 * 1000,
  /** The latest time a value may say it was measured at, in milliseconds since 1970: as JavaScript dates go. */
  latestTime: 8.64e15,
});

/** Who sent live values. */
export type LiveSender =
  /** Claude, through `set_live_values`, with values it read from its other MCP servers. */
  | { kind: 'claude' }
  /** A script, through `visual-anything live <folder>`. */
  | { kind: 'command-line' }
  /** The code of a package granted `network:<origin>`, from what it fetched through the program. */
  | { kind: 'package'; package: Id };

/** A live value as its sender gives it. */
export interface LiveValueInput {
  /** The element or relation it is a value of. */
  target: Id;
  /** The attribute it is the value of, which need not be one the target's definition gives. */
  attribute: string;
  value: JsonValue;
  /** When it was measured, in milliseconds since 1970 began, in UTC; absent when not known. */
  measuredAt?: number;
}

/** A live value as the program keeps it and sends it to every open app. */
export interface LiveValue extends LiveValueInput {
  sender: LiveSender;
  /** When the program got it, in milliseconds since 1970 began, in UTC. */
  arrivedAt: number;
  /** How long it stays fresh, in milliseconds, as its sender said: a minute by default. */
  freshFor: number;
}

/** A value refused, by its place in the list it came in, and why, in words after "it". */
export interface RefusedValue {
  at: number;
  reason: string;
}

/** What the checks of a list of values kept. */
export interface CheckedValues {
  values: LiveValueInput[];
  /** The values that are not live values, each with why. */
  refused: RefusedValue[];
  /** How many values past the cap of a message were dropped, the oldest first. */
  dropped: number;
}

/**
 * Checks a list of live values as a sender gave it. Past {@link LIVE_LIMITS.valuesPerMessage}, the
 * values first in the list, the oldest, are dropped. Each value kept is built afresh from its parts:
 * an id, an attribute name, plain data of at most 1 KiB as JSON, and a time it was measured, if any;
 * nothing else rides along. A value whose target and attribute come again later in the list gives way
 * to the later one. It never fails, whatever it is given.
 */
export function checkLiveValues(list: unknown): CheckedValues {
  if (!Array.isArray(list)) {
    return { values: [], refused: [{ at: 0, reason: 'is not a list of values' }], dropped: 0 };
  }
  const dropped = Math.max(0, list.length - LIVE_LIMITS.valuesPerMessage);
  const refused: RefusedValue[] = [];
  const kept = new Map<string, LiveValueInput>();
  for (let at = dropped; at < list.length; at += 1) {
    const checked = checkLiveValue(list[at]);
    if (typeof checked === 'string') {
      refused.push({ at, reason: checked });
      continue;
    }
    const key = liveKey(checked.target, checked.attribute);
    kept.delete(key);
    kept.set(key, checked);
  }
  return { values: [...kept.values()], refused, dropped };
}

/** One live value, built afresh from its parts, or why it is not one. */
export function checkLiveValue(item: unknown): LiveValueInput | string {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return 'is not an object';
  const record = item as Record<string, unknown>;
  const target = ownField(record, 'target');
  const attribute = ownField(record, 'attribute');
  const measuredAt = ownField(record, 'measuredAt');
  if (!isId(target)) return 'has no target id';
  if (!isLiveAttributeName(attribute)) {
    return `has no attribute name of 1 to ${LIVE_LIMITS.attributeName} characters on one line`;
  }
  if (!Object.hasOwn(record, 'value')) return `has no value for "${attribute}"`;
  const value = record.value;
  const size = plainSizeOf(value, LIVE_LIMITS.depth, LIVE_LIMITS.valueText);
  if (!size.ok) return `has a value for "${attribute}" that ${size.reason}`;
  if (measuredAt !== undefined && !isTime(measuredAt)) {
    return 'has a time it was measured at that is not milliseconds since 1970';
  }
  return {
    target,
    attribute,
    value: JSON.parse(JSON.stringify(value)) as JsonValue,
    ...(measuredAt === undefined ? {} : { measuredAt }),
  };
}

/**
 * Reads how long a sender says its values stay fresh, in milliseconds: a minute when it says nothing.
 * Undefined when what it says is not a whole number of milliseconds within the limits.
 */
export function readFreshFor(value: unknown): number | undefined {
  if (value === undefined) return LIVE_LIMITS.freshFor;
  if (!Number.isSafeInteger(value)) return undefined;
  const ms = value as number;
  return ms >= LIVE_LIMITS.freshForMin && ms <= LIVE_LIMITS.freshForMax ? ms : undefined;
}

/** Reads who sent live values, keeping only what that kind of sender holds. */
export function readLiveSender(value: unknown): LiveSender | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { kind, package: pkg } = value as Record<string, unknown>;
  if (kind === 'claude' || kind === 'command-line') return { kind };
  if (kind === 'package' && isId(pkg)) return { kind, package: pkg };
  return undefined;
}

/** Whether two senders are the same one. */
export function sameSender(a: LiveSender, b: LiveSender): boolean {
  return a.kind === b.kind && (a.kind !== 'package' || a.package === (b as typeof a).package);
}

/**
 * Whether a text can name the attribute a live value is of: one line of 1 to 64 characters, with no
 * space around it and no control character, and not `__proto__`.
 */
export function isLiveAttributeName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > LIVE_LIMITS.attributeName) return false;
  if (name.trim() !== name || name === '__proto__') return false;
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      return false;
    }
  }
  return true;
}

/** Whether a value is a time in milliseconds since 1970, as JavaScript dates go. */
export function isTime(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= LIVE_LIMITS.latestTime
  );
}

/** The key a live value is kept under: its target and its attribute. */
export function liveKey(target: Id, attribute: string): string {
  // Neither an id nor an attribute name holds a control character.
  return `${target}\u0000${attribute}`;
}

/** A field the object holds itself, never one it inherits. */
function ownField(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * The live protocol's messages for live values (version 6, ADR 0063). The local program sends every
 * open app the live values it keeps, as `live/values`, and the changes to them. An app sends, for an
 * approved package granted `network:<origin>`, what to fetch from that origin, `live/fetch`, which the
 * program fetches after checking the origin, and the live values the package's code made of it,
 * `live/set`. Each is read strictly, keeping only what it holds.
 */
import type { Capability, Id } from '@visual-anything/schema';
import { readCapability } from '../code/capabilities';
import { isId } from '../ids';
import type { LiveKey } from './store';
import {
  checkLiveValue,
  isLiveAttributeName,
  isTime,
  readFreshFor,
  readLiveSender,
  type LiveValue,
  type RefusedValue,
} from './values';

/** The limits on what package code fetches through the local program (ADR 0063). */
export const LIVE_FETCH_LIMITS = Object.freeze({
  /** The longest address package code may fetch, in characters. */
  url: 2048,
  /** The largest answer the program hands back, in bytes; a larger one is refused. */
  bytes: 256 * 1024,
  /** How long the program waits for an answer, in milliseconds. */
  timeoutMs: 10_000,
  /** The most fetches of one package that may be under way at once. */
  inFlight: 4,
  /** The most addresses one package's code may want fetched; past them, the rest read as not fetched. */
  urls: 16,
  /** How often an address is fetched again, in milliseconds, unless the code says otherwise. */
  every: 30_000,
  /** The shortest and the longest time between two fetches of one address the code may ask for. */
  everyMin: 5_000,
  everyMax: 60 * 60 * 1000,
});

/**
 * Sent to every open app when it connects, in messages of at most a thousand values, and whenever the
 * live values change: those that are new or changed, and those that are gone. An app forgets every
 * live value it holds when the project is opened anew, on `project/opened`.
 */
export interface LiveValuesMessage {
  type: 'live/values';
  values: LiveValue[];
  /** Cleared, dropped to make room, or of a target that is no longer in the model. */
  removed: LiveKey[];
}

/** The answer to live values a sender sent: what the program kept, and what it did not. */
export interface LiveKeptMessage {
  type: 'live/kept';
  requestId: string;
  /** How many it keeps now. */
  kept: number;
  /** How many wait for their sender's second to have room, merged with what waits already. */
  waiting: number;
  /** How many were dropped, the oldest first: past a message's cap, or waiting past it. */
  dropped: number;
  /** The targets that are neither an element nor a relation of the model, each once. */
  unknown: Id[];
  /** The values that are not live values, by their place in the list, and why. */
  refused: RefusedValue[];
}

/** The answer to `live/fetch`: what the origin answered, as text. */
export interface LiveFetchedMessage {
  type: 'live/fetched';
  requestId: string;
  /** The HTTP status the origin answered with. */
  status: number;
  /** The body of its answer, read as UTF-8, of at most 256 KiB. */
  text: string;
}

/** Asks the program to fetch an address for the code of an approved package granted its origin. */
export interface LiveFetchMessage {
  type: 'live/fetch';
  requestId: string;
  package: Id;
  url: string;
}

/** Live values the code of an approved package granted `network:<origin>` made from what it fetched. */
export interface LiveSetMessage {
  type: 'live/set';
  requestId: string;
  package: Id;
  /** Checked one by one where they are kept, so that the sender hears which were refused and why. */
  values: unknown[];
  /** How long they stay fresh, in milliseconds; a minute when left out. */
  freshFor?: number;
}

/** Reads `live/values` strictly. Throws a {@link LiveProtocolProblem} for anything else. */
export function readLiveValuesMessage(message: Record<string, unknown>): LiveValuesMessage {
  const { values, removed } = message;
  if (!Array.isArray(values) || !Array.isArray(removed)) {
    throw new LiveProtocolProblem('Live values come as a list of values and a list removed.');
  }
  return {
    type: 'live/values',
    values: values.map(readKeptValue),
    removed: removed.map(readKey),
  };
}

/** Reads `live/kept` strictly. */
export function readLiveKeptMessage(
  message: Record<string, unknown>,
  requestId: string,
): LiveKeptMessage {
  const { kept, waiting, dropped, unknown, refused } = message;
  if (!isCount(kept) || !isCount(waiting) || !isCount(dropped)) {
    throw new LiveProtocolProblem('The answer to live values counts what was kept.');
  }
  if (!Array.isArray(unknown) || !unknown.every(isId)) {
    throw new LiveProtocolProblem('The answer to live values lists the targets it did not know.');
  }
  if (!Array.isArray(refused)) {
    throw new LiveProtocolProblem('The answer to live values lists what it refused.');
  }
  return {
    type: 'live/kept',
    requestId,
    kept,
    waiting,
    dropped,
    unknown: [...unknown],
    refused: refused.map((each: unknown) => {
      if (typeof each !== 'object' || each === null) {
        throw new LiveProtocolProblem('A value refused has its place and why.');
      }
      const { at, reason } = each as Record<string, unknown>;
      if (!isCount(at) || typeof reason !== 'string') {
        throw new LiveProtocolProblem('A value refused has its place and why.');
      }
      return { at, reason };
    }),
  };
}

/** Reads `live/fetched` strictly. */
export function readLiveFetchedMessage(
  message: Record<string, unknown>,
  requestId: string,
): LiveFetchedMessage {
  const { status, text } = message;
  if (!Number.isInteger(status) || (status as number) < 100 || (status as number) > 599) {
    throw new LiveProtocolProblem('What was fetched has an HTTP status.');
  }
  if (typeof text !== 'string' || text.length > LIVE_FETCH_LIMITS.bytes) {
    throw new LiveProtocolProblem('What was fetched is text of at most 256 KiB.');
  }
  return { type: 'live/fetched', requestId, status: status as number, text };
}

/** Reads `live/fetch` strictly; the address itself is checked where it is fetched. */
export function readLiveFetchMessage(
  message: Record<string, unknown>,
  requestId: string,
): LiveFetchMessage {
  const { package: pkg, url } = message;
  if (!isId(pkg)) throw new LiveProtocolProblem('Fetching names its package by id.');
  if (typeof url !== 'string' || url.length === 0 || url.length > LIVE_FETCH_LIMITS.url) {
    throw new LiveProtocolProblem(
      `Fetching needs an address of at most ${LIVE_FETCH_LIMITS.url} characters.`,
    );
  }
  return { type: 'live/fetch', requestId, package: pkg, url };
}

/**
 * Reads `live/set`'s envelope strictly; its values are checked one by one where they are kept, so that
 * the sender hears which were refused and why.
 */
export function readLiveSetMessage(
  message: Record<string, unknown>,
  requestId: string,
): LiveSetMessage {
  const { package: pkg, values, freshFor } = message;
  if (!isId(pkg)) throw new LiveProtocolProblem('Live values from package code name the package.');
  if (!Array.isArray(values)) throw new LiveProtocolProblem('Live values come as a list.');
  const fresh = readFreshFor(freshFor);
  if (fresh === undefined) throw new LiveProtocolProblem(FRESHNESS);
  return {
    type: 'live/set',
    requestId,
    package: pkg,
    values,
    ...(freshFor === undefined ? {} : { freshFor: fresh }),
  };
}

/** What a sender is told when it says its values stay fresh for a time that cannot be. */
export const FRESHNESS =
  'Live values stay fresh for a whole number of milliseconds, from a second to a week.';

/**
 * An address package code may fetch, read as browsers read it, and the origin of it that one of the
 * granted capabilities names: http or https, with no user or password, its fragment left out. Why
 * not, otherwise.
 */
export function checkFetchAddress(
  url: string,
  granted: readonly Capability[],
): { ok: true; url: string; origin: string } | { ok: false; reason: string } {
  if (url.length > LIVE_FETCH_LIMITS.url) {
    return { ok: false, reason: `is longer than ${LIVE_FETCH_LIMITS.url} characters` };
  }
  let parsed: ParsedAddress;
  try {
    parsed = new WebAddress(url);
  } catch {
    return { ok: false, reason: 'is not a web address' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'is not an http or https address' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'holds a user name or a password' };
  }
  parsed.hash = '';
  const origin = parsed.origin;
  const allowed = granted.some((each) => {
    const read = readCapability(each);
    return read?.kind === 'network' && read.origin === origin;
  });
  if (!allowed) return { ok: false, reason: `is not on an origin granted: ${origin}` };
  return { ok: true, url: parsed.href, origin };
}

/** What the core reads of a web address, as browsers and Node read it. */
interface ParsedAddress {
  protocol: string;
  username: string;
  password: string;
  hash: string;
  readonly origin: string;
  readonly href: string;
}

/** The web's own reader of addresses, which both browsers and Node have, though the core's types do not. */
const WebAddress = (globalThis as unknown as { URL: new (text: string) => ParsedAddress }).URL;

/** Thrown for a live values message that is not one; the protocol turns it into its own error. */
export class LiveProtocolProblem extends Error {
  override name = 'LiveProtocolProblem';
}

function readKeptValue(item: unknown): LiveValue {
  const checked = checkLiveValue(item);
  if (typeof checked === 'string') throw new LiveProtocolProblem(`A live value ${checked}.`);
  const { sender, arrivedAt, freshFor } = item as Record<string, unknown>;
  const read = readLiveSender(sender);
  if (read === undefined) throw new LiveProtocolProblem('A live value names its sender.');
  if (!isTime(arrivedAt)) throw new LiveProtocolProblem('A live value says when it arrived.');
  const fresh = readFreshFor(freshFor);
  if (freshFor === undefined || fresh === undefined) {
    throw new LiveProtocolProblem('A live value says how long it stays fresh.');
  }
  return { ...checked, sender: read, arrivedAt, freshFor: fresh };
}

function readKey(item: unknown): LiveKey {
  if (typeof item !== 'object' || item === null) {
    throw new LiveProtocolProblem('A live value removed is named by its target and attribute.');
  }
  const { target, attribute } = item as Record<string, unknown>;
  if (!isId(target) || !isLiveAttributeName(attribute)) {
    throw new LiveProtocolProblem('A live value removed is named by its target and attribute.');
  }
  return { target, attribute };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

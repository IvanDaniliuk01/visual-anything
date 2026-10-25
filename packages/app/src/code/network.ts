/**
 * What the app fetches for package code granted an origin (ADR 0063): never from the page. The code
 * worker says which addresses each package's code reads; the app asks the local program to fetch
 * each one now and again every so often while it is read, and hands the worker what came. Why one
 * could not be fetched is said once, as a notice.
 */
import type { LiveFetchedMessage } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { LiveResult } from '../live/connection';
import type { CodeRequest, WantedAddress } from './messages';

export interface NetworkOptions {
  /** Asks the local program to fetch an address for a package. */
  fetch: (pkg: Id, url: string) => Promise<LiveResult<LiveFetchedMessage>>;
  /** Hands the worker what was fetched. */
  deliver: (request: Extract<CodeRequest, { kind: 'fetched' }>) => void;
  /** Says once why an address could not be fetched, as the program wrote it. */
  tell: (message: string) => void;
  /** Runs `task` after `ms` milliseconds; `setTimeout` by default. */
  later?: (task: () => void, ms: number) => { cancel(): void };
}

interface Wanted {
  every: number;
  timer: { cancel(): void } | undefined;
  /** Whether a fetch of it is under way. */
  busy: boolean;
}

export class PackageNetwork {
  /** By package, then address. */
  private readonly wanted = new Map<Id, Map<string, Wanted>>();
  /** What was said already, so that each problem is said once. */
  private readonly told = new Set<string>();
  private disposed = false;

  constructor(private readonly options: NetworkOptions) {}

  /** Takes every address a package's code wants now: new ones are fetched at once, gone ones no more. */
  want(pkg: Id, addresses: readonly WantedAddress[]): void {
    if (this.disposed) return;
    let byUrl = this.wanted.get(pkg);
    if (!byUrl) {
      byUrl = new Map();
      this.wanted.set(pkg, byUrl);
    }
    const now = new Map(addresses.map((each) => [each.url, each.every]));
    for (const [url, entry] of [...byUrl]) {
      if (now.has(url)) continue;
      entry.timer?.cancel();
      byUrl.delete(url);
    }
    for (const [url, every] of now) {
      const entry = byUrl.get(url);
      if (entry) {
        entry.every = every;
        continue;
      }
      const added: Wanted = { every, timer: undefined, busy: false };
      byUrl.set(url, added);
      this.fetchNow(pkg, url, added);
    }
    if (byUrl.size === 0) this.wanted.delete(pkg);
  }

  /** Stops fetching for every package but these. */
  keep(packages: ReadonlySet<Id>): void {
    for (const pkg of [...this.wanted.keys()]) if (!packages.has(pkg)) this.want(pkg, []);
  }

  /** Stops every fetch to come. */
  dispose(): void {
    this.disposed = true;
    for (const byUrl of this.wanted.values())
      for (const entry of byUrl.values()) entry.timer?.cancel();
    this.wanted.clear();
  }

  private fetchNow(pkg: Id, url: string, entry: Wanted): void {
    if (entry.busy || this.disposed) return;
    entry.busy = true;
    void this.options.fetch(pkg, url).then((result) => {
      entry.busy = false;
      if (this.disposed || this.wanted.get(pkg)?.get(url) !== entry) return;
      if (result.ok) {
        const { status, text } = result.answer;
        this.options.deliver({ kind: 'fetched', package: pkg, url, response: { status, text } });
      } else {
        for (const problem of result.problems) {
          // A connection that closed says so itself.
          if (problem.code === 'connection-closed') continue;
          const key = `${pkg}\u0000${problem.message}`;
          if (this.told.has(key)) continue;
          this.told.add(key);
          this.options.tell(problem.message);
        }
      }
      const later = this.options.later ?? defaultLater;
      entry.timer = later(() => {
        entry.timer = undefined;
        if (this.wanted.get(pkg)?.get(url) === entry) this.fetchNow(pkg, url, entry);
      }, entry.every);
    });
  }
}

function defaultLater(task: () => void, ms: number): { cancel(): void } {
  const timer = setTimeout(task, ms);
  return { cancel: () => clearTimeout(timer) };
}

/** How often the app sends the live values package code made, at most, in milliseconds. */
export const SEND_EVERY_MS = 250;

export interface LiveSendOptions {
  /** Sends live values of a package to the local program. */
  send: (pkg: Id, values: unknown[], freshFor: number) => unknown;
  later?: (task: () => void, ms: number) => { cancel(): void };
}

/**
 * The live values package code made of what it fetched, gathered and sent to the local program at
 * most four times a second, a thousand to a message, the latest of each element and attribute.
 */
export class PackageLiveValues {
  /** By package and freshness, then by element and attribute. */
  private readonly waiting = new Map<
    string,
    { pkg: Id; freshFor: number; values: Map<string, unknown> }
  >();
  private timer: { cancel(): void } | undefined;
  private disposed = false;

  constructor(private readonly options: LiveSendOptions) {}

  add(pkg: Id, freshFor: number, target: Id, attribute: string, value: unknown): void {
    if (this.disposed) return;
    const key = `${pkg}\u0000${freshFor}`;
    let group = this.waiting.get(key);
    if (!group) {
      group = { pkg, freshFor, values: new Map() };
      this.waiting.set(key, group);
    }
    group.values.set(`${target}\u0000${attribute}`, { target, attribute, value });
    this.timer ??= (this.options.later ?? defaultLater)(() => this.flush(), SEND_EVERY_MS);
  }

  /** Sends what waits now. */
  flush(): void {
    this.timer?.cancel();
    this.timer = undefined;
    for (const group of this.waiting.values()) {
      const values = [...group.values.values()];
      for (let at = 0; at < values.length; at += 1000) {
        this.options.send(group.pkg, values.slice(at, at + 1000), group.freshFor);
      }
    }
    this.waiting.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.timer?.cancel();
    this.timer = undefined;
    this.waiting.clear();
  }
}

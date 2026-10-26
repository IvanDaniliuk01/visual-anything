/**
 * What the local program fetches for package code granted `network:<origin>` (ADR 0054, ADR 0057's
 * clarification on addresses, ADR 0063): package code never fetches from the page; the app asks the
 * program, which checks that the person approved the package's code as it is now, with that origin
 * granted, and fetches the address itself.
 *
 * Where it may connect:
 * - a name is resolved here, and every address it resolves to must be public: a name never leads to
 *   this computer, the person's network, a link-local address such as the cloud metadata one, or a
 *   multicast, broadcast or reserved one. The connection then goes to the address checked and to no
 *   other, so that the name cannot lead elsewhere between the check and the connection;
 * - an origin whose host is itself an address of this computer or of the person's network, written
 *   in the grant, such as `network:http://192.168.1.20:8080`, was granted on purpose and is reached;
 * - only `https:`, but for such an address, which may use `http:`;
 * - never the local program's own port on this computer, whatever is granted.
 *
 * A fetch is a GET with no body, no cookie and no credential, that follows no redirect, waits at most
 * ten seconds, the name's resolution included, and reads at most 256 KiB; its answer goes back as
 * text. At most four of one package's fetches are under way at once.
 */
import { lookup as resolveName } from 'node:dns/promises';
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import {
  LIVE_FETCH_LIMITS,
  checkFetchAddress,
  codeStatusOf,
  packagesWithCode,
  type CodeApproval,
  type Problem,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Capability, Id } from '@visual-anything/schema';
import { addressKind, readAddress, type AddressKind } from './addresses';

/** Resolves a name to every address it has, as `dns.lookup` with `all` does; tests give their own. */
export type Resolver = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

/** Sends a request, as `http.request` or `https.request` does; tests give their own. */
export type Requester = (
  secure: boolean,
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest;

/** What a fetch came to: the origin's status and the text of its answer, or why there is none. */
export type Fetched = { ok: true; status: number; text: string } | { ok: false; problem: Problem };

/** How long a fetch may take and how much it may read; tests make them small. */
export interface FetchLimits {
  timeoutMs: number;
  bytes: number;
}

export interface FetcherOptions {
  resolve?: Resolver;
  request?: Requester;
  limits?: FetchLimits;
}

/** Where a fetch connects: the address checked, and its family. */
export interface Destination {
  address: string;
  family: 4 | 6;
}

/**
 * What the code of a package may do with the network now: the capabilities the person granted the
 * code it holds now, or why it may do nothing.
 */
export function networkGrantOf(
  project: ProjectSnapshot,
  approvals: readonly CodeApproval[],
  pkg: Id,
): { ok: true; name: string; granted: Capability[] } | { ok: false; problem: Problem } {
  const code = packagesWithCode(project).find((each) => each.package === pkg);
  if (code === undefined) {
    return refused('live-refused', `The package "${pkg}" holds no code.`, [pkg]);
  }
  const status = codeStatusOf(code, approvals);
  if (status.state !== 'approved') {
    return refused(
      'live-refused',
      `The code of “${code.name}” is not approved as it is now, so it reaches nothing.`,
      [pkg],
    );
  }
  if (!status.granted.some((each) => each.startsWith('network:'))) {
    return refused(
      'live-refused',
      `The code of “${code.name}” is granted no origin, so it fetches nothing and sends no live values.`,
      [pkg],
    );
  }
  return { ok: true, name: code.name, granted: status.granted };
}

/** The kinds of address an origin written as an address may lead to, granted on purpose. */
const GRANTED_AS_WRITTEN: ReadonlySet<AddressKind> = new Set(['public', 'private', 'loopback']);

/** What each kind of address is, in words, after the address. */
const KIND_WORDS: Readonly<Record<AddressKind, string>> = {
  unspecified: 'an address of no one',
  loopback: 'an address of this computer',
  private: 'an address of your network',
  'link-local': 'a link-local address, such as the cloud metadata one',
  multicast: 'a multicast address',
  reserved: 'an address the internet does not route',
  public: 'an address on the internet',
};

export class PackageFetcher {
  readonly #resolve: Resolver;
  readonly #request: Requester;
  readonly #limits: FetchLimits;
  readonly #underWay = new Map<Id, number>();
  /** The ports the local program listens on, on this computer, which nothing fetches from. */
  readonly #ownPorts = new Set<number>();

  constructor(options: FetcherOptions = {}) {
    this.#resolve = options.resolve ?? ((hostname) => resolveName(hostname, { all: true }));
    this.#request = options.request ?? defaultRequest;
    this.#limits = options.limits ?? {
      timeoutMs: LIVE_FETCH_LIMITS.timeoutMs,
      bytes: LIVE_FETCH_LIMITS.bytes,
    };
  }

  /** Says a port the local program listens on, on this computer: nothing is fetched from it. */
  servesAt(port: number): void {
    this.#ownPorts.add(port);
  }

  /**
   * Fetches an address for the code of a package, once the address is on an origin the person granted
   * it and leads where it may: what the origin answered, or why there is nothing.
   */
  async fetch(
    pkg: { id: Id; name: string; granted: readonly Capability[] },
    url: string,
  ): Promise<Fetched> {
    const checked = checkFetchAddress(url, pkg.granted);
    const mayNot = (reason: string) =>
      refused(
        'fetch-refused',
        `The code of “${pkg.name}” may not fetch ${quoted(url)}: it ${reason}.`,
        [pkg.id],
      );
    if (!checked.ok) return mayNot(checked.reason);
    const underWay = this.#underWay.get(pkg.id) ?? 0;
    if (underWay >= LIVE_FETCH_LIMITS.inFlight) {
      return refused(
        'fetch-refused',
        `The code of “${pkg.name}” has ${LIVE_FETCH_LIMITS.inFlight} fetches under way already, so ${quoted(checked.url)} waits for its next turn.`,
        [pkg.id],
      );
    }
    this.#underWay.set(pkg.id, underWay + 1);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#limits.timeoutMs);
    try {
      const target = new URL(checked.url);
      const destination = await this.#destinationOf(target, controller.signal);
      if (typeof destination === 'string') return mayNot(destination);
      if ('problem' in destination) return this.#failed(pkg, checked.url, destination.problem);
      return await this.#get(target, destination, controller, pkg);
    } finally {
      clearTimeout(timer);
      const left = (this.#underWay.get(pkg.id) ?? 1) - 1;
      if (left <= 0) this.#underWay.delete(pkg.id);
      else this.#underWay.set(pkg.id, left);
    }
  }

  /**
   * Where an address may be fetched from: the address its host is, or the address its name resolves
   * to once every one it resolves to is public. Why it may not, after "it", or why it failed.
   */
  async #destinationOf(
    url: URL,
    signal: AbortSignal,
  ): Promise<Destination | string | { problem: string }> {
    const secure = url.protocol === 'https:';
    const port = url.port === '' ? (secure ? 443 : 80) : Number(url.port);
    const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    const literal = readAddress(host);
    if (literal !== undefined) {
      const kind = addressKind(host) ?? 'reserved';
      if (!GRANTED_AS_WRITTEN.has(kind)) {
        return `leads to ${host}, ${KIND_WORDS[kind]}, which nothing fetches from`;
      }
      if (kind === 'public' && !secure) {
        return 'is not https, which an address on the internet must be';
      }
      if (kind === 'loopback' && this.#ownPorts.has(port)) {
        return 'leads to Visual Anything itself, which package code never reaches';
      }
      return { address: host, family: host.includes(':') ? 6 : 4 };
    }
    if (!secure) {
      return 'is not https, which an address by name must be: only an address of this computer or of your network, granted as it is written, may use http';
    }
    let found: readonly { address: string; family: number }[];
    try {
      found = await Promise.race([
        this.#resolve(host),
        new Promise<never>((_resolve, reject) => {
          if (signal.aborted) reject(new Error('late'));
          signal.addEventListener('abort', () => reject(new Error('late')), { once: true });
        }),
      ]);
    } catch {
      return {
        problem: signal.aborted ? this.#late() : `its name, ${host}, does not resolve`,
      };
    }
    if (found.length === 0) return { problem: `its name, ${host}, does not resolve` };
    for (const each of found) {
      const kind = addressKind(each.address) ?? 'reserved';
      if (kind !== 'public') {
        return `leads, by its name ${host}, to ${each.address}, ${KIND_WORDS[kind]}, which a name never reaches; grant that address itself if that is where it should go`;
      }
    }
    const first = found[0] as { address: string; family: number };
    return { address: first.address, family: first.family === 6 ? 6 : 4 };
  }

  /** Sends the GET to the address checked, and reads its answer within its time and size. */
  #get(
    url: URL,
    destination: Destination,
    controller: AbortController,
    pkg: { id: Id; name: string },
  ): Promise<Fetched> {
    const secure = url.protocol === 'https:';
    const lateOr = (why: string) => (controller.signal.aborted ? this.#late() : why);
    const failed = (why: string) => this.#failed(pkg, url.href, why);
    return new Promise<Fetched>((resolve) => {
      let settled = false;
      const settle = (fetched: Fetched) => {
        if (settled) return;
        settled = true;
        resolve(fetched);
      };
      const options: RequestOptions = {
        protocol: url.protocol,
        hostname: url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname,
        port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.1' },
        // A connection of its own, never one kept from before, which might lead elsewhere.
        agent: false,
        // The connection goes to the address checked, whatever the name resolves to by then.
        lookup: pinnedLookup(destination),
        signal: controller.signal,
      };
      let request: ClientRequest | undefined;
      const onResponse = (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        if (!Number.isInteger(status) || status < 100 || status > 599) {
          response.destroy();
          settle(failed('it answered with no HTTP status'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > this.#limits.bytes) {
            settle(failed(`it answered with more than ${kib(this.#limits.bytes)}`));
            response.destroy();
            request?.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          settle({
            ok: true,
            status,
            text: new TextDecoder('utf-8').decode(Buffer.concat(chunks)),
          });
        });
        response.on('error', () => settle(failed(lateOr('its answer broke off'))));
        response.on('aborted', () => settle(failed(lateOr('its answer broke off'))));
      };
      try {
        request = this.#request(secure, options, onResponse);
      } catch {
        settle(failed('it could not be reached'));
        return;
      }
      request.on('error', () => settle(failed(lateOr('it could not be reached'))));
      request.end();
    });
  }

  #late(): string {
    return `it did not answer within ${seconds(this.#limits.timeoutMs)}`;
  }

  #failed(pkg: { id: Id; name: string }, url: string, why: string): Fetched {
    return refused('fetch-failed', `Fetching ${quoted(url)} for “${pkg.name}” failed: ${why}.`, [
      pkg.id,
    ]);
  }
}

/** A lookup that answers only the address checked, whether Node asks for one address or for all. */
export function pinnedLookup(destination: Destination): LookupFunction {
  const lookup = (
    _hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: (error: Error | null, address: unknown, family?: number) => void,
  ) => {
    if (typeof options === 'object' && options.all === true) {
      callback(null, [{ address: destination.address, family: destination.family }]);
    } else {
      callback(null, destination.address, destination.family);
    }
  };
  return lookup as unknown as LookupFunction;
}

const defaultRequest: Requester = (secure, options, onResponse) =>
  (secure ? httpsRequest : httpRequest)(options, onResponse);

function seconds(ms: number): string {
  const count = Math.round(ms / 100) / 10;
  return `${count} second${count === 1 ? '' : 's'}`;
}

function kib(bytes: number): string {
  return `${Math.round((bytes / 1024) * 10) / 10} KiB`;
}

function refused(
  code: Problem['code'],
  message: string,
  subjects: Id[],
): { ok: false; problem: Problem } {
  return { ok: false, problem: { code, message, subjects } };
}

/** An address in what the program says, cut so that a long one does not fill the notice. */
function quoted(url: string): string {
  return url.length > 200 ? `${url.slice(0, 199)}…` : url;
}

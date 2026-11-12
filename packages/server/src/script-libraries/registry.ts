/**
 * Fetching from the npm registry for a script library (ADR 0107), only once the person approved the
 * registry's addresses for the package's exact version.
 *
 * - **Only `https://registry.npmjs.org/`.** Any other scheme, host, port, credential or fragment is
 *   refused before anything is resolved. The registry's name is resolved here and every address it
 *   resolves to must be public, as `live-fetch.ts` checks addresses by name (`addresses.ts`): never
 *   this computer, the person's network, a link-local, multicast or reserved address. The connection
 *   goes to the address checked and no other (`pinnedLookup`).
 * - **Nothing of the person's, and no redirect.** A GET with no cookie and no credential, on a
 *   connection of its own, `accept-encoding: identity`; an answer other than 200 is refused, so that
 *   no redirect leads anywhere else.
 * - **Caps.** Both reads together within 120 seconds, names' resolution included; the tarball within
 *   64 MiB and the version's document within 4 MiB, past which the read stops.
 */
import { lookup as resolveName } from 'node:dns/promises';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { addressKind } from '../addresses';
import { pinnedLookup, type Destination, type Requester, type Resolver } from '../live-fetch';

/** The registry's host, the only one a script library is fetched from. */
export const REGISTRY_HOST = 'registry.npmjs.org';

/** How long a script library's fetch may take and how much it may read; tests make them small. */
export interface RegistryLimits {
  /** Both reads together, the names' resolution included. */
  timeoutMs: number;
  /** The tarball. */
  tarballBytes: number;
  /** The version's document. */
  documentBytes: number;
}

export const REGISTRY_LIMITS: RegistryLimits = {
  timeoutMs: 120_000,
  tarballBytes: 64 * 1024 * 1024,
  documentBytes: 4 * 1024 * 1024,
};

export interface RegistryOptions {
  resolve?: Resolver;
  request?: Requester;
  limits?: Partial<RegistryLimits>;
}

/** What one read came to: its bytes, or why there are none, after "it". */
export type RegistryRead =
  | { ok: true; bytes: Buffer }
  | { ok: false; refused: true; reason: string }
  | { ok: false; refused: false; reason: string };

/** One fetch of a script library: the reads it makes share one deadline. */
export interface RegistryVisit {
  get(url: string, what: 'document' | 'tarball'): Promise<RegistryRead>;
  /** Ends the visit: what is still under way is stopped. */
  end(): void;
}

export class RegistryFetcher {
  readonly #resolve: Resolver;
  readonly #request: Requester;
  readonly limits: RegistryLimits;

  constructor(options: RegistryOptions = {}) {
    this.#resolve = options.resolve ?? ((hostname) => resolveName(hostname, { all: true }));
    this.#request = options.request ?? ((_secure, given, then) => httpsRequest(given, then));
    this.limits = { ...REGISTRY_LIMITS, ...options.limits };
  }

  /** Starts a visit to the registry: its reads together take at most the time the limits give. */
  visit(): RegistryVisit {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.limits.timeoutMs);
    return {
      get: (url, what) =>
        this.#get(
          url,
          what === 'tarball' ? this.limits.tarballBytes : this.limits.documentBytes,
          controller.signal,
        ),
      end: () => {
        clearTimeout(timer);
        controller.abort();
      },
    };
  }

  async #get(url: string, cap: number, signal: AbortSignal): Promise<RegistryRead> {
    const refused = (reason: string): RegistryRead => ({ ok: false, refused: true, reason });
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return refused('is not an address');
    }
    if (
      target.protocol !== 'https:' ||
      target.hostname !== REGISTRY_HOST ||
      (target.port !== '' && target.port !== '443') ||
      target.username !== '' ||
      target.password !== '' ||
      target.hash !== ''
    ) {
      return refused(`is not an address of https://${REGISTRY_HOST}/`);
    }
    const destination = await this.#destination(signal);
    if ('refused' in destination) return refused(destination.refused);
    if ('failed' in destination) return this.#failed(signal, destination.failed);
    return this.#read(target, destination, cap, signal);
  }

  /** Where the registry's name leads, once every address it resolves to is public. */
  async #destination(
    signal: AbortSignal,
  ): Promise<Destination | { refused: string } | { failed: string }> {
    let found: readonly { address: string; family: number }[];
    try {
      found = await Promise.race([
        this.#resolve(REGISTRY_HOST),
        new Promise<never>((_resolve, reject) => {
          if (signal.aborted) reject(new Error('late'));
          signal.addEventListener('abort', () => reject(new Error('late')), { once: true });
        }),
      ]);
    } catch {
      return { failed: `its name, ${REGISTRY_HOST}, does not resolve` };
    }
    if (found.length === 0) return { failed: `its name, ${REGISTRY_HOST}, does not resolve` };
    for (const each of found) {
      if ((addressKind(each.address) ?? 'reserved') !== 'public') {
        return {
          refused: `leads, by its name ${REGISTRY_HOST}, to ${each.address}, which is not an address on the internet`,
        };
      }
    }
    const first = found[0] as { address: string; family: number };
    return { address: first.address, family: first.family === 6 ? 6 : 4 };
  }

  #failed(signal: AbortSignal, why: string): RegistryRead {
    return {
      ok: false,
      refused: false,
      reason: signal.aborted
        ? `did not answer within ${Math.round(this.limits.timeoutMs / 1000)} seconds`
        : why,
    };
  }

  /** Sends the GET to the address checked, and reads its answer within the cap. */
  #read(
    url: URL,
    destination: Destination,
    cap: number,
    signal: AbortSignal,
  ): Promise<RegistryRead> {
    return new Promise<RegistryRead>((resolve) => {
      let settled = false;
      let request: ClientRequest | undefined;
      const settle = (read: RegistryRead) => {
        if (settled) return;
        settled = true;
        resolve(read);
      };
      const failed = (why: string) => settle(this.#failed(signal, why));
      const options: RequestOptions = {
        protocol: 'https:',
        hostname: REGISTRY_HOST,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          accept: 'application/json, application/octet-stream',
          'accept-encoding': 'identity',
        },
        agent: false,
        lookup: pinnedLookup(destination),
        signal,
      };
      const onResponse = (response: IncomingMessage) => {
        if (response.statusCode !== 200) {
          response.destroy();
          settle({
            ok: false,
            refused: false,
            reason: `answered ${response.statusCode ?? 'with no status'}, not 200`,
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > cap) {
            settle({
              ok: false,
              refused: true,
              reason: `holds more than ${Math.round(cap / (1024 * 1024))} MiB`,
            });
            response.destroy();
            request?.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => settle({ ok: true, bytes: Buffer.concat(chunks) }));
        response.on('error', () => failed('broke off its answer'));
        response.on('aborted', () => failed('broke off its answer'));
      };
      try {
        request = this.#request(true, options, onResponse);
      } catch {
        failed('could not be reached');
        return;
      }
      request.on('error', () => failed('could not be reached'));
      request.end();
    });
  }
}

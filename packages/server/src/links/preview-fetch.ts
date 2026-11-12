/**
 * Fetching a link card's preview (ADR 0098, stage 3): the only time the local program reaches the
 * internet, and only when the person presses Fetch the preview in a card's inspector.
 *
 * - **Only `https:`, to public addresses.** A name is resolved here, and every address it resolves to
 *   must be public: never this computer, the person's network, a link-local address such as the cloud
 *   metadata one, or a multicast, broadcast or reserved one. An address written as itself must be
 *   public too, since no one granted it on purpose. The connection goes to the address checked and no
 *   other (`pinnedLookup`), so that a name cannot lead elsewhere between the check and the connection.
 * - **Redirects.** At most three are followed, each new address checked from scratch as the first was.
 * - **Nothing of the person's.** A GET with no cookie, no credential and no referrer; `Set-Cookie` is
 *   ignored; a connection of its own, kept for nothing else; `accept-encoding: identity`, so nothing
 *   is inflated.
 * - **Caps.** The page within 10 seconds, its name's resolution and its redirects included, and at most
 *   512 KiB of it, past which it stops and reads what came; the image within 10 more seconds and
 *   8 MiB, past which it is left out.
 * - **What is read.** The page must answer 200 with `text/html` or `application/xhtml+xml`; it is read
 *   by the core's `readLinkPreview`, which runs nothing. The image must be PNG, JPEG, WebP or GIF, and
 *   is then cleaned as any picture's file before it is kept.
 */
import { lookup as resolveName } from 'node:dns/promises';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  LINK_CAPS,
  checkLinkAddress,
  decodePage,
  readLinkPreview,
  type LinkPreviewRead,
  type Problem,
} from '@visual-anything/core';
import { addressKind, readAddress, type AddressKind } from '../addresses';
import { pinnedLookup, type Destination, type Requester, type Resolver } from '../live-fetch';

/** The caps a fetch keeps to; tests make them small. */
export interface LinkFetchLimits {
  pageBytes: number;
  imageBytes: number;
  pageMs: number;
  imageMs: number;
  redirects: number;
}

export interface LinkFetcherOptions {
  resolve?: Resolver;
  request?: Requester;
  limits?: Partial<LinkFetchLimits>;
}

/** What fetching a page came to: its preview, or why there is none. */
export type PageFetched = { ok: true; preview: LinkPreviewRead } | { ok: false; problem: Problem };

/** What fetching an image came to: its bytes, or why there are none, after "it". */
export type ImageFetched = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

/** The page types a preview is read from. */
const PAGE_TYPES = ['text/html', 'application/xhtml+xml'];

/** The image types a preview's picture is taken in; an SVG is not fetched. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

/** What each kind of address is, in words. */
const KIND_WORDS: Readonly<Record<AddressKind, string>> = {
  unspecified: 'an address of no one',
  loopback: 'an address of this computer',
  private: 'an address of your network',
  'link-local': 'a link-local address, such as the cloud metadata one',
  multicast: 'a multicast address',
  reserved: 'an address the internet does not route',
  public: 'an address on the internet',
};

/** Why a GET came to nothing: refused before connecting, or failed. */
type Why = { refused: string } | { failed: string };

/** What one GET came to: why not, a redirect, or the answer. */
type Sent =
  | { kind: 'why'; why: Why }
  | { kind: 'redirect'; location: string }
  | { kind: 'answer'; bytes: Uint8Array; contentType: string | undefined };

type Got = { ok: true; bytes: Uint8Array; contentType: string | undefined; url: string } | Why;

export class LinkFetcher {
  readonly #resolve: Resolver;
  readonly #request: Requester;
  readonly #limits: LinkFetchLimits;

  constructor(options: LinkFetcherOptions = {}) {
    this.#resolve = options.resolve ?? ((hostname) => resolveName(hostname, { all: true }));
    this.#request = options.request ?? ((_secure, given, then) => httpsRequest(given, then));
    this.#limits = {
      pageBytes: LINK_CAPS.pageBytes,
      imageBytes: LINK_CAPS.imageBytes,
      pageMs: LINK_CAPS.pageMs,
      imageMs: LINK_CAPS.imageMs,
      redirects: LINK_CAPS.redirects,
      ...options.limits,
    };
  }

  /** Fetches a card's page and reads its preview, or says why it cannot. */
  async page(url: string): Promise<PageFetched> {
    const checked = checkLinkAddress(url);
    const shown = quoted(url);
    if (!checked.ok) {
      return refused(
        'link-refused',
        `The preview of ${shown} cannot be fetched: it ${checked.reason}.`,
      );
    }
    if (!checked.url.startsWith('https:')) {
      return refused(
        'link-refused',
        `The preview of ${shown} is not fetched: only an https address is, so that nothing travels in the clear.`,
      );
    }
    const got = await this.#get(checked.url, {
      accept: 'text/html, application/xhtml+xml;q=0.9',
      types: PAGE_TYPES,
      bytes: this.#limits.pageBytes,
      past: 'cut',
      ms: this.#limits.pageMs,
    });
    if ('refused' in got) {
      return refused('link-refused', `The preview of ${shown} is not fetched: it ${got.refused}.`);
    }
    if ('failed' in got) {
      return refused(
        'link-failed',
        `The preview of ${shown} could not be fetched: it ${got.failed}.`,
      );
    }
    const html = decodePage(got.bytes, got.contentType);
    return { ok: true, preview: readLinkPreview(html, got.url) };
  }

  /** Fetches a preview's image, or says why it cannot, after "it". */
  async image(url: string): Promise<ImageFetched> {
    const checked = checkLinkAddress(url);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    if (!checked.url.startsWith('https:')) return { ok: false, reason: 'is not https' };
    const got = await this.#get(checked.url, {
      accept: 'image/png, image/jpeg, image/webp, image/gif',
      types: IMAGE_TYPES,
      bytes: this.#limits.imageBytes,
      past: 'refuse',
      ms: this.#limits.imageMs,
    });
    if ('refused' in got) return { ok: false, reason: got.refused };
    if ('failed' in got) return { ok: false, reason: got.failed };
    return { ok: true, bytes: got.bytes };
  }

  /**
   * A GET of an https address, following at most so many redirects, each checked as the first, within
   * a time for all of them, and reading at most so many bytes of the last answer.
   */
  async #get(
    url: string,
    how: {
      accept: string;
      types: readonly string[];
      bytes: number;
      past: 'cut' | 'refuse';
      ms: number;
    },
  ): Promise<Got> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), how.ms);
    const late = (): Why => ({ failed: `did not answer within ${seconds(how.ms)}` });
    try {
      let current = url;
      for (let hop = 0; ; hop += 1) {
        const target = new URL(current);
        if (target.protocol !== 'https:') {
          return { refused: `redirects to ${quoted(current)}, which is not https` };
        }
        const destination = await this.#destinationOf(target, controller.signal);
        if (controller.signal.aborted) return late();
        if ('refused' in destination || 'failed' in destination) return destination;
        const answer = await this.#send(target, destination, controller, how);
        if (controller.signal.aborted) return late();
        if (answer.kind === 'why') return answer.why;
        if (answer.kind === 'redirect') {
          if (hop >= this.#limits.redirects) {
            return { failed: `redirects more than ${this.#limits.redirects} times` };
          }
          let next: string;
          try {
            next = new URL(answer.location, target).href;
          } catch {
            return { failed: 'redirects to something that is not an address' };
          }
          const checked = checkLinkAddress(next);
          if (!checked.ok) return { refused: `redirects to an address that ${checked.reason}` };
          current = checked.url;
          continue;
        }
        return { ok: true, bytes: answer.bytes, contentType: answer.contentType, url: current };
      }
    } catch {
      return controller.signal.aborted ? late() : { failed: 'could not be reached' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Where an address may be fetched from, once every address its host is or resolves to is public. */
  async #destinationOf(url: URL, signal: AbortSignal): Promise<Destination | Why> {
    const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    if (readAddress(host) !== undefined) {
      const kind = addressKind(host) ?? 'reserved';
      if (kind !== 'public') {
        return { refused: `leads to ${host}, ${KIND_WORDS[kind]}, which a preview never reaches` };
      }
      return { address: host, family: host.includes(':') ? 6 : 4 };
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
      return { failed: `has a name, ${host}, that does not resolve` };
    }
    if (found.length === 0) return { failed: `has a name, ${host}, that does not resolve` };
    for (const each of found) {
      const kind = addressKind(each.address) ?? 'reserved';
      if (kind !== 'public') {
        return {
          refused: `leads, by its name ${host}, to ${each.address}, ${KIND_WORDS[kind]}, which a preview never reaches`,
        };
      }
    }
    const first = found[0] as { address: string; family: number };
    return { address: first.address, family: first.family === 6 ? 6 : 4 };
  }

  /** Sends one GET to the address checked, and reads its answer within its cap. */
  #send(
    url: URL,
    destination: Destination,
    controller: AbortController,
    how: { accept: string; types: readonly string[]; bytes: number; past: 'cut' | 'refuse' },
  ): Promise<Sent> {
    return new Promise<Sent>((resolve) => {
      let settled = false;
      const settle = (sent: Sent) => {
        if (settled) return;
        settled = true;
        resolve(sent);
      };
      const failed = (why: string): Sent => ({ kind: 'why', why: { failed: why } });
      const options: RequestOptions = {
        protocol: 'https:',
        hostname: url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname,
        port: url.port === '' ? 443 : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          accept: how.accept,
          'accept-encoding': 'identity',
          'user-agent': 'VisualAnything-LinkPreview/1 (+https://github.com/visual-anything)',
        },
        // A connection of its own, never one kept from before, which might lead elsewhere.
        agent: false,
        // The connection goes to the address checked, whatever the name resolves to by then.
        lookup: pinnedLookup(destination),
        signal: controller.signal,
      };
      let request: ClientRequest | undefined;
      const onResponse = (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && typeof location === 'string') {
          response.destroy();
          settle({ kind: 'redirect', location });
          return;
        }
        if (status !== 200) {
          response.destroy();
          settle(
            failed(`answered ${status === 0 ? 'with no HTTP status' : `with status ${status}`}`),
          );
          return;
        }
        const contentType = response.headers['content-type'];
        const type = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
        if (!how.types.includes(type)) {
          response.destroy();
          settle(
            failed(
              `answered with ${type === '' ? 'no type' : type}, not ${how.types.join(' or ')}`,
            ),
          );
          return;
        }
        const declared = Number(response.headers['content-length']);
        if (how.past === 'refuse' && Number.isFinite(declared) && declared > how.bytes) {
          response.destroy();
          settle(failed(`is larger than ${mebibytes(how.bytes)}`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const whole = () =>
          settle({ kind: 'answer', bytes: new Uint8Array(Buffer.concat(chunks)), contentType });
        response.on('data', (chunk: Buffer) => {
          if (settled) return;
          const room = how.bytes - size;
          if (chunk.byteLength > room) {
            if (how.past === 'refuse') {
              settle(failed(`is larger than ${mebibytes(how.bytes)}`));
            } else {
              // A page past its cap is read as far as it came: its head is at its start.
              chunks.push(chunk.subarray(0, room));
              size += room;
              whole();
            }
            response.destroy();
            request?.destroy();
            return;
          }
          size += chunk.byteLength;
          chunks.push(chunk);
        });
        response.on('end', whole);
        response.on('error', () => settle(failed('broke off its answer')));
        response.on('aborted', () => settle(failed('broke off its answer')));
      };
      try {
        request = this.#request(true, options, onResponse);
      } catch {
        settle(failed('could not be reached'));
        return;
      }
      request.on('error', () => settle(failed('could not be reached')));
      // Time runs out whatever the request does with its signal.
      const sent = request;
      const onAbort = () => {
        sent.destroy();
        settle(failed('did not answer in time'));
      };
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener('abort', onAbort, { once: true });
      request.end();
    });
  }
}

function refused(code: Problem['code'], message: string): { ok: false; problem: Problem } {
  return { ok: false, problem: { code, message } };
}

function seconds(ms: number): string {
  const count = Math.round(ms / 100) / 10;
  return `${count} second${count === 1 ? '' : 's'}`;
}

function mebibytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.round((bytes / 1024 / 1024) * 10) / 10} MiB`
    : `${Math.round((bytes / 1024) * 10) / 10} KiB`;
}

/** An address in what the program says, cut so that a long one does not fill the notice. */
function quoted(url: string): string {
  return url.length > 200 ? `${url.slice(0, 199)}…` : url;
}

/**
 * What the local program fetches for package code granted `network:<origin>` (ADR 0054, ADR 0063):
 * package code never fetches from the page; the app asks the program, which checks that the person
 * approved the package's code as it is now, with that origin granted, and fetches the address itself.
 *
 * A fetch is a GET with no body, no cookie and no credential, that follows no redirect, waits at most
 * ten seconds and reads at most 256 KiB; its answer goes back as text. At most four of one package's
 * fetches are under way at once.
 */
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

/** How the program fetches: the platform's `fetch` by default; tests give their own. */
export type Fetcher = (
  url: string,
  init: {
    method: 'GET';
    redirect: 'manual';
    credentials: 'omit';
    cache: 'no-store';
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<Response>;

/** What a fetch came to: the origin's status and the text of its answer, or why there is none. */
export type Fetched = { ok: true; status: number; text: string } | { ok: false; problem: Problem };

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

/** How long a fetch may take and how much it may read; tests make them small. */
export interface FetchLimits {
  timeoutMs: number;
  bytes: number;
}

export class PackageFetcher {
  readonly #fetch: Fetcher;
  readonly #limits: FetchLimits;
  readonly #underWay = new Map<Id, number>();

  constructor(
    fetcher: Fetcher = defaultFetch,
    limits: FetchLimits = {
      timeoutMs: LIVE_FETCH_LIMITS.timeoutMs,
      bytes: LIVE_FETCH_LIMITS.bytes,
    },
  ) {
    this.#fetch = fetcher;
    this.#limits = limits;
  }

  /**
   * Fetches an address for the code of a package, once the address is on an origin the person granted
   * it: what the origin answered, or why there is nothing.
   */
  async fetch(
    pkg: { id: Id; name: string; granted: readonly Capability[] },
    url: string,
  ): Promise<Fetched> {
    const checked = checkFetchAddress(url, pkg.granted);
    if (!checked.ok) {
      return refused(
        'fetch-refused',
        `The code of “${pkg.name}” may not fetch ${quoted(url)}: it ${checked.reason}.`,
        [pkg.id],
      );
    }
    const underWay = this.#underWay.get(pkg.id) ?? 0;
    if (underWay >= LIVE_FETCH_LIMITS.inFlight) {
      return refused(
        'fetch-refused',
        `The code of “${pkg.name}” has ${LIVE_FETCH_LIMITS.inFlight} fetches under way already, so ${quoted(checked.url)} waits for its next turn.`,
        [pkg.id],
      );
    }
    this.#underWay.set(pkg.id, underWay + 1);
    try {
      return await this.#fetchText(pkg, checked.url);
    } finally {
      const left = (this.#underWay.get(pkg.id) ?? 1) - 1;
      if (left <= 0) this.#underWay.delete(pkg.id);
      else this.#underWay.set(pkg.id, left);
    }
  }

  async #fetchText(pkg: { id: Id; name: string }, url: string): Promise<Fetched> {
    const failed = (why: string) =>
      refused('fetch-failed', `Fetching ${quoted(url)} for “${pkg.name}” failed: ${why}.`, [
        pkg.id,
      ]);
    const controller = new AbortController();
    const { timeoutMs, bytes: most } = this.#limits;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: 'GET',
          redirect: 'manual',
          credentials: 'omit',
          cache: 'no-store',
          headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.1' },
          signal: controller.signal,
        });
      } catch {
        return failed(
          controller.signal.aborted
            ? `it did not answer within ${seconds(timeoutMs)}`
            : 'it could not be reached',
        );
      }
      const status = response.status;
      if (!Number.isInteger(status) || status < 100 || status > 599) {
        return failed('it answered with no HTTP status');
      }
      const bytes = await readCapped(response, most, controller);
      if (bytes === 'too-large') {
        return failed(`it answered with more than ${kib(most)}`);
      }
      if (bytes === 'failed') {
        return failed(
          controller.signal.aborted
            ? `it did not answer within ${seconds(timeoutMs)}`
            : 'its answer broke off',
        );
      }
      return { ok: true, status, text: new TextDecoder('utf-8').decode(bytes) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Reads a body to its end, or stops once it is past `limit` bytes. */
async function readCapped(
  response: Response,
  limit: number,
  controller: AbortController,
): Promise<Uint8Array | 'too-large' | 'failed'> {
  const body = response.body;
  if (body === null) return new Uint8Array();
  const reader = body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        controller.abort();
        await reader.cancel().catch(() => {});
        return 'too-large';
      }
      chunks.push(value);
    }
  } catch {
    return 'failed';
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

const defaultFetch: Fetcher = (url, init) => fetch(url, init);

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

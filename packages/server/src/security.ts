/**
 * The checks that keep other websites, and other programs, from driving the local program. Every
 * request must name the local program in its Host header, which defeats DNS rebinding, and must come
 * from the app's own origin when it says where it comes from. The live connection also needs the
 * per-session token, or a launch code that works once; the Claude endpoint needs Claude's credential
 * and refuses anything a browser sends.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { LAUNCH_PARAM, TOKEN_PARAM } from '@visual-anything/core';

/** The outcome of checking a request: allowed, or the status to refuse it with and why. */
export type Check = { ok: true } | { ok: false; status: 401 | 403; message: string };

/**
 * The outcome of checking the opening of the live connection: allowed, with the session token or a
 * launch code; or refused, `reused` when a launch code already spent came again.
 */
export type LiveCheck =
  | { ok: true; via: 'token' | 'launch' }
  | { ok: false; status: 401 | 403; message: string; reused?: true };

/** The headers of a request that the checks look at. */
export interface RequestHeaders {
  host: string | undefined;
  origin: string | undefined;
}

/** A request to open the live connection. */
export interface LiveRequest extends RequestHeaders {
  /** The request target, such as `/live?token=…`. */
  url: string;
}

/** What the live connection is checked against. */
export interface Session {
  /** The port the local program listens on. */
  port: number;
  /** The per-session token. */
  token: string;
  /** The launch codes that open it once; without them, only the token does. */
  launchCodes?: LaunchCodes;
}

/** How long a launch code works after it is made: two minutes. */
export const LAUNCH_CODE_LIFETIME = 2 * 60_000;

/** How many spent launch codes are remembered, to tell a code used twice from one never made. */
const SPENT_REMEMBERED = 32;

/** Why a launch address is refused, for one used twice or too late. */
export const LAUNCH_ADDRESS_SPENT =
  'This address works once, within two minutes of being made, and can no longer be used. Press o in the terminal where Visual Anything runs, or start it again.';

/**
 * The launch codes of a running local program. A launch code is what the address the program opens
 * or prints carries instead of the session token: it works once, within two minutes, and only one is
 * open at a time, so an address left in a terminal, a process list or the browser's history is
 * useless soon after.
 */
export class LaunchCodes {
  readonly #now: () => number;
  readonly #lifetime: number;
  #open: { code: string; madeAt: number } | undefined;
  readonly #spent: string[] = [];

  constructor(options: { now?: () => number; lifetime?: number } = {}) {
    this.#now = options.now ?? Date.now;
    this.#lifetime = options.lifetime ?? LAUNCH_CODE_LIFETIME;
  }

  /** Makes a new code, 16 random bytes in base64url, ending the one still open. */
  create(): string {
    const code = randomBytes(16).toString('base64url');
    this.#open = { code, madeAt: this.#now() };
    return code;
  }

  /**
   * Redeems a code, compared in constant time: `ok` once, for the open code within its lifetime;
   * `used` for a code already redeemed; `expired` for the open code too late, which ends it; and
   * `unknown` for anything else.
   */
  redeem(code: string | undefined): 'ok' | 'used' | 'expired' | 'unknown' {
    if (code === undefined || code === '') return 'unknown';
    const open = this.#open;
    if (open !== undefined && tokensMatch(open.code, code)) {
      this.#open = undefined;
      if (this.#now() - open.madeAt > this.#lifetime) return 'expired';
      this.#spent.push(open.code);
      if (this.#spent.length > SPENT_REMEMBERED) this.#spent.shift();
      return 'ok';
    }
    let used = false;
    for (const spent of this.#spent) used = tokensMatch(spent, code) || used;
    return used ? 'used' : 'unknown';
  }
}

const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost'];

/**
 * The Host header values that name the local program. A browser leaves the port out of the Host
 * header and the origin when it is the default one, 80.
 */
export function allowedHosts(port: number): string[] {
  const hosts = LOOPBACK_HOSTNAMES.map((hostname) => `${hostname}:${port}`);
  return port === 80 ? [...hosts, ...LOOPBACK_HOSTNAMES] : hosts;
}

/** The origins of the app the local program serves. */
export function allowedOrigins(port: number): string[] {
  return allowedHosts(port).map((host) => `http://${host}`);
}

/** Whether a Host header names the local program. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host !== undefined && allowedHosts(port).includes(host.toLowerCase());
}

/** Whether an Origin header is the app's own origin. `null`, sent by sandboxed and file pages, is not. */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  return origin !== undefined && allowedOrigins(port).includes(origin.toLowerCase());
}

/**
 * Checks any request to the local program: the Host must name it and the Origin, when present, must be
 * the app's own. Navigations and same-origin requests for files send no Origin.
 */
export function checkRequest(headers: RequestHeaders, port: number): Check {
  if (!isAllowedHost(headers.host, port)) {
    return refuse(
      403,
      `The local program answers only requests for ${allowedHosts(port).join(' or ')}.`,
    );
  }
  if (headers.origin !== undefined && !isAllowedOrigin(headers.origin, port)) {
    return refuse(403, 'The local program does not answer requests from other origins.');
  }
  return { ok: true };
}

/**
 * Checks the opening of the live connection: as {@link checkRequest}, but the Origin is required, since
 * browsers always send it on a WebSocket, and the query must carry exactly one credential: the
 * session token, or a launch code, which this redeems.
 */
export function checkLiveRequest(request: LiveRequest, session: Session): LiveCheck {
  const check = checkRequest(request, session.port);
  if (!check.ok) return check;
  if (request.origin === undefined) {
    return refuse(403, 'The live connection must say which origin opens it.');
  }
  const query = new URLSearchParams(queryOf(request.url));
  const tokens = query.getAll(TOKEN_PARAM);
  const codes = query.getAll(LAUNCH_PARAM);
  const needed = refuse(401, 'The live connection needs the session token.');
  if (tokens.length + codes.length !== 1) return needed;
  if (tokens.length === 1) {
    return tokensMatch(session.token, tokens[0]) ? { ok: true, via: 'token' } : needed;
  }
  switch (session.launchCodes?.redeem(codes[0])) {
    case 'ok':
      return { ok: true, via: 'launch' };
    case 'used':
      return { ok: false, status: 401, message: LAUNCH_ADDRESS_SPENT, reused: true };
    case 'expired':
      return refuse(401, LAUNCH_ADDRESS_SPENT);
    default:
      return needed;
  }
}

/** A request to open the Claude endpoint. */
export interface ClaudeRequest extends RequestHeaders {
  /** The Authorization header, which carries Claude's credential: `Bearer <credential>`. */
  authorization: string | undefined;
}

/** What the Claude endpoint is checked against. */
export interface ClaudeEndpoint {
  port: number;
  /** Claude's credential, which only the program's discovery file holds. */
  credential: string;
}

const BEARER = 'Bearer ';

/**
 * Checks the opening of the Claude endpoint. The Host must name the local program. No Origin may be
 * given: browsers always send one on a WebSocket, so no page can open it, the app's own included. And
 * the Authorization header must carry Claude's credential, which a page cannot set on a WebSocket
 * either.
 */
export function checkClaudeRequest(request: ClaudeRequest, endpoint: ClaudeEndpoint): Check {
  if (!isAllowedHost(request.host, endpoint.port)) {
    return refuse(
      403,
      `The local program answers only requests for ${allowedHosts(endpoint.port).join(' or ')}.`,
    );
  }
  if (request.origin !== undefined) {
    return refuse(403, 'The Claude endpoint does not answer pages in a browser.');
  }
  const header = request.authorization;
  const credential = header?.startsWith(BEARER) ? header.slice(BEARER.length) : undefined;
  if (!tokensMatch(endpoint.credential, credential)) {
    return refuse(401, 'The Claude endpoint needs Claude’s credential.');
  }
  return { ok: true };
}

/** Makes a per-session token: 32 random bytes, written in base64url. */
export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Compares a received token with the session token in constant time. */
export function tokensMatch(expected: string, received: string | undefined): boolean {
  if (received === undefined) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  // timingSafeEqual needs buffers of equal length; the length of a token is no secret.
  if (expectedBytes.length !== receivedBytes.length) return false;
  return timingSafeEqual(expectedBytes, receivedBytes);
}

function refuse(status: 401 | 403, message: string): Extract<Check, { ok: false }> {
  return { ok: false, status, message };
}

function queryOf(url: string): string {
  const start = url.indexOf('?');
  return start === -1 ? '' : url.slice(start + 1);
}

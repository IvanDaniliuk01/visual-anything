/**
 * The checks that keep other websites from driving the local program. Every request must name the
 * local program in its Host header, which defeats DNS rebinding, and must come from the app's own
 * origin when it says where it comes from. The live connection also needs the per-session token.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { TOKEN_PARAM } from '@visual-anything/core';

/** The outcome of checking a request: allowed, or the status to refuse it with and why. */
export type Check = { ok: true } | { ok: false; status: 401 | 403; message: string };

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
 * browsers always send it on a WebSocket, and the query must carry the session token exactly once.
 */
export function checkLiveRequest(request: LiveRequest, session: Session): Check {
  const check = checkRequest(request, session.port);
  if (!check.ok) return check;
  if (request.origin === undefined) {
    return refuse(403, 'The live connection must say which origin opens it.');
  }
  const tokens = new URLSearchParams(queryOf(request.url)).getAll(TOKEN_PARAM);
  if (tokens.length !== 1 || !tokensMatch(session.token, tokens[0])) {
    return refuse(401, 'The live connection needs the session token.');
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

function refuse(status: 401 | 403, message: string): Check {
  return { ok: false, status, message };
}

function queryOf(url: string): string {
  const start = url.indexOf('?');
  return start === -1 ? '' : url.slice(start + 1);
}

/**
 * What lets this tab open the live connection. The local program opens the browser at
 * `/#launch=<code>`, with a launch code that works once, within two minutes: a fragment never reaches
 * a server, and the code is useless once this tab has used it. Redeeming it, the tab gets the session
 * token, which it keeps for reloads and reconnections. The token never appears in an address, so it
 * sits neither in the browser's history nor on screen, and other websites cannot drive the program.
 */
import {
  LAUNCH_PARAM,
  LIVE_PATH,
  SESSION_CHALLENGE_PARAM,
  SESSION_PROOF_CONTEXT,
  SESSION_PROOF_PATH,
  TOKEN_PARAM,
} from '@visual-anything/core';

/** What the tab connects with: the session token, or the launch code that hands it over. */
export type LiveCredential = { token: string } | { launch: string };

/** Where the token is kept for the life of the tab, so that a reload keeps working. */
const STORAGE_KEY = 'visual-anything.session-token';

type SessionWindow = Pick<Window, 'location' | 'history' | 'sessionStorage'>;

/**
 * What this tab connects with. A launch code in the URL's fragment is taken out of the address bar
 * and the tab's history, and used once; without one, the session token kept earlier is used. A token
 * found in the address is removed and never used: the program never puts one there. Returns null
 * when there is neither.
 */
export function takeSessionToken(target: SessionWindow): LiveCredential | null {
  const { location, history } = target;
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = fragment.get(LAUNCH_PARAM);
  const hadToken = fragment.has(TOKEN_PARAM);
  if (code !== null || hadToken) {
    fragment.delete(LAUNCH_PARAM);
    fragment.delete(TOKEN_PARAM);
    const rest = fragment.toString();
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${location.search}${rest === '' ? '' : `#${rest}`}`,
    );
  }
  if (code !== null && code !== '') return { launch: code };
  const token = recall(target);
  return token === null ? null : { token };
}

/** Keeps the session token the local program handed over, for reloads and reconnections. */
export function rememberSessionToken(target: Pick<Window, 'sessionStorage'>, token: string): void {
  try {
    target.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Without session storage the token still works; only a reload of the tab loses it.
  }
}

/**
 * The URL of the live connection, on the host that served the app, carrying the session token or a
 * launch code; a bare string is a session token.
 */
export function liveUrl(
  location: Pick<Location, 'protocol' | 'host'>,
  credential: string | LiveCredential,
): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const given = typeof credential === 'string' ? { token: credential } : credential;
  const query = new URLSearchParams(
    'launch' in given ? { [LAUNCH_PARAM]: given.launch } : { [TOKEN_PARAM]: given.token },
  );
  return `${scheme}//${location.host}${LIVE_PATH}?${query.toString()}`;
}

function recall(target: Pick<Window, 'sessionStorage'>): string | null {
  try {
    return target.sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * What a program answering on this tab's address proved about the session token (ADR 0099): that it
 * holds it, `ok`; that it does not, `other`, as another session or another program on the port; or
 * nothing, `unreachable`, while nothing answers there yet.
 */
export type SessionProof = 'ok' | 'other' | 'unreachable';

/** What proving the session needs from the browser; the window's own by default. */
export interface ProofTools {
  fetch: typeof fetch;
  crypto: Crypto;
}

/**
 * Asks the program on this tab's address to prove that it holds the session token before the tab
 * sends the token to it (ADR 0099): a random challenge, which the program answers with an HMAC of it
 * keyed by the token. The token itself is never sent, so whatever answers on the port while the
 * program is down learns nothing that opens the session.
 */
export async function proveSession(
  location: Pick<Location, 'protocol' | 'host'>,
  token: string,
  tools: ProofTools = { fetch: globalThis.fetch.bind(globalThis), crypto: globalThis.crypto },
): Promise<SessionProof> {
  const challenge = [...tools.crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const query = new URLSearchParams({ [SESSION_CHALLENGE_PARAM]: challenge });
  let response: Response;
  try {
    response = await tools.fetch(
      `${location.protocol}//${location.host}${SESSION_PROOF_PATH}?${query.toString()}`,
      { cache: 'no-store', credentials: 'omit', redirect: 'error' },
    );
  } catch {
    return 'unreachable';
  }
  if (!response.ok) return 'other';
  let proof: unknown;
  try {
    proof = ((await response.json()) as { proof?: unknown }).proof;
  } catch {
    return 'other';
  }
  if (typeof proof !== 'string') return 'other';
  const encoder = new TextEncoder();
  const key = await tools.crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = new Uint8Array(
    await tools.crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${SESSION_PROOF_CONTEXT}${challenge}`),
    ),
  );
  return proof === base64url(signed) ? 'ok' : 'other';
}

function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

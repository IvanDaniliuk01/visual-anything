/**
 * What lets this tab open the live connection. The local program opens the browser at
 * `/#launch=<code>`, with a launch code that works once, within two minutes: a fragment never reaches
 * a server, and the code is useless once this tab has used it. Redeeming it, the tab gets the session
 * token, which it keeps for reloads and reconnections. The token never appears in an address, so it
 * sits neither in the browser's history nor on screen, and other websites cannot drive the program.
 */
import { LAUNCH_PARAM, LIVE_PATH, TOKEN_PARAM } from '@visual-anything/core';

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

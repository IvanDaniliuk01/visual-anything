/**
 * The session token that lets this tab open the live connection. The local program opens the browser
 * at `/#token=<token>`: a fragment never reaches a server, and only a tab holding the token can
 * connect, so other websites cannot drive the local program.
 */
import { LIVE_PATH, TOKEN_PARAM } from '@visual-anything/core';

/** Where the token is kept for the life of the tab, so that a reload keeps working. */
const STORAGE_KEY = 'visual-anything.session-token';

type SessionWindow = Pick<Window, 'location' | 'history' | 'sessionStorage'>;

/**
 * This session's token. One in the URL's fragment is kept in session storage and removed from the
 * address bar and the tab's history; without one there, the token kept earlier is used. Returns null
 * when there is neither.
 */
export function takeSessionToken(target: SessionWindow): string | null {
  const { location, history } = target;
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const fromFragment = fragment.get(TOKEN_PARAM);
  if (fromFragment === null) return recall(target);

  fragment.delete(TOKEN_PARAM);
  const rest = fragment.toString();
  history.replaceState(
    history.state,
    '',
    `${location.pathname}${location.search}${rest === '' ? '' : `#${rest}`}`,
  );
  if (fromFragment === '') return recall(target);
  remember(target, fromFragment);
  return fromFragment;
}

/** The URL of the live connection, on the host that served the app. */
export function liveUrl(location: Pick<Location, 'protocol' | 'host'>, token: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ [TOKEN_PARAM]: token });
  return `${scheme}//${location.host}${LIVE_PATH}?${query.toString()}`;
}

function remember(target: SessionWindow, token: string): void {
  try {
    target.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Without session storage the token still works; only a reload of the tab loses it.
  }
}

function recall(target: SessionWindow): string | null {
  try {
    return target.sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

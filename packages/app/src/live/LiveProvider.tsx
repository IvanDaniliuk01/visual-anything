import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LiveConnection } from './connection';
import { LiveContext, type Live } from './context';
import { liveUrl, rememberSessionToken, type LiveCredential } from './session';

interface LiveProviderProps {
  /**
   * What this tab connects with: the session token, as a string or as `{ token }`, or a launch code
   * that works once, as `{ launch }`; null when the tab has neither. Read once, when the provider
   * mounts.
   */
  token: string | LiveCredential | null;
  children: ReactNode;
}

/**
 * Opens the live session for the components inside it, which reach it with `useLive()`, and closes it
 * when it goes away. A launch code is redeemed for the session token, which the tab keeps for reloads
 * and reconnects with.
 */
export function LiveProvider({ token, children }: LiveProviderProps) {
  const [connection] = useState(
    () =>
      new LiveConnection(token === null ? null : liveUrl(window.location, token), {
        onToken: (handed) => {
          rememberSessionToken(window, handed);
          return liveUrl(window.location, { token: handed });
        },
      }),
  );

  useEffect(() => {
    connection.connect();
    return connection.disconnect;
  }, [connection]);

  const state = useSyncExternalStore(connection.subscribe, connection.getState);
  const live = useMemo<Live>(
    () => ({
      ...state,
      send: connection.send,
      undo: connection.undo,
      redo: connection.redo,
      notify: connection.notify,
      dismiss: connection.dismiss,
      clearGuidance: connection.clearGuidance,
      setPreferences: connection.setPreferences,
    }),
    [state, connection],
  );

  return <LiveContext value={live}>{children}</LiveContext>;
}

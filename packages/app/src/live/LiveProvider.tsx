import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LiveConnection } from './connection';
import { LiveContext, type Live } from './context';
import { liveUrl } from './session';

interface LiveProviderProps {
  /** This session's token, or null when the tab has none. Read once, when the provider mounts. */
  token: string | null;
  children: ReactNode;
}

/**
 * Opens the live session for the components inside it, which reach it with `useLive()`, and closes it
 * when it goes away.
 */
export function LiveProvider({ token, children }: LiveProviderProps) {
  const [connection] = useState(
    () => new LiveConnection(token === null ? null : liveUrl(window.location, token)),
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
    }),
    [state, connection],
  );

  return <LiveContext value={live}>{children}</LiveContext>;
}

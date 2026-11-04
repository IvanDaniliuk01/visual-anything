import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LiveConnection } from './connection';
import { LiveContext, type Live } from './context';
import { liveUrl, rememberSessionToken, type LiveCredential } from './session';
import { askForSession, openSessionChannel, shareSession, type OpenSessionChannel } from './share';

interface LiveProviderProps {
  /**
   * What this tab connects with: the session token, as a string or as `{ token }`, or a launch code
   * that works once, as `{ launch }`; null when the tab has neither, and asks the other tabs of this
   * browser for the session. Read once, when the provider mounts.
   */
  token: string | LiveCredential | null;
  /** Opens a channel to the other tabs of this origin (ADR-0043); tests give their own. */
  openChannel?: OpenSessionChannel;
  children: ReactNode;
}

/**
 * Opens the live session for the components inside it, which reach it with `useLive()`, and closes it
 * when it goes away. A launch code is redeemed for the session token, which the tab keeps for reloads
 * and reconnects with. A tab with neither asks the project's other tabs in this browser for the token,
 * and every tab whose connection is open gives it to the tabs that ask (ADR-0043).
 */
export function LiveProvider({
  token,
  openChannel = openSessionChannel,
  children,
}: LiveProviderProps) {
  const [connection] = useState(
    () =>
      new LiveConnection(token === null ? null : liveUrl(window.location, token), {
        onToken: (handed) => {
          rememberSessionToken(window, handed);
          return liveUrl(window.location, { token: handed });
        },
        ...(token === null ? { join: () => joinSession(openChannel) } : {}),
      }),
  );

  useEffect(() => {
    connection.connect();
    return connection.disconnect;
  }, [connection]);

  // Gives the token to the other tabs of this browser that ask, while this tab's connection is open.
  useEffect(() => {
    const channel = openChannel();
    if (channel === undefined) return;
    const stop = shareSession(channel, connection.sessionToken);
    return () => {
      stop();
      channel.close();
    };
  }, [connection, openChannel]);

  const state = useSyncExternalStore(connection.subscribe, connection.getState);
  const live = useMemo<Live>(
    () => ({
      ...state,
      send: connection.send,
      undo: connection.undo,
      redo: connection.redo,
      undoTo: connection.undoTo,
      redoTo: connection.redoTo,
      notify: connection.notify,
      dismiss: connection.dismiss,
      clearGuidance: connection.clearGuidance,
      answerLayout: connection.answerLayout,
      lendCapture: connection.lendCapture,
      setPreferences: connection.setPreferences,
      startProject: connection.startProject,
      openProject: connection.openProject,
      createProject: connection.createProject,
      forgetRecent: connection.forgetRecent,
      goHome: connection.goHome,
      openOtherProject: connection.openOtherProject,
      liveValues: connection.liveValues,
      fetchForPackage: connection.fetchForPackage,
      sendLiveValues: connection.sendLiveValues,
      makeDrawing: connection.makeDrawing,
      readPackageFile: connection.readPackageFile,
      listVersions: connection.listVersions,
      compareVersion: connection.compareVersion,
      acceptProposal: connection.acceptProposal,
      refuseProposal: connection.refuseProposal,
      getSolidFile: connection.getSolidFile,
      prepareSolid: connection.prepareSolid,
      listSolidFiles: connection.listSolidFiles,
      removeSolidFiles: connection.removeSolidFiles,
      getMediaFile: connection.getMediaFile,
      putMedia: connection.putMedia,
      listMediaFiles: connection.listMediaFiles,
      removeMediaFiles: connection.removeMediaFiles,
      setUpClaude: connection.setUpClaude,
    }),
    [state, connection],
  );

  return <LiveContext value={live}>{children}</LiveContext>;
}

/**
 * Asks the other tabs of this browser for the session token, and keeps the one given, as a token
 * handed over for a launch code is kept: resolves with the URL to connect at, or null.
 */
async function joinSession(openChannel: OpenSessionChannel): Promise<string | null> {
  const channel = openChannel();
  if (channel === undefined) return null;
  const token = await askForSession(channel).token;
  if (token === null) return null;
  rememberSessionToken(window, token);
  return liveUrl(window.location, { token });
}

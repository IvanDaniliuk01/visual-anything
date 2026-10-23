import { ProtocolError, decodeServerMessage, type ProjectSnapshot } from '@visual-anything/core';
import { useEffect, useState } from 'react';
import { liveUrl } from './session';

/** Where the live connection with the local program stands. */
export type LiveState =
  | { status: 'connecting' }
  | { status: 'open'; project: ProjectSnapshot }
  /** The connection closed after the project opened; the project is the last one received. */
  | { status: 'closed'; project: ProjectSnapshot }
  | { status: 'failed'; problem: LiveProblem; detail?: string };

export type LiveProblem =
  /** The tab has no session token, so it cannot connect. */
  | 'no-token'
  /** The connection closed before the project arrived: refused, or nothing is listening. */
  | 'refused'
  /** The local program sent a message this app cannot read. */
  | 'unreadable';

/**
 * Opens the live connection with this token and follows it. The app only listens in M0: the first
 * message carries the whole project, and commands start in M1. A connection that fails or closes is
 * not reopened.
 */
export function useLiveProject(token: string | null): LiveState {
  const [state, setState] = useState<LiveState>(() =>
    token === null ? { status: 'failed', problem: 'no-token' } : { status: 'connecting' },
  );

  useEffect(() => {
    if (token === null) return;
    const socket = new WebSocket(liveUrl(window.location, token));
    let project: ProjectSnapshot | undefined;
    // Set once the outcome is final, or when this effect is cleaned up: later events change nothing.
    let settled = false;

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      const data: unknown = event.data;
      try {
        if (typeof data !== 'string') throw new ProtocolError('The message is not text.');
        const message = decodeServerMessage(data);
        switch (message.type) {
          case 'project/opened':
            project = message.project;
            setState({ status: 'open', project: message.project });
            break;
        }
      } catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
        settled = true;
        setState({ status: 'failed', problem: 'unreadable', detail: error.message });
        socket.close();
      }
    };
    const onClose = () => {
      if (settled) return;
      settled = true;
      setState(project ? { status: 'closed', project } : { status: 'failed', problem: 'refused' });
    };

    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    return () => {
      settled = true;
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
      socket.close();
    };
  }, [token]);

  return state;
}

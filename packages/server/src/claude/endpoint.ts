/**
 * The program's side of the Claude endpoint: one attached Claude. It greets Claude with the project,
 * runs its commands with Claude as their author, shows its guidance in the open apps and opens the
 * app when asked. It never answers with the session token, and refuses every other message.
 */
import { ProtocolError, type Problem, type ServerMessage } from '@visual-anything/core';
import type { LiveSession, SessionClient } from '../session';
import {
  decodeClaudeMessage,
  requestIdIn,
  type ClaudeMessage,
  type ProgramMessage,
} from './messages';

/** What the program does for Claude beyond the session. */
export interface ClaudeActions {
  /** Opens the app in the browser at an address that works once; absent when it cannot. */
  openApp?: () => Promise<void>;
}

/** An attached Claude: what to call with each message it sends, and when it detaches. */
export interface ClaudeConnection {
  receive(text: string): Promise<void>;
  detach(): void;
}

/** Attaches Claude to the session; `send` writes a message to Claude's socket. */
export function attachClaude(
  session: LiveSession,
  send: (message: ProgramMessage) => void,
  actions: ClaudeActions = {},
): ClaudeConnection {
  const client: SessionClient = { send: (message: ServerMessage) => send(message) };
  const detach = session.attachClaude(client);
  const refuse = (requestId: string, problems: Problem[]) =>
    send({ type: 'command/rejected', requestId, problems });

  const handle = async (message: ClaudeMessage): Promise<void> => {
    switch (message.type) {
      case 'command':
        // The session answers through the client: the change, or why it was refused.
        await session.execute(message.command, 'claude', {
          client,
          requestId: message.requestId,
        });
        return;
      case 'guidance': {
        const apps = await session.guide(message.guidance);
        send({ type: 'guidance/shown', requestId: message.requestId, apps });
        return;
      }
      case 'open-app': {
        if (actions.openApp === undefined) {
          refuse(message.requestId, [
            { code: 'program-failed', message: 'This Visual Anything cannot open a browser.' },
          ]);
          return;
        }
        try {
          await actions.openApp();
          send({ type: 'app/opened', requestId: message.requestId });
        } catch (error) {
          refuse(message.requestId, [
            {
              code: 'program-failed',
              message: `Could not open the browser: ${error instanceof Error ? error.message : String(error)}`,
            },
          ]);
        }
        return;
      }
    }
  };

  return {
    receive: async (text) => {
      let message: ClaudeMessage;
      try {
        message = decodeClaudeMessage(text);
      } catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
        const requestId = requestIdIn(text);
        if (requestId !== undefined) {
          refuse(requestId, [{ code: 'invalid-command', message: error.message }]);
        }
        return;
      }
      await handle(message);
    },
    detach,
  };
}

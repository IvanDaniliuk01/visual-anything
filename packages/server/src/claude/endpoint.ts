/**
 * The program's side of the Claude endpoint: one attached Claude. It greets Claude with the project,
 * runs its commands with Claude as their author, and an import from the command line, which it reads
 * and maps itself, with the person as its author (ADR-0049); it shows its guidance in the open apps,
 * keeps, clears and reads back live values (ADR 0057), says which package code the person approved
 * (ADR 0054) and opens the app when asked. It never answers with the session token, and refuses every
 * other message.
 */
import {
  DRAWING_LIMITS,
  ProtocolError,
  packagesWithCode,
  viewStateProblems,
  type CodeApproval,
  type Problem,
  type ServerMessage,
  type ViewState,
} from '@visual-anything/core';
import { isDrawingImport, prepareMadeDrawing } from '../drawings/import';
import { previewImport, type ImportRequest } from '../import';
import type { LiveSession, SessionClient } from '../session';
import {
  MAX_LIVE_LISTED,
  decodeClaudeMessage,
  importRequestOf,
  requestIdIn,
  type ClaudeMessage,
  type ProgramMessage,
} from './messages';

/** What the program does for Claude beyond the session. */
export interface ClaudeActions {
  /**
   * Opens the app in the browser at an address that works once, carrying the view state when one is
   * given; absent when it cannot.
   */
  openApp?: (state?: ViewState) => Promise<void>;
  /**
   * The person's approvals of package code, from their preferences (ADR 0054); absent where the
   * program keeps none, and then no code is approved.
   */
  codeApprovals?: () => readonly CodeApproval[];
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

  /**
   * HTML the person imports on the command line, as a drawing (ADR 0068): the program makes the
   * drawing of the file itself, then plans and runs the one action that stores and shows it, as the
   * person's, against the project as it is when its turn comes.
   */
  const importDrawing = async (request: ImportRequest, requestId: string): Promise<void> => {
    const made =
      session.makeDrawing === undefined
        ? {
            ok: false as const,
            problems: [
              {
                code: 'program-failed' as const,
                message: 'This Visual Anything makes no drawings.',
              },
            ],
          }
        : await session.makeDrawing(request.text, request.width ?? DRAWING_LIMITS.width.initial);
    if (!made.ok) {
      refuse(requestId, made.problems);
      return;
    }
    await session.executePlanned(
      (state) => {
        const prepared = prepareMadeDrawing(state, request.name, made, request);
        return prepared.ok
          ? { ok: true, command: prepared.command }
          : {
              ok: false,
              problems: prepared.problems.map((each) => ({
                code: 'invalid-command' as const,
                message: each,
              })),
            };
      },
      'user',
      { client, requestId },
    );
  };

  const handle = async (message: ClaudeMessage): Promise<void> => {
    switch (message.type) {
      case 'command':
        // The session answers through the client: the change, or why it was refused.
        await session.execute(message.command, 'claude', {
          client,
          requestId: message.requestId,
        });
        return;
      case 'import': {
        // The person ran it on the command line, so it is the person's action (ADR-0049). The message
        // carries the file, never a command: what runs as the person's is only what the program's
        // own reading and mapping of that file makes. It is read and mapped in the session's queue,
        // in the turn that runs it, against the project the work asked for before it leaves.
        const request = importRequestOf(message.request);
        if (isDrawingImport(request)) {
          await importDrawing(request, message.requestId);
          return;
        }
        await session.executePlanned(
          (state) => {
            const preview = previewImport(state, request);
            return preview.ok
              ? { ok: true, command: preview.prepared.command }
              : {
                  ok: false,
                  problems: preview.problems.map((each) => ({
                    code: 'invalid-command' as const,
                    message: each,
                  })),
                };
          },
          'user',
          { client, requestId: message.requestId },
        );
        return;
      }
      case 'guidance': {
        const apps = await session.guide(message.guidance);
        send({ type: 'guidance/shown', requestId: message.requestId, apps });
        return;
      }
      case 'live/set': {
        const kept = session.setLive(
          client,
          { kind: message.from },
          message.values,
          message.freshFor,
        );
        send({ type: 'live/kept', requestId: message.requestId, ...kept });
        return;
      }
      case 'live/clear': {
        const cleared = session.clearLive({
          ...(message.from === 'everyone' ? {} : { sender: { kind: message.from } }),
          ...(message.targets === undefined ? {} : { targets: message.targets }),
          ...(message.attributes === undefined ? {} : { attributes: message.attributes }),
        });
        send({ type: 'live/cleared', requestId: message.requestId, cleared });
        return;
      }
      case 'live/list': {
        // Read from the program's own store, everyone's: reading them keeps and changes nothing.
        const filter = {
          ...(message.targets === undefined ? {} : { targets: message.targets }),
          ...(message.attributes === undefined ? {} : { attributes: message.attributes }),
        };
        const listing = session.listLive?.(filter, message.limit ?? MAX_LIVE_LISTED) ?? {
          values: [],
          total: 0,
          at: Date.now(),
        };
        send({ type: 'live/listed', requestId: message.requestId, ...listing });
        return;
      }
      case 'code-approvals': {
        // Only the approvals of the code the project holds now: nothing of the person's other projects.
        const hashes = new Set(packagesWithCode(session.snapshot).map((each) => each.hash));
        const approvals = (actions.codeApprovals?.() ?? []).filter((each) => hashes.has(each.hash));
        send({ type: 'code/approvals', requestId: message.requestId, approvals: [...approvals] });
        return;
      }
      case 'open-app': {
        if (actions.openApp === undefined) {
          refuse(message.requestId, [
            { code: 'program-failed', message: 'This Visual Anything cannot open a browser.' },
          ]);
          return;
        }
        const problems =
          message.state === undefined ? [] : viewStateProblems(session.snapshot, message.state);
        if (problems.length > 0) {
          refuse(
            message.requestId,
            problems.map((each) => ({ code: 'invalid-command', message: each })),
          );
          return;
        }
        try {
          await actions.openApp(message.state);
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

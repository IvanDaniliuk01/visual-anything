/**
 * The program's side of the Claude endpoint: one attached Claude. It greets Claude with the project,
 * runs its commands with Claude as their author, and an import from the command line, which it reads
 * and maps itself, with the person as its author (ADR-0049); it shows its guidance in the open apps,
 * keeps, clears and reads back live values (ADR 0057), says which package code the person approved
 * (ADR 0054), asks the tab the person used last for a picture of a view (ADR 0081) and opens the app
 * when asked. It lists the project's versions and compares one with the
 * project now, as the program listed it, without the version's project (ADR 0071, ADR-0029). While the
 * person reviews Claude's changes, or when a command asks to, Claude's commands join its proposal and
 * are answered with `proposal/made`; Claude may withdraw its proposal, but never accepts or refuses it
 * (ADR 0073). It never answers with the session token, and refuses every other message.
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
import type { Id } from '@visual-anything/schema';
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

/** Why a program without versions answers that it has none. */
const NO_VERSIONS = 'This Visual Anything reads no versions.';

/** Why a program that takes no pictures refuses one. */
const NO_CAPTURES = 'This Visual Anything takes no pictures of a view.';

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
  /**
   * The packages whose code the person turned off on this computer, from their preferences (ADR
   * 0089): their code runs for Claude neither, approved or not. Absent, none is turned off.
   */
  codeTurnedOff?: () => readonly Id[];
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
      case 'command': {
        // The session answers through the client: the change, or why it was refused. A command that
        // joined Claude's proposal is answered here, at once, and never waits for the person
        // (ADR 0073): the session has shown every app and Claude the proposal by then.
        const outcome = await session.execute(
          message.command,
          'claude',
          { client, requestId: message.requestId },
          message.propose === true ? { propose: true } : {},
        );
        if (outcome.ok && outcome.proposal !== undefined) {
          send({
            type: 'proposal/made',
            requestId: message.requestId,
            proposal: outcome.proposal.id,
            label: outcome.label,
            changes: outcome.proposal.changes,
            created: outcome.created,
            warnings: outcome.warnings,
            apps: outcome.proposal.apps,
          });
        }
        return;
      }
      case 'proposal/withdraw':
        if (session.withdrawProposal === undefined) {
          refuse(message.requestId, [
            { code: 'invalid-command', message: 'This Visual Anything keeps no proposals.' },
          ]);
          return;
        }
        await session.withdrawProposal({ client, requestId: message.requestId });
        return;
      case 'import': {
        // The person ran it on the command line, so it is the person's action (ADR-0049). The message
        // carries the file, never a command: what runs as the person's is only what the program's
        // own reading and mapping of that file makes. It is read and mapped in the session's queue,
        // in the turn that runs it, against the project the work asked for before it leaves.
        const request = importRequestOf(message.request);
        if (request.solid !== undefined) {
          // A solid the program prepared of the person's file, from its pieces (ADR 0075).
          if (session.importSolid === undefined) {
            refuse(message.requestId, [
              { code: 'program-failed', message: 'This Visual Anything cleans no solids.' },
            ]);
            return;
          }
          await session.importSolid(request.solid, {}, 'user', {
            client,
            requestId: message.requestId,
          });
          return;
        }
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
      case 'solid/prepare':
        // A piece of a file to import as a solid (ADR 0075): it changes nothing, and is answered once
        // the file is cleaned and held, or refused.
        if (session.prepareSolidPiece === undefined) {
          send({
            type: 'solid/refused',
            requestId: message.requestId,
            code: 'program-failed',
            message: 'This Visual Anything cleans no solids.',
          });
          return;
        }
        await session.prepareSolidPiece(client, message);
        return;
      case 'solid/prepare-file':
        // A file inside the project folder for Claude's import_solid and replace_solid (ADR 0075):
        // the program reads it itself, only as a regular file inside its folder, and cleans it. It
        // changes nothing.
        if (session.prepareSolidFile === undefined) {
          send({
            type: 'solid/refused',
            requestId: message.requestId,
            code: 'program-failed',
            message: 'This Visual Anything cleans no solids.',
          });
          return;
        }
        await session.prepareSolidFile(
          client,
          message.requestId,
          message.path,
          message.options ?? {},
        );
        return;
      case 'media/keep-file':
        // An image file inside the project folder for Claude's add_picture (ADR 0098): the program
        // reads it itself, only as a regular file inside its folder, and cleans it.
        if (session.keepPictureFile === undefined) {
          send({
            type: 'media/refused',
            requestId: message.requestId,
            code: 'program-failed',
            message: 'This Visual Anything keeps no pictures.',
          });
          return;
        }
        await session.keepPictureFile(client, message.requestId, message.path);
        return;
      case 'versions/list':
        // The session answers through the client: Claude's copy of a comparison never holds the
        // version's project (ADR-0029).
        if (session.listVersions === undefined) {
          send({
            type: 'versions/listed',
            requestId: message.requestId,
            versions: [],
            why: NO_VERSIONS,
          });
          return;
        }
        await session.listVersions({ client, requestId: message.requestId });
        return;
      case 'version/compare':
        if (session.compareVersion === undefined) {
          send({
            type: 'version/refused',
            requestId: message.requestId,
            problems: [{ code: 'program-failed', message: NO_VERSIONS }],
          });
          return;
        }
        await session.compareVersion(
          { client, requestId: message.requestId },
          message.version,
          message.view,
        );
        return;
      case 'guidance': {
        const { guidance } = message;
        // A layout is answered once the app has laid the view out, after the ones before it (M3d).
        if (guidance.kind === 'layout' && session.layOut !== undefined) {
          const { apps, ...layout } = await session.layOut(guidance);
          send({ type: 'guidance/shown', requestId: message.requestId, apps, layout });
          return;
        }
        const apps = await session.guide(guidance);
        send({ type: 'guidance/shown', requestId: message.requestId, apps });
        return;
      }
      case 'capture': {
        // A read (ADR 0081): the tab the person used last answers, and nothing changes.
        if (session.capture === undefined) {
          refuse(message.requestId, [{ code: 'program-failed', message: NO_CAPTURES }]);
          return;
        }
        const report = await session.capture(message.ask);
        send({ type: 'capture/taken', requestId: message.requestId, report });
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
        // Of the packages turned off on this computer, only the project's own.
        const packages = new Set(session.snapshot.packages.map((each) => each.id));
        const turnedOff = (actions.codeTurnedOff?.() ?? []).filter((each) => packages.has(each));
        send({
          type: 'code/approvals',
          requestId: message.requestId,
          approvals: [...approvals],
          turnedOff,
        });
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

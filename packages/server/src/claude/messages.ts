/**
 * The Claude endpoint: the WebSocket through which the MCP entry point, started by Claude Code or
 * Claude Desktop, attaches to the running local program. It has a path and a credential of its own,
 * and it accepts only the messages Claude may send: commands, which always run with Claude as their
 * author, guidance for the open apps, and a request to open the app in the browser. Undo, redo and
 * preferences are the person's, and are refused.
 *
 * The program answers with the live protocol's own messages (`project/opened`, `project/changed`,
 * `command/rejected`, `project/reloaded`), so the MCP entry point keeps its copy of the project in
 * step exactly as an app does, plus two answers of its own.
 */
import {
  FRESHNESS,
  LIVE_LIMITS,
  ProtocolError,
  checkViewState,
  decodeServerMessage,
  isId,
  isLiveAttributeName,
  readCodeApprovals,
  readFreshFor,
  readGuidance,
  type CodeApproval,
  type Command,
  type Guidance,
  type ServerMessage,
  type ViewState,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** The path of the Claude endpoint. */
export const CLAUDE_PATH = '/claude';

/** The longest request id the program accepts. */
const MAX_REQUEST_ID = 100;

/** A message Claude may send. */
export type ClaudeMessage =
  /** Runs a command with Claude as its author: one undoable action. */
  | { type: 'command'; requestId: string; command: Command }
  /** Shows guidance in every open app. */
  | { type: 'guidance'; requestId: string; guidance: Guidance }
  /**
   * Opens the app in the browser, at an address that works once; with a view state, the address
   * carries it, and the tab opens the project there (ADR-0044).
   */
  | { type: 'open-app'; requestId: string; state?: ViewState }
  /**
   * Asks which code of the open project's packages the person approved (ADR 0054), so that Claude's
   * tools run only approved code. Claude can never approve code: only the person can, in the app.
   */
  | { type: 'code-approvals'; requestId: string }
  /**
   * Live values (ADR 0057): kept by the program while the project is open, never saved and never in
   * the history; answered with `live/kept`. The command line sends them through this endpoint too.
   */
  | {
      type: 'live/set';
      requestId: string;
      /** Checked one by one where they are kept, so that the sender hears which were refused. */
      values: unknown[];
      /** How long they stay fresh, in milliseconds; a minute when left out. */
      freshFor?: number;
      from: LiveSenderKind;
    }
  /**
   * Clears live values that match: those `from` sent, or everyone's, of the targets and attributes
   * named, or of all of them; answered with `live/cleared`.
   */
  | {
      type: 'live/clear';
      requestId: string;
      targets?: Id[];
      attributes?: string[];
      from: LiveSenderKind | 'everyone';
    };

/** Who sends live values through this endpoint. */
export type LiveSenderKind = 'claude' | 'command-line';

/** The answer to `live/clear`: how many live values went. */
export interface LiveClearedMessage {
  type: 'live/cleared';
  requestId: string;
  cleared: number;
}

/**
 * The answer to `code-approvals`: the person's approvals of the code the project's packages hold now,
 * and of no other code.
 */
export interface CodeApprovalsMessage {
  type: 'code/approvals';
  requestId: string;
  approvals: CodeApproval[];
}

/** The answer to guidance: how many open apps it reached. */
export interface GuidanceShownMessage {
  type: 'guidance/shown';
  requestId: string;
  apps: number;
}

/** The answer to `open-app`: the browser was asked to open the app. */
export interface AppOpenedMessage {
  type: 'app/opened';
  requestId: string;
}

/** A message the program sends to Claude. */
export type ProgramMessage =
  | ServerMessage
  | GuidanceShownMessage
  | AppOpenedMessage
  | CodeApprovalsMessage
  | LiveClearedMessage;

/** Writes a message for the Claude endpoint. */
export function encodeClaudeMessage(message: ClaudeMessage | ProgramMessage): string {
  return JSON.stringify(message);
}

/**
 * Reads a message Claude sent. Throws a {@link ProtocolError} for anything Claude may not send; the
 * command itself is checked by the core when it runs, like every command.
 */
export function decodeClaudeMessage(text: string): ClaudeMessage {
  const message = parseObject(text);
  const requestId = requestIdOf(message);
  if (requestId === undefined) throw new ProtocolError('The message has no valid request id.');
  switch (message.type) {
    case 'command':
      if (!isRecord(message.command) || typeof message.command.type !== 'string') {
        throw new ProtocolError('The message has no command.');
      }
      return { type: 'command', requestId, command: message.command as unknown as Command };
    case 'guidance':
      return { type: 'guidance', requestId, guidance: readGuidance(message.guidance) };
    case 'open-app': {
      if (message.state === undefined) return { type: 'open-app', requestId };
      const checked = checkViewState(message.state);
      if (!checked.ok) throw new ProtocolError(checked.message);
      return { type: 'open-app', requestId, state: checked.state };
    }
    case 'code-approvals':
      return { type: 'code-approvals', requestId };
    case 'live/set':
      return readLiveSet(message, requestId);
    case 'live/clear':
      return readLiveClear(message, requestId);
    default:
      throw new ProtocolError(
        `Claude may not send ${JSON.stringify(message.type)} messages: only commands, guidance, live values and opening the app. Undo and redo are the person's, in the app.`,
      );
  }
}

/** Reads a message the program sent to Claude. */
export function decodeProgramMessage(text: string): ProgramMessage {
  const message = parseObject(text);
  switch (message.type) {
    case 'guidance/shown': {
      const requestId = requestIdOf(message);
      if (requestId === undefined || typeof message.apps !== 'number') {
        throw new ProtocolError('The answer to guidance is not valid.');
      }
      return { type: 'guidance/shown', requestId, apps: message.apps };
    }
    case 'app/opened': {
      const requestId = requestIdOf(message);
      if (requestId === undefined) throw new ProtocolError('The answer is not valid.');
      return { type: 'app/opened', requestId };
    }
    case 'code/approvals': {
      const requestId = requestIdOf(message);
      const approvals = readCodeApprovals(message.approvals);
      if (requestId === undefined || approvals === undefined) {
        throw new ProtocolError('The answer about approvals of package code is not valid.');
      }
      return { type: 'code/approvals', requestId, approvals };
    }
    case 'live/cleared': {
      const requestId = requestIdOf(message);
      const { cleared } = message;
      if (requestId === undefined || !Number.isSafeInteger(cleared) || (cleared as number) < 0) {
        throw new ProtocolError('The answer about clearing live values is not valid.');
      }
      return { type: 'live/cleared', requestId, cleared: cleared as number };
    }
    default:
      return decodeServerMessage(text);
  }
}

/** The most targets, or attributes, one clear of live values names. */
export const MAX_LIVE_CLEAR = LIVE_LIMITS.valuesPerMessage;

function readSenderKind(value: unknown, everyone: boolean): LiveSenderKind | 'everyone' {
  const from = value ?? 'claude';
  if (from === 'claude' || from === 'command-line' || (everyone && from === 'everyone')) {
    return from;
  }
  throw new ProtocolError('Live values come from Claude or from the command line.');
}

function readLiveSet(message: Record<string, unknown>, requestId: string): ClaudeMessage {
  const { values, freshFor } = message;
  if (!Array.isArray(values)) throw new ProtocolError('Live values come as a list.');
  const fresh = readFreshFor(freshFor);
  if (fresh === undefined) throw new ProtocolError(FRESHNESS);
  return {
    type: 'live/set',
    requestId,
    values,
    ...(freshFor === undefined ? {} : { freshFor: fresh }),
    from: readSenderKind(message.from, false) as LiveSenderKind,
  };
}

function readLiveClear(message: Record<string, unknown>, requestId: string): ClaudeMessage {
  const { targets, attributes } = message;
  if (
    targets !== undefined &&
    (!Array.isArray(targets) || targets.length > MAX_LIVE_CLEAR || !targets.every(isId))
  ) {
    throw new ProtocolError(`Clearing live values names at most ${MAX_LIVE_CLEAR} targets, by id.`);
  }
  if (
    attributes !== undefined &&
    (!Array.isArray(attributes) ||
      attributes.length > MAX_LIVE_CLEAR ||
      !attributes.every(isLiveAttributeName))
  ) {
    throw new ProtocolError(
      `Clearing live values names at most ${MAX_LIVE_CLEAR} attributes, by name.`,
    );
  }
  return {
    type: 'live/clear',
    requestId,
    ...(targets === undefined ? {} : { targets: [...targets] }),
    ...(attributes === undefined ? {} : { attributes: [...attributes] }),
    from: readSenderKind(message.from, true),
  };
}

/** The request id of a message as text, when it has a valid one, even if the rest is not valid. */
export function requestIdIn(text: string): string | undefined {
  try {
    return requestIdOf(parseObject(text));
  } catch {
    return undefined;
  }
}

function requestIdOf(message: Record<string, unknown>): string | undefined {
  const { requestId } = message;
  return typeof requestId === 'string' && requestId !== '' && requestId.length <= MAX_REQUEST_ID
    ? requestId
    : undefined;
}

function parseObject(text: string): Record<string, unknown> {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    throw new ProtocolError('The message is not JSON.');
  }
  if (!isRecord(message)) throw new ProtocolError('The message is not a JSON object.');
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

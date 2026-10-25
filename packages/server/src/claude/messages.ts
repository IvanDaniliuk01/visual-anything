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
  ProtocolError,
  checkViewState,
  decodeServerMessage,
  readGuidance,
  type Command,
  type Guidance,
  type ServerMessage,
  type ViewState,
} from '@visual-anything/core';

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
  | { type: 'open-app'; requestId: string; state?: ViewState };

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
export type ProgramMessage = ServerMessage | GuidanceShownMessage | AppOpenedMessage;

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
    default:
      throw new ProtocolError(
        `Claude may not send ${JSON.stringify(message.type)} messages: only commands, guidance and opening the app. Undo and redo are the person's, in the app.`,
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
    default:
      return decodeServerMessage(text);
  }
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

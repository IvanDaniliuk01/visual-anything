/**
 * The live connection between the local program and the app: a WebSocket that carries the open project
 * and every change to it. Only a page holding the session token can open it. The app sends commands;
 * the local program, which owns the model, applies them and sends the resulting operations to every
 * open app.
 */
import type { Id } from '@visual-anything/schema';
import type { Command } from './commands';
import type { Author, HistorySummary } from './history';
import type { Operation } from './operations';
import type { Problem } from './problems';
import type { ProjectSnapshot } from './snapshot';

/**
 * The version of the live protocol; the app and the local program must agree on it, so that one from
 * an older build says so on its first message instead of failing later on what it cannot read.
 *
 * 2: operations can change a view's stacking order.
 */
export const PROTOCOL_VERSION = 2;

/** The path of the live connection. */
export const LIVE_PATH = '/live';

/**
 * The name the session token travels under: in the fragment of the URL the local program opens, and in
 * the query of the live connection.
 */
export const TOKEN_PARAM = 'token';

/** A message the local program sends to the app. */
export type ServerMessage =
  | ProjectOpenedMessage
  | ProjectChangedMessage
  | CommandRejectedMessage
  | ProjectReloadedMessage
  | NoticeMessage;

/** Sent when the live connection opens: the project as it is now. */
export interface ProjectOpenedMessage {
  type: 'project/opened';
  protocolVersion: typeof PROTOCOL_VERSION;
  project: ProjectSnapshot;
  history: HistorySummary;
}

/** Sent to every open app after an action, an undo or a redo. */
export interface ProjectChangedMessage {
  type: 'project/changed';
  /** The operations to apply to the project, in order. */
  operations: Operation[];
  /** Whether a new action was done, or one was undone or redone. */
  kind: 'do' | 'undo' | 'redo';
  /** The action, as the history names it, and who did it. */
  label: string;
  author: Author;
  history: HistorySummary;
  /** The request this answers; only the app that sent it gets it. */
  requestId?: string;
  /** Rules that only warn, broken by the result. */
  warnings: Problem[];
  /** The ids of what the action created. */
  created: Id[];
}

/** Sent to the app whose command or undo was refused, and why. Nothing changed. */
export interface CommandRejectedMessage {
  type: 'command/rejected';
  requestId: string;
  problems: Problem[];
}

/** Sent when the project's files changed outside the app, such as after a git pull. */
export interface ProjectReloadedMessage {
  type: 'project/reloaded';
  project: ProjectSnapshot;
  history: HistorySummary;
  /** What happened, in words. */
  reason: string;
}

/** Something to tell the user that changes nothing, such as a file on disk that is not valid. */
export interface NoticeMessage {
  type: 'notice';
  level: 'info' | 'warning' | 'error';
  message: string;
}

/** A message the app sends to the local program. */
export type AppMessage =
  | { type: 'command'; requestId: string; command: Command }
  | { type: 'undo'; requestId: string }
  | { type: 'redo'; requestId: string };

/** Thrown for a message the live protocol does not define. */
export class ProtocolError extends Error {
  override name = 'ProtocolError';
}

/** Writes a message for the live connection. */
export function encodeMessage(message: ServerMessage | AppMessage): string {
  return JSON.stringify(message);
}

/** Writes a message for the live connection. */
export const encodeServerMessage: (message: ServerMessage) => string = encodeMessage;

const SERVER_TYPES = new Set<string>([
  'project/opened',
  'project/changed',
  'command/rejected',
  'project/reloaded',
  'notice',
]);

/**
 * Reads a message the local program sent. Only the envelope is checked: the local program validated
 * the project and the operations it sends.
 */
export function decodeServerMessage(text: string): ServerMessage {
  const message = parseObject(text);
  if (typeof message.type !== 'string' || !SERVER_TYPES.has(message.type)) {
    throw new ProtocolError(`Unknown message type: ${JSON.stringify(message.type)}.`);
  }
  switch (message.type) {
    case 'project/opened':
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        throw new ProtocolError(
          `Protocol version ${JSON.stringify(message.protocolVersion)} is not ${PROTOCOL_VERSION}.`,
        );
      }
      if (!isRecord(message.project)) throw new ProtocolError('The message has no project.');
      break;
    case 'project/reloaded':
      if (!isRecord(message.project)) throw new ProtocolError('The message has no project.');
      break;
    case 'project/changed':
      if (!Array.isArray(message.operations)) {
        throw new ProtocolError('The message has no operations.');
      }
      break;
  }
  return message as unknown as ServerMessage;
}

/** The longest request id the local program accepts. */
const MAX_REQUEST_ID = 100;

/**
 * Reads a message an app sent. The envelope is checked here; the command itself is checked by the core
 * when it runs, like every command.
 */
export function decodeAppMessage(text: string): AppMessage {
  const message = parseObject(text);
  if (
    typeof message.requestId !== 'string' ||
    message.requestId === '' ||
    message.requestId.length > MAX_REQUEST_ID
  ) {
    throw new ProtocolError('The message has no valid request id.');
  }
  switch (message.type) {
    case 'command':
      if (!isRecord(message.command) || typeof message.command.type !== 'string') {
        throw new ProtocolError('The message has no command.');
      }
      return message as unknown as AppMessage;
    case 'undo':
    case 'redo':
      return message as unknown as AppMessage;
    default:
      throw new ProtocolError(`Unknown message type: ${JSON.stringify(message.type)}.`);
  }
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

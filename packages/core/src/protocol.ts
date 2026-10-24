/**
 * The live connection between the local program and the app: a WebSocket that carries the open project
 * and every change to it. Only a page holding the session token, or a launch code that works once, can
 * open it. The app sends commands; the local program, which owns the model, applies them and sends the
 * resulting operations to every open app. It also sends Claude's guidance, which marks and moves the
 * open view without changing the model.
 */
import type { Id } from '@visual-anything/schema';
import type { Command } from './commands';
import type { Author, HistorySummary } from './history';
import { isId } from './ids';
import type { Operation } from './operations';
import type { Problem } from './problems';
import type { ProjectSnapshot } from './snapshot';

/**
 * The version of the live protocol; the app and the local program must agree on it, so that one from
 * an older build says so on its first message instead of failing later on what it cannot read.
 *
 * 2: operations can change a view's stacking order.
 * 3: guidance; and a page opens the connection with a launch code that works once, for which
 * `project/opened` hands it the session token.
 */
export const PROTOCOL_VERSION = 3;

/** The path of the live connection. */
export const LIVE_PATH = '/live';

/**
 * The name the session token travels under in the query of the live connection. The local program
 * never puts the token in an address it prints or opens: a page gets it in `project/opened`, after
 * redeeming a launch code, and keeps it for reloads and reconnections.
 */
export const TOKEN_PARAM = 'token';

/**
 * The name a launch code travels under: in the fragment of the address the local program opens or
 * prints, `/#launch=<code>`, and in the query of the live connection the page then opens. A launch
 * code works once, within two minutes.
 */
export const LAUNCH_PARAM = 'launch';

/** A message the local program sends to the app. */
export type ServerMessage =
  | ProjectOpenedMessage
  | ProjectChangedMessage
  | CommandRejectedMessage
  | ProjectReloadedMessage
  | NoticeMessage
  | GuidanceMessage;

/** Sent when the live connection opens: the project as it is now. */
export interface ProjectOpenedMessage {
  type: 'project/opened';
  protocolVersion: typeof PROTOCOL_VERSION;
  project: ProjectSnapshot;
  history: HistorySummary;
  /**
   * The session token, sent only to a page that opened the connection with a launch code: the code
   * is spent, and the page reconnects with the token from then on.
   */
  token?: string;
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

/**
 * Claude's live guidance on the open view: marks and moves that never change the model, a view's
 * positions or the history. Targets are the ids of elements, relations or free shapes; an element is
 * marked in every shape it has in the view. With `view`, the app first opens that view.
 */
export type Guidance =
  /** Marks the targets, and takes away the marks Claude made before. */
  | { kind: 'highlight'; targets: Id[]; view?: Id }
  /**
   * Marks the targets and dims everything not connected to them, taking away the marks Claude made
   * before, and moves the canvas to the first target.
   */
  | { kind: 'focus'; targets: Id[]; view?: Id }
  /** Moves the canvas so that the target shows. */
  | { kind: 'pan-to'; target: Id; view?: Id }
  /** Shows a short text over the canvas, as plain text; an empty one takes the caption away. */
  | { kind: 'caption'; text: string }
  /** Takes away every mark and the caption Claude made. */
  | { kind: 'clear' };

/** The longest caption, in UTF-16 code units. */
export const MAX_CAPTION_LENGTH = 280;

/** The most targets one guidance names. */
export const MAX_GUIDANCE_TARGETS = 500;

/** Sent to every open app when Claude guides; nothing else changes. */
export interface GuidanceMessage {
  type: 'guidance';
  guidance: Guidance;
}

/**
 * Reads guidance strictly, keeping only what its kind holds. Throws a {@link ProtocolError} for
 * anything else, so that neither side ever acts on guidance it does not understand.
 */
export function readGuidance(value: unknown): Guidance {
  if (!isRecord(value)) throw new ProtocolError('Guidance is an object.');
  const view = (): { view?: Id } => {
    if (value.view === undefined) return {};
    if (!isId(value.view)) throw new ProtocolError('The view of guidance must be an id.');
    return { view: value.view };
  };
  const targets = (): Id[] => {
    const list = value.targets;
    if (!Array.isArray(list) || list.length === 0) {
      throw new ProtocolError('Guidance needs a list of one or more targets.');
    }
    if (list.length > MAX_GUIDANCE_TARGETS) {
      throw new ProtocolError(`Guidance names at most ${MAX_GUIDANCE_TARGETS} targets.`);
    }
    if (!list.every(isId)) throw new ProtocolError('Every target of guidance must be an id.');
    return [...list];
  };
  switch (value.kind) {
    case 'highlight':
    case 'focus':
      return { kind: value.kind, targets: targets(), ...view() };
    case 'pan-to':
      if (!isId(value.target)) throw new ProtocolError('Pan to needs a target id.');
      return { kind: 'pan-to', target: value.target, ...view() };
    case 'caption':
      if (typeof value.text !== 'string') throw new ProtocolError('A caption needs its text.');
      if (value.text.length > MAX_CAPTION_LENGTH) {
        throw new ProtocolError(`A caption holds at most ${MAX_CAPTION_LENGTH} characters.`);
      }
      return { kind: 'caption', text: value.text };
    case 'clear':
      return { kind: 'clear' };
    default:
      throw new ProtocolError(`Unknown kind of guidance: ${JSON.stringify(value.kind)}.`);
  }
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
  'guidance',
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
      if (message.token !== undefined && typeof message.token !== 'string') {
        throw new ProtocolError('The session token is text.');
      }
      break;
    case 'guidance':
      return { type: 'guidance', guidance: readGuidance(message.guidance) };
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

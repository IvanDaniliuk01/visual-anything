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
  readCodeApprovals,
  readGuidance,
  type CodeApproval,
  type Command,
  type Guidance,
  type ServerMessage,
  type ViewState,
} from '@visual-anything/core';
import type { ImportRequest } from '../import';

/** The path of the Claude endpoint. */
export const CLAUDE_PATH = '/claude';

/** The largest message Claude may send: a command creating thousands of elements fits. */
export const CLAUDE_MAX_PAYLOAD = 8 * 1024 * 1024;

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
   * An import the person ran on the command line, `visual-anything import`, sent to the program that
   * runs on its project (ADR-0049). It carries the file and the person's choices, never a command: the
   * program reads and maps the file itself, and runs the batch that makes with the person as its
   * author, so that nothing but an import of that content runs as the person's. Claude's tools never
   * send it.
   */
  | { type: 'import'; requestId: string; request: ImportMessageRequest };

/** What the command line asks the program to import: `ImportRequest`, with the file in base64. */
export interface ImportMessageRequest {
  name: string;
  /** The file's bytes, in base64; its text is read from them as UTF-8. */
  bytes: string;
  format?: string;
  key?: string;
  map?: Record<string, string>;
  nesting?: string;
  views?: boolean;
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
  ServerMessage | GuidanceShownMessage | AppOpenedMessage | CodeApprovalsMessage;

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
    case 'import':
      return { type: 'import', requestId, request: readImportRequest(message.request) };
    case 'open-app': {
      if (message.state === undefined) return { type: 'open-app', requestId };
      const checked = checkViewState(message.state);
      if (!checked.ok) throw new ProtocolError(checked.message);
      return { type: 'open-app', requestId, state: checked.state };
    }
    case 'code-approvals':
      return { type: 'code-approvals', requestId };
    default:
      throw new ProtocolError(
        `Claude may not send ${JSON.stringify(message.type)} messages: only commands, guidance, opening the app and imports from the command line. Undo and redo are the person's, in the app.`,
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

/** An import message's request, as the program imports it: the file's text read from its bytes. */
export function importRequestOf(request: ImportMessageRequest): ImportRequest {
  const bytes = new Uint8Array(Buffer.from(request.bytes, 'base64'));
  return { ...request, text: new TextDecoder('utf-8').decode(bytes), bytes };
}

/** What an import message carries for an import the command line asks for. */
export function importMessageRequest(request: ImportRequest): ImportMessageRequest {
  const bytes = request.bytes ?? new TextEncoder().encode(request.text);
  const message: ImportMessageRequest = {
    name: request.name,
    bytes: Buffer.from(bytes).toString('base64'),
  };
  if (request.format !== undefined) message.format = request.format;
  if (request.key !== undefined) message.key = request.key;
  if (request.map !== undefined) message.map = { ...request.map };
  if (request.nesting !== undefined) message.nesting = request.nesting;
  if (request.views !== undefined) message.views = request.views;
  return message;
}

/** The longest file name an import message may carry, and the most kinds it may map. */
const MAX_IMPORT_NAME = 1000;
const MAX_IMPORT_CHOICES = 10_000;

/** Reads what an import message asks for, refusing anything else it holds. */
function readImportRequest(value: unknown): ImportMessageRequest {
  const refuse = (why: string): never => {
    throw new ProtocolError(`The import message ${why}.`);
  };
  if (!isRecord(value)) return refuse('has no request');
  for (const key of Object.keys(value)) {
    if (!['name', 'bytes', 'format', 'key', 'map', 'nesting', 'views'].includes(key)) {
      refuse(`may not hold ${JSON.stringify(key)}`);
    }
  }
  const { name, bytes, format, key, map, nesting, views } = value;
  if (typeof name !== 'string' || name === '' || name.length > MAX_IMPORT_NAME) {
    return refuse('has no file name');
  }
  if (typeof bytes !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(bytes)) {
    return refuse('has no file, in base64');
  }
  const text = (field: string, each: unknown): string | undefined => {
    if (each === undefined) return undefined;
    if (typeof each !== 'string' || each.length > MAX_IMPORT_NAME)
      refuse(`has an invalid ${field}`);
    return each as string;
  };
  let choices: Record<string, string> | undefined;
  if (map !== undefined) {
    if (!isRecord(map)) return refuse('has an invalid map');
    const entries = Object.entries(map);
    if (entries.length > MAX_IMPORT_CHOICES) refuse('maps too many kinds');
    if (entries.some(([kind, id]) => kind.length > MAX_IMPORT_NAME || typeof id !== 'string')) {
      refuse('has an invalid map');
    }
    // Built with `Object.fromEntries`, so that a kind named `__proto__` stays a kind.
    choices = Object.fromEntries(entries as [string, string][]);
  }
  if (views !== undefined && typeof views !== 'boolean') refuse('has an invalid views');
  const request: ImportMessageRequest = { name, bytes };
  const checkedFormat = text('format', format);
  const checkedKey = text('key', key);
  const checkedNesting = text('nesting', nesting);
  if (checkedFormat !== undefined) request.format = checkedFormat;
  if (checkedKey !== undefined) request.key = checkedKey;
  if (choices !== undefined) request.map = choices;
  if (checkedNesting !== undefined) request.nesting = checkedNesting;
  if (views !== undefined) request.views = views as boolean;
  return request;
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

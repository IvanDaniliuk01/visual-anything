/**
 * The Claude endpoint: the WebSocket through which the MCP entry point, started by Claude Code or
 * Claude Desktop, attaches to the running local program. It has a path and a credential of its own,
 * and it accepts only these messages: commands, which always run with Claude as their author;
 * guidance for the open apps; a request to open the app in the browser; a question about which
 * package code the person approved, which Claude can never approve itself (ADR 0054); live values,
 * set, cleared and read back, which are never saved (ADR 0057); and an import the person ran on the
 * command line, which carries a file, never a command, and runs as the person's (ADR-0049). Undo, redo
 * and preferences are the person's, and are refused.
 *
 * The program answers with the live protocol's own messages (`project/opened`, `project/changed`,
 * `command/rejected`, `project/reloaded`, `live/kept`), so the MCP entry point keeps its copy of the
 * project in step exactly as an app does, plus answers of its own: `guidance/shown`, `app/opened`,
 * `code/approvals`, `live/cleared` and `live/listed`.
 */
import {
  FRESHNESS,
  LIVE_LIMITS,
  LiveProtocolProblem,
  ProtocolError,
  checkViewState,
  decodeServerMessage,
  isId,
  isLiveAttributeName,
  readCodeApprovals,
  readFreshFor,
  readGuidance,
  readLiveValuesMessage,
  type CodeApproval,
  type Command,
  type Guidance,
  type LiveValue,
  type ServerMessage,
  type ViewState,
} from '@visual-anything/core';
import type { ImportRequest } from '../import';
import type { LiveAttributeCount, LiveListing, LiveSummary } from '../live';
import type { Id } from '@visual-anything/schema';

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
  | { type: 'import'; requestId: string; request: ImportMessageRequest }
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
    }
  /**
   * Asks for the live values kept now, everyone's, of the targets and attributes named or of all of
   * them, so that Claude's read tools show them beside the stored values; answered with
   * `live/listed`. Reading them changes nothing.
   */
  | {
      type: 'live/list';
      requestId: string;
      targets?: Id[];
      attributes?: string[];
      /** At most this many, the latest first; {@link MAX_LIVE_LISTED} when left out. */
      limit?: number;
    };

/** Who sends live values through this endpoint. */
export type LiveSenderKind = 'claude' | 'command-line';

/** The answer to `live/clear`: how many live values went. */
export interface LiveClearedMessage {
  type: 'live/cleared';
  requestId: string;
  cleared: number;
}

/** The answer to `live/list`: the live values that match, the latest first, and how many match. */
export type LiveListedMessage = { type: 'live/listed'; requestId: string } & LiveListing;

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
  /** For HTML imported as a drawing (ADR 0068): its width, and who shows it. */
  width?: number;
  component?: string;
  element?: string;
  view?: string;
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
  | LiveClearedMessage
  | LiveListedMessage;

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
    case 'live/set':
      return readLiveSet(message, requestId);
    case 'live/clear':
      return readLiveClear(message, requestId);
    case 'live/list':
      return readLiveList(message, requestId);
    default:
      throw new ProtocolError(
        `Claude may not send ${JSON.stringify(message.type)} messages: only commands, guidance, opening the app, asking which package code is approved, live values and imports from the command line. Undo, redo and preferences are the person's, in the app.`,
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
    case 'live/listed':
      return readLiveListed(message);
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
  return {
    type: 'live/clear',
    requestId,
    ...readLiveSelection(message, 'Clearing'),
    from: readSenderKind(message.from, true),
  };
}

/** The most live values one answer to `live/list` holds. */
export const MAX_LIVE_LISTED = LIVE_LIMITS.valuesPerMessage;

function readLiveList(message: Record<string, unknown>, requestId: string): ClaudeMessage {
  const { limit } = message;
  if (
    limit !== undefined &&
    (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_LIVE_LISTED)
  ) {
    throw new ProtocolError(`Reading live values asks for 1 to ${MAX_LIVE_LISTED} of them.`);
  }
  return {
    type: 'live/list',
    requestId,
    ...readLiveSelection(message, 'Reading'),
    ...(limit === undefined ? {} : { limit: limit as number }),
  };
}

/** The targets and attributes a message about live values names, each list when given. */
function readLiveSelection(
  message: Record<string, unknown>,
  doing: 'Clearing' | 'Reading',
): { targets?: Id[]; attributes?: string[] } {
  const { targets, attributes } = message;
  if (
    targets !== undefined &&
    (!Array.isArray(targets) || targets.length > MAX_LIVE_CLEAR || !targets.every(isId))
  ) {
    throw new ProtocolError(`${doing} live values names at most ${MAX_LIVE_CLEAR} targets, by id.`);
  }
  if (
    attributes !== undefined &&
    (!Array.isArray(attributes) ||
      attributes.length > MAX_LIVE_CLEAR ||
      !attributes.every(isLiveAttributeName))
  ) {
    throw new ProtocolError(
      `${doing} live values names at most ${MAX_LIVE_CLEAR} attributes, by name.`,
    );
  }
  return {
    ...(targets === undefined ? {} : { targets: [...targets] }),
    ...(attributes === undefined ? {} : { attributes: [...attributes] }),
  };
}

/** Reads the answer to `live/list` strictly: each value rebuilt from its parts only (ADR 0063). */
function readLiveListed(message: Record<string, unknown>): LiveListedMessage {
  const requestId = requestIdOf(message);
  const { values, total, at, summary } = message;
  if (requestId === undefined || !isCount(total) || !isCount(at)) {
    throw new ProtocolError('The answer about live values is not valid.');
  }
  let read: LiveValue[];
  try {
    read = readLiveValuesMessage({ values, removed: [] }).values;
  } catch (error) {
    if (error instanceof LiveProtocolProblem) throw new ProtocolError(error.message);
    throw error;
  }
  const answer: LiveListedMessage = { type: 'live/listed', requestId, values: read, total, at };
  if (summary !== undefined) answer.summary = readLiveSummary(summary);
  return answer;
}

function readLiveSummary(value: unknown): LiveSummary {
  const refuse = (): never => {
    throw new ProtocolError('The summary of live values is not valid.');
  };
  if (!isRecord(value)) return refuse();
  const { targets, stale, attributes, otherAttributes } = value;
  if (!isCount(targets) || !isCount(stale) || !Array.isArray(attributes)) return refuse();
  if (otherAttributes !== undefined && !isCount(otherAttributes)) return refuse();
  const counts: LiveAttributeCount[] = attributes.map((each: unknown) => {
    if (!isRecord(each) || !isLiveAttributeName(each.attribute)) return refuse();
    if (!isCount(each.values) || !isCount(each.stale)) return refuse();
    return { attribute: each.attribute, values: each.values, stale: each.stale };
  });
  return {
    targets,
    stale,
    attributes: counts,
    ...(otherAttributes === undefined ? {} : { otherAttributes }),
  };
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
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
  if (request.width !== undefined) message.width = request.width;
  if (request.component !== undefined) message.component = request.component;
  if (request.element !== undefined) message.element = request.element;
  if (request.view !== undefined) message.view = request.view;
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
    if (
      ![
        'name',
        'bytes',
        'format',
        'key',
        'map',
        'nesting',
        'views',
        'width',
        'component',
        'element',
        'view',
      ].includes(key)
    ) {
      refuse(`may not hold ${JSON.stringify(key)}`);
    }
  }
  const { name, bytes, format, key, map, nesting, views, width, component, element, view } = value;
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
  if (width !== undefined && !Number.isSafeInteger(width)) refuse('has an invalid width');
  const request: ImportMessageRequest = { name, bytes };
  const checkedFormat = text('format', format);
  const checkedKey = text('key', key);
  const checkedNesting = text('nesting', nesting);
  if (checkedFormat !== undefined) request.format = checkedFormat;
  if (checkedKey !== undefined) request.key = checkedKey;
  if (choices !== undefined) request.map = choices;
  if (checkedNesting !== undefined) request.nesting = checkedNesting;
  if (views !== undefined) request.views = views as boolean;
  if (width !== undefined) request.width = width as number;
  const checkedComponent = text('component', component);
  const checkedElement = text('element', element);
  const checkedView = text('view', view);
  if (checkedComponent !== undefined) request.component = checkedComponent;
  if (checkedElement !== undefined) request.element = checkedElement;
  if (checkedView !== undefined) request.view = checkedView;
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

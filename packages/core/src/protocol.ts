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
import type { PreferenceChanges, Preferences } from './preferences';
import type { Problem } from './problems';
import type { ProjectSnapshot } from './snapshot';

/**
 * The version of the live protocol; the app and the local program must agree on it, so that one from
 * an older build says so on its first message instead of failing later on what it cannot read.
 *
 * 2: operations can change a view's stacking order.
 * 3: guidance; and a page opens the connection with a launch code that works once, for which
 * `project/opened` hands it the session token.
 * 4: guidance that filters and focuses the open view, and plays a scenario in it.
 * 5: the history listed action by action, with each one's author and time, and undo or redo up to
 * one of them.
 */
export const PROTOCOL_VERSION = 5;

/** The path of the live connection. */
export const LIVE_PATH = '/live';

/**
 * The name the session token travels under in the query of the live connection. The local program
 * never puts the token in an address it prints or opens: a page gets it in `project/opened`, after
 * redeeming a launch code, and keeps it for reloads and reconnections.
 */
export const TOKEN_PARAM = 'token';

/**
 * The name the theme a person chose travels under, `light` or `dark`, in the fragment of the URL the
 * local program opens, so that the tab draws its first frame in it. It is left out when the person
 * matches the system.
 */
export const THEME_PARAM = 'theme';

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
  | PreferencesChangedMessage
  | GuidanceMessage
  | HistoryListedMessage;

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
 * Sent to every open app when it connects and after every change of preferences, which are each
 * person's own and never part of the project (ADR-0032). The app that asked for the change gets its
 * request id.
 */
export interface PreferencesChangedMessage {
  type: 'preferences/changed';
  preferences: Preferences;
  requestId?: string;
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
  | { kind: 'clear' }
  /**
   * Sets the filters of the open view, replacing the ones it has, as if the person had set them
   * (ADR-0025): the app shows them as the person's, and the person can end them. Nothing is written
   * to the view.
   */
  | { kind: 'filter'; filters: GuidedFilters; view?: Id }
  /**
   * Turns focus mode on in the open view, as if the person had, starting from the targets, which
   * are elements and relations, and reaching some degrees in a direction. It follows the person's
   * selection from then on, as focus does.
   */
  | ({ kind: 'focus-view'; targets: Id[]; view?: Id } & GuidedFocus)
  /** Ends the filters and the focus of the open view, whoever set them. */
  | { kind: 'clear-explore'; view?: Id }
  /**
   * Opens a scenario in the app's scenario panel, and its view, and plays, pauses or steps it there,
   * as the person would; playing changes nothing. `step`, for `go-to-step` only, is the index of a
   * step among the scenario's steps, from 0.
   */
  | { kind: 'playback'; scenario: Id; action: PlaybackAction; step?: number };

/** What filters hide in a view, as the app's explorer holds them (ADR-0025), in lists. */
export interface GuidedFilters {
  /** The components whose elements are hidden: exactly the component each one is created from. */
  components: Id[];
  /** The relation types whose relations are hidden. */
  relationTypes: Id[];
  /** Conditions every element, or every relation, must meet to stay shown. */
  conditions: GuidedCondition[];
}

/** How a filter tests an attribute's value, as the app's filters do. */
export const FILTER_TESTS = ['is', 'is-not', 'contains', 'below', 'above', 'set', 'unset'] as const;

/** A condition on an attribute that elements, or relations, must meet to stay shown. */
export interface GuidedCondition {
  of: 'elements' | 'relations';
  attribute: string;
  test: (typeof FILTER_TESTS)[number];
  /** What the value is compared with; empty for `set` and `unset`, which do not use it. */
  value: string;
}

/** How far focus reaches, and what it does with the rest, as the app's focus mode does. */
export interface GuidedFocus {
  /** How many relations away it reaches, from 1 to {@link MAX_FOCUS_DEGREES}, or every degree. */
  degrees: number | 'all';
  direction: (typeof FOCUS_DIRECTIONS)[number];
  /** Hides what it does not reach, instead of dimming it. */
  isolate: boolean;
}

/** Which way focus follows relations: both ways, along them, or back. */
export const FOCUS_DIRECTIONS = ['both', 'outgoing', 'incoming'] as const;

/** The most degrees focus reaches short of every degree, as the app's focus mode offers. */
export const MAX_FOCUS_DEGREES = 5;

/** What Claude can ask of a scenario's playback in the open app. */
export const PLAYBACK_ACTIONS = [
  'open',
  'play',
  'pause',
  'go-to-step',
  'next-step',
  'previous-step',
] as const;
export type PlaybackAction = (typeof PLAYBACK_ACTIONS)[number];

/** The longest caption, in UTF-16 code units. */
export const MAX_CAPTION_LENGTH = 280;

/** The most targets one guidance names. */
export const MAX_GUIDANCE_TARGETS = 500;

/** The most conditions one guidance's filters hold. */
export const MAX_FILTER_CONDITIONS = 32;

/** The longest attribute name, or value, in a condition of guidance's filters. */
export const MAX_FILTER_TEXT = 200;

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
    case 'filter':
      return { kind: 'filter', filters: readFilters(value.filters), ...view() };
    case 'focus-view':
      return { kind: 'focus-view', targets: targets(), ...readFocus(value), ...view() };
    case 'clear-explore':
      return { kind: 'clear-explore', ...view() };
    case 'playback':
      return readPlayback(value);
    default:
      throw new ProtocolError(`Unknown kind of guidance: ${JSON.stringify(value.kind)}.`);
  }
}

/** Reads the filters of guidance, filling in the lists left out. */
function readFilters(value: unknown): GuidedFilters {
  if (!isRecord(value)) throw new ProtocolError('Filters are an object.');
  const ids = (list: unknown, what: string): Id[] => {
    if (list === undefined) return [];
    if (!Array.isArray(list) || !list.every(isId)) {
      throw new ProtocolError(`The ${what} of filters are a list of ids.`);
    }
    if (list.length > MAX_GUIDANCE_TARGETS) {
      throw new ProtocolError(`Filters name at most ${MAX_GUIDANCE_TARGETS} ${what}.`);
    }
    return [...list];
  };
  const conditions = value.conditions ?? [];
  if (!Array.isArray(conditions)) throw new ProtocolError('The conditions of filters are a list.');
  if (conditions.length > MAX_FILTER_CONDITIONS) {
    throw new ProtocolError(`Filters hold at most ${MAX_FILTER_CONDITIONS} conditions.`);
  }
  return {
    components: ids(value.components, 'components'),
    relationTypes: ids(value.relationTypes, 'relation types'),
    conditions: conditions.map(readCondition),
  };
}

function readCondition(value: unknown): GuidedCondition {
  if (!isRecord(value)) throw new ProtocolError('A condition of filters is an object.');
  const { of, attribute, test } = value;
  if (of !== 'elements' && of !== 'relations') {
    throw new ProtocolError('A condition is on elements or on relations.');
  }
  if (typeof attribute !== 'string' || attribute.trim() === '') {
    throw new ProtocolError('A condition names an attribute.');
  }
  if (!FILTER_TESTS.some((each) => each === test)) {
    throw new ProtocolError(`A condition tests with one of: ${FILTER_TESTS.join(', ')}.`);
  }
  const tested = test as GuidedCondition['test'];
  const needsValue = tested !== 'set' && tested !== 'unset';
  const given = value.value ?? (needsValue ? undefined : '');
  if (typeof given !== 'string' || (needsValue && given.trim() === '')) {
    throw new ProtocolError(`A condition that tests with "${tested}" needs a value, as text.`);
  }
  if (attribute.length > MAX_FILTER_TEXT || given.length > MAX_FILTER_TEXT) {
    throw new ProtocolError(
      `A condition's attribute and value hold at most ${MAX_FILTER_TEXT} characters.`,
    );
  }
  return { of, attribute, test: tested, value: needsValue ? given : '' };
}

/** Reads how far focus guidance reaches: one degree, both ways, dimming, unless it says. */
function readFocus(value: Record<string, unknown>): GuidedFocus {
  const degrees = value.degrees ?? 1;
  if (
    degrees !== 'all' &&
    !(
      Number.isInteger(degrees) &&
      (degrees as number) >= 1 &&
      (degrees as number) <= MAX_FOCUS_DEGREES
    )
  ) {
    throw new ProtocolError(`Focus reaches 1 to ${MAX_FOCUS_DEGREES} degrees, or "all".`);
  }
  const direction = value.direction ?? 'both';
  if (!FOCUS_DIRECTIONS.some((each) => each === direction)) {
    throw new ProtocolError(`Focus goes one of these ways: ${FOCUS_DIRECTIONS.join(', ')}.`);
  }
  const isolate = value.isolate ?? false;
  if (typeof isolate !== 'boolean') throw new ProtocolError('Whether focus isolates is a boolean.');
  return {
    degrees: degrees as GuidedFocus['degrees'],
    direction: direction as GuidedFocus['direction'],
    isolate,
  };
}

function readPlayback(value: Record<string, unknown>): Guidance {
  if (!isId(value.scenario)) throw new ProtocolError('Playback names its scenario by id.');
  const { action, step } = value;
  if (!PLAYBACK_ACTIONS.some((each) => each === action)) {
    throw new ProtocolError(`Playback does one of: ${PLAYBACK_ACTIONS.join(', ')}.`);
  }
  if (action !== 'go-to-step') {
    return { kind: 'playback', scenario: value.scenario, action: action as PlaybackAction };
  }
  if (!Number.isSafeInteger(step) || (step as number) < 0) {
    throw new ProtocolError('Going to a step needs the index of the step, from 0.');
  }
  return { kind: 'playback', scenario: value.scenario, action, step: step as number };
}

/**
 * One action the history keeps (ADR-0028), as the app's history panel lists it: what the history calls
 * it, who did it and when, and whether it is undone.
 */
export interface ListedAction {
  /**
   * Names the action while the local program runs, from 1: no two actions share one, even across a
   * reload of the project, which starts the history over.
   */
  id: number;
  /** How the history names it, in English, as the core writes it. */
  label: string;
  author: Author;
  /** When it was done, in milliseconds since 1970 began, in UTC. */
  time: number;
  /** Whether it is undone, so that it can be redone. */
  undone: boolean;
}

/**
 * The history the local program keeps, action by action, oldest first: the actions done, then those
 * undone, the next one to redo first. Sent to every open app when it connects, after every action,
 * undo or redo, and after a reload, which empties it. Claude does not get it.
 */
export interface HistoryListedMessage {
  type: 'history/listed';
  actions: ListedAction[];
}

/**
 * Reads the actions of a history list strictly, keeping only what each one holds. Throws a
 * {@link ProtocolError} for anything else.
 */
export function readListedActions(value: unknown): ListedAction[] {
  if (!Array.isArray(value)) throw new ProtocolError('The actions of the history are a list.');
  const seen = new Set<number>();
  return value.map((item: unknown): ListedAction => {
    if (!isRecord(item)) throw new ProtocolError('An action of the history is an object.');
    const { id, label, author, time, undone } = item;
    if (!isActionId(id)) throw new ProtocolError('An action of the history has a whole id from 1.');
    if (seen.has(id)) throw new ProtocolError(`Two actions of the history have the id ${id}.`);
    seen.add(id);
    if (typeof label !== 'string') throw new ProtocolError('An action of the history has a label.');
    if (author !== 'user' && author !== 'claude') {
      throw new ProtocolError('An action of the history is the person’s or Claude’s.');
    }
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      throw new ProtocolError('An action of the history has the time it was done.');
    }
    if (typeof undone !== 'boolean') {
      throw new ProtocolError('An action of the history says whether it is undone.');
    }
    return { id, label, author, time, undone };
  });
}

/** Whether a value can name an action of the history: a whole number from 1. */
function isActionId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

/**
 * A message the app sends to the local program. An undo or a redo with `to` goes on until the action
 * with that id is undone, or redone: the history panel's "Undo to here" and "Redo to here".
 */
export type AppMessage =
  | { type: 'command'; requestId: string; command: Command }
  | { type: 'undo'; requestId: string; to?: number }
  | { type: 'redo'; requestId: string; to?: number }
  | PreferencesSetMessage;

/**
 * Asks the local program to change some preferences. It is answered with `preferences/changed`, or
 * with `command/rejected` when the changes cannot be used. It is never a command: it is not undone,
 * has no author and changes no project file.
 */
export interface PreferencesSetMessage {
  type: 'preferences/set';
  requestId: string;
  changes: PreferenceChanges;
}

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
  'preferences/changed',
  'guidance',
  'history/listed',
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
    case 'history/listed':
      return { type: 'history/listed', actions: readListedActions(message.actions) };
    case 'project/reloaded':
      if (!isRecord(message.project)) throw new ProtocolError('The message has no project.');
      break;
    case 'project/changed':
      if (!Array.isArray(message.operations)) {
        throw new ProtocolError('The message has no operations.');
      }
      break;
    case 'preferences/changed':
      if (!isRecord(message.preferences))
        throw new ProtocolError('The message has no preferences.');
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
      if (message.to !== undefined && !isActionId(message.to)) {
        throw new ProtocolError(`The action to ${message.type} up to is named by its id.`);
      }
      return message as unknown as AppMessage;
    case 'preferences/set':
      // The changes themselves are checked by checkPreferenceChanges, where they are used.
      if (!isRecord(message.changes)) {
        throw new ProtocolError('The message has no preferences to change.');
      }
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

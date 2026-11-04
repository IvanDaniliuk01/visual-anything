/**
 * The live session with the local program, kept outside React: the WebSocket, the project as this tab
 * knows it, the requests waiting for an answer and the notices to show. The local program owns the
 * model (ADR-0016): this tab sends commands, undo and redo, and applies the operations that every
 * change carries to its own copy of the project, whoever made the change.
 */
import {
  LAUNCH_PARAM,
  MAX_CAPTURE_WHY,
  OperationError,
  SOLID_PIECE_BYTES,
  MEDIA_PIECE_BYTES,
  TOKEN_PARAM,
  ProtocolError,
  applyOperations,
  decodeBase64,
  decodeServerMessage,
  encodeBase64,
  encodeMessage,
  type AppMessage,
  type CaptureAsk,
  type CaptureRequestMessage,
  type ClaudeSetupAnswerMessage,
  type Command,
  type CommandRejectedMessage,
  type HistorySummary,
  type HomeOfferedMessage,
  type HomeProject,
  type ListedAction,
  type DrawingMadeMessage,
  type PackageReadAnswerMessage,
  type LiveFetchedMessage,
  type LiveKeptMessage,
  type OfferedSample,
  type PreferenceChanges,
  type Preferences,
  type Problem,
  type ProjectChangedMessage,
  type ProjectSnapshot,
  type RecentProject,
  type ProposalClosedMessage,
  type ProposalShownMessage,
  type ServerMessage,
  type SolidFilesListedMessage,
  type SolidImportOptions,
  type SolidPieceMessage,
  type MediaFilesListedMessage,
  type MediaPieceMessage,
  type MediaStoredMessage,
  type SolidPreparedMessage,
  type Comparison,
  type VersionRef,
  type VersionsListedMessage,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import {
  NO_GUIDANCE,
  applyGuidance,
  type GuidanceState,
  type GuidedLayoutAnswer,
} from '../guidance/state';
import type { CaptureOutcome } from '../capture/take';
import { tabUse } from '../guidance/tabs';
import { fill } from '../i18n/translate';
import { LiveValueBook } from '../live-values/book';

/** Where the live connection stands. */
export type LiveStatus =
  /** Waiting for the local program to send the project. */
  | 'connecting'
  /** The project is open, and commands can be sent. */
  | 'open'
  /** The connection closed after the project opened; the project is the last one received. */
  | 'closed'
  /** The project could not be opened, or this tab's copy of it can no longer be trusted. */
  | 'failed';

/** Why the live connection failed. */
export type LiveFailureReason =
  /** The tab has no session token, so it cannot connect. */
  | 'no-token'
  /** The connection closed before the project arrived: refused, or nothing is listening. */
  | 'refused'
  /** The local program sent a message this app cannot read or apply. */
  | 'unreadable';

export interface LiveFailure {
  reason: LiveFailureReason;
  /** What exactly went wrong, when there is more to say. */
  detail?: string;
}

/** How much a notice matters: info goes away by itself, warnings and errors stay until dismissed. */
export type NoticeLevel = 'info' | 'warning' | 'error';

/** Something to tell the user that needs no screen of its own. */
export interface Notice {
  /** Unique within the tab. */
  readonly id: number;
  readonly level: NoticeLevel;
  readonly message: string;
}

/** Everything the app knows about the live session at one moment; replaced whole on every change. */
export interface LiveState {
  readonly status: LiveStatus;
  /** Why the connection failed; set exactly when the status is "failed". */
  readonly failure: LiveFailure | undefined;
  /** The project as this tab knows it; absent until the local program sends it. */
  readonly project: ProjectSnapshot | undefined;
  /** What the next undo and redo would do. */
  readonly history: HistorySummary;
  /**
   * The actions the history keeps, oldest first, as the local program last listed them (protocol 5):
   * those done, then those undone, the next to redo first. Absent until it lists them, which it does
   * when the tab connects and after every change.
   */
  readonly actions?: readonly ListedAction[];
  /** The notices to show, oldest first. */
  readonly notices: readonly Notice[];
  /** What Claude's live guidance shows now; it never changes the project. */
  readonly guidance?: GuidanceState;
  /**
   * The person's preferences as the local program last sent them (ADR-0032); absent until it does,
   * which it does when the tab connects and after every change.
   */
  readonly preferences?: Preferences | undefined;
  /**
   * Set while this tab, opened with neither a launch code nor a token, asks the other tabs of this
   * browser for the session (ADR-0043).
   */
  readonly joining?: boolean | undefined;
  /**
   * What a new project can start from, while the local program runs on a folder that holds no project
   * yet (ADR 0051); absent otherwise, and once a project is open.
   */
  readonly start?: StartOffer | undefined;
  /**
   * What the Projects screen offers, while the local program is at home with no project open (ADR
   * 0093); absent otherwise.
   */
  readonly home?: HomeOffer | undefined;
  /**
   * Claude's proposal that waits (ADR 0073), as the program showed it last; absent while none waits.
   */
  readonly proposal?: WaitingProposal | undefined;
  /** How the last proposal closed, since this tab connected; absent before one has. */
  readonly proposalEnded?: ProposalEnded | undefined;
}

/**
 * Claude's proposal as the program showed it (ADR 0073), on the project as this tab knew it then: the
 * review draws it as the comparison of that project with the proposed one.
 */
export interface WaitingProposal {
  readonly shown: ProposalShownMessage['proposal'];
  /** The project now, as this tab knew it when the proposal was shown. */
  readonly base: ProjectSnapshot;
  /** The proposed project: the base with the proposal's operations. */
  readonly proposed: ProjectSnapshot;
}

/** How a proposal closed, and whether this tab decided it. */
export interface ProposalEnded {
  readonly proposal: Id;
  readonly how: ProposalClosedMessage['how'];
  /** For an accepted proposal, the keys of the changes accepted. */
  readonly accepted?: readonly string[];
  /** How many changes it held when it was last shown. */
  readonly total: number;
  /** Whether this tab decided it. */
  readonly here: boolean;
}

/** The start screen's offer: the folder a new project goes in, and the samples it can start from. */
export interface StartOffer {
  /** The folder's name. */
  readonly folder: string;
  readonly samples: readonly OfferedSample[];
}

/**
 * What the Projects screen offers (ADR 0093): the projects folder, the projects in it, the projects
 * opened last, and the samples a new project can start from.
 */
export interface HomeOffer {
  readonly folder: string;
  readonly projects: readonly HomeProject[];
  readonly recent: readonly RecentProject[];
  readonly samples: readonly OfferedSample[];
}

/** A new project the Projects screen starts: its name, and its sample, or empty with a first view. */
export interface NewProjectChoice {
  name: string;
  sample?: string;
  /** For an empty project, its first view's name, in the language the app reads in. */
  view?: string;
}

/** How to start the new project: from a sample, or empty when `sample` is left out. */
export interface StartChoice {
  sample?: string;
  /** For an empty project: its name, and its first view's, in the language the app reads in. */
  names?: { project?: string; view?: string };
}

/** How a connection hears of what the local program hands it. */
export interface LiveConnectionOptions {
  /**
   * Called with the session token the local program hands over for a launch code, which is spent;
   * returns the URL to reconnect at from then on.
   */
  onToken?: (token: string) => string;
  /**
   * For a tab with neither a launch code nor a token: asks the project's other tabs in this browser
   * for the session token (ADR-0043), and resolves with the URL to connect at, or null when none gave
   * one. Without it, such a tab fails at once.
   */
  join?: () => Promise<string | null>;
  /**
   * Whether no other open tab of the app was used after this one, which answers Claude's pictures
   * (ADR 0081); the tab's own tracker by default (`guidance/tabs.ts`).
   */
  isLastUsed?: () => boolean;
}

/** Takes a picture Claude asked for with the tab's canvas, or says why it took none (ADR 0081). */
export type TakeCapture = (ask: CaptureAsk) => Promise<CaptureOutcome>;

/**
 * A problem with a request: one the local program found, or the connection closing before it
 * answered, in which case the request may or may not have been done.
 */
export interface RequestProblem extends Omit<Problem, 'code'> {
  code: Problem['code'] | 'connection-closed';
}

/** How the local program answered a command, an undo or a redo. */
export type CommandResult =
  | {
      ok: true;
      /** The ids of what the action created. */
      created: Id[];
      /** Rules that only warn, such as relation type limits, that the result breaks. */
      warnings: Problem[];
    }
  | { ok: false; problems: RequestProblem[] };

/** How a command is sent: a layout of what the newest action added asks to join it (ADR 0065). */
export interface SendOptions {
  /** The id of the newest action, as the history lists it. */
  joins?: number;
}

/** How the local program answered a change of preferences. */
export type PreferencesResult =
  { ok: true; preferences: Preferences } | { ok: false; problems: RequestProblem[] };

/** How the local program answered a request about live values: its answer, or why it refused. */
export type LiveResult<T> = { ok: true; answer: T } | { ok: false; problems: RequestProblem[] };

/**
 * How the local program answered a request to compare a version with the project now (ADR 0070): the
 * version's project, the older, and the project as this tab knew it when the answer came, the newer,
 * which the comparison was worked out against; or why it could not be compared.
 */
export type ComparedResult =
  | {
      ok: true;
      version: VersionRef;
      older: ProjectSnapshot;
      newer: ProjectSnapshot;
      comparison: Comparison;
    }
  | { ok: false; problems: RequestProblem[] };

/** How many notices are shown at most; the oldest make way for newer ones. */
export const MAX_NOTICES = 5;

/**
 * How the local program answered a request to open another project (ADR 0056): the name of the
 * project a tab opened on, or why none did.
 */
export type OtherProjectResult =
  { ok: true; name: string } | { ok: false; problems: RequestProblem[] };

type RequestKind = 'command' | 'undo' | 'redo' | 'start' | 'home' | 'proposal';

type Waiting =
  | { kind: RequestKind; resolve: (result: CommandResult) => void }
  | { kind: 'preferences'; resolve: (result: PreferencesResult) => void }
  | { kind: 'other-project'; resolve: (result: OtherProjectResult) => void }
  | { kind: 'live-fetch'; resolve: (result: LiveResult<LiveFetchedMessage>) => void }
  | { kind: 'live-set'; resolve: (result: LiveResult<LiveKeptMessage>) => void }
  | { kind: 'drawing'; resolve: (result: LiveResult<DrawingMadeMessage>) => void }
  | { kind: 'package-read'; resolve: (result: LiveResult<PackageReadAnswerMessage>) => void }
  | { kind: 'versions'; resolve: (result: LiveResult<VersionsListedMessage>) => void }
  | { kind: 'compare'; resolve: (result: ComparedResult) => void }
  | { kind: 'solid-prepare'; resolve: (result: LiveResult<SolidPreparedMessage>) => void }
  | { kind: 'solid-files'; resolve: (result: LiveResult<SolidFilesListedMessage>) => void }
  | { kind: 'claude-setup'; resolve: (result: LiveResult<ClaudeSetupAnswerMessage>) => void }
  | { kind: 'media-put'; resolve: (result: LiveResult<MediaStoredMessage>) => void }
  | { kind: 'media-files'; resolve: (result: LiveResult<MediaFilesListedMessage>) => void }
  | SolidFileWaiting
  | (Omit<SolidFileWaiting, 'kind'> & { kind: 'media' });

/**
 * A solid's file (ADR 0075) or a media file (ADR 0098) asked for: its pieces as they come, until the
 * last one.
 */
interface SolidFileWaiting {
  kind: 'solid';
  hash: string;
  pieces: (Uint8Array | undefined)[];
  received: number;
  resolve: (result: LiveResult<Uint8Array>) => void;
}

/** What each request {@link LiveConnection.ask} sends resolves with. */
interface VersionAnswers {
  versions: LiveResult<VersionsListedMessage>;
  compare: ComparedResult;
  'claude-setup': LiveResult<ClaudeSetupAnswerMessage>;
}

/** Answers go back to the socket that asked, so request ids only need to be unique in the tab. */
let requestCount = 0;

function nextRequestId(): string {
  requestCount += 1;
  return `request-${requestCount}`;
}

const NOT_CONNECTED = 'Visual Anything is not connected, so nothing was changed.';
const CLOSED_BEFORE_ANSWER = 'The connection to Visual Anything closed before it answered.';
const NO_VERSION_DRAWN = 'Visual Anything sent the comparison without the version to draw.';
const PIECES_APART = 'Visual Anything sent pieces of a solid’s file that do not fit together.';
const DRIFTED =
  'This tab’s copy of the project fell out of step with Visual Anything, so it is getting the project again.';

function closedResult(message: string): { ok: false; problems: RequestProblem[] } {
  return { ok: false, problems: [{ code: 'connection-closed', message }] };
}

function done(change: ProjectChangedMessage): CommandResult {
  return { ok: true, created: change.created, warnings: change.warnings };
}

function sentences(problems: readonly { message: string }[]): string {
  return problems.map((each) => each.message).join(' ');
}

/**
 * What a tab says when Claude's proposal closes (ADR 0073), in the English the notices translate.
 */
function endedNotice(ended: ProposalEnded, afterChange: boolean): string {
  switch (ended.how) {
    case 'accepted': {
      if (!ended.here) return 'Claude’s proposal was accepted in another tab.';
      const accepted = ended.accepted?.length ?? 0;
      if (accepted >= ended.total) return 'Accepted Claude’s changes.';
      return fill('Accepted {accepted} of Claude’s {total} changes.', {
        accepted,
        total: ended.total,
      });
    }
    case 'refused':
      return ended.here
        ? 'Refused Claude’s proposal: nothing of it was applied.'
        : 'Claude’s proposal was refused in another tab.';
    case 'withdrawn':
      return 'Claude withdrew its proposal: nothing of it was applied.';
    case 'dropped':
      return afterChange
        ? 'Claude’s proposal closed by itself: what changed left nothing in it to review.'
        : 'Claude’s proposal was dropped: nothing of it was applied.';
  }
}

/**
 * One tab's live session. It connects when asked and does not reconnect by itself, except once when a
 * change does not fit this tab's copy of the project: then it reconnects to get a fresh copy. The
 * methods are bound, so they can be handed around as they are.
 */
export class LiveConnection {
  /** Where to connect: with a launch code at first, with the session token once it was handed over. */
  private url: string | null;
  private readonly options: LiveConnectionOptions;
  /** How many guidance messages arrived, to number each one. */
  private guidanceCount = 0;
  private state: LiveState;
  private socket: WebSocket | undefined;
  /** Stops listening to the current socket. */
  private release: (() => void) | undefined;
  private readonly waiting = new Map<string, Waiting>();
  private readonly listeners = new Set<() => void>();
  /** Set after reconnecting because the copy drifted, until a change fits the fresh copy. */
  private recovering = false;
  private noticeCount = 0;
  /** A socket opened with a launch code, kept for a moment after a disconnect: see `disconnect`. */
  private parked: ReturnType<typeof setTimeout> | undefined;
  /** Whether the tab has asked the other tabs for the session; it asks once. */
  private joinAsked = false;
  /** Whether a connection is wanted now: between `connect` and `disconnect`. */
  private wanted = false;
  /** Whether the last message the program sent changed the project now, for a proposal that closes. */
  private changedLast = false;
  /** What takes Claude's pictures: the canvas, while it is mounted (ADR 0081). */
  private capturer: TakeCapture | undefined;
  /**
   * The live values the local program keeps for the open project (ADR 0057), outside the state, so
   * that values arriving every second re-render only what reads them.
   */
  readonly liveValues = new LiveValueBook();

  /**
   * `url` is the live connection's, carrying the session token or a launch code; null when the tab
   * has neither.
   */
  constructor(url: string | null, options: LiveConnectionOptions = {}) {
    this.url = url;
    this.options = options;
    const joins = url === null && options.join !== undefined;
    this.state = {
      status: url === null && !joins ? 'failed' : 'connecting',
      failure: url === null && !joins ? { reason: 'no-token' } : undefined,
      project: undefined,
      history: {},
      notices: [],
      guidance: NO_GUIDANCE,
      ...(joins ? { joining: true } : {}),
    };
  }

  /** Calls `listener` after every change to the state; returns what stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The state now: the same value until something changes. */
  readonly getState = (): LiveState => this.state;

  /**
   * Opens the live connection. Does nothing while one is open, and once the connection has closed or
   * failed: it is never reopened in a loop.
   */
  readonly connect = (): void => {
    if (this.parked !== undefined) {
      // Connected again at once: the socket kept is still the one to use.
      clearTimeout(this.parked);
      this.parked = undefined;
      return;
    }
    this.wanted = true;
    if (this.url === null) {
      this.join();
      return;
    }
    if (this.socket !== undefined) return;
    if (this.state.status === 'closed' || this.state.status === 'failed') return;
    this.openSocket(this.url);
    if (this.state.status !== 'connecting') this.update({ status: 'connecting' });
  };

  /**
   * Closes the live connection, answering the requests still waiting. `connect` opens a new one. A
   * socket opened with a launch code, before the token was handed over, closes a moment later
   * instead: the code works once, so a mount undone and done again at once, as React's StrictMode
   * does, must keep that socket rather than open another with a spent code.
   */
  readonly disconnect = (): void => {
    this.wanted = false;
    if (this.socket !== undefined && this.parked === undefined && this.opensOnce()) {
      this.parked = setTimeout(() => {
        this.parked = undefined;
        this.closeSocket();
      }, 0);
      return;
    }
    this.closeSocket();
  };

  /**
   * The session token this tab connects with, while its connection is open, for another tab of this
   * browser that asks for it (ADR-0043); never a launch code.
   */
  readonly sessionToken = (): string | undefined => {
    if (this.state.status !== 'open' || this.url === null) return undefined;
    const query = this.url.slice(this.url.indexOf('?') + 1);
    return new URLSearchParams(query).get(TOKEN_PARAM) || undefined;
  };

  /** Asks the other tabs for the session, once, and connects with what they give while wanted. */
  private join(): void {
    const { join } = this.options;
    if (join === undefined || this.joinAsked) return;
    this.joinAsked = true;
    void join()
      .catch(() => null)
      .then((url) => {
        if (url === null) {
          this.update({ status: 'failed', failure: { reason: 'no-token' }, joining: undefined });
          return;
        }
        this.url = url;
        this.update({ joining: undefined });
        if (this.wanted) this.connect();
      });
  }

  /** Whether the socket was opened with a launch code that the token has not yet replaced. */
  private opensOnce(): boolean {
    if (this.url === null || this.state.status !== 'connecting') return false;
    const query = this.url.slice(this.url.indexOf('?') + 1);
    return new URLSearchParams(query).has(LAUNCH_PARAM);
  }

  /**
   * Sends a command; resolves once the local program has answered it. With `joins`, it asks to join
   * the newest action, which the program does only under ADR 0065's conditions.
   */
  readonly send = (command: Command, options: SendOptions = {}): Promise<CommandResult> =>
    this.request('command', (requestId) => ({
      type: 'command',
      requestId,
      command,
      ...(options.joins === undefined ? {} : { joins: options.joins }),
    }));

  /** Undoes the newest action, whoever did it. A refusal is also shown as a notice. */
  readonly undo = (): Promise<CommandResult> =>
    this.request('undo', (requestId) => ({ type: 'undo', requestId }));

  /** Redoes the newest undone action. A refusal is also shown as a notice. */
  readonly redo = (): Promise<CommandResult> =>
    this.request('redo', (requestId) => ({ type: 'redo', requestId }));

  /**
   * Undoes, one action at a time, every action after the one with this id and that one too, whoever
   * did each. A refusal is also shown as a notice.
   */
  readonly undoTo = (action: number): Promise<CommandResult> =>
    this.request('undo', (requestId) => ({ type: 'undo', requestId, to: action }));

  /** Redoes, one action at a time, every undone action up to the one with this id, and that one. */
  readonly redoTo = (action: number): Promise<CommandResult> =>
    this.request('redo', (requestId) => ({ type: 'redo', requestId, to: action }));

  /**
   * Asks the local program to change some of the person's preferences, which are never commands:
   * resolves with the preferences it then holds, or with why it refused. A refusal is not shown here;
   * whoever asked says so.
   */
  readonly setPreferences = (changes: PreferenceChanges): Promise<PreferencesResult> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage({ type: 'preferences/set', requestId, changes });
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'preferences', resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  };

  /**
   * Starts the project the start screen offers (ADR 0051): resolves once the local program has written
   * and opened it, which every tab then shows, or with why it could not.
   */
  readonly startProject = (choice: StartChoice): Promise<CommandResult> =>
    this.request('start', (requestId) => ({ type: 'start/create', requestId, ...choice }));

  /**
   * Opens the project in a folder from the Projects screen (ADR 0093): resolves once every tab shows
   * it, or the start screen of a folder that holds nothing yet, or with why it could not.
   */
  readonly openProject = (path: string): Promise<CommandResult> =>
    this.request('home', (requestId) => ({ type: 'home/open', requestId, path }));

  /** Starts a new project in the projects folder, and opens it, as `openProject` does. */
  readonly createProject = (choice: NewProjectChoice): Promise<CommandResult> =>
    this.request('home', (requestId) => ({ type: 'home/create', requestId, ...choice }));

  /** Takes a project off the recent list; resolves once the Projects screen shows the list. */
  readonly forgetRecent = (path: string): Promise<CommandResult> =>
    this.request('home', (requestId) => ({ type: 'home/forget', requestId, path }));

  /**
   * Closes the open project, once its writes have landed, and takes every tab to the Projects
   * screen (ADR 0093); resolves once this tab shows it.
   */
  readonly goHome = (): Promise<CommandResult> =>
    this.request('home', (requestId) => ({ type: 'home/close', requestId }));
  /**
   * Asks the local program to open another project, as a destination names it, in a tab of that
   * project's own program (ADR 0056); the person agreed first. Resolves with the project's name once
   * a tab opened there, or with why none did. Nothing in this project changes.
   */
  readonly openOtherProject = (project: string, view?: Id): Promise<OtherProjectResult> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage({
      type: 'project/open-other',
      requestId,
      project,
      ...(view === undefined ? {} : { view }),
    });
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'other-project', resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  };

  /**
   * Asks the local program to make a drawing of HTML, laid out `width` CSS pixels wide (ADR 0068):
   * resolves with the cleaned SVG and what making it dropped, or with why it was not made. Nothing in
   * the project changes; the import's one action is sent afterwards, as a command.
   */
  readonly makeDrawing = (
    name: string,
    html: string,
    width: number,
  ): Promise<LiveResult<DrawingMadeMessage>> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage({ type: 'drawing/make', requestId, name, html, width });
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'drawing', resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  };

  /**
   * Asks the local program to read a package file the person chose (ADR 0089): resolves with the
   * package, which the schema found valid and of which nothing ran, or with what the schema found.
   * Nothing in the project changes; adding or updating the package is sent afterwards, as commands.
   */
  readonly readPackageFile = (
    name: string,
    text: string,
  ): Promise<LiveResult<PackageReadAnswerMessage>> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const message = encodeMessage({ type: 'package/read', requestId, name, text });
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'package-read', resolve });
      this.sendOn(socket, message, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  };

  /**
   * Asks the local program for a solid's file by its hash (ADR 0075): resolves with its bytes, put
   * together from the pieces the program sends, or with why it sent none. This tab keeps no copy:
   * the solid worker reads the bytes, and checks them against their hash.
   */
  readonly getSolidFile = (hash: string): Promise<LiveResult<Uint8Array>> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage({ type: 'solid/get', requestId, hash });
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'solid', hash, pieces: [], received: 0, resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  };

  /**
   * Sends a file to the local program to be cleaned as a solid (ADR 0075), in pieces of 1 MiB, with
   * how to read it in the first: resolves with what the program then holds, its description and the
   * report of what cleaning dropped or changed, for the import dialog's preview; or with why it holds
   * nothing. Nothing in the project changes: `define-solid` is sent afterwards, as a command.
   */
  readonly prepareSolid = (
    fileName: string,
    bytes: Uint8Array,
    options: SolidImportOptions = {},
  ): Promise<LiveResult<SolidPreparedMessage>> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const count = Math.max(1, Math.ceil(bytes.length / SOLID_PIECE_BYTES));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'solid-prepare', resolve });
      for (let index = 0; index < count && this.waiting.has(requestId); index++) {
        const data = encodeBase64(
          bytes.subarray(index * SOLID_PIECE_BYTES, (index + 1) * SOLID_PIECE_BYTES),
        );
        const text = encodeMessage({
          type: 'solid/prepare',
          requestId,
          fileName,
          piece: { index, count, data },
          ...(index === 0 ? { options } : {}),
        });
        this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
      }
    });
  };

  /**
   * Asks the local program for a picture's media file by its hash (ADR 0098): resolves with its bytes,
   * put together from the pieces the program sends, or with why it sent none, as when the file is
   * missing or no longer what cleaning writes.
   */
  readonly getMediaFile = (hash: string): Promise<LiveResult<Uint8Array>> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage({ type: 'media/get', requestId, hash });
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'media', hash, pieces: [], received: 0, resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  };

  /**
   * Sends an image file to the local program to be cleaned and kept as a media file (ADR 0098), in
   * pieces of 1 MiB: resolves with the reference a picture names it by, or with why it was refused.
   * Nothing in the project changes: the picture is added afterwards, as a command.
   */
  readonly putMedia = (
    fileName: string,
    bytes: Uint8Array,
  ): Promise<LiveResult<MediaStoredMessage>> => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const count = Math.max(1, Math.ceil(bytes.length / MEDIA_PIECE_BYTES));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'media-put', resolve });
      for (let index = 0; index < count && this.waiting.has(requestId); index++) {
        const data = encodeBase64(
          bytes.subarray(index * MEDIA_PIECE_BYTES, (index + 1) * MEDIA_PIECE_BYTES),
        );
        const text = encodeMessage({
          type: 'media/put',
          requestId,
          fileName,
          piece: { index, count, data },
        });
        this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
      }
    });
  };

  /** Asks the local program for the files of `media/` no picture names (ADR 0098). */
  readonly listMediaFiles = (): Promise<LiveResult<MediaFilesListedMessage>> =>
    this.mediaFilesRequest((requestId) => ({ type: 'media-files/list', requestId }));

  /** Removes files of `media/` no picture names, by their hashes (ADR 0098); it cannot be undone. */
  readonly removeMediaFiles = (
    hashes: readonly string[],
  ): Promise<LiveResult<MediaFilesListedMessage>> =>
    this.mediaFilesRequest((requestId) => ({
      type: 'media-files/remove',
      requestId,
      hashes: [...hashes],
    }));

  private mediaFilesRequest(
    message: (requestId: string) => AppMessage,
  ): Promise<LiveResult<MediaFilesListedMessage>> {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage(message(requestId));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'media-files', resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  }

  /**
   * Asks the local program for the files in `solids/` that no package names (ADR 0075): resolves with
   * them, each with its size, or with why it could not list them.
   */
  readonly listSolidFiles = (): Promise<LiveResult<SolidFilesListedMessage>> =>
    this.solidFilesRequest((requestId) => ({ type: 'solid-files/list', requestId }));

  /**
   * Removes files in `solids/` that no package names, by their hashes (ADR 0075); it cannot be undone.
   * Resolves with the files left, those removed and those the program kept, with why.
   */
  readonly removeSolidFiles = (
    hashes: readonly string[],
  ): Promise<LiveResult<SolidFilesListedMessage>> =>
    this.solidFilesRequest((requestId) => ({
      type: 'solid-files/remove',
      requestId,
      hashes: [...hashes],
    }));

  private solidFilesRequest(
    message: (requestId: string) => AppMessage,
  ): Promise<LiveResult<SolidFilesListedMessage>> {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage(message(requestId));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind: 'solid-files', resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  }

  /**
   * Asks the local program to fetch an address for the code of an approved package granted its origin
   * (ADR 0063): resolves with what the origin answered, or with why the program would not.
   */
  readonly fetchForPackage = (pkg: Id, url: string): Promise<LiveResult<LiveFetchedMessage>> =>
    this.liveRequest('live-fetch', (requestId) => ({
      type: 'live/fetch',
      requestId,
      package: pkg,
      url,
    }));

  /**
   * Sends the live values the code of an approved package granted an origin made of what it fetched:
   * resolves with what the program kept of them, or with why it would not.
   */
  readonly sendLiveValues = (
    pkg: Id,
    values: unknown[],
    freshFor?: number,
  ): Promise<LiveResult<LiveKeptMessage>> =>
    this.liveRequest('live-set', (requestId) => ({
      type: 'live/set',
      requestId,
      package: pkg,
      values,
      ...(freshFor === undefined ? {} : { freshFor }),
    }));

  private liveRequest<K extends 'live-fetch' | 'live-set'>(
    kind: K,
    message: (requestId: string) => AppMessage,
  ): Promise<LiveResult<K extends 'live-fetch' ? LiveFetchedMessage : LiveKeptMessage>> {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage(message(requestId));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind, resolve } as Waiting);
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  }

  /**
   * Asks the local program for the versions it can list (ADR 0071): resolves with them, newest first
   * in each kind, and with why it could list no commit, if it could not.
   */
  readonly listVersions = (): Promise<LiveResult<VersionsListedMessage>> =>
    this.ask('versions', (requestId) => ({ type: 'versions/list', requestId }));

  /**
   * Asks the local program to compare a version, as it listed it, with the project now (ADR 0070):
   * resolves with the version's project and the comparison, or with why it could not compare them.
   * With `view`, the comparison holds that view's changes only.
   */
  readonly compareVersion = (version: VersionRef, view?: Id): Promise<ComparedResult> =>
    this.ask('compare', (requestId) => ({
      type: 'version/compare',
      requestId,
      version,
      ...(view === undefined ? {} : { view }),
    }));

  /**
   * Asks the local program to add itself to Claude Desktop's configuration (ADR 0093), as
   * `visual-anything setup-claude` does: resolves with what that came to, which changes no project.
   */
  readonly setUpClaude = (): Promise<LiveResult<ClaudeSetupAnswerMessage>> =>
    this.ask('claude-setup', (requestId) => ({ type: 'claude/setup', requestId }));

  /** Sends a request and waits for the answer of its kind, or says it is not connected. */
  private ask<K extends keyof VersionAnswers>(
    kind: K,
    message: (requestId: string) => AppMessage,
  ): Promise<VersionAnswers[K]> {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage(message(requestId));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind, resolve } as Waiting);
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  }

  /**
   * Accepts some of the changes of Claude's proposal, by their keys, or all of them (ADR 0073), as the
   * revision the person was shown holds them: resolves once the program has applied them and closed
   * the proposal, or with why it would not, such as a revision that is no longer the one shown.
   */
  readonly acceptProposal = (
    proposal: Id,
    revision: number,
    changes: readonly string[] | 'all',
  ): Promise<CommandResult> =>
    this.request('proposal', (requestId) => ({
      type: 'proposal/accept',
      requestId,
      proposal,
      revision,
      changes: changes === 'all' ? 'all' : [...changes],
    }));

  /** Refuses Claude's proposal whole: resolves once the program has closed it, or with why not. */
  readonly refuseProposal = (proposal: Id): Promise<CommandResult> =>
    this.request('proposal', (requestId) => ({ type: 'proposal/refuse', requestId, proposal }));

  /** Shows a notice. The same message at the same level is shown once, as the newest. */
  readonly notify = (level: NoticeLevel, message: string): void => {
    this.noticeCount += 1;
    const others = this.state.notices.filter(
      (each) => each.level !== level || each.message !== message,
    );
    this.update({
      notices: [...others, { id: this.noticeCount, level, message }].slice(-MAX_NOTICES),
    });
  };

  /** Stops showing Claude's guidance in this tab, as when the person dismisses it. */
  readonly clearGuidance = (): void => {
    if (this.state.guidance !== NO_GUIDANCE) this.update({ guidance: NO_GUIDANCE });
  };

  /**
   * Tells the local program, by the id Claude's layout came with, what each layout it asked for came
   * to, or why this tab ran none (M3d). Nothing waits for an answer: with the connection closed, the
   * program stops waiting for this tab anyway.
   */
  readonly answerLayout = (answer: string, outcome: GuidedLayoutAnswer): void => {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') return;
    const message: AppMessage =
      outcome.layouts === undefined
        ? { type: 'layout/done', requestId: answer, passed: outcome.passed }
        : { type: 'layout/done', requestId: answer, layouts: outcome.layouts };
    this.sendOn(socket, encodeMessage(message), answer, () => undefined);
  };

  /**
   * Lends the connection what takes Claude's pictures with the tab's canvas (ADR 0081); returns what
   * takes it back.
   */
  readonly lendCapture = (capture: TakeCapture): (() => void) => {
    this.capturer = capture;
    return () => {
      if (this.capturer === capture) this.capturer = undefined;
    };
  };

  /**
   * Answers a picture Claude asked for (ADR 0081): the tab the person used last takes it with its
   * canvas, or says why it took none; every other tab passes it over. Taking it changes nothing.
   */
  private async answerCapture(message: CaptureRequestMessage): Promise<void> {
    const socket = this.socket;
    if (socket === undefined) return;
    const { requestId, view, region, width, theme } = message;
    const ask: CaptureAsk = {
      ...(view === undefined ? {} : { view }),
      region,
      width,
      ...(theme === undefined ? {} : { theme }),
    };
    let outcome: CaptureOutcome | { passed: 'other-tab' };
    const lastUsed = this.options.isLastUsed ?? (() => tabUse().isLastUsed());
    const capture = this.capturer;
    if (!lastUsed()) outcome = { passed: 'other-tab' };
    else if (capture === undefined) outcome = { failed: 'no-canvas' };
    else {
      try {
        outcome = await capture(ask);
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        outcome = { failed: 'failed', why: why.slice(0, MAX_CAPTURE_WHY) };
      }
    }
    // The program stops waiting for a tab whose connection closed.
    if (this.socket !== socket) return;
    const answer: AppMessage = { type: 'capture/answer', requestId, ...outcome };
    this.sendOn(socket, encodeMessage(answer), requestId, () => undefined);
  }

  /** Stops showing a notice. */
  readonly dismiss = (id: number): void => {
    const notices = this.state.notices.filter((each) => each.id !== id);
    if (notices.length !== this.state.notices.length) this.update({ notices });
  };

  private request(
    kind: RequestKind,
    message: (requestId: string) => AppMessage,
  ): Promise<CommandResult> {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage(message(requestId));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind, resolve });
      this.sendOn(socket, text, requestId, () => resolve(closedResult(NOT_CONNECTED)));
    });
  }

  /** Sends a request's text, and stops waiting for it when the socket cannot take it. */
  private sendOn(socket: WebSocket, text: string, requestId: string, refused: () => void): void {
    try {
      socket.send(text);
    } catch (error) {
      // A browser refuses to send on a socket that is not open; anything else is a bug.
      if (!(error instanceof DOMException)) throw error;
      this.waiting.delete(requestId);
      refused();
    }
  }

  private openSocket(url: string): void {
    const socket = new WebSocket(url);
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      this.receive(data);
    };
    const onClose = () => {
      this.closed();
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    this.socket = socket;
    this.release = () => {
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
    };
  }

  /** Stops listening to the socket and answers the requests waiting on it. */
  private forgetSocket(): WebSocket | undefined {
    const socket = this.socket;
    if (socket === undefined) return undefined;
    this.release?.();
    this.socket = undefined;
    this.release = undefined;
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const each of waiting) each.resolve(closedResult(CLOSED_BEFORE_ANSWER));
    return socket;
  }

  private closeSocket(): void {
    this.forgetSocket()?.close();
  }

  /** The socket closed without this tab closing it. */
  private closed(): void {
    this.forgetSocket();
    // The program forgets its live values when it stops; they no longer come from anywhere.
    this.liveValues.clear();
    // Claude's marks and caption no longer come from a live session.
    this.update(
      this.state.project === undefined && this.state.home === undefined
        ? { status: 'failed', failure: { reason: 'refused' }, guidance: NO_GUIDANCE }
        : { status: 'closed', guidance: NO_GUIDANCE },
    );
  }

  private fail(reason: LiveFailureReason, detail: string): void {
    this.closeSocket();
    this.update({ status: 'failed', failure: { reason, detail } });
  }

  private receive(data: unknown): void {
    let message: ServerMessage;
    try {
      if (typeof data !== 'string') throw new ProtocolError('The message is not text.');
      message = decodeServerMessage(data);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      this.fail('unreadable', error.message);
      return;
    }
    const changedBefore = this.changedLast;
    this.changedLast = message.type === 'project/changed' || message.type === 'project/reloaded';
    switch (message.type) {
      case 'project/opened':
        if (message.token !== undefined && this.options.onToken !== undefined) {
          this.url = this.options.onToken(message.token);
        }
        // The program sends the live values it keeps right after the project.
        this.liveValues.clear();
        this.update({
          status: 'open',
          project: message.project,
          history: message.history,
          start: undefined,
          home: undefined,
          // The program shows the proposal that waits, if any, right after the project.
          proposal: undefined,
        });
        this.started();
        break;
      case 'start/offered':
        if (message.token !== undefined && this.options.onToken !== undefined) {
          this.url = this.options.onToken(message.token);
        }
        this.update({
          status: 'open',
          start: { folder: message.folder, samples: message.samples },
          home: undefined,
        });
        this.started();
        break;
      case 'home/offered':
        this.atHome(message);
        break;
      case 'project/closed':
        // Only Claude is told so; an app gets `home/offered`.
        break;
      case 'project/changed':
        this.change(message);
        break;
      case 'command/rejected':
        this.rejected(message);
        break;
      case 'project/reloaded':
        this.recovering = false;
        this.update({ status: 'open', project: message.project, history: message.history });
        this.notify('info', fill('Reloaded the project: {why}', { why: message.reason }));
        break;
      case 'notice':
        this.notify(message.level, message.message);
        break;
      case 'preferences/changed': {
        this.update({ preferences: message.preferences });
        const answered = message.requestId === undefined ? undefined : this.take(message.requestId);
        if (answered?.kind === 'preferences') {
          answered.resolve({ ok: true, preferences: message.preferences });
        }
        break;
      }
      case 'history/listed':
        this.update({ actions: message.actions });
        break;
      case 'other-project/opened': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'other-project') answered.resolve({ ok: true, name: message.name });
        break;
      }
      case 'live/values':
        this.liveValues.apply(message);
        break;
      case 'live/fetched': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'live-fetch') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'drawing/made': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'drawing') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'claude/setup-answer': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'claude-setup') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'package/read-answer': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'package-read') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'live/kept': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'live-set') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'versions/listed': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'versions') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'version/compared': {
        const answered = this.take(message.requestId);
        if (answered?.kind !== 'compare') break;
        const newer = this.state.project;
        answered.resolve(
          message.project === undefined || newer === undefined
            ? { ok: false, problems: [{ code: 'program-failed', message: NO_VERSION_DRAWN }] }
            : {
                ok: true,
                version: message.version,
                older: message.project,
                newer,
                comparison: message.comparison,
              },
        );
        break;
      }
      case 'version/refused': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'compare')
          answered.resolve({ ok: false, problems: message.problems });
        break;
      }
      case 'proposal/shown':
        this.proposalShown(message);
        break;
      case 'proposal/closed':
        this.proposalClosed(message, changedBefore);
        break;
      case 'capture/request':
        void this.answerCapture(message);
        break;
      case 'solid/piece':
        this.solidPiece(message, 'solid');
        break;
      case 'media/piece':
        this.solidPiece(message, 'media');
        break;
      case 'media/refused': {
        const answered = this.take(message.requestId);
        if (
          answered?.kind === 'media' ||
          answered?.kind === 'media-put' ||
          answered?.kind === 'media-files'
        ) {
          answered.resolve({
            ok: false,
            problems: [{ code: message.code, message: message.message }],
          });
        }
        break;
      }
      case 'media/stored': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'media-put') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'media-files/listed': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'media-files') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'solid/refused': {
        const answered = this.take(message.requestId);
        if (
          answered?.kind === 'solid' ||
          answered?.kind === 'solid-prepare' ||
          answered?.kind === 'solid-files'
        ) {
          answered.resolve({
            ok: false,
            problems: [{ code: message.code, message: message.message }],
          });
        }
        break;
      }
      case 'solid/prepared': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'solid-prepare') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'solid-files/listed': {
        const answered = this.take(message.requestId);
        if (answered?.kind === 'solid-files') answered.resolve({ ok: true, answer: message });
        break;
      }
      case 'guidance':
        this.guidanceCount += 1;
        this.update({
          guidance: applyGuidance(
            this.state.guidance ?? NO_GUIDANCE,
            message.guidance,
            this.guidanceCount,
            message.answer,
          ),
        });
        break;
    }
  }

  private change(message: ProjectChangedMessage): void {
    const project = this.state.project;
    if (project === undefined) {
      this.fail('unreadable', 'Visual Anything sent a change before the project.');
      return;
    }
    const taken = message.requestId === undefined ? undefined : this.take(message.requestId);
    const answered =
      taken === undefined ||
      taken.kind === 'preferences' ||
      taken.kind === 'other-project' ||
      taken.kind === 'live-fetch' ||
      taken.kind === 'live-set' ||
      taken.kind === 'drawing' ||
      taken.kind === 'package-read' ||
      taken.kind === 'versions' ||
      taken.kind === 'compare' ||
      taken.kind === 'proposal' ||
      taken.kind === 'solid' ||
      taken.kind === 'solid-prepare' ||
      taken.kind === 'solid-files' ||
      taken.kind === 'media' ||
      taken.kind === 'media-put' ||
      taken.kind === 'media-files' ||
      taken.kind === 'claude-setup'
        ? undefined
        : taken;
    let next: ProjectSnapshot;
    try {
      next = applyOperations(project, message.operations).state;
    } catch (error) {
      // The local program did the action; only this tab's copy is behind.
      answered?.resolve(done(message));
      if (error instanceof OperationError) this.drifted(error);
      else this.fail('unreadable', error instanceof Error ? error.message : String(error));
      return;
    }
    this.recovering = false;
    this.update({ project: next, history: message.history });
    if (answered === undefined) return;
    if (message.warnings.length > 0) this.notify('warning', sentences(message.warnings));
    answered.resolve(done(message));
  }

  /** Keeps the proposal shown, on the project as this tab knows it now. */
  private proposalShown(message: ProposalShownMessage): void {
    const base = this.state.project;
    if (base === undefined) {
      this.fail('unreadable', 'Visual Anything sent a proposal before the project.');
      return;
    }
    let proposed: ProjectSnapshot;
    try {
      proposed = applyOperations(base, message.proposal.operations).state;
    } catch (error) {
      if (error instanceof OperationError) this.drifted(error);
      else this.fail('unreadable', error instanceof Error ? error.message : String(error));
      return;
    }
    this.update({ proposal: { shown: message.proposal, base, proposed } });
  }

  /**
   * The proposal closed: the request that decided it is answered, and every tab says how it ended.
   */
  private proposalClosed(message: ProposalClosedMessage, afterChange: boolean): void {
    const waiting = this.state.proposal;
    const same = waiting?.shown.id === message.proposal;
    const total = same ? waiting.shown.changes.length : 0;
    const taken = message.requestId === undefined ? undefined : this.take(message.requestId);
    const here = taken?.kind === 'proposal';
    const ended: ProposalEnded = {
      proposal: message.proposal,
      how: message.how,
      ...(message.accepted === undefined ? {} : { accepted: message.accepted }),
      total,
      here,
    };
    this.update({ proposalEnded: ended, ...(same ? { proposal: undefined } : {}) });
    const said = endedNotice(ended, afterChange);
    if (said !== undefined) this.notify('info', said);
    if (here) taken.resolve({ ok: true, created: [], warnings: [] });
  }

  /** A change did not fit this tab's copy of the project: get a fresh copy, once. */
  private drifted(error: OperationError): void {
    if (this.recovering || this.url === null) {
      // The fresh copy drifted too, so reconnecting again would only loop.
      this.fail(
        'unreadable',
        fill('This tab’s copy of the project fell out of step with Visual Anything again: {why}', {
          why: error.message,
        }),
      );
      return;
    }
    this.recovering = true;
    this.closeSocket();
    this.openSocket(this.url);
    this.update({ status: 'connecting' });
    this.notify('warning', DRIFTED);
  }

  private rejected(message: CommandRejectedMessage): void {
    const answered = this.take(message.requestId);
    if (answered === undefined) return;
    if (answered.kind === 'undo' || answered.kind === 'redo') {
      const why = sentences(message.problems);
      const notice =
        answered.kind === 'undo'
          ? why === ''
            ? 'Could not undo.'
            : fill('Could not undo: {why}', { why })
          : why === ''
            ? 'Could not redo.'
            : fill('Could not redo: {why}', { why });
      this.notify('error', notice);
    }
    answered.resolve({ ok: false, problems: message.problems });
  }

  /**
   * Keeps a piece of a solid's file asked for, and once the last one came, answers with the bytes they
   * make. Pieces that do not fit together, as of another file or of another count, end the request.
   */
  private solidPiece(
    message: SolidPieceMessage | MediaPieceMessage,
    kind: 'solid' | 'media',
  ): void {
    const waiting = this.waiting.get(message.requestId);
    if (waiting?.kind !== kind) return;
    const { index, count, data } = message.piece;
    const bytes = decodeBase64(data);
    const fits =
      message.hash === waiting.hash &&
      (waiting.received === 0 || waiting.pieces.length === count) &&
      waiting.pieces[index] === undefined &&
      bytes !== undefined &&
      bytes.length > 0 &&
      (index === count - 1
        ? bytes.length <= SOLID_PIECE_BYTES
        : bytes.length === SOLID_PIECE_BYTES);
    if (!fits) {
      this.waiting.delete(message.requestId);
      waiting.resolve({
        ok: false,
        problems: [
          { code: kind === 'solid' ? 'invalid-solid' : 'media-not-clean', message: PIECES_APART },
        ],
      });
      return;
    }
    if (waiting.received === 0) waiting.pieces = new Array<Uint8Array | undefined>(count);
    waiting.pieces[index] = bytes;
    waiting.received += 1;
    if (waiting.received < count) return;
    this.waiting.delete(message.requestId);
    const parts = waiting.pieces as Uint8Array[];
    const whole = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      whole.set(part, offset);
      offset += part.length;
    }
    waiting.resolve({ ok: true, answer: whole });
  }

  /**
   * The program is at home (ADR 0093): the project, its history, Claude's guidance and proposal and
   * the live values are gone from this tab, which shows the Projects screen.
   */
  private atHome(message: HomeOfferedMessage): void {
    if (message.token !== undefined && this.options.onToken !== undefined) {
      this.url = this.options.onToken(message.token);
    }
    this.liveValues.clear();
    const { folder, projects, recent, samples } = message;
    this.update({
      status: 'open',
      home: { folder, projects, recent, samples },
      project: undefined,
      start: undefined,
      history: {},
      actions: undefined,
      guidance: NO_GUIDANCE,
      proposal: undefined,
      proposalEnded: undefined,
    });
    const answered = message.requestId === undefined ? undefined : this.take(message.requestId);
    if (answered?.kind === 'home') answered.resolve({ ok: true, created: [], warnings: [] });
  }

  /**
   * The project, or the start screen, that the start screen or the Projects screen asked for is
   * shown: every such request waiting is done.
   */
  private started(): void {
    for (const [requestId, each] of this.waiting) {
      if (each.kind !== 'start' && each.kind !== 'home') continue;
      this.waiting.delete(requestId);
      each.resolve({ ok: true, created: [], warnings: [] });
    }
  }

  /** The request with this id, which stops waiting. */
  private take(requestId: string): Waiting | undefined {
    const answered = this.waiting.get(requestId);
    this.waiting.delete(requestId);
    return answered;
  }

  private update(change: Partial<LiveState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener();
  }
}

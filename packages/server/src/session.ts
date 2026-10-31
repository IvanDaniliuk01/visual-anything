/**
 * The live session of an open project. The local program owns the model and its single undo history
 * (ADR-0016): every change arrives as a command, from the app or from Claude; the core applies it, and
 * the session saves the files it affects and tells every open app. It also reloads the project when its
 * files change outside the app, such as after a git pull.
 *
 * Changes are applied one at a time, in the order they arrive, file writes included. The session keeps
 * the bytes of every project file as it last read or wrote them: a change on disk that differs from
 * them was made outside, and a file is never written over such a change.
 */
import { readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  EMPTY_HISTORY,
  PROTOCOL_VERSION,
  applyOperations,
  checkPreferenceChanges,
  checkProject,
  codePackagesOn,
  compareProjects,
  decodeAppMessage,
  executeCommand,
  extendNewest,
  modelIndexOf,
  placementJoins,
  record,
  redo as redoAction,
  summarize,
  undo as undoAction,
  type AppMessage,
  type Author,
  type Command,
  type CommandOutcome,
  type Guidance,
  type History,
  type HistoryEntry,
  type HistoryStep,
  type HistorySummary,
  type IdGenerator,
  type LayoutReport,
  type CaptureAsk,
  type CaptureReport,
  type ListedAction,
  MAX_DRAWING_REPORT,
  type DrawingMakeMessage,
  type SolidImportOptions,
  type SolidPrepareMessage,
  type LiveFetchMessage,
  type LiveFilter,
  type LiveSender,
  type LiveSetMessage,
  type NoticeMessage,
  type Operation,
  type PreferencesSetMessage,
  type Problem,
  type ProposalAcceptMessage,
  type ProposalClosedMessage,
  type ProblemCode,
  type ProjectChangedMessage,
  type ProjectSnapshot,
  type ServerMessage,
  type VersionRef,
} from '@visual-anything/core';
import type { FileKind, Id } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { validateFile, type ValidationError } from '@visual-anything/schema/validate';
import { errorReason } from './errors';
import {
  affectedFiles,
  contentOf,
  liveFiles,
  parseFileKey,
  type FileContent,
  type FileKey,
} from './file-plan';
import { FOLDERS, newFilePath, type FolderKind } from './layout';
import type { MadeDrawing } from './drawings/make';
import { DrawingQueue, type DrawingMaker } from './drawings/queue';
import { projectDestinationWarnings, type OpenOtherProject } from './other-project';
import { LiveValues, type LiveKept, type LiveListing } from './live';
import { LayoutWaits, type LayoutGuidance, type LayoutWait } from './layout-waits';
import { CaptureWaits } from './capture-waits';
import { PackageFetcher, networkGrantOf, type FetcherOptions } from './live-fetch';
import type { LogEvent, ProgramEvent } from './program-log';
import type { PreferencesStore } from './preferences';
import { toForwardSlashes } from './paths';
import {
  formatProjectProblem,
  loadProject,
  locateProblems,
  readProjectFiles,
  type LoadedProject,
  type ProjectFileProblem,
  type ProjectFiles,
} from './project';
import { STALE_PROPOSAL, SessionProposal, goesToProjectNow } from './proposals';
import { capOf, describeCap, readRegularFile } from './regular-files';
import { comparisonOfView, Versions, type VersionsOptions } from './versions/versions';
import { watchProject, type ProjectWatcher, type WatchMode } from './watcher';
import { removeFile, writeFileAtomic, type WriteOptions } from './writer';
import { solidFileWarnings } from './solids/files';
import { planSolidImport, type SolidChoices } from './solids/import';
import { readProjectSolidFile } from './solids/project-file';
import {
  SolidStore,
  preparedMessage,
  type Preparing,
  type SolidStoreOptions,
} from './solids/store';

/** An open app, as the session sees it: something to send messages to. */
export interface SessionClient {
  send(message: ServerMessage): void;
}

/** How an app connects. */
export interface ConnectOptions {
  /**
   * The session token, handed to an app that opened the connection with a launch code, which is
   * spent; it reconnects with the token from then on.
   */
  token?: string;
}

/** What the local program's server needs from the open project. */
export interface LiveSession {
  /** The project folder, as an absolute path: dev mode serves no file inside it. */
  readonly folder?: string;
  /** The project as it is now, as {@link Session.snapshot} gives it. */
  readonly snapshot: ProjectSnapshot;
  /**
   * Greets an app that connects with the project, its history and its warnings, and sends it every
   * change from then on. Returns what to call when the app disconnects.
   */
  connect(client: SessionClient, options?: ConnectOptions): () => void;
  /** Handles a message an app sent. It never fails: a message it cannot use is answered or ignored. */
  receive(client: SessionClient, text: string): Promise<void>;
  /**
   * Greets Claude, attached through its own endpoint, with the project and its history, and sends it
   * every change and reload from then on; never the session token, notices or what only apps need.
   * Returns what to call when Claude detaches.
   */
  attachClaude(client: SessionClient): () => void;
  /** Runs a command, as {@link Session.execute} does. */
  execute(
    command: Command,
    author: Author,
    origin?: Origin,
    how?: ExecuteOptions,
  ): Promise<SessionOutcome>;
  /** Plans a command and runs it in one turn of the queue, as {@link Session.executePlanned} does. */
  executePlanned(plan: CommandPlan, author: Author, origin?: Origin): Promise<SessionOutcome>;
  /**
   * Shows Claude's guidance in every open app, after the work already asked for; resolves with how
   * many apps it reached. Guidance changes nothing: no file, no history.
   */
  guide(guidance: Guidance): Promise<number>;
  /**
   * Lays a view out in the open apps, after the layouts asked for before it, and resolves once the
   * tab that runs it says what it moved, or no app is left to, or the wait runs out (M3d, ADR 0029's
   * clarification of 2026-10-30). Absent where the program runs no layouts.
   */
  layOut?(guidance: LayoutGuidance): Promise<LayoutReport>;
  /**
   * Asks the open apps for a picture of a view as the canvas draws it (ADR 0081), after the work
   * asked for before it, and resolves once the tab the person used last answers with it or with why
   * it took none, or no app is left to, or 20 s ran out. It changes nothing. Absent where the program
   * takes no pictures.
   */
  capture?(ask: CaptureAsk): Promise<CaptureReport>;
  /**
   * Takes live values (ADR 0057) that a sender sent on a connection, and says what it kept. They are
   * never commands: nothing is saved and nothing enters the history.
   */
  setLive(connection: object, sender: LiveSender, values: unknown, freshFor?: number): LiveKept;
  /** Clears the live values that match; gives back how many it cleared. */
  clearLive(filter: LiveFilter): number;
  /**
   * The live values kept now that match, the latest first, at most `limit`, as Claude's read tools
   * show them (ADR 0057); reading them changes nothing. Absent where none are kept.
   */
  listLive?(filter: LiveFilter, limit: number): LiveListing;
  /**
   * Says the port the local program listens on, on 127.0.0.1, which package code never fetches from
   * (ADR 0057's clarification on addresses).
   */
  servesAt?(port: number): void;
  /**
   * Makes a drawing of HTML (ADR 0068), after those asked for before it, in a worker of its own; it
   * changes nothing. Absent where the program makes none.
   */
  makeDrawing?(html: string, width: number): Promise<MadeDrawing>;
  /**
   * Lists the versions of the project's repository (ADR 0071) and answers through the origin's client
   * with them, or with why none can be listed. Absent where the program reads no versions.
   */
  listVersions?(origin: Origin): Promise<void>;
  /**
   * Compares a version, the project as opened or a commit of the recent listings, with the project now
   * (ADR 0070), for every view or for one, and answers through the origin's client with the
   * comparison, or with why it cannot be made. Absent where the program reads no versions.
   */
  compareVersion?(origin: Origin, version: VersionRef, view?: Id): Promise<void>;
  /**
   * Closes Claude's proposal that waits (ADR 0073), and answers through the origin's client with
   * `proposal/closed`, or with why none waits. Absent where the program keeps no proposal.
   */
  withdrawProposal?(origin: Origin): Promise<void>;
  /**
   * Takes a piece of a file to import as a solid, from an app or the command line (ADR 0075), and
   * once it has them all, cleans the file in the cleaner's worker and answers through the client with
   * `solid/prepared` or `solid/refused`. It changes nothing. Absent where the program cleans no solid.
   */
  prepareSolidPiece?(client: SessionClient, message: SolidPrepareMessage): Promise<void>;
  /**
   * Reads a glTF file inside the project folder, by its path from the folder, only as a regular file
   * inside it, for Claude's `import_solid` and `replace_solid` (ADR 0075); cleans it as a file sent in
   * pieces is cleaned, and answers through the client with `solid/prepared` or `solid/refused`. It
   * changes nothing. Absent where the program cleans no solid.
   */
  prepareSolidFile?(
    client: SessionClient,
    requestId: string,
    path: string,
    options: SolidImportOptions,
  ): Promise<void>;
  /**
   * Defines a file the program prepared as a solid, as one action (ADR 0075), in the turn of the queue
   * that runs it. Absent where the program cleans no solid.
   */
  importSolid?(
    hash: string,
    choices: SolidChoices,
    author: Author,
    origin?: Origin,
  ): Promise<SessionOutcome>;
}

/** How a command of Claude's runs: `propose` makes it join Claude's proposal (ADR 0073). */
export interface ExecuteOptions {
  propose?: boolean;
}

/**
 * What a command of Claude's that joined its proposal came to (ADR 0073): the proposal, the keys of
 * its changes so far, and how many apps show it. Whoever asked answers with it: nothing was applied.
 */
export interface ProposedOutcome {
  id: Id;
  changes: string[];
  apps: number;
}

/**
 * Makes a command from the project as it is when its turn comes: the command, or the problems that
 * keep it from being made.
 */
export type CommandPlan = (
  state: ProjectSnapshot,
) => { ok: true; command: Command } | { ok: false; problems: Problem[] };

/** Who asked for a change: the app it is answered to, and the id of its request. */
export interface Origin {
  client: SessionClient;
  requestId: string;
}

/** The outcome of a command, an undo or a redo. */
export type SessionOutcome =
  | {
      ok: true;
      /** Whether it became an action of the history; a command that changes nothing does not. */
      recorded: boolean;
      label: string;
      author: Author;
      /** What changed, in order; empty when nothing did. */
      operations: Operation[];
      warnings: Problem[];
      created: Id[];
      history: HistorySummary;
      /**
       * Present when the command joined Claude's proposal rather than applying: nothing was saved
       * or recorded, and nobody was answered yet.
       */
      proposal?: ProposedOutcome;
    }
  | { ok: false; problems: Problem[] };

export interface SessionOptions {
  /** How to watch the folder for changes made outside the app; `false` does not watch it. */
  watch?: false | { delay?: number; mode?: WatchMode };
  /** Makes the ids of what commands create; random suffixes by default. */
  newId?: IdGenerator;
  /** How files are written; tests replace the file system to simulate failures. */
  writer?: WriteOptions;
  /** When each action is done, in milliseconds since 1970; the computer's clock by default. */
  now?: () => number;
  /** Prints a line of normal output, such as a reload. */
  out?: (line: string) => void;
  /** Prints a line about a problem. */
  err?: (line: string) => void;
  /**
   * The person's preferences (ADR-0032), which every app gets when it connects and can change; absent,
   * the program keeps none and refuses changes.
   */
  preferences?: PreferencesStore;
  /**
   * Opens another project in a tab of its own program, as an app asks when the person follows a
   * destination to it (ADR 0056); absent, the program refuses to.
   */
  openOtherProject?: OpenOtherProject;
  /**
   * How the program resolves names and fetches for package code granted an origin (ADR 0063), and
   * how long and how much a fetch may take; the system's resolver, ten seconds and 256 KiB by default.
   */
  fetcher?: FetcherOptions;
  /**
   * Where the program's log goes, with `--log` (ADR-0016's clarification of W46): actions, refusals,
   * apps and Claude attaching and going, and files changed on disk. Absent, nothing is logged.
   */
  log?: LogEvent;
  /** What makes drawings of HTML (ADR 0068); the drawing's own worker by default. Tests give their own. */
  makeDrawing?: DrawingMaker;
  /** How the program finds and runs git to read versions (ADR 0071); tests give their own. */
  versions?: VersionsOptions;
  /**
   * Hears whenever Claude's proposal opens, grows or closes (ADR 0073): with when its last change
   * joined it, or undefined once none waits. `--stop-when-idle` keeps the program running for it.
   */
  onProposal?: (lastJoined: number | undefined) => void;
  /** How long Claude's layouts wait for the app; ADR 0015's 20 s per layout, and 10 s more. */
  layoutWait?: LayoutWait;
  /** How long a picture Claude asks for waits for the app, in milliseconds; 20 s (ADR 0081). */
  captureWait?: number;
  /** How solids are cleaned and checked (ADR 0075); in the cleaner's worker by default. */
  solids?: Pick<SolidStoreOptions, 'clean' | 'check'>;
}

/** The outcome of opening a session: the session, or every problem that keeps the project closed. */
export type OpenSessionResult =
  { ok: true; session: Session } | { ok: false; errors: ProjectFileProblem[] };

/** Opens the project in a folder and starts watching it for changes made outside the app. */
export function openSession(
  folder: string,
  options: SessionOptions = {},
): Promise<OpenSessionResult> {
  return Session.open(folder, options);
}

/** The longest request id the core accepts; a longer one is never answered. */
const MAX_REQUEST_ID = 100;

/** A change to one file: its new bytes, or `null` to delete it. */
interface FileChange {
  path: string;
  kind: FileKind;
  next: Buffer | null;
  /** Whether the file does not exist yet. */
  isNew: boolean;
}

type Plan =
  | { ok: true; changes: FileChange[]; assigned: Map<FileKey, string> }
  | { ok: false; problems: Problem[] };

type Saved = { ok: true } | { ok: false; problems: Problem[] };

export class Session implements LiveSession {
  /** The project folder, as an absolute path. */
  readonly folder: string;
  readonly #options: SessionOptions;
  #state: ProjectSnapshot;
  #history: History = EMPTY_HISTORY;
  /**
   * The id and the time of each action of the history, which the history panel lists. An undo or a
   * redo moves the same action, so it keeps both.
   */
  readonly #stamps = new WeakMap<HistoryEntry, { id: number; time: number }>();
  /** The id of the newest action, which goes on counting across reloads. */
  #lastAction = 0;
  /**
   * Where each file lives. A removed view, scenario or package keeps its path, so that undo writes it
   * back where it was and no new file takes that name meanwhile.
   */
  #paths = new Map<FileKey, string>();
  /** The package files the project does not list, by package id: never written, but their ids are taken. */
  #unlisted = new Map<Id, string>();
  /** The bytes of every project file on disk, as last read or written, by path. */
  #known = new Map<string, Buffer>();
  /**
   * The files whose bytes as read are not formatFile's text of their value: those bytes and that text.
   * A file whose value comes back to what was read gets its bytes back, so undo restores them exactly.
   */
  #originals = new Map<string, { bytes: Buffer; text: string }>();
  readonly #clients = new Set<SessionClient>();
  /** Claude, attached through its own endpoint: it hears of changes and reloads only. */
  readonly #claudes = new Set<SessionClient>();
  /** The work in progress: commands, undos, redos, saves and checks of the files, one at a time. */
  #queue: Promise<void> = Promise.resolve();
  #scanQueued = false;
  /** The changes on disk that last failed to load, so that they are reported once. */
  #rejected: Map<string, Buffer | undefined> | undefined;
  #watcher: ProjectWatcher | undefined;
  #closed = false;
  #closing: Promise<void> | undefined;
  #warnings: { state: ProjectSnapshot; warnings: ProjectFileProblem[] } | undefined;
  /** The live values of the open project (ADR 0057), in memory only. */
  readonly #live: LiveValues;
  /** What fetches for package code granted an origin (ADR 0063). */
  readonly #fetcher: PackageFetcher;
  /** The drawings of HTML the apps and the command line ask for, made one at a time (ADR 0068). */
  readonly #drawings: DrawingQueue;
  /** The solid files the program prepared, read and checked (ADR 0075). */
  readonly #solids: SolidStore;
  /** Claude's layouts, sent to the apps one at a time, each once the one before was answered (M3d). */
  readonly #layouts: LayoutWaits;
  /** The pictures Claude asked the apps for, each waited for by its own id (ADR 0081). */
  readonly #captures: CaptureWaits;
  /**
   * The project as the program opened it, or last read it again from disk: the version as opened
   * (ADR 0070), which needs no git.
   */
  #opened: ProjectSnapshot;
  /** The versions read from git (ADR 0071), one at a time. */
  readonly #versions: Versions;
  /**
   * Claude's proposal (ADR 0073), on top of the project now, in memory only: nothing of it reaches a
   * file, the history or the repository before it is accepted.
   */
  readonly #proposal: SessionProposal;

  private constructor(folder: string, loaded: LoadedProject, options: SessionOptions) {
    this.folder = folder;
    this.#options = options;
    this.#state = loaded.project;
    this.#opened = loaded.project;
    this.#adopt(loaded);
    this.#live = new LiveValues({
      now: () => this.#now(),
      broadcast: (message) => this.#broadcast(message),
      notice: (message) => this.#broadcast({ type: 'notice', level: 'warning', message }),
      err: (line) => this.#err(line),
    });
    this.#fetcher = new PackageFetcher(options.fetcher);
    this.#drawings = new DrawingQueue(options.makeDrawing);
    this.#solids = new SolidStore(folder, {
      ...options.solids,
      ...(options.writer === undefined ? {} : { writer: options.writer }),
      ...(options.now === undefined ? {} : { now: options.now }),
      notClean: (found) => {
        // The warnings change, and every app hears of the file found not clean.
        this.#warnings = undefined;
        this.#broadcast(warningNotice(locateProblems(found, this.#state, this.files)));
      },
    });
    // In the session's queue, so that a layout reaches the apps after the work asked for before it.
    this.#layouts = new LayoutWaits(
      (guidance, answer) =>
        this.#enqueue(() => {
          const apps = [...this.#clients];
          for (const client of apps) this.#send(client, { type: 'guidance', guidance, answer });
          return Promise.resolve(apps);
        }),
      options.layoutWait,
    );
    // In the queue too, so that a picture shows the work asked for before it.
    this.#captures = new CaptureWaits(
      (ask, requestId) =>
        this.#enqueue(() => {
          const apps = [...this.#clients];
          for (const client of apps) {
            this.#send(client, { type: 'capture/request', requestId, ...ask });
          }
          return Promise.resolve(apps);
        }),
      options.captureWait,
    );
    this.#versions = new Versions(folder, {
      ...options.versions,
      warn: options.versions?.warn ?? ((line) => this.#err(line)),
    });
    this.#proposal = new SessionProposal(() => this.#now());
  }

  /** Opens the project in a folder; see {@link openSession}. */
  static async open(folder: string, options: SessionOptions = {}): Promise<OpenSessionResult> {
    // The real path, worked out once: every later read and write goes there, whatever a link on the
    // way to it comes to point to.
    const projectFolder = await realpath(resolve(folder)).catch(() => resolve(folder));
    // Watched before it is read: the watcher then never takes the files as newer than those read,
    // and a change made while reading them is reported too.
    // Until the session exists, a change is only noted.
    let changedWhileOpening = false;
    let onChange = () => {
      changedWhileOpening = true;
    };
    const watcher =
      options.watch === false
        ? undefined
        : watchFolder(projectFolder, options.watch ?? {}, options.err ?? console.error, () =>
            onChange(),
          );
    const loaded = await loadProject(projectFolder);
    if (!loaded.ok) {
      watcher?.close();
      return { ok: false, errors: loaded.errors };
    }
    const session = new Session(projectFolder, loaded, options);
    session.#watcher = watcher;
    onChange = () => session.#scanSoon();
    if (changedWhileOpening) session.#scanSoon();
    return { ok: true, session };
  }

  /** The project as it is now. */
  get snapshot(): ProjectSnapshot {
    return this.#state;
  }

  /** What the next undo and redo would do. */
  get history(): HistorySummary {
    return summarize(this.#history);
  }

  /**
   * The actions the history keeps, oldest first: those done, then those undone, the next to redo
   * first, each with its id, its author and when it was done.
   */
  get actions(): ListedAction[] {
    const { done, undone } = this.#history;
    const listed = (entry: HistoryEntry, isUndone: boolean): ListedAction => {
      const { id, time } = this.#stampOf(entry);
      return { id, label: entry.label, author: entry.author, time, undone: isUndone };
    };
    return [
      ...done.map((entry) => listed(entry, false)),
      ...undone.toReversed().map((entry) => listed(entry, true)),
    ];
  }

  /** Where each file of the project lives now. */
  get files(): ProjectFiles {
    const pathOf = (key: FileKey): string => {
      const path = this.#paths.get(key);
      if (path === undefined) throw new Error(`The project has no file for ${key}.`);
      return path;
    };
    const byId = (kind: FolderKind, ids: readonly Id[]) =>
      new Map(
        ids.flatMap((id) => {
          const path = this.#paths.get(`${kind}:${id}`);
          return path === undefined ? [] : [[id, path] as const];
        }),
      );
    return {
      project: pathOf('project'),
      model: pathOf('model'),
      packages: byId(
        'package',
        this.#state.packages.map((file) => file.id),
      ),
      views: byId(
        'view',
        this.#state.views.map((view) => view.id),
      ),
      scenarios: byId(
        'scenario',
        this.#state.scenarios.map((scenario) => scenario.id),
      ),
      tours: byId(
        'tour',
        this.#state.tours.map((tour) => tour.id),
      ),
      comments: byId(
        'comment',
        this.#state.comments.map((thread) => thread.id),
      ),
      unlistedPackages: new Map(this.#unlisted),
    };
  }

  /** What the project breaks now of the rules that only warn, each against its file. */
  warnings(): ProjectFileProblem[] {
    let known = this.#warnings;
    if (known?.state !== this.#state) {
      const { warnings } = checkProject(this.#state);
      // Whether a destination's project is there is for the program to tell (ADR 0056).
      warnings.push(...projectDestinationWarnings(this.#state, this.folder));
      // So is whether the files the solids name are there, and clean (ADR 0075).
      warnings.push(...solidFileWarnings(this.#state, this.folder));
      warnings.push(...this.#solids.warnings(this.#state));
      known = { state: this.#state, warnings: locateProblems(warnings, this.#state, this.files) };
      this.#warnings = known;
    }
    return known.warnings;
  }

  connect(client: SessionClient, options: ConnectOptions = {}): () => void {
    this.#clients.add(client);
    this.#send(client, {
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: this.#state,
      history: this.history,
      ...(options.token === undefined ? {} : { token: options.token }),
    });
    this.#send(client, { type: 'history/listed', actions: this.actions });
    try {
      const warnings = this.warnings();
      if (warnings.length > 0) this.#send(client, warningNotice(warnings));
    } catch (error) {
      this.#err(`Could not check the project for warnings: ${reasonOf(error)}`);
    }
    const preferences = this.#options.preferences;
    if (preferences !== undefined) {
      this.#send(client, { type: 'preferences/changed', preferences: preferences.current() });
    }
    for (const message of this.#live.greeting()) this.#send(client, message);
    this.#greetWithProposal(client);
    this.#logAttached('attached', 'app');
    return () => {
      if (this.#clients.delete(client)) this.#logAttached('gone', 'app');
      this.#live.forget(client);
      this.#layouts.gone(client);
      this.#captures.gone(client);
      this.#solids.forget(client);
    };
  }

  attachClaude(client: SessionClient): () => void {
    this.#claudes.add(client);
    this.#send(client, {
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: this.#state,
      history: this.history,
    });
    this.#greetWithProposal(client);
    this.#logAttached('attached', 'claude');
    return () => {
      if (this.#claudes.delete(client)) this.#logAttached('gone', 'claude');
      this.#live.forget(client);
    };
  }

  setLive(connection: object, sender: LiveSender, values: unknown, freshFor?: number): LiveKept {
    const exists = this.#exists();
    let refuseTarget: ((target: Id) => string | undefined) | undefined;
    let senderName: string;
    if (sender.kind === 'package') {
      const name =
        this.#state.packages.find((each) => each.id === sender.package)?.name ?? sender.package;
      senderName = `the code of “${name}”`;
      // Package code sends values only of the elements its hooks run on.
      refuseTarget = (target) =>
        codePackagesOn(this.#state, target).includes(sender.package)
          ? undefined
          : `is of something the code of “${name}” does not run on`;
    } else {
      senderName = sender.kind === 'claude' ? 'Claude' : 'the command line';
    }
    return this.#live.set(connection, sender, values, {
      ...(freshFor === undefined ? {} : { freshFor }),
      exists,
      ...(refuseTarget === undefined ? {} : { refuseTarget }),
      senderName,
    });
  }

  clearLive(filter: LiveFilter): number {
    return this.#live.clear(filter);
  }

  listLive(filter: LiveFilter, limit: number): LiveListing {
    return this.#live.list(filter, limit);
  }

  servesAt(port: number): void {
    this.#fetcher.servesAt(port);
  }

  /** Forgets the live values of what the model no longer holds. */
  #pruneLive(): void {
    if (this.#live.size > 0) this.#live.prune(this.#exists());
  }

  /** Whether an id names an element or a relation of the model as it is now. */
  #exists(): (target: Id) => boolean {
    const index = modelIndexOf(this.#state);
    return (target) => index.element(target) !== undefined || index.relation(target) !== undefined;
  }

  guide(guidance: Guidance): Promise<number> {
    if (this.#closed) return Promise.resolve(0);
    // In the queue, so that guidance about what a command just made reaches the apps after it.
    return this.#enqueue(() => {
      for (const client of this.#clients) this.#send(client, { type: 'guidance', guidance });
      return Promise.resolve(this.#clients.size);
    });
  }

  layOut(guidance: LayoutGuidance): Promise<LayoutReport> {
    if (this.#closed) return Promise.resolve({ apps: 0 });
    return this.#layouts.layOut(guidance);
  }

  capture(ask: CaptureAsk): Promise<CaptureReport> {
    if (this.#closed) return Promise.resolve({ apps: 0 });
    return this.#captures.capture(ask);
  }

  /**
   * Handles a message from an app: a command runs with the user as its author, and an undo or a redo
   * is applied. A message that is not valid is answered with `command/rejected` when it has a request
   * id, and ignored otherwise.
   */
  async receive(client: SessionClient, text: string): Promise<void> {
    let message: AppMessage;
    try {
      message = decodeAppMessage(text);
    } catch (error) {
      const requestId = requestIdIn(text);
      if (requestId !== undefined) {
        this.#send(client, {
          type: 'command/rejected',
          requestId,
          problems: [refusal('invalid-command', reasonOf(error))],
        });
      }
      this.#log({
        event: 'refused',
        request: 'message',
        author: 'user',
        codes: ['invalid-command'],
      });
      return;
    }
    const origin = { client, requestId: message.requestId };
    switch (message.type) {
      case 'command':
        // The app's placement of what the newest action added may join it (ADR 0065).
        await this.#execute(message.command, 'user', origin, message.joins);
        return;
      case 'undo':
        await this.undo(origin, message.to);
        return;
      case 'redo':
        await this.redo(origin, message.to);
        return;
      case 'preferences/set':
        await this.#setPreferences(client, message);
        return;
      case 'live/fetch':
        await this.#fetchForPackage(client, message);
        return;
      case 'live/set':
        this.#liveFromPackage(client, message);
        return;
      case 'start/create':
        // Only a program on a folder that holds no project yet starts one (ADR 0051).
        this.#send(client, {
          type: 'command/rejected',
          requestId: message.requestId,
          problems: [refusal('invalid-command', 'A project is open here already.')],
        });
        return;
      case 'project/open-other':
        await this.#openOtherProject(client, message);
        return;
      case 'drawing/make':
        await this.#makeDrawing(client, message);
        return;
      case 'versions/list':
        await this.listVersions(origin);
        return;
      case 'version/compare':
        await this.compareVersion(origin, message.version, message.view);
        return;
      case 'proposal/accept':
        await this.#acceptProposal(origin, message);
        return;
      case 'proposal/refuse':
        await this.#decideProposal(origin, message.proposal, 'refused');
        return;
      case 'layout/done':
        // What the tab that ran Claude's layout moved, or why this tab passed it over (M3d).
        this.#layouts.answered(client, message);
        return;
      case 'capture/answer':
        // The picture the tab the person used last took for Claude, or why it took none (ADR 0081).
        this.#captures.answered(client, message);
        return;
      case 'solid/get':
        // A solid's file for the app's solid worker, in pieces (ADR 0075). It only reads, and never
        // waits behind the project's own work.
        for (const answer of await this.#solids.serve(
          message.requestId,
          message.hash,
          this.#state,
        )) {
          this.#send(client, answer);
        }
        return;
      case 'solid/prepare':
        await this.prepareSolidPiece(client, message);
        return;
    }
  }

  /**
   * Takes a piece of a file to import as a solid (ADR 0075); once all its pieces are in, cleans it in
   * the cleaner's worker, after the files asked for before it, and answers with what the program now
   * holds, or why it holds nothing. Cleaning changes nothing, so it never waits behind the project's
   * own work, and the project's work never waits behind it.
   */
  async prepareSolidPiece(client: SessionClient, message: SolidPrepareMessage): Promise<void> {
    const outcome = this.#solids.receive(client, message);
    if (outcome.kind === 'refused') {
      this.#send(client, {
        type: 'solid/refused',
        requestId: message.requestId,
        code: outcome.problem.code,
        message: outcome.problem.message,
      });
      return;
    }
    if (outcome.kind !== 'whole') return;
    const prepared = await this.prepareSolid(outcome.bytes, outcome.fileName, outcome.options);
    this.#sendPrepared(client, message.requestId, prepared);
  }

  /**
   * Reads a glTF file inside the project folder for Claude (ADR 0075), only as a regular file inside
   * it within the 256 MiB cleaning reads, then cleans it as {@link prepareSolidPiece} does. A path
   * outside the folder, a link, and a file that is no glTF file by its name are refused unread.
   */
  async prepareSolidFile(
    client: SessionClient,
    requestId: string,
    path: string,
    options: SolidImportOptions,
  ): Promise<void> {
    const read = await readProjectSolidFile(this.folder, path);
    if (!read.ok) {
      this.#send(client, {
        type: 'solid/refused',
        requestId,
        code: read.problem.code,
        message: read.problem.message,
      });
      return;
    }
    const prepared = await this.prepareSolid(read.bytes, read.fileName, options);
    this.#sendPrepared(client, requestId, prepared);
  }

  #sendPrepared(client: SessionClient, requestId: string, prepared: Preparing): void {
    this.#send(
      client,
      prepared.ok
        ? preparedMessage(requestId, prepared.prepared)
        : {
            type: 'solid/refused',
            requestId,
            code: prepared.problems[0]?.code ?? 'invalid-solid',
            message: prepared.problems.map((each) => each.message).join(' '),
          },
    );
  }

  /** Cleans a file to import as a solid and holds what it made (ADR 0075); it changes nothing. */
  prepareSolid(
    bytes: Uint8Array,
    fileName: string,
    options: SolidImportOptions = {},
  ): Promise<Preparing> {
    return this.#solids.prepare(bytes, fileName, options);
  }

  /**
   * Defines a file the program prepared as a solid, as the one action `Import "arm.glb" as a solid`
   * (ADR 0075), planned against the project as the work asked for before it leaves it.
   */
  importSolid(
    hash: string,
    choices: SolidChoices,
    author: Author,
    origin?: Origin,
  ): Promise<SessionOutcome> {
    return this.executePlanned(
      (state) => {
        const prepared = this.#solids.prepared(hash);
        if (prepared === undefined) {
          return {
            ok: false,
            problems: [
              {
                code: 'invalid-solid',
                message: `Visual Anything holds no prepared file "solids/${hash}.glb": prepare it again, as it holds one for ten minutes.`,
              },
            ],
          };
        }
        const planned = planSolidImport(state, prepared, choices, this.#options.newId);
        return planned.ok
          ? { ok: true, command: planned.command }
          : {
              ok: false,
              problems: planned.problems.map((each) => ({
                code: 'invalid-command' as const,
                message: each,
              })),
            };
      },
      author,
      origin,
    );
  }

  /**
   * Lists the versions of the project's repository (ADR 0071) and answers with them, newest first in
   * each kind, or with why none can be listed. It only reads, and never waits behind the project's own
   * work. Its commits join those a version may name: the commits of the program's last five
   * listings within ten minutes, from an app or from Claude (ADR 0071's clarification of 2026-10-29).
   */
  async listVersions(origin: Origin): Promise<void> {
    const listing = await this.#versions.list();
    this.#send(origin.client, {
      type: 'versions/listed',
      requestId: origin.requestId,
      versions: listing.versions,
      ...(listing.why === undefined ? {} : { why: listing.why }),
    });
  }

  /**
   * Compares a version with the project now (ADR 0070): the version is the older, the project now
   * the newer. An app gets the version's project too, to draw it; Claude does not (ADR-0029). A
   * commit not in the recent listings is refused before git hears of it, and one version is read at a
   * time: a newer request stops the one under way. Like a listing, it never waits behind the project's
   * own work. The comparison is worked out against the project as every app last heard of it, and
   * sent at once, so that an app follows every later action with `recompare`.
   */
  async compareVersion(origin: Origin, version: VersionRef, view?: Id): Promise<void> {
    const refuse = (problems: Problem[]) =>
      this.#send(origin.client, { type: 'version/refused', requestId: origin.requestId, problems });
    let older: ProjectSnapshot;
    if (version.kind === 'opened') {
      older = this.#opened;
    } else {
      const read = await this.#versions.read(version.commit);
      if (!read.ok) return refuse(read.problems);
      older = read.project;
    }
    if (this.#closed) return refuse([CLOSED]);
    // From here to the answer nothing waits, so no change comes between the comparison and it.
    const newer = this.#state;
    const hasView = (state: ProjectSnapshot) => state.views.some((each) => each.id === view);
    if (view !== undefined && !hasView(older) && !hasView(newer)) {
      return refuse([
        refusal('unknown-view', `Neither the version nor the project now has the view "${view}".`),
      ]);
    }
    let comparison;
    try {
      comparison = compareProjects(older, newer);
      if (view !== undefined) comparison = comparisonOfView(comparison, older, newer, view);
    } catch (error) {
      this.#err(`Could not compare the version: ${reasonOf(error)}`);
      return refuse([
        refusal('program-failed', `The version could not be compared: ${reasonOf(error)}`),
      ]);
    }
    this.#send(origin.client, {
      type: 'version/compared',
      requestId: origin.requestId,
      version,
      ...(this.#claudes.has(origin.client) ? {} : { project: older }),
      comparison,
    });
  }

  // ——— Claude's proposal (ADR 0073) ———

  /**
   * Whether a command of Claude's joins its proposal: while the person reviews Claude's changes, when
   * the command asks to, or while a proposal waits, since Claude's later commands build on what it
   * proposed. Comments never do: they go to the project now. Resolving conflicts does, and the core
   * refuses it there, since conflicts are resolved with the review off.
   */
  #proposes(command: Command, propose: boolean): boolean {
    if (goesToProjectNow(command)) return false;
    return (
      propose ||
      this.#proposal.open !== undefined ||
      this.#options.preferences?.current().reviewClaude === true
    );
  }

  /**
   * Runs a command of Claude's on the proposed project; only from inside a turn of the queue. Nothing
   * is saved or recorded: every app and Claude are shown the proposal, and whoever asked answers with
   * the outcome's `proposal`. A refused command is answered as any other.
   */
  #runProposed(command: Command, origin: Origin | undefined): SessionOutcome {
    const opened = this.#proposal.open === undefined;
    let ran;
    try {
      ran = this.#proposal.propose(this.#state, command, {
        ...(this.#options.newId === undefined ? {} : { newId: this.#options.newId }),
        author: 'claude',
        now: () => this.#now(),
      });
    } catch (error) {
      return this.#refuse(origin, [
        refusal('program-failed', `The command could not be proposed: ${reasonOf(error)}`),
      ]);
    }
    const { outcome, joined } = ran;
    if (!outcome.ok) return this.#refuse(origin, outcome.problems);
    const { label, warnings, created, operations } = outcome;
    if (!joined) return this.#answerUnchanged(origin, label, 'claude', warnings);
    const id = this.#proposal.open?.id ?? '';
    this.#showProposal();
    const changes = this.#proposal.changeKeys();
    this.#log({ event: 'proposal', kind: opened ? 'opened' : 'joined', changes: changes.length });
    this.#proposalChanged();
    return {
      ok: true,
      recorded: false,
      label,
      author: 'claude',
      operations,
      warnings,
      created,
      history: this.history,
      proposal: { id, changes, apps: this.#clients.size },
    };
  }

  /**
   * Accepts some of the proposal's changes, or all of them, as an app asks: one action of Claude's on
   * the project now, saved, recorded and announced as any other, which keeps what the person did
   * meanwhile; then the proposal closes, and the app that decided hears of it with its request id. An
   * acceptance the core refuses, or that cannot be saved, changes nothing, and the proposal waits on.
   */
  #acceptProposal(origin: Origin, message: ProposalAcceptMessage): Promise<SessionOutcome> {
    if (this.#closed) return Promise.resolve(this.#refuse(origin, [CLOSED]));
    return this.#enqueue(() =>
      this.#guarded(origin, async () => {
        const wrong = this.#proposal.check(message.proposal);
        if (wrong !== undefined) return this.#refuseDecision(origin, [wrong]);
        if (message.revision !== this.#proposal.revision) {
          // Claude, or a rebase, changed it after the app drew it: nothing is accepted unseen, and
          // the app is shown the proposal as it is now.
          const refused = this.#refuseDecision(origin, [
            refusal('invalid-command', STALE_PROPOSAL),
          ]);
          this.#greetWithProposal(origin.client);
          return refused;
        }
        const total = this.#proposal.changeKeys().length;
        const accepted = this.#proposal.accept(this.#state, message.changes, {
          ...(this.#options.newId === undefined ? {} : { newId: this.#options.newId }),
          author: 'claude',
          now: () => this.#now(),
        });
        if (!accepted.ok) return this.#refuseDecision(origin, accepted.problems);
        const { state, operations, inverse, label, warnings, created } = accepted.outcome;
        if (operations.length === 0 || isDeepStrictEqual(state, this.#state)) {
          // Nothing of it differs from the project now: it closes, and nothing is recorded.
          const closed = this.#proposal.close('accepted', accepted.accepted);
          if (closed !== undefined) this.#closedProposal(closed, origin, total);
          return {
            ok: true,
            recorded: false,
            label,
            author: 'claude',
            operations: [],
            warnings,
            created: [],
            history: this.history,
          };
        }
        const saved = await this.#save(state, operations);
        if (!saved.ok) return this.#refuseDecision(origin, saved.problems);
        this.#state = state;
        const closed = this.#proposal.close('accepted', accepted.accepted);
        const action = this.#recordAction(
          { label, author: 'claude', operations, inverse },
          undefined,
        );
        const announced = this.#announce(
          { kind: 'do', ...action, operations, warnings, created },
          undefined,
        );
        this.#log({
          event: 'action',
          kind: 'done',
          id: this.#lastAction,
          author: 'claude',
          label: action.label,
          operations: operations.length,
          created,
        });
        if (closed !== undefined) this.#closedProposal(closed, origin, accepted.accepted.length);
        this.#listHistory();
        return announced;
      }),
    );
  }

  /** Refuses the proposal whole, as an app asks: nothing changes, and it closes. */
  #decideProposal(origin: Origin, proposal: Id, how: 'refused'): Promise<SessionOutcome> {
    if (this.#closed) return Promise.resolve(this.#refuse(origin, [CLOSED]));
    return this.#enqueue(() =>
      this.#guarded(origin, () => {
        const wrong = this.#proposal.check(proposal);
        if (wrong !== undefined) return Promise.resolve(this.#refuseDecision(origin, [wrong]));
        const total = this.#proposal.changeKeys().length;
        const closed = this.#proposal.close(how);
        if (closed !== undefined) this.#closedProposal(closed, origin, total);
        return Promise.resolve(this.#unchanged());
      }),
    );
  }

  /**
   * Closes Claude's own proposal, as Claude asks: nothing changes, every app and Claude hear that it
   * was withdrawn, and Claude with its request id. With none waiting, Claude hears why.
   */
  async withdrawProposal(origin: Origin): Promise<void> {
    if (this.#closed) {
      this.#refuse(origin, [CLOSED]);
      return;
    }
    await this.#enqueue(() => {
      const total = this.#proposal.changeKeys().length;
      const closed = this.#proposal.close('withdrawn');
      if (closed === undefined) {
        this.#refuse(origin, [refusal('invalid-command', NO_PROPOSAL_TO_WITHDRAW)]);
      } else {
        this.#closedProposal(closed, origin, total);
      }
      return Promise.resolve();
    });
  }

  /** Refuses what an app decided about the proposal, and logs it by its problems' codes. */
  #refuseDecision(origin: Origin, problems: Problem[]): SessionOutcome {
    this.#log({
      event: 'refused',
      request: 'proposal',
      author: 'user',
      codes: problems.map((each) => each.code),
    });
    return this.#refuse(origin, problems);
  }

  /** An outcome that changed nothing, which nobody hears of. */
  #unchanged(): SessionOutcome {
    return {
      ok: true,
      recorded: false,
      label: '',
      author: 'user',
      operations: [],
      warnings: [],
      created: [],
      history: this.history,
    };
  }

  /**
   * Rebases the proposal that waits on the project now, after the operations that changed it, or
   * after a reload. A rebase that fails drops the proposal, and every app and Claude hear of it.
   */
  #rebaseProposal(operations?: readonly Operation[]): void {
    if (this.#proposal.open === undefined) return;
    try {
      this.#proposal.rebase(this.#state, operations);
    } catch (error) {
      this.#err(`Could not keep Claude’s proposal on the change: ${reasonOf(error)}`);
      this.#dropProposal();
    }
  }

  /** Shows every app and Claude the proposal that waits, after it opened or changed. */
  #showProposal(): void {
    if (this.#proposal.open === undefined) return;
    let shown;
    try {
      shown = this.#proposal.shown(true);
    } catch (error) {
      this.#err(`Could not show Claude’s proposal: ${reasonOf(error)}`);
      this.#dropProposal();
      return;
    }
    if (shown === undefined) return;
    for (const client of [...this.#clients, ...this.#claudes]) this.#send(client, shown);
  }

  /**
   * Shows every app and Claude the proposal rebased on the project now, after the person's action, an
   * undo, a redo or a reload; or, when that left it with no change, closes it as `dropped`, since
   * nothing is left to review (ADR 0073's clarification of 2026-10-29).
   */
  #showRebased(): void {
    if (this.#proposal.open === undefined) return;
    let empty;
    try {
      empty = this.#proposal.changeKeys().length === 0;
    } catch (error) {
      this.#err(`Could not show Claude’s proposal: ${reasonOf(error)}`);
      this.#dropProposal();
      return;
    }
    if (empty) this.#dropProposal();
    else this.#showProposal();
  }

  /** Shows an app, or Claude, that connects the proposal that waits. */
  #greetWithProposal(client: SessionClient): void {
    if (this.#proposal.open === undefined) return;
    try {
      const shown = this.#proposal.shown(false);
      if (shown !== undefined) this.#send(client, shown);
    } catch (error) {
      this.#err(`Could not show Claude’s proposal: ${reasonOf(error)}`);
    }
  }

  /** Drops the proposal that waits, when it can no longer be kept. */
  #dropProposal(): void {
    const changes = this.#proposal.open === undefined ? 0 : this.#proposal.changeKeys().length;
    const closed = this.#proposal.close('dropped');
    if (closed !== undefined) this.#closedProposal(closed, undefined, changes);
  }

  /**
   * Tells every app and Claude how the proposal closed, the one that asked with its request id, and
   * logs it with how many changes it held, or were accepted.
   */
  #closedProposal(
    closed: ProposalClosedMessage,
    origin: Origin | undefined,
    changes: number,
  ): void {
    for (const client of [...this.#clients, ...this.#claudes]) {
      this.#send(
        client,
        origin?.client === client ? { ...closed, requestId: origin.requestId } : closed,
      );
    }
    this.#log({ event: 'proposal', kind: closed.how, changes });
    this.#proposalChanged();
  }

  /** Says when the last change joined the proposal, or that none waits, to whoever listens. */
  #proposalChanged(): void {
    try {
      this.#options.onProposal?.(this.#proposal.lastJoined);
    } catch (error) {
      this.#err(`Could not tell of Claude’s proposal: ${reasonOf(error)}`);
    }
  }

  makeDrawing(html: string, width: number): Promise<MadeDrawing> {
    return this.#drawings.make(html, width);
  }

  /**
   * Makes a drawing of the HTML an app sent (ADR 0068), and answers with it or with why not. It is
   * never a command: it changes nothing, and never waits behind the project's own work.
   */
  async #makeDrawing(client: SessionClient, message: DrawingMakeMessage): Promise<void> {
    const { requestId } = message;
    const made = await this.#drawings.make(message.html, message.width);
    this.#send(
      client,
      made.ok
        ? {
            type: 'drawing/made',
            requestId,
            svg: made.svg,
            width: made.width,
            height: made.height,
            report: made.report
              .slice(0, MAX_DRAWING_REPORT.lines)
              .map((line) => line.slice(0, MAX_DRAWING_REPORT.length)),
          }
        : { type: 'command/rejected', requestId, problems: made.problems },
    );
  }

  /**
   * Opens another project in a tab of its own program, as a destination names it (ADR 0056). It is
   * never a command: it changes nothing in this project and never waits behind its work.
   */
  async #openOtherProject(
    client: SessionClient,
    message: Extract<AppMessage, { type: 'project/open-other' }>,
  ): Promise<void> {
    const { requestId } = message;
    const open = this.#options.openOtherProject;
    if (open === undefined) {
      this.#send(client, {
        type: 'command/rejected',
        requestId,
        problems: [refusal('program-failed', 'This Visual Anything cannot open another project.')],
      });
      return;
    }
    let outcome;
    try {
      outcome = await open(this.folder, {
        project: message.project,
        ...(message.view === undefined ? {} : { view: message.view }),
      });
    } catch (error) {
      outcome = {
        ok: false as const,
        problems: [
          refusal('program-failed', `The project could not be opened: ${reasonOf(error)}`),
        ],
      };
    }
    this.#send(
      client,
      outcome.ok
        ? { type: 'other-project/opened', requestId, name: outcome.name }
        : { type: 'command/rejected', requestId, problems: outcome.problems },
    );
  }

  /**
   * Fetches an address for the code of an approved package granted its origin (ADR 0063), and answers
   * with what the origin answered. Like preferences, it never waits behind the project's own work.
   */
  async #fetchForPackage(client: SessionClient, message: LiveFetchMessage): Promise<void> {
    const { requestId } = message;
    const refuse = (problems: Problem[]) =>
      this.#send(client, { type: 'command/rejected', requestId, problems });
    const grant = networkGrantOf(
      this.#state,
      this.#options.preferences?.current().codeApprovals ?? [],
      message.package,
    );
    if (!grant.ok) {
      refuse([grant.problem]);
      return;
    }
    const fetched = await this.#fetcher.fetch(
      { id: message.package, name: grant.name, granted: grant.granted },
      message.url,
    );
    if (!fetched.ok) {
      refuse([fetched.problem]);
      return;
    }
    this.#send(client, {
      type: 'live/fetched',
      requestId,
      status: fetched.status,
      text: fetched.text,
    });
  }

  /** Takes live values the code of an approved package granted an origin made, from an app. */
  #liveFromPackage(client: SessionClient, message: LiveSetMessage): void {
    const { requestId } = message;
    const grant = networkGrantOf(
      this.#state,
      this.#options.preferences?.current().codeApprovals ?? [],
      message.package,
    );
    if (!grant.ok) {
      this.#send(client, { type: 'command/rejected', requestId, problems: [grant.problem] });
      return;
    }
    const kept = this.setLive(
      client,
      { kind: 'package', package: message.package },
      message.values,
      message.freshFor,
    );
    this.#send(client, { type: 'live/kept', requestId, ...kept });
  }

  /**
   * Changes the person's preferences (ADR-0032). They are not part of the project: this is never a
   * command, never enters the history, writes no project file and never waits behind the project's own
   * work. Every open app hears of the change, the one that asked with its request id.
   */
  async #setPreferences(client: SessionClient, message: PreferencesSetMessage): Promise<void> {
    const { requestId } = message;
    const store = this.#options.preferences;
    const refuse = (problems: Problem[]) =>
      this.#send(client, { type: 'command/rejected', requestId, problems });
    if (store === undefined) {
      refuse([refusal('not-saved', 'This program keeps no preferences.')]);
      return;
    }
    const checked = checkPreferenceChanges(message.changes);
    if (!checked.ok) {
      refuse(checked.problems);
      return;
    }
    let result;
    try {
      result = await store.set(checked.changes);
    } catch (error) {
      refuse([
        refusal('program-failed', `Your preferences could not be changed: ${reasonOf(error)}`),
      ]);
      return;
    }
    const { preferences } = result;
    this.#send(client, { type: 'preferences/changed', preferences, requestId });
    for (const other of this.#clients) {
      if (other !== client) this.#send(other, { type: 'preferences/changed', preferences });
    }
    if (!result.saved) {
      this.#send(client, {
        type: 'notice',
        level: 'warning',
        message: `Your preference applies until Visual Anything stops: it could not be saved (${result.reason}).`,
      });
    }
  }

  /**
   * Runs a command through the core. A rejected command changes nothing; one that changes nothing is
   * not recorded. Otherwise the action is recorded, the files it affects are saved, and every open app
   * is told, the one that asked with its request id.
   */
  execute(
    command: Command,
    author: Author,
    origin?: Origin,
    how: ExecuteOptions = {},
  ): Promise<SessionOutcome> {
    return this.#execute(command, author, origin, undefined, how.propose === true);
  }

  /**
   * Runs a command as `execute` does; an app's may join the newest action (ADR 0065), and Claude's
   * may join its proposal (ADR 0073).
   */
  #execute(
    command: Command,
    author: Author,
    origin: Origin | undefined,
    joins?: number,
    propose = false,
  ): Promise<SessionOutcome> {
    const outcome = this.#closed
      ? Promise.resolve(this.#refuse(origin, [CLOSED]))
      : this.#enqueue(() =>
          this.#guarded(origin, async () => {
            // A solid is defined only of a file the program holds, with its description (ADR 0075).
            const admitted = await this.#solids.admit(command);
            if (!admitted.ok) return this.#refuse(origin, admitted.problems);
            return author === 'claude' && this.#proposes(admitted.command, propose)
              ? this.#runProposed(admitted.command, origin)
              : this.#run(admitted.command, author, origin, joins);
          }),
        );
    return this.#logRefusal(outcome, 'command', author, () => command);
  }

  /**
   * Plans a command against the project as the work already asked for leaves it, then runs it as
   * {@link execute} does, in the same turn of the queue, so that nothing comes between the plan and
   * the change: an import from the command line is read and mapped this way (ADR-0049). A plan that
   * cannot be made is refused with its problems, and changes nothing.
   */
  executePlanned(plan: CommandPlan, author: Author, origin?: Origin): Promise<SessionOutcome> {
    let command: Command | undefined;
    const outcome = this.#closed
      ? Promise.resolve(this.#refuse(origin, [CLOSED]))
      : this.#enqueue(() =>
          this.#guarded(origin, async () => {
            const planned = plan(this.#state);
            if (!planned.ok) return this.#refuse(origin, planned.problems);
            command = planned.command;
            const admitted = await this.#solids.admit(planned.command);
            if (!admitted.ok) return this.#refuse(origin, admitted.problems);
            return this.#run(admitted.command, author, origin);
          }),
        );
    return this.#logRefusal(outcome, 'command', author, () => command);
  }

  /**
   * Runs a command through the core and records it; only from inside a turn of the queue. With
   * `joins`, the id of the newest action, a placement that meets ADR 0065's conditions extends that
   * action instead of being recorded as one of its own.
   */
  async #run(
    command: Command,
    author: Author,
    origin: Origin | undefined,
    joins?: number,
  ): Promise<SessionOutcome> {
    const joined = joins === undefined ? undefined : this.#joinable(joins, command);
    let outcome: CommandOutcome;
    try {
      outcome = executeCommand(this.#state, command, {
        ...(this.#options.newId === undefined ? {} : { newId: this.#options.newId }),
        // Who sent it signs what it writes, such as a comment (ADR 0059): the core refuses a comment
        // whose sender is not said, so that Claude's words are never the person's.
        author,
        now: () => this.#now(),
      });
    } catch (error) {
      return this.#refuse(origin, [
        refusal('program-failed', `The command could not be run: ${reasonOf(error)}`),
      ]);
    }
    if (!outcome.ok) {
      return this.#refuse(
        origin,
        author === 'claude' && this.#proposal.open !== undefined
          ? onlyInProposal(outcome.problems)
          : outcome.problems,
      );
    }
    const { state, operations, inverse, label, warnings, created } = outcome;
    if (operations.length === 0 || isDeepStrictEqual(state, this.#state)) {
      return this.#answerUnchanged(origin, label, author, warnings);
    }
    const saved = await this.#save(state, operations);
    if (!saved.ok) return this.#refuse(origin, saved.problems);
    this.#state = state;
    const action = this.#recordAction({ label, author, operations, inverse }, joined);
    const announced = this.#announce(
      { kind: 'do', ...action, operations, warnings, created },
      origin,
    );
    this.#log({
      event: 'action',
      kind: action.joins === undefined ? 'done' : 'joined',
      id: action.joins ?? this.#lastAction,
      author: action.author,
      label: action.label,
      operations: operations.length,
      created,
    });
    this.#listHistory();
    return announced;
  }

  /**
   * Records an action, or extends the newest one with it when it joins that one (ADR 0065), which
   * keeps its id, time, label and author; says how to announce it.
   */
  #recordAction(
    entry: HistoryEntry,
    joined: { stamp: { id: number; time: number } } | undefined,
  ): { label: string; author: Author; joins?: number } {
    const extended =
      joined === undefined
        ? undefined
        : extendNewest(this.#history, entry.operations, entry.inverse);
    const newest = extended?.done.at(-1);
    if (joined !== undefined && extended !== undefined && newest !== undefined) {
      this.#history = extended;
      this.#stamps.set(newest, joined.stamp);
      return { label: newest.label, author: newest.author, joins: joined.stamp.id };
    }
    this.#history = record(this.#history, entry);
    this.#stamps.set(entry, { id: (this.#lastAction += 1), time: this.#now() });
    return { label: entry.label, author: entry.author };
  }

  /**
   * Undoes the newest action, whoever did it, and saves and announces it like a command. With `to`,
   * the id of an action done, it goes on, one action at a time, until that action is undone too: the
   * history panel's "Undo to here". Only the last of the changes answers the request.
   */
  undo(origin?: Origin, to?: number): Promise<SessionOutcome> {
    return this.#step('undo', origin, to);
  }

  /**
   * Redoes the newest undone action, and saves and announces it like a command. With `to`, the id of
   * an action undone, it goes on until that action is redone too: "Redo to here".
   */
  redo(origin?: Origin, to?: number): Promise<SessionOutcome> {
    return this.#step('redo', origin, to);
  }

  /**
   * Writes every file of the project again, in formatFile form. A project whose files are in that
   * form keeps every byte. Rejects when a file cannot be saved.
   */
  saveAll(): Promise<void> {
    if (this.#closed) return Promise.reject(new Error(CLOSED.message));
    return this.#enqueue(async () => {
      const saved = await this.#saveFiles(this.#state, liveFiles(this.#state), {
        always: true,
        formatted: true,
      });
      if (!saved.ok) throw new Error(saved.problems.map((each) => each.message).join(' '));
      this.#originals.clear();
    });
  }

  /** Resolves once the work already asked for is done. */
  idle(): Promise<void> {
    return this.#queue;
  }

  /**
   * When the last change joined Claude's proposal, in milliseconds since 1970, while one waits; undefined
   * when none waits.
   */
  get proposalWaiting(): number | undefined {
    return this.#proposal.lastJoined;
  }

  /** The proposed project, the project now with every change of Claude's, while a proposal waits. */
  get proposed(): ProjectSnapshot | undefined {
    return this.#proposal.open?.proposed;
  }

  /**
   * Stops watching and resolves once the work already asked for is done. Later commands are refused.
   * Claude's proposal, if one waits, is dropped, and the program's output and log say so.
   */
  close(): Promise<void> {
    this.#closing ??= (async () => {
      this.#closed = true;
      this.#watcher?.close();
      this.#watcher = undefined;
      this.#live.close();
      this.#versions.close();
      this.#layouts.close();
      this.#captures.close();
      await this.#queue;
      const changes = this.#proposal.changeKeys().length;
      const dropped = this.#proposal.close('dropped');
      if (dropped !== undefined) {
        this.#out(
          `Claude’s proposal of ${changes} change${changes === 1 ? '' : 's'} was never accepted, so it is dropped: nothing of it was applied.`,
        );
        this.#closedProposal(dropped, undefined, changes);
      }
    })();
    return this.#closing;
  }

  /**
   * Undoes or redoes one action, or as many as reach the action `to`, each saved and announced on its
   * own, in one turn of the queue so that nothing comes between them. A step that cannot be saved
   * stops there, and the request is refused; the steps before it stay done.
   */
  #step(kind: 'undo' | 'redo', origin: Origin | undefined, to?: number): Promise<SessionOutcome> {
    const outcome = this.#closed
      ? Promise.resolve(this.#refuse(origin, [CLOSED]))
      : this.#stepped(kind, origin, to);
    return this.#logRefusal(outcome, kind, 'user', () => undefined);
  }

  /** Undoes or redoes as `#step` says, in one turn of the queue. */
  #stepped(
    kind: 'undo' | 'redo',
    origin: Origin | undefined,
    to?: number,
  ): Promise<SessionOutcome> {
    return this.#enqueue(() =>
      this.#guarded(origin, async () => {
        const steps = to === undefined ? 1 : this.#stepsTo(kind, to);
        if (typeof steps !== 'number') return this.#refuse(origin, [steps]);
        let stepped = 0;
        try {
          for (;;) {
            const step: HistoryStep | undefined = (kind === 'undo' ? undoAction : redoAction)(
              this.#state,
              this.#history,
            );
            if (step === undefined)
              return this.#refuse(origin, [
                refusal(`nothing-to-${kind}`, `There is nothing to ${kind}.`),
              ]);
            const operations = [...step.operations];
            const saved = await this.#save(step.state, operations);
            if (!saved.ok) return this.#refuse(origin, saved.problems);
            this.#state = step.state;
            this.#history = step.history;
            stepped += 1;
            const { label, author } = step.entry;
            const last = stepped === steps;
            const announced = this.#announce(
              { kind, label, author, operations, warnings: [], created: [] },
              last ? origin : undefined,
            );
            this.#log({
              event: 'action',
              kind: kind === 'undo' ? 'undone' : 'redone',
              id: this.#stampOf(step.entry).id,
              author,
              label,
              operations: operations.length,
              created: [],
            });
            if (last) return announced;
          }
        } finally {
          if (stepped > 0) this.#listHistory();
        }
      }),
    );
  }

  /** How many undos, or redos, reach the action `to` and undo or redo it too, or why none can. */
  #stepsTo(kind: 'undo' | 'redo', to: number): number | Problem {
    const { done, undone } = this.#history;
    const named = (entry: HistoryEntry) => this.#stamps.get(entry)?.id === to;
    const inDone = done.findIndex(named);
    const inUndone = undone.findIndex(named);
    if (kind === 'undo') {
      if (inDone >= 0) return done.length - inDone;
      return refusal(
        'nothing-to-undo',
        inUndone >= 0
          ? 'That action is undone already, so nothing was undone.'
          : 'That action is no longer in the history, so nothing was undone.',
      );
    }
    if (inUndone >= 0) return undone.length - inUndone;
    return refusal(
      'nothing-to-redo',
      inDone >= 0
        ? 'That action is not undone, so nothing was redone.'
        : 'That action is no longer in the history, so nothing was redone.',
    );
  }

  /**
   * Whether a placement may join the action with this id (ADR 0065): that action is the newest and
   * not undone, and the placement only sets unpinned positions of what it added, or of what it moved
   * aside to make room for it (`placementJoins`). Undefined when it may not.
   */
  #joinable(joins: number, command: Command): { stamp: { id: number; time: number } } | undefined {
    const { done, undone } = this.#history;
    const newest = done.at(-1);
    if (newest === undefined || undone.length > 0) return undefined;
    const stamp = this.#stamps.get(newest);
    if (stamp === undefined || stamp.id !== joins) return undefined;
    let previous: ProjectSnapshot;
    try {
      previous = applyOperations(this.#state, newest.inverse).state;
    } catch {
      return undefined;
    }
    return placementJoins(previous, this.#state, command).ok ? { stamp } : undefined;
  }

  /** The id and time of an action of the history, given now if it has none yet. */
  #stampOf(entry: HistoryEntry): { id: number; time: number } {
    let stamp = this.#stamps.get(entry);
    if (stamp === undefined) {
      stamp = { id: (this.#lastAction += 1), time: this.#now() };
      this.#stamps.set(entry, stamp);
    }
    return stamp;
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  /** Writes an event to the program's log, when there is one; a log that fails never stops work. */
  #log(event: ProgramEvent): void {
    try {
      this.#options.log?.(event);
    } catch (error) {
      this.#err(`Could not write to the log: ${reasonOf(error)}`);
    }
  }

  /** Logs how many apps and Claudes are attached, as one attaches or goes. */
  #logAttached(event: 'attached' | 'gone', who: 'app' | 'claude'): void {
    this.#log({ event, who, apps: this.#clients.size, claudes: this.#claudes.size });
  }

  /**
   * Logs what was asked, once refused, with its problems' codes and the kind of command it was,
   * never their words; gives the outcome back as it came.
   */
  async #logRefusal(
    outcome: Promise<SessionOutcome>,
    request: 'command' | 'undo' | 'redo',
    author: Author,
    asked: () => unknown,
  ): Promise<SessionOutcome> {
    const result = await outcome;
    if (!result.ok) {
      const type = commandTypeOf(asked());
      this.#log({
        event: 'refused',
        request,
        author,
        ...(type === undefined ? {} : { command: type }),
        codes: result.problems.map((each) => each.code),
      });
    }
    return result;
  }

  /** Tells every open app the history as it is now; Claude does not hear of it. */
  #listHistory(): void {
    this.#broadcast({ type: 'history/listed', actions: this.actions });
  }

  /** Runs work after the work already asked for. */
  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task);
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Runs a change, refusing it instead of failing when something unexpected goes wrong. */
  async #guarded(
    origin: Origin | undefined,
    task: () => Promise<SessionOutcome>,
  ): Promise<SessionOutcome> {
    try {
      return await task();
    } catch (error) {
      this.#err(
        `The local program failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      return this.#refuse(origin, [
        refusal('program-failed', `The local program failed: ${reasonOf(error)}`),
      ]);
    }
  }

  /**
   * Tells every app and Claude about a change, the one that asked with its request id. Claude's
   * proposal, if one waits, is rebased on the project now before they hear of it, and shown again
   * after.
   */
  #announce(
    change: Pick<
      ProjectChangedMessage,
      'kind' | 'label' | 'author' | 'operations' | 'warnings' | 'created' | 'joins'
    >,
    origin: Origin | undefined,
  ): SessionOutcome {
    this.#rebaseProposal(change.operations);
    const history = this.history;
    const message: ProjectChangedMessage = { type: 'project/changed', ...change, history };
    // The live values of what the change took away go, once every app has heard of the change.
    queueMicrotask(() => this.#pruneLive());
    for (const client of [...this.#clients, ...this.#claudes]) {
      this.#send(
        client,
        origin?.client === client ? { ...message, requestId: origin.requestId } : message,
      );
    }
    this.#showRebased();
    return { ok: true, recorded: true, ...change, history };
  }

  /** Answers a command that changed nothing: only its sender hears of it, and nothing is recorded. */
  #answerUnchanged(
    origin: Origin | undefined,
    label: string,
    author: Author,
    warnings: Problem[],
  ): SessionOutcome {
    const history = this.history;
    const answer = { kind: 'do' as const, label, author, operations: [], warnings, created: [] };
    if (origin) {
      this.#send(origin.client, {
        type: 'project/changed',
        ...answer,
        history,
        requestId: origin.requestId,
      });
    }
    return { ok: true, recorded: false, ...answer, history };
  }

  /** Answers a refused change to the app that asked for it, if any. */
  #refuse(origin: Origin | undefined, problems: Problem[]): SessionOutcome {
    if (origin) {
      this.#send(origin.client, {
        type: 'command/rejected',
        requestId: origin.requestId,
        problems,
      });
    }
    return { ok: false, problems };
  }

  #send(client: SessionClient, message: ServerMessage): void {
    try {
      client.send(message);
    } catch (error) {
      this.#err(`Could not send a message to an app: ${reasonOf(error)}`);
    }
  }

  #broadcast(message: ServerMessage): void {
    for (const client of this.#clients) this.#send(client, message);
  }

  /** Saves the files that operations affect, as they are in the project after them. */
  #save(next: ProjectSnapshot, operations: readonly Operation[]): Promise<Saved> {
    return this.#saveFiles(next, affectedFiles(operations, this.#state, next));
  }

  /**
   * Saves files as they are in a project: validates each one, checks that none changed on disk since
   * it was last read or written, then writes them. When a write fails, the files already written are
   * put back, so that either every file is saved or none is.
   */
  async #saveFiles(
    next: ProjectSnapshot,
    keys: readonly FileKey[],
    how: { always?: boolean; formatted?: boolean } = {},
  ): Promise<Saved> {
    const plan = await this.#plan(next, keys, how);
    if (!plan.ok) return plan;
    const changed = await this.#changedOnDisk(plan.changes);
    if (changed.length > 0) {
      this.#scanSoon();
      return {
        ok: false,
        problems: [
          refusal(
            'changed-on-disk',
            `${listOf(changed)} changed on disk, so this change was not made; the project is reloaded from the files.`,
          ),
        ],
      };
    }
    const failure = await this.#apply(plan.changes);
    if (failure !== undefined) return { ok: false, problems: [failure] };
    for (const change of plan.changes) {
      if (change.next === null) this.#known.delete(change.path);
      else this.#known.set(change.path, change.next);
    }
    for (const [key, path] of plan.assigned) this.#paths.set(key, path);
    return { ok: true };
  }

  /**
   * Works out what to write: the bytes of each file that a project holds, a new path for a new view,
   * scenario or package, and the files to delete. A file whose bytes would not change is left alone,
   * unless `always`. With `formatted`, every file gets formatFile's text, even one that was read in
   * another form.
   */
  async #plan(
    next: ProjectSnapshot,
    keys: readonly FileKey[],
    how: { always?: boolean; formatted?: boolean },
  ): Promise<Plan> {
    const problems: Problem[] = [];
    const changes: FileChange[] = [];
    const assigned = new Map<FileKey, string>();
    let taken: Set<string> | undefined;
    for (const key of keys) {
      const content = contentOf(key, next);
      let path = this.#paths.get(key);
      if (content === undefined) {
        if (path !== undefined && this.#known.has(path)) {
          changes.push({ path, kind: parseFileKey(key).kind, next: null, isNew: false });
        }
        continue;
      }
      if (path === undefined) {
        const { kind, id } = parseFileKey(key);
        if (kind === 'project' || kind === 'model' || id === undefined) {
          throw new Error(`The project has no file for ${key}.`);
        }
        const holder = kind === 'package' ? this.#unlisted.get(id) : undefined;
        if (holder !== undefined) {
          problems.push({
            code: 'id-taken',
            message: `The id "${id}" is taken: ${holder} holds a package with that id, which the project does not use.`,
            subjects: [id],
          });
          continue;
        }
        const names = (taken ??= await this.#takenPaths());
        path = newFilePath(kind, id, (candidate) => names.has(candidate.toLowerCase()));
        names.add(path.toLowerCase());
        assigned.set(key, path);
      }
      const checked = validateFile(content.kind, content.value);
      if (!checked.ok) {
        problems.push(
          refusal(
            'invalid-file',
            `The change would make ${path} invalid: ${describeErrors(checked.errors)}.`,
          ),
        );
        continue;
      }
      const text = formatContent(content);
      const bytes = how.formatted ? Buffer.from(text, 'utf8') : this.#bytesFor(path, text);
      const current = this.#known.get(path);
      if (!how.always && current?.equals(bytes)) continue;
      // A file is read only within its cap, so one written past it would keep the project from
      // opening, and every later change to it would be refused as changed on disk.
      if (bytes.length > capOf(content.kind)) {
        problems.push(refusal('invalid-file', tooLargeMessage(path, content.kind)));
        continue;
      }
      changes.push({ path, kind: content.kind, next: bytes, isNew: current === undefined });
    }
    return problems.length > 0 ? { ok: false, problems } : { ok: true, changes, assigned };
  }

  /**
   * The paths a new file may not take, in lower case, since Windows and macOS do not tell names apart
   * by case: those of the project's files, including removed ones that undo may bring back, and
   * whatever its folders hold now.
   */
  async #takenPaths(): Promise<Set<string>> {
    const taken = new Set<string>();
    for (const path of [
      ...this.#paths.values(),
      ...this.#unlisted.values(),
      ...this.#known.keys(),
    ]) {
      taken.add(path.toLowerCase());
    }
    for (const folder of Object.values(FOLDERS)) {
      let names: string[] = [];
      try {
        names = await readdir(join(this.folder, folder));
      } catch {
        // A folder that does not exist yet holds nothing.
      }
      for (const name of names) taken.add(`${folder}/${name}`.toLowerCase());
    }
    return taken;
  }

  /** The bytes to write for a file's text: the bytes it was read with, when its text is the same again. */
  #bytesFor(path: string, text: string): Buffer {
    const original = this.#originals.get(path);
    return original !== undefined && original.text === text
      ? original.bytes
      : Buffer.from(text, 'utf8');
  }

  /** The files about to change whose bytes on disk are not those last read or written. */
  async #changedOnDisk(changes: readonly FileChange[]): Promise<string[]> {
    const changed: string[] = [];
    for (const { path, kind } of changes) {
      const onDisk = await readIfThere(this.folder, path, kind);
      const known = this.#known.get(path);
      const same =
        onDisk === 'unreadable'
          ? false
          : onDisk === undefined || known === undefined
            ? onDisk === known
            : onDisk.equals(known);
      if (!same) changed.push(path);
    }
    return changed;
  }

  /**
   * Writes and deletes files: new ones first, then the ones that change, then the deletions, each in
   * {@link WRITE_RANK} order. A crash between two files then mostly leaves a file that nothing refers
   * to yet, or any longer, rather than a reference to a missing file that would keep the project from
   * opening. When a write fails, the ones done are put back. Returns the problem when one fails.
   */
  async #apply(changes: readonly FileChange[]): Promise<Problem | undefined> {
    const done: { path: string; previous: Buffer | undefined }[] = [];
    for (const change of inWritingOrder(changes)) {
      const previous = this.#known.get(change.path);
      try {
        await this.#put(change.path, change.next);
      } catch (error) {
        const reason = `Could not save ${change.path} (${errorReason(error)})`;
        if (await this.#putBack(done))
          return refusal('not-saved', `${reason}; nothing was changed.`);
        this.#scanSoon();
        return refusal(
          'not-saved',
          `${reason}, nor put back the files saved before it; the project is reloaded from the files.`,
        );
      }
      done.push({ path: change.path, previous });
    }
    return undefined;
  }

  /** Puts files back as they were, newest first; resolves with whether all of them were. */
  async #putBack(
    done: readonly { path: string; previous: Buffer | undefined }[],
  ): Promise<boolean> {
    let restored = true;
    for (const { path, previous } of [...done].reverse()) {
      try {
        await this.#put(path, previous ?? null);
      } catch (error) {
        restored = false;
        this.#err(`Could not put ${path} back as it was: ${errorReason(error)}`);
      }
    }
    return restored;
  }

  #put(path: string, bytes: Buffer | null): Promise<void> {
    const target = join(this.folder, path);
    return bytes === null
      ? removeFile(target, this.#options.writer)
      : writeFileAtomic(target, bytes, {
          ...this.#options.writer,
          regularOnly: true,
          inside: this.folder,
        });
  }

  /** Checks the files on disk after the work already asked for; one check waits at a time. */
  #scanSoon(): void {
    if (this.#scanQueued || this.#closed) return;
    this.#scanQueued = true;
    this.#enqueue(() => this.#scan()).catch((error: unknown) =>
      this.#err(`Could not check the project's files: ${reasonOf(error)}`),
    );
  }

  /**
   * Compares the files on disk with those last read or written. When they differ, the project is
   * loaded again: if it is valid, it replaces the open one and the history is cleared, since its
   * operations no longer apply; if not, the open project is kept and every app is told why.
   */
  async #scan(): Promise<void> {
    this.#scanQueued = false;
    if (this.#closed) return;
    const changed = differences(this.#known, await readProjectFiles(this.folder));
    if (changed.size === 0) {
      this.#rejected = undefined;
      return;
    }
    if (this.#rejected !== undefined && sameDifferences(changed, this.#rejected)) return;
    const loaded = await loadProject(this.folder);
    if (!loaded.ok) {
      this.#rejected = changed;
      const message = `${listOf([...changed.keys()])} changed on disk, but the project is not valid now, so the open project is kept:\n${loaded.errors.map(formatProjectProblem).join('\n')}`;
      this.#err(message);
      this.#broadcast({ type: 'notice', level: 'error', message });
      this.#log({ event: 'files-changed', files: sortedPaths(changed), reloaded: false });
      return;
    }
    this.#rejected = undefined;
    const reloaded = differences(this.#known, loaded.contents);
    if (reloaded.size === 0) return;
    this.#adopt(loaded);
    // Claude's proposal stays, rebased on what was read (ADR 0073).
    this.#rebaseProposal();
    this.#log({ event: 'files-changed', files: sortedPaths(reloaded), reloaded: true });
    const reason = `${listOf([...reloaded.keys()])} changed on disk.`;
    this.#out(`Reloaded the project: ${reason}`);
    const announcement: ServerMessage = {
      type: 'project/reloaded',
      project: this.#state,
      history: this.history,
      reason,
    };
    this.#broadcast(announcement);
    for (const client of this.#claudes) this.#send(client, announcement);
    this.#showRebased();
    this.#pruneLive();

    this.#listHistory();
    const warnings = this.warnings();
    if (warnings.length > 0) this.#broadcast(warningNotice(warnings));
  }

  /** Takes a project as opened: its files, where they live and their bytes. The history starts empty. */
  #adopt(loaded: LoadedProject): void {
    const { project: state, files, contents } = loaded;
    this.#state = state;
    this.#opened = state;
    this.#history = EMPTY_HISTORY;
    this.#paths = new Map<FileKey, string>([
      ['project', files.project],
      ['model', files.model],
    ]);
    for (const [id, path] of files.packages) this.#paths.set(`package:${id}`, path);
    for (const [id, path] of files.views) this.#paths.set(`view:${id}`, path);
    for (const [id, path] of files.scenarios) this.#paths.set(`scenario:${id}`, path);
    for (const [id, path] of files.tours) this.#paths.set(`tour:${id}`, path);
    for (const [id, path] of files.comments) this.#paths.set(`comment:${id}`, path);
    this.#unlisted = new Map(files.unlistedPackages);
    this.#known = new Map(contents);
    this.#originals = new Map();
    for (const key of liveFiles(state)) {
      const path = this.#paths.get(key);
      const content = contentOf(key, state);
      const bytes = path === undefined ? undefined : contents.get(path);
      if (path === undefined || content === undefined || bytes === undefined) continue;
      const text = formatContent(content);
      if (!bytes.equals(Buffer.from(text, 'utf8'))) this.#originals.set(path, { bytes, text });
    }
  }

  #out(line: string): void {
    (this.#options.out ?? console.log)(line);
  }

  #err(line: string): void {
    (this.#options.err ?? console.error)(line);
  }
}

/** Watches a project folder for changes made outside the app; `undefined` when it cannot be watched. */
function watchFolder(
  folder: string,
  settings: { delay?: number; mode?: WatchMode },
  err: (line: string) => void,
  onChange: () => void,
): ProjectWatcher | undefined {
  try {
    return watchProject(folder, onChange, {
      ...settings,
      onError: (error) => err(`Watching ${toForwardSlashes(folder)} failed: ${reasonOf(error)}`),
    });
  } catch (error) {
    err(
      `Changes made outside the app will not be reloaded: ${toForwardSlashes(folder)} cannot be watched (${reasonOf(error)}).`,
    );
    return undefined;
  }
}

const CLOSED: Problem = { code: 'project-closed', message: 'The project is closed.' };

/** Why Claude withdrew nothing. */
const NO_PROPOSAL_TO_WITHDRAW = 'No proposal of yours waits, so nothing was withdrawn.';

/**
 * A refusal of Claude's command that goes to the project now while a proposal waits, such as a
 * comment: what it names may be only in the proposal, which the project now does not hold yet.
 */
function onlyInProposal(problems: readonly Problem[]): Problem[] {
  const last = problems.at(-1);
  if (last === undefined) return [...problems];
  return [
    ...problems.slice(0, -1),
    {
      ...last,
      message: `${last.message} Comments go to the project now, not to your proposal: what only the proposal holds takes a thread once the person accepts it.`,
    },
  ];
}

function refusal(code: ProblemCode, message: string): Problem {
  return { code, message };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The text of a file in formatFile form. */
function formatContent(content: FileContent): string {
  return formatFile(content.kind, content.value);
}

function describeErrors(errors: readonly ValidationError[]): string {
  return errors
    .map((error) => `${error.path === '' ? 'the file' : error.path} ${error.message}`)
    .join('; ');
}

/** Why a change that would write a file past its kind's cap was not made, and what to do instead. */
function tooLargeMessage(path: string, kind: FileKind): string {
  const size = describeCap(capOf(kind));
  switch (kind) {
    case 'comment':
      return `${path} would hold more than ${size}, the most a thread may hold in its file, so this change was not made: start another thread.`;
    case 'tour':
      return `${path} would hold more than ${size}, the most a tour may hold in its file, so this change was not made: put the rest of its steps in another tour.`;
    default:
      return `${path} would hold more than ${size}, the most a file of its kind may hold, so this change was not made.`;
  }
}

/** A command's kind, as its `type` names it, for the log; nothing else of it, and nothing odd. */
function commandTypeOf(command: unknown): string | undefined {
  if (typeof command !== 'object' || command === null) return undefined;
  const { type } = command as { type?: unknown };
  return typeof type === 'string' && /^[a-z][a-z-]{0,47}$/.test(type) ? type : undefined;
}

/** The request id of a message that could not be read, when it has a valid one. */
function requestIdIn(text: string): string | undefined {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof message !== 'object' || message === null || !('requestId' in message))
    return undefined;
  const { requestId } = message;
  return typeof requestId === 'string' && requestId !== '' && requestId.length <= MAX_REQUEST_ID
    ? requestId
    : undefined;
}

function warningNotice(warnings: readonly ProjectFileProblem[]): NoticeMessage {
  const count = `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`;
  return {
    type: 'notice',
    level: 'warning',
    message: `The project has ${count}:\n${warnings.map(formatProjectProblem).join('\n')}`,
  };
}

/**
 * The bytes of a project file, `undefined` when there is none, or `unreadable`, as is anything but a
 * regular file within its kind's cap.
 */
async function readIfThere(
  folder: string,
  path: string,
  kind: FileKind,
): Promise<Buffer | undefined | 'unreadable'> {
  const read = await readRegularFile(join(folder, path), capOf(kind), { inside: folder });
  if (read.ok) return read.bytes;
  return read.reason === 'missing' ? undefined : 'unreadable';
}

/** How files are written: kinds that others refer to come first, and are deleted last. */
const WRITE_RANK: Record<FileKind, number> = {
  package: 0,
  project: 1,
  model: 2,
  view: 3,
  scenario: 4,
  // Tours name views and scenarios, and threads name what they are about (ADR 0058, ADR 0059).
  tour: 5,
  comment: 6,
};

/** New files first, then the files that change, then the deletions, each by {@link WRITE_RANK}. */
function inWritingOrder(changes: readonly FileChange[]): FileChange[] {
  const phase = (change: FileChange) => (change.next === null ? 2 : change.isNew ? 0 : 1);
  const rank = (change: FileChange) =>
    change.next === null ? -WRITE_RANK[change.kind] : WRITE_RANK[change.kind];
  return [...changes].sort(
    (a, b) => phase(a) - phase(b) || rank(a) - rank(b) || compareText(a.path, b.path),
  );
}

/** The files whose bytes on disk differ from those known, by path: `undefined` for a file gone. */
function differences(
  known: ReadonlyMap<string, Buffer>,
  disk: ReadonlyMap<string, Buffer>,
): Map<string, Buffer | undefined> {
  const changed = new Map<string, Buffer | undefined>();
  for (const [path, bytes] of disk) {
    if (!known.get(path)?.equals(bytes)) changed.set(path, bytes);
  }
  for (const path of known.keys()) if (!disk.has(path)) changed.set(path, undefined);
  return changed;
}

function sameDifferences(
  a: ReadonlyMap<string, Buffer | undefined>,
  b: ReadonlyMap<string, Buffer | undefined>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [path, bytes] of a) {
    if (!b.has(path)) return false;
    const other = b.get(path);
    if (bytes === undefined || other === undefined ? bytes !== other : !bytes.equals(other)) {
      return false;
    }
  }
  return true;
}

/** The paths that changed, sorted, as the log writes them: paths only, never what the files hold. */
function sortedPaths(changed: ReadonlyMap<string, unknown>): string[] {
  return [...changed.keys()].sort(compareText);
}

/** Paths in words: "a", "a and b", "a, b and c". */
function listOf(paths: readonly string[]): string {
  const sorted = [...paths].sort(compareText);
  const last = sorted.pop();
  if (last === undefined) return '';
  return sorted.length === 0 ? last : `${sorted.join(', ')} and ${last}`;
}

/** Compares by UTF-16 code units, the same on every machine and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

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
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  EMPTY_HISTORY,
  PROTOCOL_VERSION,
  checkProject,
  decodeAppMessage,
  executeCommand,
  record,
  redo as redoAction,
  summarize,
  undo as undoAction,
  type AppMessage,
  type Author,
  type Command,
  type CommandOutcome,
  type History,
  type HistoryStep,
  type HistorySummary,
  type IdGenerator,
  type NoticeMessage,
  type Operation,
  type Problem,
  type ProblemCode,
  type ProjectChangedMessage,
  type ProjectSnapshot,
  type ServerMessage,
} from '@visual-anything/core';
import type { FileKind, Id } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { validateFile, type ValidationError } from '@visual-anything/schema/validate';
import { errorCode, errorReason } from './errors';
import {
  affectedFiles,
  contentOf,
  liveFiles,
  parseFileKey,
  type FileContent,
  type FileKey,
} from './file-plan';
import { FOLDERS, newFilePath } from './layout';
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
import { watchProject, type ProjectWatcher, type WatchMode } from './watcher';
import { removeFile, writeFileAtomic, type WriteOptions } from './writer';

/** An open app, as the session sees it: something to send messages to. */
export interface SessionClient {
  send(message: ServerMessage): void;
}

/** What the local program's server needs from the open project. */
export interface LiveSession {
  /**
   * Greets an app that connects with the project, its history and its warnings, and sends it every
   * change from then on. Returns what to call when the app disconnects.
   */
  connect(client: SessionClient): () => void;
  /** Handles a message an app sent. It never fails: a message it cannot use is answered or ignored. */
  receive(client: SessionClient, text: string): Promise<void>;
}

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
    }
  | { ok: false; problems: Problem[] };

export interface SessionOptions {
  /** How to watch the folder for changes made outside the app; `false` does not watch it. */
  watch?: false | { delay?: number; mode?: WatchMode };
  /** Makes the ids of what commands create; random suffixes by default. */
  newId?: IdGenerator;
  /** How files are written; tests replace the file system to simulate failures. */
  writer?: WriteOptions;
  /** Prints a line of normal output, such as a reload. */
  out?: (line: string) => void;
  /** Prints a line about a problem. */
  err?: (line: string) => void;
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
  /** The work in progress: commands, undos, redos, saves and checks of the files, one at a time. */
  #queue: Promise<void> = Promise.resolve();
  #scanQueued = false;
  /** The changes on disk that last failed to load, so that they are reported once. */
  #rejected: Map<string, Buffer | undefined> | undefined;
  #watcher: ProjectWatcher | undefined;
  #closed = false;
  #closing: Promise<void> | undefined;
  #warnings: { state: ProjectSnapshot; warnings: ProjectFileProblem[] } | undefined;

  private constructor(folder: string, loaded: LoadedProject, options: SessionOptions) {
    this.folder = folder;
    this.#options = options;
    this.#state = loaded.project;
    this.#adopt(loaded);
  }

  /** Opens the project in a folder; see {@link openSession}. */
  static async open(folder: string, options: SessionOptions = {}): Promise<OpenSessionResult> {
    const projectFolder = resolve(folder);
    const loaded = await loadProject(projectFolder);
    if (!loaded.ok) return { ok: false, errors: loaded.errors };
    const session = new Session(projectFolder, loaded, options);
    if (options.watch !== false) session.#watch(options.watch ?? {});
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

  /** Where each file of the project lives now. */
  get files(): ProjectFiles {
    const pathOf = (key: FileKey): string => {
      const path = this.#paths.get(key);
      if (path === undefined) throw new Error(`The project has no file for ${key}.`);
      return path;
    };
    const byId = (kind: 'package' | 'view' | 'scenario', ids: readonly Id[]) =>
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
      unlistedPackages: new Map(this.#unlisted),
    };
  }

  /** What the project breaks now of the rules that only warn, each against its file. */
  warnings(): ProjectFileProblem[] {
    let known = this.#warnings;
    if (known?.state !== this.#state) {
      const { warnings } = checkProject(this.#state);
      known = { state: this.#state, warnings: locateProblems(warnings, this.#state, this.files) };
      this.#warnings = known;
    }
    return known.warnings;
  }

  connect(client: SessionClient): () => void {
    this.#clients.add(client);
    this.#send(client, {
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: this.#state,
      history: this.history,
    });
    try {
      const warnings = this.warnings();
      if (warnings.length > 0) this.#send(client, warningNotice(warnings));
    } catch (error) {
      this.#err(`Could not check the project for warnings: ${reasonOf(error)}`);
    }
    return () => {
      this.#clients.delete(client);
    };
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
      return;
    }
    const origin = { client, requestId: message.requestId };
    switch (message.type) {
      case 'command':
        await this.execute(message.command, 'user', origin);
        return;
      case 'undo':
        await this.undo(origin);
        return;
      case 'redo':
        await this.redo(origin);
        return;
    }
  }

  /**
   * Runs a command through the core. A rejected command changes nothing; one that changes nothing is
   * not recorded. Otherwise the action is recorded, the files it affects are saved, and every open app
   * is told, the one that asked with its request id.
   */
  execute(command: Command, author: Author, origin?: Origin): Promise<SessionOutcome> {
    if (this.#closed) return Promise.resolve(this.#refuse(origin, [CLOSED]));
    return this.#enqueue(() =>
      this.#guarded(origin, async () => {
        let outcome: CommandOutcome;
        try {
          outcome = executeCommand(
            this.#state,
            command,
            this.#options.newId === undefined ? {} : { newId: this.#options.newId },
          );
        } catch (error) {
          return this.#refuse(origin, [
            refusal('program-failed', `The command could not be run: ${reasonOf(error)}`),
          ]);
        }
        if (!outcome.ok) return this.#refuse(origin, outcome.problems);
        const { state, operations, inverse, label, warnings, created } = outcome;
        if (operations.length === 0 || isDeepStrictEqual(state, this.#state)) {
          return this.#answerUnchanged(origin, label, author, warnings);
        }
        const saved = await this.#save(state, operations);
        if (!saved.ok) return this.#refuse(origin, saved.problems);
        this.#state = state;
        this.#history = record(this.#history, { label, author, operations, inverse });
        return this.#announce({ kind: 'do', label, author, operations, warnings, created }, origin);
      }),
    );
  }

  /** Undoes the newest action, whoever did it, and saves and announces it like a command. */
  undo(origin?: Origin): Promise<SessionOutcome> {
    return this.#step('undo', origin);
  }

  /** Redoes the newest undone action, and saves and announces it like a command. */
  redo(origin?: Origin): Promise<SessionOutcome> {
    return this.#step('redo', origin);
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

  /** Stops watching and resolves once the work already asked for is done. Later commands are refused. */
  close(): Promise<void> {
    this.#closing ??= (async () => {
      this.#closed = true;
      this.#watcher?.close();
      this.#watcher = undefined;
      await this.#queue;
    })();
    return this.#closing;
  }

  #step(kind: 'undo' | 'redo', origin: Origin | undefined): Promise<SessionOutcome> {
    if (this.#closed) return Promise.resolve(this.#refuse(origin, [CLOSED]));
    return this.#enqueue(() =>
      this.#guarded(origin, async () => {
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
        const { label, author } = step.entry;
        return this.#announce(
          { kind, label, author, operations, warnings: [], created: [] },
          origin,
        );
      }),
    );
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

  /** Tells every app about a change, the one that asked with its request id. */
  #announce(
    change: Pick<
      ProjectChangedMessage,
      'kind' | 'label' | 'author' | 'operations' | 'warnings' | 'created'
    >,
    origin: Origin | undefined,
  ): SessionOutcome {
    const history = this.history;
    const message: ProjectChangedMessage = { type: 'project/changed', ...change, history };
    for (const client of this.#clients) {
      this.#send(
        client,
        origin?.client === client ? { ...message, requestId: origin.requestId } : message,
      );
    }
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
    for (const { path } of changes) {
      const onDisk = await readIfThere(join(this.folder, path));
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
      : writeFileAtomic(target, bytes, this.#options.writer);
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
      return;
    }
    this.#rejected = undefined;
    const reloaded = differences(this.#known, loaded.contents);
    if (reloaded.size === 0) return;
    this.#adopt(loaded);
    const reason = `${listOf([...reloaded.keys()])} changed on disk.`;
    this.#out(`Reloaded the project: ${reason}`);
    this.#broadcast({
      type: 'project/reloaded',
      project: this.#state,
      history: this.history,
      reason,
    });
    const warnings = this.warnings();
    if (warnings.length > 0) this.#broadcast(warningNotice(warnings));
  }

  /** Takes a project as opened: its files, where they live and their bytes. The history starts empty. */
  #adopt(loaded: LoadedProject): void {
    const { project: state, files, contents } = loaded;
    this.#state = state;
    this.#history = EMPTY_HISTORY;
    this.#paths = new Map<FileKey, string>([
      ['project', files.project],
      ['model', files.model],
    ]);
    for (const [id, path] of files.packages) this.#paths.set(`package:${id}`, path);
    for (const [id, path] of files.views) this.#paths.set(`view:${id}`, path);
    for (const [id, path] of files.scenarios) this.#paths.set(`scenario:${id}`, path);
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

  #watch(settings: { delay?: number; mode?: WatchMode }): void {
    try {
      this.#watcher = watchProject(this.folder, () => this.#scanSoon(), {
        ...settings,
        onError: (error) =>
          this.#err(`Watching ${toForwardSlashes(this.folder)} failed: ${reasonOf(error)}`),
      });
    } catch (error) {
      this.#err(
        `Changes made outside the app will not be reloaded: ${toForwardSlashes(this.folder)} cannot be watched (${reasonOf(error)}).`,
      );
      return;
    }
    // What changed between reading the files and watching them.
    this.#scanSoon();
  }

  #out(line: string): void {
    (this.#options.out ?? console.log)(line);
  }

  #err(line: string): void {
    (this.#options.err ?? console.error)(line);
  }
}

const CLOSED: Problem = { code: 'project-closed', message: 'The project is closed.' };

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

/** The bytes of a file, `undefined` when there is none, or `unreadable`. */
async function readIfThere(path: string): Promise<Buffer | undefined | 'unreadable'> {
  try {
    return await readFile(path);
  } catch (error) {
    return errorCode(error) === 'ENOENT' ? undefined : 'unreadable';
  }
}

/** How files are written: kinds that others refer to come first, and are deleted last. */
const WRITE_RANK: Record<FileKind, number> = {
  package: 0,
  project: 1,
  model: 2,
  view: 3,
  scenario: 4,
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

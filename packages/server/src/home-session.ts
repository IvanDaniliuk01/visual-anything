/**
 * The live session of a program at home (ADR 0093): it serves the app as for any project, behind the
 * same checks and session token, but greets each app with `home/offered`, what the Projects screen
 * offers, until an app opens a project. Then it is that project's session, for every app connected and
 * every one that connects later, and for Claude, until an app asks to go home: it closes the project
 * once every write has landed, tells Claude that no project is open, and greets every app with the
 * Projects screen again. One project is open at a time (ADR-0016).
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PROTOCOL_VERSION,
  checkLiveValues,
  checkPreferenceChanges,
  decodeAppMessage,
  type Author,
  type CaptureAsk,
  type CaptureReport,
  type Command,
  type Guidance,
  type HomeCreateMessage,
  type HomeOfferedMessage,
  type LayoutReport,
  type LiveFilter,
  type LiveSender,
  type PreferencesSetMessage,
  type Problem,
  type ProblemCode,
  type ProjectSnapshot,
  type RecentProject,
  type ServerMessage,
  type SolidImportOptions,
  type SolidPrepareMessage,
  type VersionRef,
} from '@visual-anything/core';
import type { Id, ProjectFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import type { MadeDrawing } from './drawings/make';
import { errorReason } from './errors';
import {
  checkHomeFolder,
  describeProject,
  folderNameFor,
  listProjects,
  samePath,
} from './home';
import type { LayoutGuidance } from './layout-waits';
import type { LiveKept, LiveListing } from './live';
import { toForwardSlashes } from './paths';
import type { PreferencesStore } from './preferences';
import { formatProjectProblem } from './project';
import {
  emptyProjectFiles,
  folderState,
  sampleOf,
  samples,
  writeNewProject,
  type NewProjectResult,
} from './samples';
import type {
  CommandPlan,
  ConnectOptions,
  ExecuteOptions,
  LiveSession,
  OpenSessionResult,
  Origin,
  Session,
  SessionClient,
  SessionOutcome,
} from './session';
import type { SolidChoices } from './solids/import';
import { NO_PROJECT, StartingSession } from './start';

/** What a session at home needs from the world around it. */
export interface HomeOptions {
  /** The projects folder, where new projects are written; made when first needed. */
  projectsFolder: string;
  /** Opens a project: `openSession`, with the program's options. */
  open(folder: string): Promise<OpenSessionResult>;
  /** The person's preferences, which keep the recent projects and which the screen's controls change. */
  preferences?: PreferencesStore;
  /** Hears that a project is open, once every app was handed over to it. */
  onOpened?: (session: Session) => Promise<void> | void;
  /** Hears that the project in this folder closed, before the apps are greeted at home. */
  onClosed?: (folder: string) => Promise<void> | void;
  /**
   * Whether another Visual Anything runs on this folder already: what to tell the app then, having
   * opened a tab there (ADR-0044); undefined when none does, and this program opens it.
   */
  elsewhere?: (folder: string) => Promise<string | undefined>;
  /** Writes a new project's files; `writeNewProject` by default. */
  write?: (
    folder: string,
    files: ReadonlyMap<string, string | Uint8Array>,
  ) => Promise<NewProjectResult>;
  /** The platform whose paths an app sends; this one by default. */
  platform?: NodeJS.Platform;
}

/** Why a request that needs a project is refused at home. */
export const NO_PROJECT_OPEN = 'No project is open: open one from the Projects screen first.';

/** What Claude is told when the project it worked on closes. */
export const NO_PROJECT_FOR_CLAUDE =
  'No project is open in Visual Anything now: the person went back to the Projects screen. Ask them to open a project, then read it again.';

const BUSY = 'Visual Anything is opening or closing a project already.';
const OPEN_ALREADY = 'A project is open here already.';

/** The most folders tried for a new project's name, as "Name", "Name 2", … */
const MAX_NAME_TRIES = 100;

/** A live session that is at home, or the session of the project opened from there. */
export class HomeSession implements LiveSession {
  readonly #options: HomeOptions;
  /** The project open now, or the start screen of a folder that holds nothing yet. */
  #inner: Session | StartingSession | undefined;
  /** Every app connected, with what disconnects it from the project open now. */
  readonly #apps = new Map<SessionClient, (() => void) | undefined>();
  /** The session token, for each app that connected with a launch code and has not got it yet. */
  readonly #tokens = new Map<SessionClient, string>();
  /** Every Claude attached, with what detaches it from the project open now. */
  readonly #claudes = new Map<SessionClient, (() => void) | undefined>();
  readonly #ports: number[] = [];
  #busy = false;
  #closed = false;
  /** Counts the times the program went home or opened a project, so a late greeting is dropped. */
  #turn = 0;

  constructor(options: HomeOptions) {
    this.#options = options;
  }

  /** The folder of the project open now; none at home. */
  get folder(): string | undefined {
    return this.#inner?.folder;
  }

  /** Whether no project is open. */
  get atHome(): boolean {
    return this.#inner === undefined;
  }

  /** The session of the project open now, once there is one. */
  get session(): Session | undefined {
    const inner = this.#inner;
    return inner instanceof StartingSession ? inner.session : inner;
  }

  get snapshot(): ProjectSnapshot {
    return this.#inner?.snapshot ?? NO_PROJECT;
  }

  connect(client: SessionClient, options: ConnectOptions = {}): () => void {
    const inner = this.#inner;
    if (inner !== undefined) {
      this.#apps.set(client, inner.connect(client, options));
    } else {
      this.#apps.set(client, undefined);
      if (options.token !== undefined) this.#tokens.set(client, options.token);
      const preferences = this.#options.preferences;
      if (preferences !== undefined) {
        client.send({ type: 'preferences/changed', preferences: preferences.current() });
      }
      void this.#greet(client);
    }
    return () => {
      this.#apps.get(client)?.();
      this.#apps.delete(client);
      this.#tokens.delete(client);
    };
  }

  async receive(client: SessionClient, text: string): Promise<void> {
    // Only a message that names home is read here; the project's session reads every other one.
    if (text.includes('home/')) {
      let message;
      try {
        message = decodeAppMessage(text);
      } catch {
        message = undefined;
      }
      if (
        message?.type === 'home/open' ||
        message?.type === 'home/create' ||
        message?.type === 'home/forget' ||
        message?.type === 'home/close'
      ) {
        await this.#home(client, message);
        return;
      }
    }
    const inner = this.#inner;
    if (inner !== undefined) {
      await inner.receive(client, text);
      return;
    }
    let message;
    try {
      message = decodeAppMessage(text);
    } catch {
      return;
    }
    if (message.type === 'preferences/set') {
      await this.#setPreferences(client, message);
      return;
    }
    client.send({
      type: 'command/rejected',
      requestId: message.requestId,
      problems: [refusal('not-saved', NO_PROJECT_OPEN)],
    });
  }

  attachClaude(client: SessionClient): () => void {
    const inner = this.#inner;
    if (inner !== undefined) {
      this.#claudes.set(client, inner.attachClaude(client));
    } else {
      this.#claudes.set(client, undefined);
      client.send({ type: 'project/closed', message: NO_PROJECT_FOR_CLAUDE });
    }
    return () => {
      this.#claudes.get(client)?.();
      this.#claudes.delete(client);
    };
  }

  execute(
    command: Command,
    author: Author,
    origin?: Origin,
    how?: ExecuteOptions,
  ): Promise<SessionOutcome> {
    return this.#inner?.execute(command, author, origin, how) ?? this.#noProject(origin);
  }

  executePlanned(plan: CommandPlan, author: Author, origin?: Origin): Promise<SessionOutcome> {
    return this.#inner?.executePlanned(plan, author, origin) ?? this.#noProject(origin);
  }

  guide(guidance: Guidance): Promise<number> {
    return this.#inner?.guide(guidance) ?? Promise.resolve(0);
  }

  layOut(guidance: LayoutGuidance): Promise<LayoutReport> {
    return this.session?.layOut(guidance) ?? Promise.resolve({ apps: 0 });
  }

  capture(ask: CaptureAsk): Promise<CaptureReport> {
    return this.session?.capture(ask) ?? Promise.resolve({ apps: 0 });
  }

  setLive(connection: object, sender: LiveSender, values: unknown, freshFor?: number): LiveKept {
    const inner = this.#inner;
    if (inner !== undefined) return inner.setLive(connection, sender, values, freshFor);
    const checked = checkLiveValues(values);
    return {
      kept: 0,
      waiting: 0,
      dropped: checked.dropped,
      unknown: [...new Set(checked.values.map((each) => each.target))],
      refused: checked.refused,
    };
  }

  clearLive(filter: LiveFilter): number {
    return this.#inner?.clearLive(filter) ?? 0;
  }

  listLive(filter: LiveFilter, limit: number): LiveListing {
    return this.session?.listLive(filter, limit) ?? { values: [], total: 0, at: Date.now() };
  }

  servesAt(port: number): void {
    this.#ports.push(port);
    this.#inner?.servesAt(port);
  }

  makeDrawing(html: string, width: number): Promise<MadeDrawing> {
    return (
      this.session?.makeDrawing(html, width) ??
      Promise.resolve({ ok: false, problems: [refusal('not-saved', NO_PROJECT_OPEN)] })
    );
  }

  async listVersions(origin: Origin): Promise<void> {
    const session = this.session;
    if (session !== undefined) return session.listVersions(origin);
    origin.client.send({
      type: 'versions/listed',
      requestId: origin.requestId,
      versions: [],
      why: NO_PROJECT_OPEN,
    });
  }

  async compareVersion(origin: Origin, version: VersionRef, view?: Id): Promise<void> {
    const session = this.session;
    if (session !== undefined) return session.compareVersion(origin, version, view);
    origin.client.send({
      type: 'version/refused',
      requestId: origin.requestId,
      problems: [refusal('not-saved', NO_PROJECT_OPEN)],
    });
  }

  async withdrawProposal(origin: Origin): Promise<void> {
    const inner = this.#inner;
    if (inner !== undefined) return inner.withdrawProposal(origin);
    this.#refuse(origin.client, origin.requestId, 'not-saved', NO_PROJECT_OPEN);
  }

  async prepareSolidPiece(client: SessionClient, message: SolidPrepareMessage): Promise<void> {
    const session = this.session;
    if (session !== undefined) return session.prepareSolidPiece(client, message);
    client.send(solidRefused(message.requestId));
  }

  async prepareSolidFile(
    client: SessionClient,
    requestId: string,
    path: string,
    options: SolidImportOptions,
  ): Promise<void> {
    const session = this.session;
    if (session !== undefined) return session.prepareSolidFile(client, requestId, path, options);
    client.send(solidRefused(requestId));
  }

  importSolid(
    hash: string,
    choices: SolidChoices,
    author: Author,
    origin?: Origin,
  ): Promise<SessionOutcome> {
    return this.session?.importSolid(hash, choices, author, origin) ?? this.#noProject(origin);
  }

  /** Closes the project open now, once its writes have landed; at home there is nothing to close. */
  async close(): Promise<void> {
    this.#closed = true;
    await this.#inner?.close();
  }

  /** What the Projects screen offers now. */
  async offer(): Promise<Omit<HomeOfferedMessage, 'token' | 'requestId'>> {
    const root = this.#options.projectsFolder;
    const recentPaths = this.#options.preferences?.recentProjects?.() ?? [];
    const [projects, recent] = await Promise.all([
      listProjects(root),
      Promise.all(
        recentPaths.map(async (path): Promise<RecentProject> => {
          const found = await describeProject(path);
          return found === undefined ? { path, missing: true } : { path, ...found, missing: false };
        }),
      ),
    ]);
    return {
      type: 'home/offered',
      protocolVersion: PROTOCOL_VERSION,
      folder: root,
      projects,
      recent,
      samples: samples().map(({ id, name, packages }) => ({ id, name, packages })),
    };
  }

  /** Greets an app at home with the offer, and the session token it is owed; dropped if home is left. */
  async #greet(client: SessionClient, requestId?: string): Promise<void> {
    const turn = this.#turn;
    const offer = await this.offer().catch(() => undefined);
    if (offer === undefined || turn !== this.#turn || !this.#apps.has(client)) return;
    const token = this.#tokens.get(client);
    this.#tokens.delete(client);
    client.send({
      ...offer,
      ...(token === undefined ? {} : { token }),
      ...(requestId === undefined ? {} : { requestId }),
    });
  }

  /** Greets every app at home again, the one that asked with its request's id. */
  async #greetAll(asker?: SessionClient, requestId?: string): Promise<void> {
    await Promise.all(
      [...this.#apps.keys()].map((client) =>
        this.#greet(client, client === asker ? requestId : undefined),
      ),
    );
  }

  /** Handles a message of the Projects screen, or the header's "Projects…". */
  async #home(
    client: SessionClient,
    message: Extract<
      ReturnType<typeof decodeAppMessage>,
      { type: 'home/open' | 'home/create' | 'home/forget' | 'home/close' }
    >,
  ): Promise<void> {
    const { requestId } = message;
    if (message.type === 'home/close') {
      if (this.#inner === undefined && !this.#busy) {
        await this.#greet(client, requestId);
        return;
      }
      await this.#switch(client, requestId, () => this.#goHome(client, requestId));
      return;
    }
    if (this.#inner !== undefined) {
      this.#refuse(client, requestId, 'not-saved', OPEN_ALREADY);
      return;
    }
    switch (message.type) {
      case 'home/open':
        await this.#switch(client, requestId, () => this.#open(client, requestId, message.path));
        return;
      case 'home/create':
        await this.#switch(client, requestId, () => this.#create(client, message));
        return;
      case 'home/forget':
        await this.#forget(client, requestId, message.path);
        return;
    }
  }

  /** Runs one opening or closing at a time; another app's while one is under way is refused. */
  async #switch(client: SessionClient, requestId: string, run: () => Promise<void>): Promise<void> {
    if (this.#busy || this.#closed) {
      this.#refuse(client, requestId, 'not-saved', BUSY);
      return;
    }
    this.#busy = true;
    try {
      await run();
    } catch (error) {
      this.#refuse(
        client,
        requestId,
        'program-failed',
        `The local program failed: ${errorReason(error)}`,
      );
    } finally {
      this.#busy = false;
    }
  }

  /** Opens the project in a folder an app named, or the start screen of one that holds nothing yet. */
  async #open(client: SessionClient, requestId: string, path: string): Promise<void> {
    const checked = await checkHomeFolder(path, this.#options.platform ?? process.platform);
    if (!checked.ok) {
      this.#refuse(client, requestId, 'invalid-command', checked.message);
      return;
    }
    const elsewhere = await this.#options.elsewhere?.(checked.folder);
    if (elsewhere !== undefined) {
      this.#refuse(client, requestId, 'not-saved', elsewhere);
      return;
    }
    if (checked.holds === 'nothing') {
      const starting = new StartingSession(checked.folder, {
        open: this.#options.open,
        ...(this.#options.preferences === undefined
          ? {}
          : { preferences: this.#options.preferences }),
        ...(this.#options.write === undefined ? {} : { write: this.#options.write }),
      });
      this.#enter(starting);
      void starting.started.then((session) => this.#opened(session));
      return;
    }
    await this.#openProject(client, requestId, checked.folder);
  }

  /** Opens the project in a folder, and hands every app and Claude over to it. */
  async #openProject(client: SessionClient, requestId: string, folder: string): Promise<void> {
    const opened = await this.#options.open(folder);
    if (!opened.ok) {
      this.#refuse(
        client,
        requestId,
        'not-saved',
        `The project in ${toForwardSlashes(folder)} could not be opened: ${opened.errors.map(formatProjectProblem).join(' ')}`,
      );
      return;
    }
    if (this.#closed) {
      await opened.session.close();
      return;
    }
    this.#enter(opened.session);
    await this.#opened(opened.session);
  }

  /**
   * Writes a new project in a subfolder of the projects folder named from its name, as "Name 2" when
   * "Name" is taken, from a sample or empty, and opens it.
   */
  async #create(client: SessionClient, message: HomeCreateMessage): Promise<void> {
    const { requestId } = message;
    const name = message.name.trim();
    const sample = message.sample === undefined ? undefined : sampleOf(message.sample);
    if (message.sample !== undefined && sample === undefined) {
      this.#refuse(
        client,
        requestId,
        'invalid-command',
        `There is no sample "${message.sample}" to start from.`,
      );
      return;
    }
    const root = this.#options.projectsFolder;
    try {
      await mkdir(root, { recursive: true });
    } catch (error) {
      this.#refuse(
        client,
        requestId,
        'not-saved',
        `The projects folder ${toForwardSlashes(root)} could not be made: ${errorReason(error)}`,
      );
      return;
    }
    const base = folderNameFor(name);
    let folder: string | undefined;
    for (let n = 1; n <= MAX_NAME_TRIES && folder === undefined; n += 1) {
      const candidate = join(root, n === 1 ? base : `${base} ${n}`);
      const state = await folderState(candidate).catch(() => 'taken' as const);
      if (state !== 'taken') folder = candidate;
    }
    if (folder === undefined) {
      this.#refuse(
        client,
        requestId,
        'not-saved',
        `The projects folder holds too many folders named “${base}”: choose another name.`,
      );
      return;
    }
    const files =
      sample === undefined
        ? emptyProjectFiles(folder, {
            project: name,
            ...(message.view === undefined ? {} : { view: message.view }),
          })
        : renamed(sample.files, name);
    const written = await (this.#options.write ?? writeNewProject)(folder, files);
    if (!written.ok) {
      this.#refuse(client, requestId, 'not-saved', written.message);
      return;
    }
    await this.#openProject(client, requestId, written.folder);
  }

  /** Takes a project off the recent list, and greets every app at home with the list as it is now. */
  async #forget(client: SessionClient, requestId: string, path: string): Promise<void> {
    const store = this.#options.preferences;
    if (store?.updateRecentProjects === undefined) {
      this.#refuse(client, requestId, 'not-saved', 'This program keeps no preferences.');
      return;
    }
    const platform = this.#options.platform ?? process.platform;
    await store.updateRecentProjects((paths) =>
      paths.filter((each) => !samePath(each, path, platform)),
    );
    await this.#greetAll(client, requestId);
  }

  /**
   * Closes the project once every write has landed, then hands every app back home and tells Claude
   * that no project is open.
   */
  async #goHome(client: SessionClient, requestId: string): Promise<void> {
    const inner = this.#inner;
    if (inner === undefined) {
      await this.#greet(client, requestId);
      return;
    }
    const folder = inner.folder;
    // The project's session answers what was asked before, then refuses what comes after.
    await inner.close();
    this.#turn += 1;
    this.#inner = undefined;
    for (const [app, disconnect] of this.#apps) {
      disconnect?.();
      this.#apps.set(app, undefined);
    }
    for (const [claude, detach] of this.#claudes) {
      detach?.();
      this.#claudes.set(claude, undefined);
      claude.send({ type: 'project/closed', message: NO_PROJECT_FOR_CLAUDE });
    }
    await this.#options.onClosed?.(folder);
    await this.#greetAll(client, requestId);
  }

  /** Becomes the session of a project, or of a start screen, for every app and Claude. */
  #enter(inner: Session | StartingSession): void {
    this.#turn += 1;
    this.#inner = inner;
    for (const port of this.#ports) inner.servesAt(port);
    for (const app of this.#apps.keys()) {
      const token = this.#tokens.get(app);
      this.#tokens.delete(app);
      this.#apps.set(app, inner.connect(app, token === undefined ? {} : { token }));
    }
    for (const claude of this.#claudes.keys()) this.#claudes.set(claude, inner.attachClaude(claude));
  }

  /** A project is open: it joins the recent list, and whoever listens hears of it. */
  async #opened(session: Session): Promise<void> {
    await rememberProject(
      this.#options.preferences,
      session.folder,
      this.#options.platform ?? process.platform,
    );
    await this.#options.onOpened?.(session);
  }

  /** Changes the person's preferences from the Projects screen's controls, as a session does. */
  async #setPreferences(client: SessionClient, message: PreferencesSetMessage): Promise<void> {
    const { requestId } = message;
    const store = this.#options.preferences;
    if (store === undefined) {
      this.#refuse(client, requestId, 'not-saved', 'This program keeps no preferences.');
      return;
    }
    const checked = checkPreferenceChanges(message.changes);
    if (!checked.ok) {
      client.send({ type: 'command/rejected', requestId, problems: checked.problems });
      return;
    }
    try {
      const { preferences } = await store.set(checked.changes);
      const changed: ServerMessage = { type: 'preferences/changed', preferences };
      client.send({ ...changed, requestId });
      for (const other of this.#apps.keys()) if (other !== client) other.send(changed);
    } catch (error) {
      this.#refuse(
        client,
        requestId,
        'program-failed',
        `Your preferences could not be changed: ${errorReason(error)}`,
      );
    }
  }

  #refuse(client: SessionClient, requestId: string, code: ProblemCode, message: string): void {
    client.send({ type: 'command/rejected', requestId, problems: [refusal(code, message)] });
  }

  #noProject(origin: Origin | undefined): Promise<SessionOutcome> {
    const problems = [refusal('not-saved', NO_PROJECT_OPEN)];
    if (origin !== undefined) {
      origin.client.send({ type: 'command/rejected', requestId: origin.requestId, problems });
    }
    return Promise.resolve({ ok: false, problems });
  }
}

/**
 * Puts a project first on the recent list (ADR 0093), once; a list that cannot be saved is kept until
 * the program stops, and a store that keeps none is left as it is.
 */
export async function rememberProject(
  store: PreferencesStore | undefined,
  folder: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  await store
    ?.updateRecentProjects?.((paths) => [
      folder,
      ...paths.filter((each) => !samePath(each, folder, platform)),
    ])
    .catch(() => undefined);
}

/** A sample's files, with its project file renamed as the person named the new project. */
function renamed(
  files: ReadonlyMap<string, string | Uint8Array>,
  name: string,
): Map<string, string | Uint8Array> {
  const copy = new Map(files);
  const text = copy.get('project.vaproject');
  if (typeof text === 'string') {
    const project = JSON.parse(text) as ProjectFile;
    copy.set('project.vaproject', formatFile('project', { ...project, name }));
  }
  return copy;
}

function solidRefused(requestId: string): ServerMessage {
  return { type: 'solid/refused', requestId, code: 'not-saved', message: NO_PROJECT_OPEN };
}

function refusal(code: ProblemCode, message: string): Problem {
  return { code, message };
}

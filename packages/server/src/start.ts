/**
 * The local program on a folder that holds no project yet (ADR 0051). It serves the app as for any
 * project, behind the same checks and session token, but greets each app with the start screen's
 * offer instead of a project: the sample projects a new project there can start from, or an empty
 * one. Once an app chooses, the program writes the project into the folder, opens it, and from then
 * on is the session of that project, for every app connected meanwhile and every one that connects
 * later.
 */
import { basename } from 'node:path';
import {
  PROTOCOL_VERSION,
  checkPreferenceChanges,
  decodeAppMessage,
  type Author,
  type Command,
  type Guidance,
  type PreferencesSetMessage,
  type Problem,
  type ProblemCode,
  type ProjectSnapshot,
  type ServerMessage,
  type StartCreateMessage,
} from '@visual-anything/core';
import { errorReason } from './errors';
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
  ConnectOptions,
  LiveSession,
  OpenSessionResult,
  Origin,
  Session,
  SessionClient,
  SessionOutcome,
} from './session';

/** What a starting session needs from the world around it. */
export interface StartOptions {
  /** Opens the project once it is written: `openSession`, with the program's options. */
  open(folder: string): Promise<OpenSessionResult>;
  /** The person's preferences, which the start screen's controls change too. */
  preferences?: PreferencesStore;
  /** Writes the new project's files; `writeNewProject` by default. */
  write?: (folder: string, files: ReadonlyMap<string, string>) => Promise<NewProjectResult>;
}

/** The project nobody has started yet, which no app ever sees: what `snapshot` gives until then. */
const NO_PROJECT: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'New project', packages: [] },
  model: {
    world: { id: 'world', component: 'essence', name: 'World' },
    elements: [],
    relations: [],
  },
  packages: [],
  views: [],
  scenarios: [],
  tours: [],
  comments: [],
};

const NOT_STARTED = 'No project is open here yet: choose how to start one first.';

/** The live session of a program on a folder that holds no project yet, until one is started. */
export class StartingSession implements LiveSession {
  readonly folder: string;
  readonly #options: StartOptions;
  #session: Session | undefined;
  /** The apps connected before the project was started. */
  readonly #waiting = new Set<SessionClient>();
  /** What disconnects each of those apps from the session once there is one. */
  readonly #disconnects = new Map<SessionClient, () => void>();
  /** Claude, attached before the project was started; it attaches to the session once there is one. */
  readonly #claudes = new Map<SessionClient, (() => void) | undefined>();
  #starting = false;
  #closed = false;
  readonly #started: Promise<Session>;
  #resolveStarted: (session: Session) => void = () => {};

  constructor(folder: string, options: StartOptions) {
    this.folder = folder;
    this.#options = options;
    this.#started = new Promise<Session>((resolve) => {
      this.#resolveStarted = resolve;
    });
  }

  /** Resolves with the project's session once an app has started it. */
  get started(): Promise<Session> {
    return this.#started;
  }

  /** The project's session, once started. */
  get session(): Session | undefined {
    return this.#session;
  }

  get snapshot(): ProjectSnapshot {
    return this.#session?.snapshot ?? NO_PROJECT;
  }

  connect(client: SessionClient, options: ConnectOptions = {}): () => void {
    if (this.#session !== undefined) return this.#session.connect(client, options);
    this.#waiting.add(client);
    client.send({
      type: 'start/offered',
      protocolVersion: PROTOCOL_VERSION,
      folder: basename(this.folder),
      samples: samples().map(({ id, name, packages }) => ({ id, name, packages })),
      ...(options.token === undefined ? {} : { token: options.token }),
    });
    const preferences = this.#options.preferences;
    if (preferences !== undefined) {
      client.send({ type: 'preferences/changed', preferences: preferences.current() });
    }
    return () => {
      this.#waiting.delete(client);
      this.#disconnects.get(client)?.();
      this.#disconnects.delete(client);
    };
  }

  async receive(client: SessionClient, text: string): Promise<void> {
    if (this.#session !== undefined) {
      await this.#session.receive(client, text);
      return;
    }
    let message;
    try {
      message = decodeAppMessage(text);
    } catch {
      return;
    }
    switch (message.type) {
      case 'start/create':
        await this.#start(client, message);
        return;
      case 'preferences/set':
        await this.#setPreferences(client, message);
        return;
      default:
        client.send({
          type: 'command/rejected',
          requestId: message.requestId,
          problems: [refusal('not-saved', NOT_STARTED)],
        });
    }
  }

  attachClaude(client: SessionClient): () => void {
    if (this.#session !== undefined) return this.#session.attachClaude(client);
    this.#claudes.set(client, undefined);
    return () => {
      this.#claudes.get(client)?.();
      this.#claudes.delete(client);
    };
  }

  execute(command: Command, author: Author, origin?: Origin): Promise<SessionOutcome> {
    if (this.#session !== undefined) return this.#session.execute(command, author, origin);
    return Promise.resolve({ ok: false, problems: [refusal('not-saved', NOT_STARTED)] });
  }

  guide(guidance: Guidance): Promise<number> {
    return this.#session?.guide(guidance) ?? Promise.resolve(0);
  }

  /** Closes the project's session, once started; until then there is nothing to close. */
  async close(): Promise<void> {
    this.#closed = true;
    await this.#session?.close();
  }

  /**
   * Writes the project an app chose and opens it, then hands every app connected meanwhile over to
   * its session. One start at a time: another app's choice while one is under way is refused.
   */
  async #start(client: SessionClient, message: StartCreateMessage): Promise<void> {
    const refuse = (code: ProblemCode, text: string) =>
      client.send({
        type: 'command/rejected',
        requestId: message.requestId,
        problems: [refusal(code, text)],
      });
    if (this.#starting || this.#closed) {
      refuse('not-saved', 'The project here is being started already.');
      return;
    }
    const sample = message.sample === undefined ? undefined : sampleOf(message.sample);
    if (message.sample !== undefined && sample === undefined) {
      refuse('invalid-command', `There is no sample "${message.sample}" to start from.`);
      return;
    }
    this.#starting = true;
    try {
      const files = sample?.files ?? emptyProjectFiles(this.folder, message.names);
      const written = await (this.#options.write ?? writeNewProject)(this.folder, files);
      if (!written.ok) {
        refuse('not-saved', written.message);
        return;
      }
      const opened = await this.#options.open(this.folder);
      if (!opened.ok) {
        refuse(
          'not-saved',
          `The new project could not be opened: ${opened.errors.map(formatProjectProblem).join(' ')}`,
        );
        return;
      }
      if (this.#closed) {
        await opened.session.close();
        return;
      }
      this.#adopt(opened.session);
    } catch (error) {
      refuse('program-failed', `The new project could not be started: ${errorReason(error)}`);
    } finally {
      this.#starting = false;
    }
  }

  /** Becomes the session of the project just started, for every app and Claude connected meanwhile. */
  #adopt(session: Session): void {
    this.#session = session;
    // The token went with the offer already: each app reconnects with it from then on.
    for (const client of this.#waiting) this.#disconnects.set(client, session.connect(client));
    this.#waiting.clear();
    for (const client of this.#claudes.keys()) {
      this.#claudes.set(client, session.attachClaude(client));
    }
    this.#resolveStarted(session);
  }

  /** Changes the person's preferences from the start screen's controls, as a session does. */
  async #setPreferences(client: SessionClient, message: PreferencesSetMessage): Promise<void> {
    const { requestId } = message;
    const refuse = (problems: Problem[]) =>
      client.send({ type: 'command/rejected', requestId, problems });
    const store = this.#options.preferences;
    if (store === undefined) {
      refuse([refusal('not-saved', 'This program keeps no preferences.')]);
      return;
    }
    const checked = checkPreferenceChanges(message.changes);
    if (!checked.ok) {
      refuse(checked.problems);
      return;
    }
    try {
      const { preferences } = await store.set(checked.changes);
      const changed: ServerMessage = { type: 'preferences/changed', preferences };
      client.send({ ...changed, requestId });
      for (const other of this.#waiting) if (other !== client) other.send(changed);
    } catch (error) {
      refuse([
        refusal('program-failed', `Your preferences could not be changed: ${errorReason(error)}`),
      ]);
    }
  }
}

/**
 * A starting session for a folder that holds no project yet, as `folderState` tells it; undefined
 * for a folder with something in it, or none at all, which the program opens, or fails to, as before.
 */
export async function startingOn(
  folder: string,
  open: StartOptions['open'],
  preferences?: PreferencesStore,
): Promise<StartingSession | undefined> {
  const state = await folderState(folder).catch(() => 'taken' as const);
  if (state !== 'empty') return undefined;
  return new StartingSession(folder, {
    open,
    ...(preferences === undefined ? {} : { preferences }),
  });
}

function refusal(code: ProblemCode, message: string): Problem {
  return { code, message };
}

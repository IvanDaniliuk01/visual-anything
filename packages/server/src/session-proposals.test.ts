/**
 * The session's proposal (ADR 0073): while the person reviews Claude's changes, or when a command asks
 * to, Claude's commands join one proposal on top of the project now, which every app and Claude are
 * shown after each change. The person's actions, undo and redo included, and reloads rebase it; an app
 * accepts it, all or some, as one action of Claude's, or refuses it; Claude may withdraw it. Nothing of
 * it reaches a file or the history before it is accepted.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyOperations,
  decodeServerMessage,
  type Command,
  type ProjectSnapshot,
  type ServerMessage,
} from '@visual-anything/core';
import { untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachClaude } from './claude/endpoint';
import type { ProgramMessage } from './claude/messages';
import { openPreferences, type PreferencesStore } from './preferences';
import type { ProgramEvent } from './program-log';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, filesIn, testProject, writeProjectFolder } from './test-support';

const RENAME_API: Command = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } };
const RENAME_DB: Command = { type: 'update-element', id: 'db', changes: { name: 'Store' } };
const CREATE_CACHE: Command = {
  type: 'create-element',
  element: { id: 'cache', component: 'systems.database', name: 'Cache' },
};
const CREATE_QUEUE: Command = {
  type: 'create-element',
  element: { id: 'queue', component: 'systems.service', name: 'Queue' },
};

let folder: string;
const opened: Session[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-session-proposals-'));
  await writeProjectFolder(folder, testProject());
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

interface Opened {
  session: Session;
  preferences: PreferencesStore;
  log: ProgramEvent[];
  out: string[];
}

async function open(options: SessionOptions = {}, review = true): Promise<Opened> {
  const { store: preferences } = await openPreferences(null);
  if (review) await preferences.set({ reviewClaude: true });
  const log: ProgramEvent[] = [];
  const out: string[] = [];
  let made = 0;
  const result = await openSession(folder, {
    watch: false,
    out: (line) => out.push(line),
    err: () => {},
    preferences,
    newId: (base) => `${base}-${(made += 1)}`,
    log: (event) => log.push(event),
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return { session: result.session, preferences, log, out };
}

/** Claude attached through its endpoint, keeping what the program sends it. */
function claudeOn(session: Session) {
  const messages: ProgramMessage[] = [];
  const connection = attachClaude(session, (message) => messages.push(message));
  let count = 0;
  return {
    messages,
    /** Sends a message, and gives back what answers it. */
    async send(message: Record<string, unknown>): Promise<ProgramMessage[]> {
      const requestId = `c${(count += 1)}`;
      await connection.receive(JSON.stringify({ ...message, requestId }));
      return messages.filter((each) => 'requestId' in each && each.requestId === requestId);
    },
    command(command: Command, propose?: boolean) {
      return this.send({ type: 'command', command, ...(propose ? { propose } : {}) });
    },
    detach: () => connection.detach(),
  };
}

/** The proposals an app or Claude was shown, as the protocol reads them. */
function shownTo(messages: readonly (ServerMessage | ProgramMessage)[]) {
  return messages.flatMap((message) => {
    if (message.type !== 'proposal/shown') return [];
    const read = decodeServerMessage(JSON.stringify(message));
    return read.type === 'proposal/shown' ? [read.proposal] : [];
  });
}

/**
 * Sends a message from an app, and gives back what answers it. An acceptance names the revision the
 * app was shown last, unless it names one itself.
 */
async function fromApp(
  session: Session,
  app: FakeClient,
  message: Record<string, unknown>,
): Promise<ServerMessage[]> {
  const revision =
    message.type === 'proposal/accept' ? (shownTo(app.messages).at(-1)?.revision ?? 0) : undefined;
  const before = app.messages.length;
  await session.receive(
    app,
    JSON.stringify({
      requestId: 'a1',
      ...(revision === undefined ? {} : { revision }),
      ...message,
    }),
  );
  return app.messages
    .slice(before)
    .filter((each) => 'requestId' in each && each.requestId === 'a1');
}

/** The proposed project, as an app builds it from what it was shown. */
function proposedFor(
  project: ProjectSnapshot,
  messages: readonly ServerMessage[],
): ProjectSnapshot {
  const last = shownTo(messages).at(-1);
  if (last === undefined) throw new Error('No proposal was shown.');
  return applyOperations(project, last.operations).state;
}

describe('Claude’s commands while the person reviews them', () => {
  it('join one proposal, shown to every app and Claude, and answered at once', async () => {
    const { session, log } = await open();
    const before = await filesIn(folder);
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);

    const answers = await claude.command(RENAME_API);
    expect(answers).toHaveLength(1);
    const [made] = answers;
    expect(made).toMatchObject({
      type: 'proposal/made',
      label: expect.any(String) as unknown,
      changes: ['element:api changed'],
      created: [],
      apps: 1,
    });
    // Nothing applies: the project, the history and the files are as they were.
    expect(session.snapshot).toEqual(testProject());
    expect(session.history.undo).toBeUndefined();
    expect(session.actions).toEqual([]);
    expect(await filesIn(folder)).toEqual(before);
    expect(app.ofType('project/changed')).toEqual([]);

    const [shown] = shownTo(app.messages);
    expect(shown?.changes.map((each) => each.key)).toEqual(['element:api changed']);
    expect(shownTo(claude.messages)).toEqual([shown]);
    expect(proposedFor(session.snapshot, app.messages).model.elements[1]?.name).toBe('Gateway');

    // The next one joins it.
    const [second] = await claude.command(CREATE_CACHE);
    expect(second).toMatchObject({
      type: 'proposal/made',
      proposal: made?.type === 'proposal/made' ? made.proposal : '',
      created: ['cache'],
    });
    expect(shownTo(app.messages).at(-1)?.labels).toHaveLength(2);
    expect(session.snapshot).toEqual(testProject());
    expect(await filesIn(folder)).toEqual(before);
    expect(log.filter((each) => each.event === 'proposal')).toEqual([
      { event: 'proposal', kind: 'opened', changes: 1 },
      { event: 'proposal', kind: 'joined', changes: 2 },
    ]);
  });

  it('applies at once with the review off, unless a command asks to be proposed', async () => {
    const { session } = await open({}, false);
    const claude = claudeOn(session);
    const [applied] = await claude.command(RENAME_DB);
    expect(applied?.type).toBe('project/changed');
    expect(session.snapshot.model.elements.find((each) => each.id === 'db')?.name).toBe('Store');

    const [proposed] = await claude.command(RENAME_API, true);
    expect(proposed?.type).toBe('proposal/made');
    expect(session.snapshot.model.elements.find((each) => each.id === 'api')?.name).toBe('API');

    // While it waits, Claude's later commands build on it, and join it too.
    const [joined] = await claude.command(CREATE_CACHE);
    expect(joined?.type).toBe('proposal/made');
    expect(session.snapshot.model.elements.some((each) => each.id === 'cache')).toBe(false);
  });

  it('runs on the proposed project, so a command can name what the proposal made', async () => {
    const { session } = await open();
    const claude = claudeOn(session);
    await claude.command(CREATE_CACHE);
    const [answer] = await claude.command({
      type: 'update-element',
      id: 'cache',
      changes: { name: 'Hot cache' },
    });
    expect(answer?.type).toBe('proposal/made');
    // The person's own command cannot: the project now has no such element.
    const outcome = await session.execute(
      { type: 'update-element', id: 'cache', changes: { name: 'Mine' } },
      'user',
    );
    expect(outcome.ok).toBe(false);
  });

  it('refuses what the core refuses, and a command that changes nothing opens none', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [refused] = await claude.command({
      type: 'update-element',
      id: 'nowhere',
      changes: { name: 'X' },
    });
    expect(refused?.type).toBe('command/rejected');
    const [unchanged] = await claude.command({
      type: 'update-element',
      id: 'api',
      changes: { name: 'API' },
    });
    expect(unchanged).toMatchObject({ type: 'project/changed', operations: [] });
    expect(shownTo(app.messages)).toEqual([]);
    expect(session.proposalWaiting).toBeUndefined();
  });

  it('sends comments to the project now, and refuses a batch that mixes them in', async () => {
    const { session } = await open();
    const claude = claudeOn(session);
    const thread: Command = {
      type: 'create-thread',
      thread: {
        id: 'why',
        anchor: { kind: 'element', element: 'api' },
        comment: { id: 'first', text: 'Why?' },
      },
    };
    const [comment] = await claude.command(thread);
    expect(comment?.type).toBe('project/changed');
    expect(session.snapshot.comments.map((each) => each.id)).toEqual(['why']);

    const [mixed] = await claude.command({
      type: 'batch',
      label: 'Both',
      commands: [RENAME_API, { ...thread, thread: { ...thread.thread, id: 'again' } }],
    });
    expect(mixed?.type).toBe('command/rejected');

    // A thread about what only the proposal holds waits for the person to accept it.
    await claude.command(CREATE_CACHE);
    const [about] = await claude.command({
      type: 'create-thread',
      thread: {
        id: 'cache-why',
        anchor: { kind: 'element', element: 'cache' },
        comment: { id: 'c1', text: 'Why a cache?' },
      },
    });
    expect(about?.type).toBe('command/rejected');
    expect(about?.type === 'command/rejected' && about.problems.at(-1)?.message).toMatch(
      /once the person accepts it/,
    );
  });

  it('greets an app, and Claude, that attach while a proposal waits', async () => {
    const { session } = await open();
    const claude = claudeOn(session);
    await claude.command(RENAME_API);
    const late = new FakeClient();
    session.connect(late);
    expect(shownTo(late.messages)).toHaveLength(1);
    const other = claudeOn(session);
    expect(shownTo(other.messages)).toHaveLength(1);
  });
});

describe('the person’s actions while a proposal waits', () => {
  it('rebase it before the apps hear of them, keeping Claude’s changes', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    await claude.command(RENAME_API);
    const shownBefore = shownTo(app.messages).length;

    await session.execute(RENAME_DB, 'user');
    // The change, then the proposal on the project it leaves.
    const types = app.messages.slice(-2).map((each) => each.type);
    expect(types).toEqual(['project/changed', 'proposal/shown']);
    expect(shownTo(app.messages)).toHaveLength(shownBefore + 1);
    const proposed = proposedFor(session.snapshot, app.messages);
    expect(proposed.model.elements.find((each) => each.id === 'db')?.name).toBe('Store');
    expect(proposed.model.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
    const [change] = shownTo(app.messages).at(-1)?.changes ?? [];
    expect(change).toMatchObject({ key: 'element:api changed', changedByYou: false });

    // Claude hears of the change and of the rebased proposal too.
    expect(claude.messages.slice(-2).map((each) => each.type)).toEqual([
      'project/changed',
      'proposal/shown',
    ]);
  });

  it('marks what the person changed too, and keeps Claude’s value in the proposal', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    await claude.command(RENAME_API);
    await session.execute({ type: 'update-element', id: 'api', changes: { name: 'Edge' } }, 'user');
    const [change] = shownTo(app.messages).at(-1)?.changes ?? [];
    expect(change).toMatchObject({ key: 'element:api changed', changedByYou: true });
    expect(
      proposedFor(session.snapshot, app.messages).model.elements.find((each) => each.id === 'api')
        ?.name,
    ).toBe('Gateway');
  });

  it('closes as dropped once the person’s actions leave it with no change', async () => {
    const { session, log } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [made] = await claude.command(RENAME_API);
    const id = made?.type === 'proposal/made' ? made.proposal : '';
    const shownBefore = shownTo(app.messages).length;

    // The person makes Claude's one change themselves: nothing is left to review.
    await session.execute(RENAME_API, 'user');
    expect(app.messages.slice(-2).map((each) => each.type)).toEqual([
      'project/changed',
      'proposal/closed',
    ]);
    expect(app.messages.at(-1)).toEqual({ type: 'proposal/closed', proposal: id, how: 'dropped' });
    expect(shownTo(app.messages)).toHaveLength(shownBefore);
    expect(claude.messages.at(-1)).toMatchObject({ type: 'proposal/closed', how: 'dropped' });
    expect(session.proposalWaiting).toBeUndefined();
    expect(log).toContainEqual({ event: 'proposal', kind: 'dropped', changes: 0 });

    // Claude's next command opens a new proposal.
    const [next] = await claude.command(RENAME_DB);
    expect(next).toMatchObject({ type: 'proposal/made' });
    expect(next?.type === 'proposal/made' && next.proposal).not.toBe(id);
  });

  it('keeps one that still holds a change after the person’s action', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    await claude.command(RENAME_API);
    await claude.command(RENAME_DB);
    await session.execute(RENAME_API, 'user');
    expect(app.messages.at(-1)?.type).toBe('proposal/shown');
    expect(
      shownTo(app.messages)
        .at(-1)
        ?.changes.map((each) => each.key),
    ).toEqual(['element:db changed']);
  });

  it('survives undo and redo, rebased on each', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    await session.execute(RENAME_DB, 'user');
    const claude = claudeOn(session);
    await claude.command(CREATE_CACHE);
    const keys = shownTo(app.messages)
      .at(-1)
      ?.changes.map((each) => each.key);

    const undone = await session.undo();
    expect(undone.ok).toBe(true);
    expect(app.messages.at(-1)?.type).toBe('proposal/shown');
    let proposed = proposedFor(session.snapshot, app.messages);
    expect(proposed.model.elements.find((each) => each.id === 'db')?.name).toBe('DB');
    expect(proposed.model.elements.some((each) => each.id === 'cache')).toBe(true);

    const redone = await session.redo();
    expect(redone.ok).toBe(true);
    proposed = proposedFor(session.snapshot, app.messages);
    expect(proposed.model.elements.find((each) => each.id === 'db')?.name).toBe('Store');
    expect(
      shownTo(app.messages)
        .at(-1)
        ?.changes.map((each) => each.key),
    ).toEqual(keys);
    // Undo and redo are the person's: the proposal never entered the history.
    expect(session.actions.map((each) => each.author)).toEqual(['user']);
  });

  it('is kept, rebased, through a reload from disk', async () => {
    const { session } = await open({ watch: { delay: 30 } });
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    await claude.command(CREATE_CACHE);
    const changed = { ...testProject(), project: { ...testProject().project, name: 'Changed' } };
    await writeProjectFolder(folder, changed);
    await expect.poll(() => app.ofType('project/reloaded').length, { timeout: 5000 }).toBe(1);
    await session.idle();
    const reloaded = app.messages.findIndex((each) => each.type === 'project/reloaded');
    expect(app.messages.slice(reloaded + 1).map((each) => each.type)).toContain('proposal/shown');
    const proposed = proposedFor(session.snapshot, app.messages);
    expect(proposed.project.name).toBe('Changed');
    expect(proposed.model.elements.some((each) => each.id === 'cache')).toBe(true);
  });
});

describe('resolving conflicts', () => {
  /** The test project with one conflict in its model file, from a merge (ADR 0072). */
  async function withConflict(): Promise<void> {
    const project = testProject();
    await writeProjectFolder(folder, {
      ...project,
      model: {
        ...project.model,
        conflicts: [
          {
            id: 'conflict-1',
            item: 'element:api',
            path: ['name'],
            why: 'both-changed',
            kept: 'ours',
            other: 'Edge',
          },
        ],
      },
    });
  }
  const RESOLVE: Command = {
    type: 'resolve-conflicts',
    file: { kind: 'model' },
    resolutions: [{ conflict: 'conflict-1', take: 'other' }],
  };
  const NEVER = /Conflicts are never resolved in a proposal/;

  it('runs as before with the review off and no proposal waiting', async () => {
    await withConflict();
    const { session } = await open({}, false);
    const claude = claudeOn(session);
    const [answer] = await claude.command(RESOLVE);
    expect(answer?.type).toBe('project/changed');
    expect(session.snapshot.model.conflicts ?? []).toEqual([]);
  });

  it('is refused, never applied, while the person reviews Claude’s changes', async () => {
    await withConflict();
    const { session } = await open();
    const claude = claudeOn(session);
    for (const command of [RESOLVE, { type: 'batch', label: 'Resolve', commands: [RESOLVE] }]) {
      const [answer] = await claude.command(command as Command);
      expect(answer?.type).toBe('command/rejected');
      expect(answer?.type === 'command/rejected' && answer.problems[0]?.message).toMatch(NEVER);
    }
    expect(session.snapshot.model.conflicts).toHaveLength(1);
    expect(session.proposalWaiting).toBeUndefined();
  });

  it('is refused when the command asks to be proposed, or while a proposal waits', async () => {
    await withConflict();
    const { session } = await open({}, false);
    const claude = claudeOn(session);
    const [asked] = await claude.command(RESOLVE, true);
    expect(asked?.type === 'command/rejected' && asked.problems[0]?.message).toMatch(NEVER);

    await claude.command(CREATE_CACHE, true);
    const [waiting] = await claude.command(RESOLVE);
    expect(waiting?.type === 'command/rejected' && waiting.problems[0]?.message).toMatch(NEVER);
    expect(session.snapshot.model.conflicts).toHaveLength(1);
  });
});

describe('deciding about a proposal', () => {
  it('refuses an acceptance of a revision Claude changed since, and shows it again', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [made] = await claude.command(CREATE_CACHE);
    const id = made?.type === 'proposal/made' ? made.proposal : '';
    const seen = shownTo(app.messages).at(-1)?.revision ?? -1;
    await claude.command(CREATE_QUEUE);
    const now = shownTo(app.messages).at(-1)?.revision ?? -1;
    expect(now).toBe(seen + 1);

    for (const changes of ['all', ['element:cache added']]) {
      const shownBefore = shownTo(app.messages).length;
      const [refused] = await fromApp(session, app, {
        type: 'proposal/accept',
        proposal: id,
        revision: seen,
        changes,
      });
      expect(refused).toMatchObject({
        type: 'command/rejected',
        problems: [{ message: 'The proposal changed since it was shown: review it again.' }],
      });
      // The app is shown the proposal as it is now, at the same revision.
      expect(shownTo(app.messages)).toHaveLength(shownBefore + 1);
      expect(shownTo(app.messages).at(-1)?.revision).toBe(now);
    }
    expect(session.snapshot).toEqual(testProject());
    expect(session.actions).toEqual([]);
    expect(session.proposalWaiting).toBeDefined();

    // A rebase after the person's action is a new revision too.
    await session.execute(RENAME_DB, 'user');
    expect(shownTo(app.messages).at(-1)?.revision).toBe(now + 1);
    const [stale] = await fromApp(session, app, {
      type: 'proposal/accept',
      proposal: id,
      revision: now,
      changes: 'all',
    });
    expect(stale?.type).toBe('command/rejected');

    const [accepted] = await fromApp(session, app, {
      type: 'proposal/accept',
      proposal: id,
      changes: 'all',
    });
    expect(accepted).toMatchObject({ type: 'proposal/closed', how: 'accepted' });
  });

  it('accepts every change as one action of Claude’s, saved and announced', async () => {
    const { session, log } = await open();
    const app = new FakeClient();
    const other = new FakeClient();
    session.connect(app);
    session.connect(other);
    const claude = claudeOn(session);
    const [made] = await claude.command(RENAME_API);
    await claude.command(CREATE_CACHE);
    await session.execute(RENAME_DB, 'user');
    const proposed = proposedFor(session.snapshot, app.messages);
    const id = made?.type === 'proposal/made' ? made.proposal : '';

    const answers = await fromApp(session, app, {
      type: 'proposal/accept',
      proposal: id,
      changes: 'all',
    });
    expect(answers).toEqual([
      {
        type: 'proposal/closed',
        proposal: id,
        how: 'accepted',
        accepted: ['element:cache added', 'element:api changed'].sort(),
        requestId: 'a1',
      },
    ]);
    // What the person did meanwhile stays, and the project is the proposed one.
    expect(session.snapshot).toEqual(proposed);
    expect(session.snapshot.model.elements.find((each) => each.id === 'db')?.name).toBe('Store');
    expect(session.actions.map(({ label, author }) => ({ label, author }))).toEqual([
      { label: expect.any(String) as unknown, author: 'user' },
      { label: expect.stringContaining('and 1 more') as unknown, author: 'claude' },
    ]);
    // On disk too, as the files of the project now.
    const reopened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    expect(reopened.ok && reopened.session.snapshot).toEqual(proposed);
    if (reopened.ok) await reopened.session.close();

    // Every app and Claude hear of the action, then that the proposal closed; only the app that
    // decided gets the request id.
    const changed = other.ofType('project/changed').at(-1);
    expect(changed).toMatchObject({ author: 'claude', kind: 'do' });
    expect(other.messages.at(-1)).toEqual({
      type: 'proposal/closed',
      proposal: id,
      how: 'accepted',
      accepted: expect.any(Array) as unknown,
    });
    expect(claude.messages.slice(-2).map((each) => each.type)).toEqual([
      'project/changed',
      'proposal/closed',
    ]);
    expect(session.proposalWaiting).toBeUndefined();
    expect(log.filter((each) => each.event === 'proposal').at(-1)).toEqual({
      event: 'proposal',
      kind: 'accepted',
      changes: 2,
    });

    // An undo takes the whole acceptance back, and does not bring the proposal back.
    await session.undo();
    expect(session.snapshot.model.elements.some((each) => each.id === 'cache')).toBe(false);
    expect(session.snapshot.model.elements.find((each) => each.id === 'api')?.name).toBe('API');
    expect(session.proposalWaiting).toBeUndefined();
    expect(app.messages.at(-1)?.type).not.toBe('proposal/shown');
  });

  it('accepts some changes, with what they need, and labels how many', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [made] = await claude.command(CREATE_CACHE);
    await claude.command(CREATE_QUEUE);
    const id = made?.type === 'proposal/made' ? made.proposal : '';
    const changes = shownTo(app.messages)
      .at(-1)
      ?.changes.map((each) => each.key);
    expect(changes).toEqual(['element:cache added', 'element:queue added']);

    const [closed] = await fromApp(session, app, {
      type: 'proposal/accept',
      proposal: id,
      changes: ['element:queue added'],
    });
    expect(closed).toMatchObject({ type: 'proposal/closed', how: 'accepted' });
    expect(closed?.type === 'proposal/closed' && closed.accepted).toEqual(['element:queue added']);
    const ids = session.snapshot.model.elements.map((each) => each.id);
    expect(ids).toContain('queue');
    expect(ids).not.toContain('cache');
    expect(session.actions.at(-1)).toMatchObject({
      author: 'claude',
      label: expect.stringContaining('(1 of 2 changes)') as unknown,
    });
  });

  it('refuses an acceptance that lacks what a change needs, and the proposal waits on', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [made] = await claude.command(CREATE_CACHE);
    await claude.command({
      type: 'create-relation',
      relation: {
        id: 'api-reads-cache',
        relationType: 'systems.reads-from',
        from: 'api',
        to: 'cache',
      },
    });
    const id = made?.type === 'proposal/made' ? made.proposal : '';
    const relation = shownTo(app.messages)
      .at(-1)
      ?.changes.find((each) => each.key.startsWith('relation:'));
    expect(relation?.needs).toContain('element:cache added');
    const [refused] = await fromApp(session, app, {
      type: 'proposal/accept',
      proposal: id,
      changes: [relation?.key],
    });
    expect(refused?.type).toBe('command/rejected');
    expect(session.snapshot).toEqual(testProject());
    expect(session.proposalWaiting).toBeDefined();
  });

  it('refuses a proposal whole: nothing changes, and it closes', async () => {
    const { session, log } = await open();
    const before = await filesIn(folder);
    const app = new FakeClient();
    const other = new FakeClient();
    session.connect(app);
    session.connect(other);
    const claude = claudeOn(session);
    const [made] = await claude.command(CREATE_CACHE);
    const id = made?.type === 'proposal/made' ? made.proposal : '';

    const answers = await fromApp(session, app, { type: 'proposal/refuse', proposal: id });
    expect(answers).toEqual([
      { type: 'proposal/closed', proposal: id, how: 'refused', requestId: 'a1' },
    ]);
    expect(other.messages.at(-1)).toEqual({
      type: 'proposal/closed',
      proposal: id,
      how: 'refused',
    });
    expect(claude.messages.at(-1)).toEqual({
      type: 'proposal/closed',
      proposal: id,
      how: 'refused',
    });
    expect(session.snapshot).toEqual(testProject());
    expect(session.actions).toEqual([]);
    expect(await filesIn(folder)).toEqual(before);
    expect(log.filter((each) => each.event === 'proposal').at(-1)).toMatchObject({
      kind: 'refused',
    });

    // The next command of Claude's opens another.
    const [next] = await claude.command(CREATE_QUEUE);
    expect(next?.type === 'proposal/made' && next.proposal).not.toBe(id);
  });

  it('refuses a decision about a proposal that no longer waits', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const [none] = await fromApp(session, app, {
      type: 'proposal/accept',
      proposal: 'proposal-1',
      changes: 'all',
    });
    expect(none?.type).toBe('command/rejected');
    const claude = claudeOn(session);
    await claude.command(CREATE_CACHE);
    const [other] = await fromApp(session, app, { type: 'proposal/refuse', proposal: 'not-it' });
    expect(other?.type).toBe('command/rejected');
    expect(session.proposalWaiting).toBeDefined();
  });

  it('lets Claude withdraw its own, but never accept or refuse it', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [made] = await claude.command(CREATE_CACHE);
    const id = made?.type === 'proposal/made' ? made.proposal : '';

    const [accept] = await claude.send({ type: 'proposal/accept', proposal: id, changes: 'all' });
    expect(accept?.type).toBe('command/rejected');
    const [refuse] = await claude.send({ type: 'proposal/refuse', proposal: id });
    expect(refuse?.type).toBe('command/rejected');
    expect(session.proposalWaiting).toBeDefined();

    const [withdrawn] = await claude.send({ type: 'proposal/withdraw' });
    expect(withdrawn).toEqual({
      type: 'proposal/closed',
      proposal: id,
      how: 'withdrawn',
      requestId: 'c4',
    });
    expect(app.messages.at(-1)).toEqual({
      type: 'proposal/closed',
      proposal: id,
      how: 'withdrawn',
    });
    expect(session.snapshot).toEqual(testProject());

    const [again] = await claude.send({ type: 'proposal/withdraw' });
    expect(again?.type).toBe('command/rejected');
  });
});

describe('when the program stops', () => {
  it('drops the proposal that waits, and says so', async () => {
    const { session, log, out } = await open();
    const before = await filesIn(folder);
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [made] = await claude.command(CREATE_CACHE);
    const heard: (number | undefined)[] = [];
    await session.close();
    opened.splice(opened.indexOf(session), 1);
    expect(app.messages.at(-1)).toEqual({
      type: 'proposal/closed',
      proposal: made?.type === 'proposal/made' ? made.proposal : '',
      how: 'dropped',
    });
    expect(out.at(-1)).toMatch(/proposal of 1 change was never accepted, so it is dropped/);
    expect(log.at(-1)).toEqual({ event: 'proposal', kind: 'dropped', changes: 1 });
    expect(await filesIn(folder)).toEqual(before);
    expect(heard).toEqual([]);
  });

  it('tells whoever listens when the last change joined, and when none waits', async () => {
    const heard: (number | undefined)[] = [];
    let now = 1000;
    const { session } = await open({ onProposal: (at) => heard.push(at), now: () => now });
    const app = new FakeClient();
    session.connect(app);
    const claude = claudeOn(session);
    const [made] = await claude.command(CREATE_CACHE);
    now = 2000;
    await claude.command(CREATE_QUEUE);
    expect(session.proposalWaiting).toBe(2000);
    await fromApp(session, app, {
      type: 'proposal/refuse',
      proposal: made?.type === 'proposal/made' ? made.proposal : '',
    });
    expect(heard).toEqual([1000, 2000, undefined]);
  });
});

describe('what the program says to an app about a proposal, in Spanish', () => {
  it('reads every reason it refuses a decision for in Spanish', async () => {
    const { session } = await open();
    const app = new FakeClient();
    session.connect(app);
    const said: string[] = [];
    const refusalOf = async (message: Record<string, unknown>) => {
      const answers = await fromApp(session, app, message);
      for (const answer of answers) {
        if (answer.type === 'command/rejected')
          said.push(...answer.problems.map((each) => each.message));
      }
    };
    await refusalOf({ type: 'proposal/refuse', proposal: 'proposal-9' });
    const claude = claudeOn(session);
    await claude.command(CREATE_CACHE);
    await claude.command({
      type: 'create-relation',
      relation: {
        id: 'api-reads-cache',
        relationType: 'systems.reads-from',
        from: 'api',
        to: 'cache',
      },
    });
    const id = shownTo(app.messages).at(-1)?.id ?? '';
    const relation = shownTo(app.messages)
      .at(-1)
      ?.changes.find((each) => each.key.startsWith('relation:'))?.key;
    await refusalOf({ type: 'proposal/refuse', proposal: 'not-it' });
    await refusalOf({ type: 'proposal/accept', proposal: id, revision: 0, changes: 'all' });
    await refusalOf({ type: 'proposal/accept', proposal: id, changes: [relation] });
    await refusalOf({ type: 'proposal/accept', proposal: id, changes: ['element:nothing added'] });

    expect(said).toHaveLength(5);
    expect(said.flatMap((message) => untranslatedParts('es', message))).toEqual([]);
  });
});

/**
 * The history list (protocol 5): every open app hears of each action the history keeps, with its
 * author and time and whether it is undone, and can undo or redo up to one of them.
 */
import * as fsp from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command, ListedAction, ServerMessage } from '@visual-anything/core';
import { formatFile } from '@visual-anything/schema/format';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, readText, testProject, writeProjectFolder, writeText } from './test-support';

const RENAME_API: Command = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } };
const RENAME_AGAIN: Command = { type: 'update-element', id: 'api', changes: { name: 'Edge' } };
const MOVE_CUSTOMER: Command = {
  type: 'set-positions',
  view: 'overview',
  positions: [{ element: 'customer', x: -300, y: 80, pinned: true }],
};

const RENAMED = 'Rename "API" to "Gateway"';
const RENAMED_AGAIN = 'Rename "Gateway" to "Edge"';
const MOVED = 'Move "Customer" in "Overview"';

let folder: string;
let clock: number;
const opened: Session[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-history-'));
  clock = Date.UTC(2026, 9, 24, 14, 30);
  await writeProjectFolder(folder, testProject());
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

/** Opens a session whose clock moves on a minute for each action it records. */
async function open(options: SessionOptions = {}): Promise<Session> {
  const result = await openSession(folder, {
    watch: false,
    now: () => (clock += 60_000),
    out: () => {},
    err: () => {},
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return result.session;
}

/** The lists an app got, each as the labels of its actions, with a mark on those undone. */
function lists(client: FakeClient): string[][] {
  return client
    .ofType('history/listed')
    .map(({ actions }) => actions.map(({ label, undone }) => (undone ? `(${label})` : label)));
}

/** The last list an app got. */
function last(client: FakeClient): ListedAction[] {
  return client.ofType('history/listed').at(-1)?.actions ?? [];
}

const undoTo = (requestId: string, to: number) => JSON.stringify({ type: 'undo', requestId, to });
const redoTo = (requestId: string, to: number) => JSON.stringify({ type: 'redo', requestId, to });

describe('the history list', () => {
  it('greets an app with the history after the project', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });

    session.connect(app);

    expect(app.messages.map((message) => message.type)).toEqual([
      'project/opened',
      'history/listed',
    ]);
    expect(last(app)).toEqual([]);
  });

  it('lists each action with its label, its author and the time it was done', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    const start = clock;

    await session.execute(RENAME_API, 'user');
    await session.execute(MOVE_CUSTOMER, 'claude');

    expect(last(app)).toEqual([
      { id: 1, label: RENAMED, author: 'user', time: start + 60_000, undone: false },
      { id: 2, label: MOVED, author: 'claude', time: start + 120_000, undone: false },
    ]);
    expect(session.actions).toEqual(last(app));
  });

  it('follows every change, after the change itself, to every app but never to Claude', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    const other = new FakeClient({ history: true });
    const claude = new FakeClient({ history: true });
    session.connect(app);
    session.connect(other);
    session.attachClaude(claude);

    await session.receive(
      app,
      JSON.stringify({ type: 'command', requestId: 'c1', command: RENAME_API }),
    );

    const types = (client: FakeClient) => client.messages.map((message) => message.type);
    expect(types(app)).toEqual([
      'project/opened',
      'history/listed',
      'project/changed',
      'history/listed',
    ]);
    expect(types(other)).toEqual(types(app));
    expect(types(claude)).toEqual(['project/opened', 'project/changed']);
  });

  it('marks what is undone, the next action to redo first, and keeps when each was done', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    await session.execute(RENAME_API, 'user');
    await session.execute(RENAME_AGAIN, 'claude');
    await session.execute(MOVE_CUSTOMER, 'user');
    const done = session.actions;

    await session.undo();
    await session.undo();

    expect(lists(app).at(-1)).toEqual([RENAMED, `(${RENAMED_AGAIN})`, `(${MOVED})`]);
    expect(last(app).map(({ id, time }) => ({ id, time }))).toEqual(
      done.map(({ id, time }) => ({ id, time })),
    );
    await session.redo();
    expect(lists(app).at(-1)).toEqual([RENAMED, RENAMED_AGAIN, `(${MOVED})`]);
  });

  it('starts over after a new action, which can no longer redo what was undone', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    await session.execute(RENAME_API, 'user');
    await session.execute(RENAME_AGAIN, 'user');
    await session.undo();

    await session.execute(MOVE_CUSTOMER, 'claude');

    expect(last(app).map(({ id, label, undone }) => ({ id, label, undone }))).toEqual([
      { id: 1, label: RENAMED, undone: false },
      { id: 3, label: MOVED, undone: false },
    ]);
  });

  it('sends nothing for a command that changes nothing, or one refused', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);

    await session.execute({ type: 'update-element', id: 'api', changes: { name: 'API' } }, 'user');
    await session.execute({ type: 'delete', elements: ['nothing'] }, 'user');
    await session.undo();

    expect(app.ofType('history/listed')).toHaveLength(1);
  });

  it('greets an app that connects later with the history as it is', async () => {
    const session = await open();
    await session.execute(RENAME_API, 'claude');
    await session.undo();
    const late = new FakeClient({ history: true });

    session.connect(late);

    expect(lists(late)).toEqual([[`(${RENAMED})`]]);
  });
});

describe('undo and redo up to an action', () => {
  let session: Session;
  let app: FakeClient;
  let other: FakeClient;
  let ids: number[];

  beforeEach(async () => {
    session = await open();
    app = new FakeClient({ history: true });
    other = new FakeClient({ history: true });
    session.connect(app);
    session.connect(other);
    await session.execute(RENAME_API, 'user');
    await session.execute(RENAME_AGAIN, 'claude');
    await session.execute(MOVE_CUSTOMER, 'user');
    ids = session.actions.map(({ id }) => id);
  });

  /** What each app heard after the actions above: the changes, their requests, and the lists. */
  const heard = (client: FakeClient, from: number) =>
    client.messages
      .slice(from)
      .map((message: ServerMessage) =>
        message.type === 'project/changed'
          ? `${message.kind} ${message.label}${message.requestId ? ` (${message.requestId})` : ''}`
          : message.type,
      );

  it('undoes one action at a time, newest first, whoever did each, up to and with that action', async () => {
    const from = app.messages.length;

    await session.receive(app, undoTo('u1', ids[1] as number));

    expect(heard(app, from)).toEqual([
      `undo ${MOVED}`,
      `undo ${RENAMED_AGAIN} (u1)`,
      'history/listed',
    ]);
    expect(heard(other, from)).toEqual([
      `undo ${MOVED}`,
      `undo ${RENAMED_AGAIN}`,
      'history/listed',
    ]);
    expect(lists(app).at(-1)).toEqual([RENAMED, `(${RENAMED_AGAIN})`, `(${MOVED})`]);
    expect(session.snapshot.model.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
    expect(await readText(folder, 'model.vamodel')).toContain('"Gateway"');
    expect(session.history).toEqual({
      undo: { label: RENAMED, author: 'user' },
      redo: { label: RENAMED_AGAIN, author: 'claude' },
    });
  });

  it('undoes only the newest action when asked up to it, as an undo does', async () => {
    await session.receive(app, undoTo('u1', ids[2] as number));

    expect(lists(app).at(-1)).toEqual([RENAMED, RENAMED_AGAIN, `(${MOVED})`]);
  });

  it('redoes one action at a time up to and with that action', async () => {
    await session.receive(app, undoTo('u1', ids[0] as number));
    const from = app.messages.length;

    await session.receive(app, redoTo('r1', ids[1] as number));

    expect(heard(app, from)).toEqual([
      `redo ${RENAMED}`,
      `redo ${RENAMED_AGAIN} (r1)`,
      'history/listed',
    ]);
    expect(lists(app).at(-1)).toEqual([RENAMED, RENAMED_AGAIN, `(${MOVED})`]);
    expect(session.snapshot.model.elements.find((each) => each.id === 'api')?.name).toBe('Edge');
  });

  it('refuses to undo up to an action that is undone or no longer kept, and changes nothing', async () => {
    await session.undo();
    const from = app.messages.length;

    await session.receive(app, undoTo('u1', ids[2] as number));
    await session.receive(app, undoTo('u2', 99));

    expect(app.messages.slice(from)).toEqual([
      {
        type: 'command/rejected',
        requestId: 'u1',
        problems: [
          {
            code: 'nothing-to-undo',
            message: 'That action is undone already, so nothing was undone.',
          },
        ],
      },
      {
        type: 'command/rejected',
        requestId: 'u2',
        problems: [
          {
            code: 'nothing-to-undo',
            message: 'That action is no longer in the history, so nothing was undone.',
          },
        ],
      },
    ]);
    expect(other.messages.slice(from)).toEqual([]);
  });

  it('refuses to redo up to an action that is not undone', async () => {
    const outcome = await session.redo(undefined, ids[0]);

    expect(outcome).toEqual({
      ok: false,
      problems: [
        { code: 'nothing-to-redo', message: 'That action is not undone, so nothing was redone.' },
      ],
    });
  });

  it('stops at the first step that cannot be saved, and lists what was undone', async () => {
    await session.close();
    opened.length = 0;
    await writeProjectFolder(folder, testProject());
    let renames = 0;
    const failing = await open({
      writer: {
        retryDelays: [],
        fs: {
          open: (path, flags) => fsp.open(path, flags),
          rename: (from, to) => {
            renames += 1;
            // The three actions and the first undo save; the second undo does not.
            return renames === 5
              ? Promise.reject(Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' }))
              : fsp.rename(from, to);
          },
          unlink: (path) => fsp.unlink(path),
          mkdir: (path, options) => fsp.mkdir(path, options),
        },
      },
    });
    const client = new FakeClient({ history: true });
    failing.connect(client);
    await failing.execute(RENAME_API, 'user');
    await failing.execute(RENAME_AGAIN, 'claude');
    await failing.execute(MOVE_CUSTOMER, 'user');
    const first = failing.actions[0]?.id as number;

    await failing.receive(client, undoTo('u1', first));

    expect(client.ofType('command/rejected')).toMatchObject([
      { requestId: 'u1', problems: [{ code: 'not-saved' }] },
    ]);
    expect(lists(client).at(-1)).toEqual([RENAMED, RENAMED_AGAIN, `(${MOVED})`]);
  });
});

describe('after a reload', () => {
  it('lists an empty history, and names new actions with ids not used before', async () => {
    const session = await open({ watch: { delay: 50 } });
    const app = new FakeClient({ history: true });
    session.connect(app);
    await session.execute(RENAME_API, 'user');
    const model = testProject().model;

    await writeText(
      folder,
      'model.vamodel',
      formatFile('model', {
        ...model,
        elements: model.elements.map((element) =>
          element.id === 'db' ? { ...element, name: 'Orders DB' } : element,
        ),
      }),
    );
    await expect.poll(() => app.ofType('project/reloaded'), { timeout: 5000 }).toHaveLength(1);

    expect(app.messages.at(-1)).toEqual({ type: 'history/listed', actions: [] });
    await session.execute(MOVE_CUSTOMER, 'user');
    expect(last(app).map(({ id }) => id)).toEqual([2]);
  });
});

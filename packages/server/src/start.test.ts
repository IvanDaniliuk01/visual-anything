import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION, type ServerMessage } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openPreferences } from './preferences';
import { openSession, type SessionClient } from './session';
import { StartingSession, startingOn } from './start';

let root: string;
let folder: string;
const opened: StartingSession[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'va-start-'));
  folder = join(root, 'new-project');
  await mkdir(join(folder, '.git'), { recursive: true });
});

afterEach(async () => {
  for (const each of opened.splice(0)) await each.close();
  await rm(root, { recursive: true, force: true });
});

/** An app that keeps what it is sent. */
function app(): SessionClient & { messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return { messages, send: (message) => messages.push(message) };
}

async function starting(): Promise<StartingSession> {
  const session = await startingOn(folder, (each) => openSession(each, { watch: false }));
  if (session === undefined) throw new Error('The folder is not empty.');
  opened.push(session);
  return session;
}

const create = (extra: object = {}) =>
  JSON.stringify({ type: 'start/create', requestId: 'r', ...extra });

describe('a program on a folder that holds no project yet', () => {
  it('starts only on a folder that holds nothing but dot entries', async () => {
    expect(
      await startingOn(join(root, 'missing'), () => Promise.reject(new Error())),
    ).toBeUndefined();
    await writeFile(join(root, 'notes.txt'), 'mine');
    expect(await startingOn(root, () => Promise.reject(new Error()))).toBeUndefined();
    expect(await starting()).toBeInstanceOf(StartingSession);
  });

  it('offers each app the samples, with the token for a page that opened with a launch code', async () => {
    const session = await starting();
    const first = app();
    session.connect(first, { token: 'secret' });
    expect(first.messages).toEqual([
      {
        type: 'start/offered',
        protocolVersion: PROTOCOL_VERSION,
        folder: 'new-project',
        samples: [
          { id: 'c4-architecture', name: 'Internet banking', packages: ['c4'] },
          { id: 'data-science-pipeline', name: 'Churn prediction', packages: ['data-science'] },
          { id: 'robot-arm', name: 'Pick-and-place arm', packages: ['physical-ai'] },
        ],
        token: 'secret',
      },
    ]);
    const second = app();
    session.connect(second);
    expect(second.messages[0]).not.toHaveProperty('token');
  });

  it('refuses commands until a project is started', async () => {
    const session = await starting();
    const client = app();
    session.connect(client);
    await session.receive(
      client,
      JSON.stringify({ type: 'command', requestId: 'c', command: { type: 'delete' } }),
    );
    expect(client.messages.at(-1)).toMatchObject({ type: 'command/rejected', requestId: 'c' });
    expect((await session.execute({ type: 'delete' }, 'claude')).ok).toBe(false);
  });

  it('starts a project from a sample, and every app connected meanwhile, and Claude, gets it', async () => {
    const session = await starting();
    const first = app();
    const second = app();
    const claude = app();
    session.connect(first);
    session.connect(second);
    session.attachClaude(claude);
    await session.receive(first, create({ sample: 'c4-architecture' }));
    for (const each of [first, second, claude]) {
      const message = each.messages.find((m) => m.type === 'project/opened');
      expect(message?.type === 'project/opened' && message.project.project.name).toBe(
        'Internet banking',
      );
    }
    expect((await readdir(folder)).sort()).toEqual([
      '.git',
      'model.vamodel',
      'project.vaproject',
      'scenarios',
      'views',
    ]);
    const started = await session.started;
    expect(session.snapshot).toBe(started.snapshot);
    // From then on it is the project's session.
    const later = app();
    session.connect(later);
    expect(later.messages[0]?.type).toBe('project/opened');
    await session.receive(first, create());
    expect(first.messages.filter((m) => m.type === 'command/rejected')).toHaveLength(1);
  });

  it('starts an empty project with the names the app gives', async () => {
    const session = await starting();
    const client = app();
    session.connect(client);
    await session.receive(
      client,
      create({ names: { project: 'Mi tienda', view: 'Vista general' } }),
    );
    const started = await session.started;
    expect(started.snapshot.project.name).toBe('Mi tienda');
    expect(started.snapshot.views.map((view) => view.name)).toEqual(['Vista general']);
  });

  it('refuses a sample it does not hold, and a folder that took files meanwhile', async () => {
    const session = await starting();
    const client = app();
    session.connect(client);
    await session.receive(client, create({ sample: 'my-systems' }));
    expect(client.messages.at(-1)).toMatchObject({
      type: 'command/rejected',
      problems: [{ message: 'There is no sample "my-systems" to start from.' }],
    });
    await writeFile(join(folder, 'notes.txt'), 'mine');
    await session.receive(client, create());
    expect(client.messages.at(-1)).toMatchObject({
      type: 'command/rejected',
      problems: [{ message: expect.stringContaining('already holds files') as string }],
    });
    expect(session.session).toBeUndefined();
  });

  it('changes preferences from the start screen, for every app waiting', async () => {
    const { store } = await openPreferences(null);
    const session = new StartingSession(folder, {
      open: (each) => openSession(each, { watch: false }),
      preferences: store,
    });
    opened.push(session);
    const first = app();
    const second = app();
    session.connect(first);
    session.connect(second);
    await session.receive(
      first,
      JSON.stringify({ type: 'preferences/set', requestId: 'p', changes: { theme: 'dark' } }),
    );
    expect(first.messages.at(-1)).toMatchObject({
      type: 'preferences/changed',
      requestId: 'p',
      preferences: { theme: 'dark' },
    });
    expect(second.messages.at(-1)).toMatchObject({
      type: 'preferences/changed',
      preferences: { theme: 'dark' },
    });
  });
});

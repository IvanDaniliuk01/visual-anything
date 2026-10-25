/** The session's side of preferences (ADR-0032): the greeting, changes, and what they never touch. */
import * as fsp from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PREFERENCES,
  applyPreferenceChanges,
  type Command,
  type PreferenceChanges,
  type Preferences,
} from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreferencesStore, SetPreferencesResult } from './preferences';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, filesIn, testProject, writeProjectFolder } from './test-support';
import type { WriterFs } from './writer';

const RENAME_API: Command = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } };

let folder: string;
const opened: Session[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-session-preferences-'));
  await writeProjectFolder(folder, testProject());
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function open(options: SessionOptions = {}): Promise<Session> {
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return result.session;
}

/** A store in memory that records what it is asked, and answers as it is told. */
class FakeStore implements PreferencesStore {
  preferences: Preferences = { ...DEFAULT_PREFERENCES, theme: 'dark' };
  readonly asked: PreferenceChanges[] = [];
  answer: (preferences: Preferences) => SetPreferencesResult = (preferences) => ({
    preferences,
    saved: true,
  });

  current(): Preferences {
    return { ...this.preferences };
  }

  set(changes: PreferenceChanges): Promise<SetPreferencesResult> {
    this.asked.push(changes);
    this.preferences = applyPreferenceChanges(this.preferences, changes);
    return Promise.resolve(this.answer(this.current()));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function setMessage(changes: unknown, requestId = 'request-1'): string {
  return JSON.stringify({ type: 'preferences/set', requestId, changes });
}

describe('the greeting', () => {
  it('sends the preferences after the project, when the program keeps them', async () => {
    const store = new FakeStore();
    const session = await open({ preferences: store });
    const client = new FakeClient();
    session.connect(client);
    expect(client.messages.map((message) => message.type)).toEqual([
      'project/opened',
      'preferences/changed',
    ]);
    expect(client.ofType('preferences/changed')).toEqual([
      { type: 'preferences/changed', preferences: store.current() },
    ]);
  });

  it('is unchanged when the program keeps no preferences', async () => {
    const session = await open();
    const client = new FakeClient();
    session.connect(client);
    expect(client.messages.map((message) => message.type)).toEqual(['project/opened']);
  });
});

describe('preferences/set', () => {
  it('changes the preferences and tells every app, the one that asked with its request id', async () => {
    const store = new FakeStore();
    const session = await open({ preferences: store });
    const asking = new FakeClient();
    const other = new FakeClient();
    session.connect(asking);
    session.connect(other);

    await session.receive(asking, setMessage({ theme: 'light', recentColors: ['#dcebff'] }));

    expect(store.asked).toEqual([{ theme: 'light', recentColors: ['#DCEBFF'] }]);
    const preferences = { ...DEFAULT_PREFERENCES, theme: 'light', recentColors: ['#DCEBFF'] };
    expect(asking.ofType('preferences/changed').at(-1)).toEqual({
      type: 'preferences/changed',
      preferences,
      requestId: 'request-1',
    });
    expect(other.ofType('preferences/changed').at(-1)).toEqual({
      type: 'preferences/changed',
      preferences,
    });
  });

  it('changes the language, as any other preference', async () => {
    const store = new FakeStore();
    const session = await open({ preferences: store });
    const client = new FakeClient();
    session.connect(client);

    await session.receive(client, setMessage({ language: 'es' }));

    expect(store.asked).toEqual([{ language: 'es' }]);
    expect(client.ofType('preferences/changed').at(-1)).toMatchObject({
      type: 'preferences/changed',
      preferences: { language: 'es' },
      requestId: 'request-1',
    });
  });

  it('refuses changes it cannot use, naming each problem, and changes nothing', async () => {
    const store = new FakeStore();
    const session = await open({ preferences: store });
    const client = new FakeClient();
    session.connect(client);
    const before = client.messages.length;

    await session.receive(client, setMessage({ theme: 'sepia', zoom: 2 }));

    expect(client.messages.slice(before)).toEqual([
      {
        type: 'command/rejected',
        requestId: 'request-1',
        problems: [
          {
            code: 'invalid-command',
            message: '"theme" must be "system", "light" or "dark", not "sepia".',
          },
          { code: 'invalid-command', message: '"zoom" is not a preference.' },
        ],
      },
    ]);
    expect(store.asked).toEqual([]);
  });

  it('refuses a message whose changes are not an object, as any unreadable message', async () => {
    const session = await open({ preferences: new FakeStore() });
    const client = new FakeClient();
    await session.receive(client, setMessage('dark'));
    expect(client.ofType('command/rejected')).toEqual([
      {
        type: 'command/rejected',
        requestId: 'request-1',
        problems: [
          { code: 'invalid-command', message: 'The message has no preferences to change.' },
        ],
      },
    ]);
  });

  it('refuses every change when the program keeps no preferences', async () => {
    const session = await open();
    const client = new FakeClient();
    await session.receive(client, setMessage({ theme: 'dark' }));
    expect(client.messages).toEqual([
      {
        type: 'command/rejected',
        requestId: 'request-1',
        problems: [{ code: 'not-saved', message: 'This program keeps no preferences.' }],
      },
    ]);
  });

  it('says to the app that asked when the change could not be saved', async () => {
    const store = new FakeStore();
    store.answer = (preferences) => ({ preferences, saved: false, reason: 'EACCES' });
    const session = await open({ preferences: store });
    const asking = new FakeClient();
    const other = new FakeClient();
    session.connect(asking);
    session.connect(other);

    await session.receive(asking, setMessage({ grid: true }));

    expect(asking.messages.at(-1)).toEqual({
      type: 'notice',
      level: 'warning',
      message:
        'Your preference applies until Visual Anything stops: it could not be saved (EACCES).',
    });
    expect(other.ofType('notice')).toEqual([]);
    expect(other.ofType('preferences/changed').at(-1)?.preferences.grid).toBe(true);
  });

  it('never enters the history, never has an author and writes no project file', async () => {
    const session = await open({ preferences: new FakeStore() });
    const client = new FakeClient();
    session.connect(client);
    await session.execute(RENAME_API, 'user');
    const history = session.history;
    const files = await filesIn(folder);

    await session.receive(client, setMessage({ theme: 'light' }));
    await session.idle();

    expect(session.history).toEqual(history);
    expect(await filesIn(folder)).toEqual(files);
    expect(client.ofType('project/changed')).toHaveLength(1);
  });

  it('is answered while a save of the project is still waiting', async () => {
    let release: () => void = () => {};
    let saving = false;
    const slow: WriterFs = {
      open: (path, flags) => fsp.open(path, flags),
      rename: async (from, to) => {
        saving = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await fsp.rename(from, to);
      },
      unlink: (path) => fsp.unlink(path),
      mkdir: (path, options) => fsp.mkdir(path, options),
    };
    const session = await open({ preferences: new FakeStore(), writer: { fs: slow } });
    const client = new FakeClient();
    session.connect(client);

    const renaming = session.execute(RENAME_API, 'user');
    await expect.poll(() => saving).toBe(true);
    await session.receive(client, setMessage({ theme: 'light' }, 'request-2'));

    expect(client.ofType('preferences/changed').at(-1)).toMatchObject({ requestId: 'request-2' });
    expect(client.ofType('project/changed')).toEqual([]);
    release();
    await renaming;
    expect(client.ofType('project/changed')).toHaveLength(1);
  });
});

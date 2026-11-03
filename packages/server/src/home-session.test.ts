/**
 * The program at home (ADR 0093): the Projects screen's offer, opening a project, starting one,
 * refusing folders it cannot open, the recent list, and going back home.
 */
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION, type ServerMessage } from '@visual-anything/core';
import { translateMessage, untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HomeSession,
  NO_PROJECT_FOR_CLAUDE,
  NO_PROJECT_OPEN,
  type HomeOptions,
} from './home-session';
import { PREFERENCES_FILE, openPreferences, type PreferencesStore } from './preferences';
import { openSession, type Session, type SessionClient } from './session';
import { testProject, writeProjectFolder } from './test-support';

let root: string;
let projects: string;
let preferences: PreferencesStore;
const homes: HomeSession[] = [];

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-home-session-')));
  projects = join(root, 'Documents', 'Visual Anything');
  preferences = (await openPreferences(join(root, 'config'))).store;
});

afterEach(async () => {
  for (const each of homes.splice(0)) await each.close();
  await preferences.close();
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

/** An app that keeps what it is sent. */
function app(): SessionClient & { messages: ServerMessage[]; last: (type: string) => unknown } {
  const messages: ServerMessage[] = [];
  return {
    messages,
    send: (message) => messages.push(message),
    last: (type) => messages.filter((each) => each.type === type).at(-1),
  };
}

function home(options: Partial<HomeOptions> = {}) {
  const opened: Session[] = [];
  const closed: string[] = [];
  const session = new HomeSession({
    projectsFolder: projects,
    open: (folder) => openSession(folder, { watch: false }),
    preferences,
    onOpened: (each) => {
      opened.push(each);
    },
    onClosed: (folder) => {
      closed.push(folder);
    },
    ...options,
  });
  homes.push(session);
  return { session, opened, closed };
}

const message = (type: string, extra: object = {}) =>
  JSON.stringify({ type, requestId: 'r', ...extra });

/** Waits for an app to be sent a message of a type, `count` of them. */
async function sent(client: { messages: ServerMessage[] }, type: string, count = 1) {
  await expect
    .poll(() => client.messages.filter((each) => each.type === type).length)
    .toBeGreaterThanOrEqual(count);
  return client.messages.filter((each) => each.type === type).at(count - 1);
}

async function shop(name = 'shop'): Promise<string> {
  const folder = join(projects, name);
  await writeProjectFolder(folder, testProject());
  return folder;
}

describe('a program at home', () => {
  it('greets each app with the projects folder, its projects, the recent ones and the samples', async () => {
    const folder = await shop();
    await mkdir(join(projects, 'notes'));
    const { session } = home();
    const client = app();
    session.connect(client, { token: 'secret' });
    expect(client.messages[0]?.type).toBe('preferences/changed');
    const offered = await sent(client, 'home/offered');
    expect(offered).toMatchObject({
      type: 'home/offered',
      protocolVersion: PROTOCOL_VERSION,
      folder: projects,
      projects: [{ path: folder, name: testProject().project.name }],
      recent: [],
      token: 'secret',
    });
    expect((offered as { samples: unknown[] }).samples.length).toBeGreaterThan(0);
    expect(session.atHome).toBe(true);
  });

  it('opens a project for every app, joins it to the recent list, and hears of it', async () => {
    const folder = await shop();
    const { session, opened } = home();
    const first = app();
    const second = app();
    session.connect(first);
    session.connect(second);
    await sent(second, 'home/offered');
    await session.receive(first, message('home/open', { path: folder }));
    expect(first.last('project/opened')).toMatchObject({ project: { project: { name: 'Shop' } } });
    expect(second.last('project/opened')).toBeDefined();
    expect(opened.map((each) => each.folder)).toEqual([folder]);
    expect(preferences.recentProjects?.()).toEqual([folder]);
    const file = JSON.parse(await readFile(join(root, 'config', PREFERENCES_FILE), 'utf8')) as {
      recentProjects: string[];
    };
    expect(file.recentProjects).toEqual([folder]);
    // Its commands go to the project now.
    await session.receive(
      first,
      message('command', {
        command: { type: 'update-element', id: 'api', changes: { name: 'G' } },
      }),
    );
    expect(second.last('project/changed')).toBeDefined();
  });

  it('refuses a folder it cannot open, and says why in words the app reads in Spanish', async () => {
    await mkdir(join(projects, 'notes'), { recursive: true });
    await writeFile(join(projects, 'notes', 'a.txt'), 'x');
    const { session } = home();
    const client = app();
    session.connect(client);
    for (const path of ['relative/shop', join(projects, 'missing'), join(projects, 'notes')]) {
      await session.receive(client, message('home/open', { path }));
      const refused = client.last('command/rejected') as { problems: { message: string }[] };
      expect(refused.problems[0]?.message).toBeDefined();
      const said = refused.problems[0]?.message ?? '';
      expect(untranslatedParts('es', said), translateMessage('es', said)).toEqual([]);
    }
    expect(session.atHome).toBe(true);
  });

  it('refuses commands, and refuses a project another program has open', async () => {
    const folder = await shop();
    const { session } = home({
      elsewhere: () =>
        Promise.resolve(
          'Visual Anything already runs on “Shop” in another program, so it opened a tab there.',
        ),
    });
    const client = app();
    session.connect(client);
    await session.receive(client, message('undo'));
    expect(client.last('command/rejected')).toMatchObject({
      problems: [{ message: NO_PROJECT_OPEN }],
    });
    await session.receive(client, message('home/open', { path: folder }));
    expect(client.last('command/rejected')).toMatchObject({
      problems: [{ message: expect.stringMatching(/opened a tab there/) as string }],
    });
    expect(session.atHome).toBe(true);
  });

  it('shows the start screen of an empty folder, and opens the project started there', async () => {
    const empty = join(root, 'empty');
    await mkdir(empty);
    const { session, opened } = home();
    const client = app();
    session.connect(client);
    await session.receive(client, message('home/open', { path: empty }));
    expect(client.last('start/offered')).toMatchObject({ folder: 'empty' });
    await session.receive(client, message('start/create', { names: { view: 'Vista general' } }));
    await sent(client, 'project/opened');
    await expect.poll(() => opened.length).toBe(1);
    expect(preferences.recentProjects?.()).toEqual([empty]);
  });

  it('starts a new project in a subfolder of the projects folder named from its name', async () => {
    const { session } = home();
    const client = app();
    session.connect(client);
    await session.receive(
      client,
      message('home/create', { name: 'Auditoría: médica', view: 'Vista' }),
    );
    expect(client.last('project/opened')).toMatchObject({
      project: { project: { name: 'Auditoría: médica' }, views: [{ name: 'Vista' }] },
    });
    expect(await readdir(projects)).toEqual(['Auditoría médica']);
  });

  it('starts one from a sample, renamed, beside one of the same name', async () => {
    await shop('Bank');
    const { session } = home();
    const client = app();
    session.connect(client);
    await session.receive(
      client,
      message('home/create', { name: 'Bank', sample: 'c4-architecture' }),
    );
    expect(client.last('project/opened')).toMatchObject({
      project: { project: { name: 'Bank', packages: ['c4'] } },
    });
    expect((await readdir(projects)).sort()).toEqual(['Bank', 'Bank 2']);
    await session.receive(client, message('home/close'));
    await session.receive(client, message('home/create', { name: 'x', sample: 'nothing' }));
    expect(client.last('command/rejected')).toMatchObject({
      problems: [{ message: 'There is no sample "nothing" to start from.' }],
    });
  });

  it('goes back home once the writes landed, for every app, and tells Claude', async () => {
    const folder = await shop();
    const { session, closed } = home();
    const first = app();
    const second = app();
    const claude = app();
    session.connect(first);
    session.connect(second);
    session.attachClaude(claude);
    expect(claude.last('project/closed')).toEqual({
      type: 'project/closed',
      message: NO_PROJECT_FOR_CLAUDE,
    });
    await session.receive(first, message('home/open', { path: folder }));
    expect(claude.last('project/opened')).toBeDefined();
    const rename = session.receive(
      first,
      message('command', {
        requestId: 'c',
        command: { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
      }),
    );
    const back = session.receive(second, message('home/close', { requestId: 'h' }));
    await Promise.all([rename, back]);
    expect(first.last('project/changed')).toBeDefined();
    const model = await readFile(join(folder, 'model.vamodel'), 'utf8');
    expect(model).toContain('Gateway');
    expect(second.last('home/offered')).toMatchObject({
      requestId: 'h',
      recent: [{ path: folder }],
    });
    expect(first.last('home/offered')).not.toHaveProperty('requestId');
    expect(claude.messages.filter((each) => each.type === 'project/closed')).toHaveLength(2);
    expect(closed).toEqual([folder]);
    expect(session.atHome).toBe(true);
    // Opening again greets everyone with the project, Claude too.
    await session.receive(first, message('home/open', { path: folder }));
    expect(claude.messages.filter((each) => each.type === 'project/opened')).toHaveLength(2);
  });

  it('marks a recent project whose folder is gone as missing, and forgets it when asked', async () => {
    const folder = await shop();
    const { session } = home();
    const client = app();
    session.connect(client);
    await session.receive(client, message('home/open', { path: folder }));
    await session.receive(client, message('home/close'));
    await rm(folder, { recursive: true, force: true });
    await session.receive(client, message('home/close', { requestId: 'again' }));
    expect(client.last('home/offered')).toMatchObject({
      requestId: 'again',
      recent: [{ path: folder, missing: true }],
    });
    await session.receive(client, message('home/forget', { requestId: 'f', path: folder }));
    expect(client.last('home/offered')).toMatchObject({ requestId: 'f', recent: [] });
    expect(preferences.recentProjects?.()).toEqual([]);
  });

  it('refuses to open a second project while one is open', async () => {
    const folder = await shop();
    const { session } = home();
    const client = app();
    session.connect(client);
    await session.receive(client, message('home/open', { path: folder }));
    await session.receive(client, message('home/open', { path: folder }));
    expect(client.last('command/rejected')).toMatchObject({
      problems: [{ message: 'A project is open here already.' }],
    });
  });
});

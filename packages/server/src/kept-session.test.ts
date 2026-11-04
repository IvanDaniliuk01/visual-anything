import { chmod, mkdtemp, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentContext, type RuntimeContext } from './claude/discovery';
import {
  KEPT_SESSION_FOR,
  KEPT_SESSION_MOST,
  SESSIONS_ENV,
  keepSession,
  keptSessionName,
  readKeptSession,
  resumableSession,
  sessionKey,
  sessionsFolder,
  type KeptSession,
} from './kept-session';
import { createToken } from './security';

describe('sessionsFolder', () => {
  it('is the runtime folder, beside Claude’s record', () => {
    expect(sessionsFolder('darwin', {}, '/Users/ana')).toBe(
      '/Users/ana/Library/Application Support/Visual Anything/run',
    );
    expect(sessionsFolder('linux', { XDG_STATE_HOME: '/tmp/state' }, '/home/ana')).toBe(
      '/tmp/state/visual-anything/run',
    );
  });

  it('takes an absolute folder from the environment, as the container names one', () => {
    expect(
      sessionsFolder('linux', { [SESSIONS_ENV]: '/data/preferences/sessions' }, '/home/ana'),
    ).toBe('/data/preferences/sessions');
    expect(sessionsFolder('linux', { [SESSIONS_ENV]: 'sessions' }, '/home/ana')).toBe(
      '/home/ana/.local/state/visual-anything/run',
    );
  });
});

describe('sessionKey and keptSessionName', () => {
  it('tells home from a project folder', () => {
    expect(sessionKey({ home: '/data/projects' })).toBe('home:/data/projects');
    expect(sessionKey({ project: 'C:\\Projects\\Shop' })).toBe('project:C:/Projects/Shop');
    expect(sessionKey({ home: '/p' })).not.toBe(sessionKey({ project: '/p' }));
  });

  it('names the file after its key, the same however the folder is spelt on Windows', () => {
    const name = keptSessionName('project:C:/Projects/Shop', 'win32');
    expect(name).toMatch(/^session-[0-9a-f]{24}\.json$/);
    expect(keptSessionName('project:c:/projects/shop', 'win32')).toBe(name);
    expect(keptSessionName('project:/p/shop', 'linux')).not.toBe(
      keptSessionName('project:/p/Shop', 'linux'),
    );
  });
});

describe('resumableSession', () => {
  const kept: KeptSession = {
    format: 1,
    key: 'home:/data/projects',
    token: createToken(),
    port: 47700,
    madeAt: '2026-11-04T10:00:00.000Z',
    keptAt: '2026-11-04T11:00:00.000Z',
  };

  it('resumes on the port it had, when no port or that one is asked for', () => {
    expect(resumableSession(kept, 0)).toEqual({ token: kept.token, port: 47700 });
    expect(resumableSession(kept, 47700)).toEqual({ token: kept.token, port: 47700 });
  });

  it('does not resume on another port, nor without a kept session', () => {
    expect(resumableSession(kept, 47701)).toBeUndefined();
    expect(resumableSession(undefined, 0)).toBeUndefined();
  });
});

describe('kept sessions', () => {
  let profile: string;
  let folder: string;
  let context: RuntimeContext;
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  const session = (overrides: Partial<KeptSession> = {}): KeptSession => ({
    format: 1,
    key: 'project:/projects/shop',
    token: createToken(),
    port: 51234,
    madeAt: new Date(now - 60 * 60_000).toISOString(),
    keptAt: new Date(now - 60_000).toISOString(),
    ...overrides,
  });

  beforeEach(async () => {
    profile = await realpath(await mkdtemp(join(tmpdir(), 'va-sessions-')));
    folder = join(profile, 'run');
    context = { ...currentContext(), home: profile };
  });

  afterEach(async () => {
    await rm(profile, { recursive: true, force: true, maxRetries: 10 });
  });

  it('keeps a session and reads it back by its key', async () => {
    const shop = session({ project: '/projects/shop' });
    await keepSession(folder, shop, context);
    expect(await readKeptSession(folder, shop.key, { context, now })).toEqual(shop);
    expect(
      await readKeptSession(folder, 'project:/projects/other', { context, now }),
    ).toBeUndefined();
    expect(await readdir(folder)).toEqual([keptSessionName(shop.key, context.platform)]);
  });

  it('keeps it readable by its user only, where files have owners', async () => {
    if (process.platform === 'win32') return;
    await keepSession(folder, session(), context);
    const file = join(folder, keptSessionName(session().key, context.platform));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(folder)).mode & 0o777).toBe(0o700);
  });

  it('reads nothing when there is no folder yet', async () => {
    expect(await readKeptSession(join(folder, 'missing'), 'home:/p', { context, now })).toBe(
      undefined,
    );
  });

  it('forgets a session kept more than a day ago, or made more than 30 days ago', async () => {
    await keepSession(
      folder,
      session({ keptAt: new Date(now - KEPT_SESSION_FOR - 1).toISOString() }),
      context,
    );
    expect(await readKeptSession(folder, session().key, { context, now })).toBeUndefined();
    await keepSession(
      folder,
      session({ madeAt: new Date(now - KEPT_SESSION_MOST - 1).toISOString() }),
      context,
    );
    expect(await readKeptSession(folder, session().key, { context, now })).toBeUndefined();
  });

  it.each([
    ['not JSON', '{'],
    ['a later format', JSON.stringify({ ...session(), format: 2 })],
    ['a token of another form', JSON.stringify({ ...session(), token: 'short' })],
    ['a port that is no port', JSON.stringify({ ...session(), port: 0 })],
    ['another key', JSON.stringify({ ...session(), key: 'project:/projects/other' })],
    ['a time that is no date', JSON.stringify({ ...session(), keptAt: 'yesterday' })],
    ['a project that is not text', JSON.stringify({ ...session(), project: 4 })],
  ])('reads a file that holds %s as no session', async (_case, text) => {
    await keepSession(folder, session(), context);
    await writeFile(join(folder, keptSessionName(session().key, context.platform)), text, {
      mode: 0o600,
    });
    expect(await readKeptSession(folder, session().key, { context, now })).toBeUndefined();
  });

  it('trusts no file other users may read', async () => {
    if (process.platform === 'win32') return;
    await keepSession(folder, session(), context);
    await chmod(join(folder, keptSessionName(session().key, context.platform)), 0o644);
    expect(await readKeptSession(folder, session().key, { context, now })).toBeUndefined();
  });

  it('refuses a folder outside the profile on Windows', async () => {
    const elsewhere = await realpath(await mkdtemp(join(tmpdir(), 'va-elsewhere-')));
    try {
      await expect(
        keepSession(elsewhere, session(), { platform: 'win32', home: profile }),
      ).rejects.toThrow(/could read the session token/);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });
});

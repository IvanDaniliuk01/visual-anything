/**
 * The program's log, with `--log <file>` (ADR-0016's clarification of W46): one JSON line per action
 * done, undone, redone or joined, per refusal with its codes, per app or Claude attached or gone, and
 * per change of the project's files on disk; never a token, a launch code, a credential, a preference
 * or anything a file holds.
 */
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LAUNCH_PARAM, type Command } from '@visual-anything/core';
import { formatFile } from '@visual-anything/schema/format';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listProgramRecords } from './claude/discovery';
import { USAGE, parseCommandLine, runCommand, type CommandEnvironment } from './command';
import { ProgramLog, logLine, type ProgramEvent } from './program-log';
import { openSession, type Session } from './session';
import { FakeClient, openLiveClient, testProject, writeProjectFolder } from './test-support';

let folder: string;
let project: string;
const opened: Session[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-log-'));
  project = join(folder, 'shop');
  await mkdir(project);
  await writeProjectFolder(project, testProject());
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

const RENAME: Command = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } };
const UNKNOWN: Command = { type: 'update-element', id: 'ghost', changes: { name: 'Nobody' } };

describe('a line of the log', () => {
  it('is the time, then the event, as one line of JSON', () => {
    expect(logLine({ event: 'stopped' }, Date.UTC(2026, 9, 26, 9, 30))).toBe(
      '{"time":"2026-10-26T09:30:00.000Z","event":"stopped"}\n',
    );
  });

  it('is appended to the file, after what it held', async () => {
    const path = join(folder, 'program.log');
    await writeFile(path, 'before\n');
    const log = await ProgramLog.open(path, { now: () => 0 });
    log.write({ event: 'stopped' });
    await log.close();
    expect(await readFile(path, 'utf8')).toBe(
      'before\n{"time":"1970-01-01T00:00:00.000Z","event":"stopped"}\n',
    );
  });

  it('cannot be opened in a folder that is not there', async () => {
    await expect(ProgramLog.open(join(folder, 'missing', 'program.log'))).rejects.toThrow();
  });
});

describe('what the session logs', { timeout: 20_000 }, () => {
  async function open(events: ProgramEvent[], watch = false): Promise<Session> {
    const result = await openSession(project, {
      watch: watch ? { delay: 20 } : false,
      out: () => {},
      err: () => {},
      log: (event) => events.push(event),
    });
    if (!result.ok) throw new Error('The project does not open.');
    opened.push(result.session);
    return result.session;
  }

  it('logs each action done, undone and redone, and each refusal with its codes only', async () => {
    const events: ProgramEvent[] = [];
    const session = await open(events);
    await session.execute(RENAME, 'claude');
    await session.execute(UNKNOWN, 'user');
    await session.undo();
    await session.redo();
    await session.redo();
    expect(events).toEqual([
      {
        event: 'action',
        kind: 'done',
        id: 1,
        author: 'claude',
        label: 'Rename "API" to "Gateway"',
        operations: 1,
        created: [],
      },
      {
        event: 'refused',
        request: 'command',
        author: 'user',
        command: 'update-element',
        codes: ['unknown-element'],
      },
      expect.objectContaining({ event: 'action', kind: 'undone', id: 1, author: 'claude' }),
      expect.objectContaining({ event: 'action', kind: 'redone', id: 1, author: 'claude' }),
      { event: 'refused', request: 'redo', author: 'user', codes: ['nothing-to-redo'] },
    ]);
  });

  it('logs a placement that joins the action it places, under that action', async () => {
    const events: ProgramEvent[] = [];
    const session = await open(events);
    const app = new FakeClient();
    session.connect(app);
    await session.execute(
      {
        type: 'create-element',
        element: { id: 'queue', component: 'systems.service', name: 'Queue' },
        containers: [{ container: 'system', relationType: 'systems.is-part-of' }],
      },
      'claude',
    );
    await session.receive(
      app,
      JSON.stringify({
        type: 'command',
        requestId: 'place',
        joins: 1,
        command: {
          type: 'set-positions',
          view: 'overview',
          positions: [{ element: 'queue', container: 'system', x: 200, y: 40 }],
        },
      }),
    );
    expect(events.filter((each) => each.event === 'action')).toEqual([
      expect.objectContaining({ kind: 'done', id: 1, author: 'claude', label: 'Create "Queue"' }),
      expect.objectContaining({ kind: 'joined', id: 1, author: 'claude', label: 'Create "Queue"' }),
    ]);
  });

  it('logs apps and Claude attaching and going, with how many are attached', async () => {
    const events: ProgramEvent[] = [];
    const session = await open(events);
    const goApp = session.connect(new FakeClient());
    const goClaude = session.attachClaude(new FakeClient());
    goApp();
    goApp();
    goClaude();
    expect(events).toEqual([
      { event: 'attached', who: 'app', apps: 1, claudes: 0 },
      { event: 'attached', who: 'claude', apps: 1, claudes: 1 },
      { event: 'gone', who: 'app', apps: 0, claudes: 1 },
      { event: 'gone', who: 'claude', apps: 0, claudes: 0 },
    ]);
  });

  it('logs the files changed on disk by path, and whether the project was reloaded from them', async () => {
    const events: ProgramEvent[] = [];
    const session = await open(events, true);
    const changed = { ...testProject().project, name: 'Shop, renamed' };
    await writeFile(join(project, 'project.vaproject'), formatFile('project', changed));
    await expect
      .poll(() => events.find((each) => each.event === 'files-changed'), { timeout: 10_000 })
      .toEqual({ event: 'files-changed', files: ['project.vaproject'], reloaded: true });
    expect(session.snapshot.project.name).toBe('Shop, renamed');
    // Never what the file holds.
    expect(JSON.stringify(events)).not.toContain('renamed');
  });
});

describe('--log on the command line', { timeout: 30_000 }, () => {
  it('is read with its file, said in the usage, and refused empty', () => {
    expect(parseCommandLine(['shop', '--log', 'program.log'])).toMatchObject({
      ok: true,
      value: { folder: 'shop', log: 'program.log' },
    });
    const plain = parseCommandLine(['shop']);
    expect(plain.ok && plain.value).not.toHaveProperty('log');
    expect(parseCommandLine(['--log', '']).ok).toBe(false);
    expect(USAGE).toContain('--log <file>');
  });

  it('logs what the program does, and never the token, the launch code or the credential', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const signals = new EventEmitter();
    const runtime = join(folder, 'runtime');
    const appDir = join(folder, 'dist');
    await mkdir(appDir);
    await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
    const environment: CommandEnvironment = {
      cwd: folder,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      openBrowser: () => Promise.resolve(),
      signals,
      runtimeFolder: runtime,
      appSource: () => ({ mode: 'static', dir: appDir }),
    };
    const exit = runCommand(['shop', '--no-open', '--log', 'program.log'], environment);
    const launchLine = async () => {
      await expect
        .poll(() => out.some((line) => line.includes(`#${LAUNCH_PARAM}=`)), { timeout: 15_000 })
        .toBe(true);
      return out.find((line) => line.includes(`#${LAUNCH_PARAM}=`)) ?? '';
    };
    const line = await launchLine();
    const url = new URL(line.slice(line.indexOf('http://')));
    const code = new URLSearchParams(url.hash.slice(1)).get(LAUNCH_PARAM) ?? '';
    const app = await openLiveClient(Number(url.port), code, 'launch');
    await expect.poll(() => app.messages.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const first = app.messages[0];
    const token = first?.type === 'project/opened' ? (first.token ?? '') : '';
    expect(token).not.toBe('');
    const [record] = await listProgramRecords(runtime);
    const credential = record?.credential ?? '';
    expect(credential).not.toBe('');

    app.send({ type: 'command', requestId: 'r1', command: RENAME });
    app.send({ type: 'command', requestId: 'r2', command: UNKNOWN });
    app.send({ type: 'undo', requestId: 'r3' });
    await expect
      .poll(() => app.messages.filter((each) => 'requestId' in each).length, { timeout: 5_000 })
      .toBe(3);
    await app.close();
    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);

    const text = await readFile(join(folder, 'program.log'), 'utf8');
    const lines = text
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as ProgramEvent & { time: string });
    expect(lines.map((line) => line.event)).toEqual([
      'started',
      'attached',
      'action',
      'refused',
      'action',
      'gone',
      'stopped',
    ]);
    expect(lines.every((line) => !Number.isNaN(Date.parse(line.time)))).toBe(true);
    for (const secret of [token, code, credential]) expect(text).not.toContain(secret);
  });
});

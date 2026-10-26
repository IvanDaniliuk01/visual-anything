/**
 * `visual-anything new`, and the program run on a folder that holds no project yet, end to end: the
 * start screen's offer over the live connection, and the project an app starts there (ADR 0051).
 */
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LAUNCH_PARAM,
  LIVE_PATH,
  TOKEN_PARAM,
  decodeServerMessage,
  type ServerMessage,
} from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { runCommand, type CommandEnvironment } from './command';
import { entryOf } from './main';
import { NEW_USAGE, parseNewCommandLine, runNewCommand } from './new-command';
import { loadProject } from './project';
import type { AppSource } from './server';
import { textOf } from './test-support';

const STARTING = { timeout: 10_000 };

let root: string;
let appDir: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'va-new-command-'));
  appDir = join(root, 'dist');
  await mkdir(appDir);
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  const signals = new EventEmitter();
  const environment: CommandEnvironment = {
    cwd: root,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    openBrowser: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    signals,
    appSource: (): AppSource => ({ mode: 'static', dir: appDir }),
  };
  return { out, err, opened, signals, environment };
}

describe('parseNewCommandLine', () => {
  it('takes one folder, a sample, and the options of opening it', () => {
    expect(parseNewCommandLine(['bank', '--from', 'c4-architecture', '--no-open'])).toEqual({
      ok: true,
      value: {
        folder: 'bank',
        from: 'c4-architecture',
        open: ['bank', '--no-open'],
        help: false,
      },
    });
    expect(parseNewCommandLine(['shop', '--port', '8123', '--dev'])).toEqual({
      ok: true,
      value: { folder: 'shop', open: ['shop', '--port', '8123', '--dev'], help: false },
    });
  });

  it('refuses no folder, two, and a sample it does not hold', () => {
    expect(parseNewCommandLine([])).toEqual({
      ok: false,
      message: 'Give the folder to start the new project in.',
    });
    expect(parseNewCommandLine(['a', 'b']).ok).toBe(false);
    expect(parseNewCommandLine(['a', '--from', 'my-systems'])).toEqual({
      ok: false,
      message:
        'There is no sample "my-systems"; the samples are c4-architecture, data-science-pipeline and robot-arm.',
    });
    expect(parseNewCommandLine(['a', '--view', 'x']).ok).toBe(false);
  });

  it('is the entry point of `visual-anything new`', () => {
    expect(entryOf(['new', 'bank', '--from', 'c4-architecture'])).toEqual({
      kind: 'new',
      argv: ['bank', '--from', 'c4-architecture'],
    });
  });
});

describe('runNewCommand', () => {
  it('writes the sample into a new folder, then opens it with the options given', async () => {
    const { out, environment } = harness();
    const asked: (readonly string[])[] = [];
    const code = await runNewCommand(
      ['bank', '--from', 'c4-architecture', '--no-open'],
      environment,
      (argv) => {
        asked.push(argv);
        return Promise.resolve(0);
      },
    );
    expect(code).toBe(0);
    expect(asked).toEqual([['bank', '--no-open']]);
    expect(out.at(-1)).toMatch(
      /^Started "Internet banking" in .*bank, from the sample c4-architecture\.$/,
    );
    const loaded = await loadProject(join(root, 'bank'));
    expect(loaded.ok && loaded.project.project.packages).toEqual(['c4']);
  });

  it('writes an empty project without --from', async () => {
    const { environment } = harness();
    expect(await runNewCommand(['empty'], environment, () => Promise.resolve(0))).toBe(0);
    const loaded = await loadProject(join(root, 'empty'));
    expect(loaded.ok && loaded.project.project).toEqual({
      schemaVersion: 1,
      name: 'empty',
      packages: ['systems'],
    });
  });

  it('refuses a folder that holds files, and opens nothing', async () => {
    const { err, environment } = harness();
    await mkdir(join(root, 'taken'));
    await writeFile(join(root, 'taken', 'notes.txt'), 'mine');
    let ran = false;
    const code = await runNewCommand(['taken'], environment, () => {
      ran = true;
      return Promise.resolve(0);
    });
    expect(code).toBe(1);
    expect(ran).toBe(false);
    expect(err.join('\n')).toContain('already holds files');
    expect(await readdir(join(root, 'taken'))).toEqual(['notes.txt']);
  });

  it('shows its help, and its usage for arguments it does not understand', async () => {
    const help = harness();
    expect(await runNewCommand(['--help'], help.environment)).toBe(0);
    expect(help.out).toEqual([NEW_USAGE]);
    const wrong = harness();
    expect(await runNewCommand([], wrong.environment)).toBe(2);
    expect(wrong.err.at(-1)).toBe(NEW_USAGE);
  });
});

/** Opens the live connection as the page does, and keeps every message it gets. */
async function connect(url: URL, query: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${url.port}${LIVE_PATH}?${query}`, {
    origin: url.origin,
  });
  const messages: ServerMessage[] = [];
  socket.on('message', (data) => messages.push(decodeServerMessage(textOf(data))));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return { socket, messages };
}

describe('the program on a folder that holds no project yet', { timeout: 30_000 }, () => {
  it('offers the start screen behind the launch code, then serves the project an app starts', async () => {
    const folder = join(root, 'fresh');
    await mkdir(join(folder, '.git'), { recursive: true });
    const { out, opened, signals, environment } = harness();
    const exit = runCommand([folder], environment);
    await expect.poll(() => opened, STARTING).toHaveLength(1);
    expect(out.join('\n')).toContain('holds no project yet: start one in the browser');

    const url = new URL(opened[0] ?? '');
    const code = new URLSearchParams(url.hash.slice(1)).get(LAUNCH_PARAM) ?? '';
    const first = await connect(url, `${LAUNCH_PARAM}=${code}`);
    await expect.poll(() => first.messages.length, STARTING).toBeGreaterThan(0);
    const offered = first.messages[0];
    expect(offered?.type).toBe('start/offered');
    const token = offered?.type === 'start/offered' ? (offered.token ?? '') : '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    // A second tab of the session waits on the start screen too.
    const second = await connect(url, `${TOKEN_PARAM}=${token}`);
    await expect.poll(() => second.messages.length, STARTING).toBeGreaterThan(0);
    expect(second.messages[0]?.type).toBe('start/offered');

    first.socket.send(
      JSON.stringify({ type: 'start/create', requestId: 'r', sample: 'data-science-pipeline' }),
    );
    for (const tab of [first, second]) {
      await expect
        .poll(() => tab.messages.some((m) => m.type === 'project/opened'), STARTING)
        .toBe(true);
    }
    const project = first.messages.find((m) => m.type === 'project/opened');
    expect(project?.type === 'project/opened' && project.project.project.name).toBe(
      'Churn prediction',
    );
    await expect
      .poll(() => out.some((line) => line.startsWith('Started "Churn prediction"')))
      .toBe(true);
    expect((await readdir(folder)).sort()).toEqual([
      '.git',
      'model.vamodel',
      'project.vaproject',
      'scenarios',
      'views',
    ]);

    first.socket.close();
    second.socket.close();
    signals.emit('SIGINT');
    expect(await exit).toBe(0);
  });

  it('refuses --view there, since there is no view yet', async () => {
    const folder = join(root, 'fresh-view');
    await mkdir(folder);
    const { err, environment } = harness();
    expect(await runCommand([folder, '--view', 'overview', '--no-open'], environment)).toBe(2);
    expect(err.join('\n')).toContain('holds no project yet, so it has no view to open');
  });
});

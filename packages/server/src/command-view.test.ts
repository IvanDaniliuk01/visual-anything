/**
 * `visual-anything open <folder> --view <id> --select <id>` (ADR-0030's addendum of 2026-10-25): every
 * launch address the program opens or prints carries the view state, beside its launch code, and the
 * code still works once.
 */
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAUNCH_PARAM, LIVE_PATH, readViewState } from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USAGE, parseCommandLine, runCommand, type CommandEnvironment } from './command';
import { entryOf } from './main';
import type { AppSource } from './server';
import { openLive } from './test-support';

const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url));
const SAMPLE = 'examples/my-systems';
/** Opening the sample takes a while the first time, and longer on a loaded machine. */
const STARTING = { timeout: 10_000 };

let appDir: string;

beforeAll(async () => {
  appDir = await mkdtemp(join(tmpdir(), 'va-command-view-'));
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

/** Runs the command line as `visual-anything` would, recording what it prints and opens. */
function run(argv: readonly string[], keys?: CommandEnvironment['keys']) {
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  const signals = new EventEmitter();
  const environment: CommandEnvironment = {
    cwd: REPOSITORY,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    openBrowser: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    signals,
    appSource: (): AppSource => ({ mode: 'static', dir: appDir }),
    ...(keys === undefined ? {} : { keys }),
  };
  const entry = entryOf(argv);
  const exit = runCommand(entry.argv, environment);
  const launches = async (count = 1) => {
    const lines = () => out.filter((line) => line.includes(`#${LAUNCH_PARAM}=`));
    await expect.poll(() => lines().length, STARTING).toBe(count);
    return lines().map((line) => new URL(line.slice(line.indexOf('http://'))));
  };
  return { out, err, opened, signals, exit, launches };
}

describe('parseCommandLine', () => {
  it('takes the view, and what to select there, given again or as a list', () => {
    expect(
      parseCommandLine([
        SAMPLE,
        '--view',
        'system-overview',
        '--select',
        'patient',
        '--select',
        'a,b',
      ]),
    ).toMatchObject({
      ok: true,
      value: {
        folder: SAMPLE,
        state: { view: 'system-overview', select: ['patient', 'a', 'b'] },
      },
    });
    expect(parseCommandLine([SAMPLE])).toEqual({
      ok: true,
      value: { folder: SAMPLE, port: 0, open: true, dev: false, stopWhenIdle: false, help: false },
    });
  });

  it('refuses a selection without its view, and what is not an id', () => {
    expect(parseCommandLine(['--select', 'patient'])).toEqual({
      ok: false,
      message: '--select needs --view, the view to select in.',
    });
    expect(parseCommandLine(['--view', 'system overview'])).toEqual({
      ok: false,
      message: '--view and --select take ids: "system overview" is not an id.',
    });
    expect(parseCommandLine(['--view', 'v', '--select', 'a', '--select', 'a'])).toEqual({
      ok: false,
      message: '--view and --select take ids: "a" is named twice in select.',
    });
  });

  it('says so in its usage', () => {
    expect(USAGE).toContain('visual-anything [open] [folder] [--view <id> [--select <id>]...]');
  });
});

describe('visual-anything open <folder> --view <id>', { timeout: 20_000 }, () => {
  it('prints a launch address that carries the view state, and works once', async () => {
    const { opened, signals, exit, launches } = run([
      'open',
      SAMPLE,
      '--view',
      'system-overview',
      '--select',
      'appointments-api',
      '--no-open',
    ]);
    const [url] = await launches();
    if (url === undefined) throw new Error('No launch address was printed.');
    expect(opened).toEqual([]);
    expect(url.hash).toMatch(
      new RegExp(
        `^#${LAUNCH_PARAM}=[A-Za-z0-9_-]{22}&view=system-overview&select=appointments-api$`,
      ),
    );
    expect(readViewState(url.hash)).toEqual({
      ok: true,
      state: { view: 'system-overview', select: ['appointments-api'] },
    });
    const code = new URLSearchParams(url.hash.slice(1)).get(LAUNCH_PARAM) ?? '';
    const outcome = await openLive(Number(url.port), {
      path: `${LIVE_PATH}?${LAUNCH_PARAM}=${code}`,
      origin: url.origin,
    });
    expect(outcome.open).toBe(true);
    if (outcome.open) outcome.socket.close();
    signals.emit('SIGTERM');
    await expect(exit).resolves.toBe(0);
  });

  it('opens the browser at it, and every new tab from the terminal too', async () => {
    let onKey: ((key: string) => void) | undefined;
    const { opened, signals, exit } = run([SAMPLE, '--view', 'system-overview'], {
      listen: (listener) => {
        onKey = listener;
        return () => {
          onKey = undefined;
        };
      },
    });
    await expect.poll(() => opened, STARTING).toHaveLength(1);
    await expect.poll(() => onKey !== undefined, STARTING).toBe(true);
    onKey?.('o');
    await expect.poll(() => opened, STARTING).toHaveLength(2);
    for (const each of opened) expect(new URL(each).hash).toMatch(/&view=system-overview$/);
    signals.emit('SIGTERM');
    await expect(exit).resolves.toBe(0);
  });

  it('refuses a view or a selection the project does not hold, and starts nothing', async () => {
    const { err, opened, exit } = run([SAMPLE, '--view', 'security', '--no-open']);
    await expect(exit).resolves.toBe(2);
    expect(err).toEqual([
      'Could not open "My systems" there:',
      '  The project has no view "security".',
    ]);
    expect(opened).toEqual([]);

    const second = run([SAMPLE, '--view', 'system-overview', '--select', 'ghost', '--no-open']);
    await expect(second.exit).resolves.toBe(2);
    expect(second.err).toEqual([
      'Could not open "My systems" there:',
      '  Nothing in the view "System overview" has the id "ghost".',
    ]);
  });
});

describe('entryOf', () => {
  it('runs the local program for open, with the arguments after it', () => {
    expect(entryOf(['open', SAMPLE, '--view', 'v'])).toEqual({
      kind: 'program',
      argv: [SAMPLE, '--view', 'v'],
    });
    expect(entryOf(['./open'])).toEqual({ kind: 'program', argv: ['./open'] });
  });
});

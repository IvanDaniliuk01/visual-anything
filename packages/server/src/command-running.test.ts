/**
 * `visual-anything open <folder> --view <id> --select <id>` while a program already runs on that
 * folder (ADR-0044): it starts no second program, but asks the running one, through the interface
 * Claude's `open_app` uses, to open a tab at the view state.
 */
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAUNCH_PARAM, PROTOCOL_VERSION } from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listProgramRecords, writeProgramRecord } from './claude/discovery';
import { runCommand, type CommandEnvironment } from './command';
import { entryOf } from './main';
import type { AppSource } from './server';

const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url));
const SAMPLE = 'examples/my-systems';
/** Opening the sample takes a while the first time, and longer on a loaded machine. */
const STARTING = { timeout: 15_000 };
const SLOW = { timeout: 30_000 };

let scratch: string;
let appDir: string;
let runtime: string;

beforeAll(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'va-command-running-')));
  appDir = join(scratch, 'dist');
  runtime = join(scratch, 'run');
  await mkdir(appDir);
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true, maxRetries: 10 });
});

/** Runs a command line as `visual-anything` would, recording what it prints and opens. */
function run(argv: readonly string[]) {
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
    runtimeFolder: runtime,
  };
  const exit = runCommand(entryOf(argv).argv, environment);
  /** The address the program serves the app at, once it runs. */
  const address = async () => {
    const running = () => out.find((line) => line.startsWith('Visual Anything is running at '));
    await expect.poll(running, STARTING).toBeDefined();
    return (running() ?? '').slice('Visual Anything is running at '.length);
  };
  return { out, err, opened, signals, exit, address };
}

describe('visual-anything open while a program runs on the folder', () => {
  it(
    'opens a tab in the running program at the view state, and starts no other',
    SLOW,
    async () => {
      const first = run([SAMPLE, '--no-open']);
      const address = await first.address();
      try {
        const second = run([
          'open',
          SAMPLE,
          '--view',
          'system-overview',
          '--select',
          'appointments-api',
        ]);
        await expect(second.exit).resolves.toBe(0);
        expect(second.opened).toEqual([]);
        expect(second.out).toContain(
          `Visual Anything already runs on "My systems" at ${address}, so it opens a new tab there.`,
        );
        expect(second.out.join('\n')).not.toMatch(/launch=|token/);

        await expect.poll(() => first.opened.length).toBe(1);
        const url = new URL(first.opened[0] ?? '');
        expect(`${url.origin}/`).toBe(address);
        const fragment = new URLSearchParams(url.hash.slice(1));
        expect(fragment.get(LAUNCH_PARAM)).toMatch(/^[\w-]{16,}$/);
        expect(fragment.get('view')).toBe('system-overview');
        expect(fragment.get('select')).toBe('appointments-api');
        expect(await listProgramRecords(runtime)).toHaveLength(1);
      } finally {
        first.signals.emit('SIGINT');
        await expect(first.exit).resolves.toBe(0);
      }
    },
  );

  it(
    'with --no-open, prints the running program’s view address and opens nothing',
    SLOW,
    async () => {
      const first = run([SAMPLE, '--no-open']);
      const address = await first.address();
      try {
        const second = run([SAMPLE, '--view', 'system-overview', '--no-open']);
        await expect(second.exit).resolves.toBe(0);
        expect(second.out.join('\n')).toContain(`${address}#view=system-overview`);
        expect(second.out.join('\n')).not.toMatch(/launch=|token/);
        expect(first.opened).toEqual([]);
      } finally {
        first.signals.emit('SIGINT');
        await expect(first.exit).resolves.toBe(0);
      }
    },
  );

  it(
    'refuses what the project does not hold, with exit code 2, and opens nothing',
    SLOW,
    async () => {
      const first = run([SAMPLE, '--no-open']);
      await first.address();
      try {
        const second = run(['open', SAMPLE, '--view', 'nowhere']);
        await expect(second.exit).resolves.toBe(2);
        expect(second.err).toEqual([
          'Could not open "My systems" there:',
          '  The project has no view "nowhere".',
        ]);
        expect(first.opened).toEqual([]);
      } finally {
        first.signals.emit('SIGINT');
        await expect(first.exit).resolves.toBe(0);
      }
    },
  );

  it('says that --dev and --port apply only to a program that starts', SLOW, async () => {
    const first = run([SAMPLE, '--no-open']);
    await first.address();
    try {
      const second = run([SAMPLE, '--no-open', '--dev', '--port', '1']);
      await expect(second.exit).resolves.toBe(0);
      expect(second.err).toEqual([
        '--dev and --port apply only to a Visual Anything that starts; stop the one running first to use them.',
      ]);
    } finally {
      first.signals.emit('SIGINT');
      await expect(first.exit).resolves.toBe(0);
    }
  });

  it('starts a program of its own when the record names one that is gone', SLOW, async () => {
    await writeProgramRecord(runtime, {
      format: 1,
      protocolVersion: PROTOCOL_VERSION,
      pid: 2 ** 22 + 12345,
      port: 1,
      folder: (await realpath(join(REPOSITORY, SAMPLE))).replaceAll('\\', '/'),
      credential: 'x'.repeat(43),
      startedAt: new Date(Date.now() - 1000).toISOString(),
    });
    const program = run([SAMPLE, '--no-open']);
    await program.address();
    program.signals.emit('SIGINT');
    await expect(program.exit).resolves.toBe(0);
    expect(program.out.join('\n')).not.toMatch(/already runs/);
  });
});

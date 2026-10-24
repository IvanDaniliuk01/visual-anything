/** The program's preferences end to end (ADR-0032): the file, the address it opens and the live connection. */
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PREFERENCES, LAUNCH_PARAM, THEME_PARAM } from '@visual-anything/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCommand, type CommandEnvironment } from './command';
import { PREFERENCES_FILE } from './preferences';
import type { AppSource } from './server';
import { openLiveClient } from './test-support';

const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url));
const SAMPLE = 'examples/my-systems';

let appDir: string;
let preferences: string;

beforeAll(async () => {
  appDir = await mkdtemp(join(tmpdir(), 'va-command-app-'));
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

beforeEach(async () => {
  preferences = await mkdtemp(join(tmpdir(), 'va-command-preferences-'));
});

afterEach(async () => {
  await rm(preferences, { recursive: true, force: true, maxRetries: 10 });
});

/** Runs the program on the sample with preferences kept in the test's own folder. */
function run(overrides: Partial<CommandEnvironment> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const signals = new EventEmitter();
  const environment: CommandEnvironment = {
    cwd: REPOSITORY,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    openBrowser: () => Promise.resolve(),
    signals,
    appSource: (): AppSource => ({ mode: 'static', dir: appDir }),
    preferences: { folder: preferences },
    ...overrides,
  };
  const exit = runCommand([SAMPLE, '--no-open'], environment);
  const printedUrl = async () => {
    // The launch address, which carries the theme beside its launch code.
    const launch = (line: string) => line.includes(`#${LAUNCH_PARAM}=`);
    await expect.poll(() => out.some(launch)).toBe(true);
    const line = out.find(launch) ?? '';
    return new URL(line.slice(line.indexOf('http://')));
  };
  const stop = async () => {
    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
  };
  return { out, err, printedUrl, stop };
}

function fragmentOf(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.slice(1));
}

describe('the address the program opens', () => {
  it.each(['dark', 'light'] as const)('carries the theme chosen: %s', async (theme) => {
    await writeFile(join(preferences, PREFERENCES_FILE), JSON.stringify({ theme }));
    const { printedUrl, stop } = run();
    const fragment = fragmentOf(await printedUrl());
    expect(fragment.get(THEME_PARAM)).toBe(theme);
    expect(fragment.get(LAUNCH_PARAM)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    await stop();
  });

  it('carries no theme for a person who matches the system', async () => {
    const { printedUrl, stop } = run();
    expect([...fragmentOf(await printedUrl()).keys()]).toEqual([LAUNCH_PARAM]);
    await stop();
  });
});

describe('a preferences file that cannot be read', () => {
  it('prints one warning and the program runs with the defaults', async () => {
    const file = join(preferences, PREFERENCES_FILE);
    await writeFile(file, '{ broken');
    const { err, printedUrl, stop } = run();
    await printedUrl();
    expect(err).toEqual([
      `Warning: Your preferences in ${file.replaceAll('\\', '/')} could not be read (it is not JSON), so the defaults apply; the file is left as it is until you change a preference.`,
    ]);
    await stop();
    expect(await readFile(file, 'utf8')).toBe('{ broken');
  });

  it('prints the warning about where preferences are kept', async () => {
    const { err, printedUrl, stop } = run({
      preferences: { folder: preferences, warning: 'VISUAL_ANYTHING_PREFERENCES is ignored.' },
    });
    await printedUrl();
    expect(err).toEqual(['Warning: VISUAL_ANYTHING_PREFERENCES is ignored.']);
    await stop();
  });
});

describe('preferences over the live connection', () => {
  it('greets the app with them, and keeps a change in the file after the program stops', async () => {
    const nested = join(preferences, 'Visual Anything');
    await mkdir(nested);
    const { printedUrl, stop } = run({ preferences: { folder: nested } });
    const url = await printedUrl();
    const code = fragmentOf(url).get(LAUNCH_PARAM) ?? '';
    const app = await openLiveClient(Number(url.port), code, 'launch');

    await expect
      .poll(() => app.messages.map((message) => message.type))
      .toEqual(['project/opened', 'preferences/changed']);
    expect(app.messages[1]).toEqual({
      type: 'preferences/changed',
      preferences: DEFAULT_PREFERENCES,
    });

    app.send({ type: 'preferences/set', requestId: 'request-1', changes: { theme: 'dark' } });
    await expect.poll(() => app.messages.length).toBe(3);
    expect(app.messages[2]).toEqual({
      type: 'preferences/changed',
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' },
      requestId: 'request-1',
    });
    await app.close();
    await stop();

    expect(JSON.parse(await readFile(join(nested, PREFERENCES_FILE), 'utf8'))).toEqual({
      schemaVersion: 1,
      ...DEFAULT_PREFERENCES,
      theme: 'dark',
    });
    const again = run({ preferences: { folder: nested } });
    expect(fragmentOf(await again.printedUrl()).get(THEME_PARAM)).toBe('dark');
    await again.stop();
  });
});

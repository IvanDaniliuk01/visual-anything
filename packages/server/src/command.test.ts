import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_PATH, TOKEN_PARAM, decodeServerMessage } from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USAGE, parseCommandLine, runCommand, type CommandEnvironment } from './command';
import type { AppSource } from './server';
import { openLive, send } from './test-support';

const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url));
const SAMPLE = 'examples/my-systems';

let folder: string;
let appDir: string;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-command-'));
  appDir = join(folder, 'dist');
  await mkdir(appDir);
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** A command environment that records what the program prints and opens, with signals to send. */
function harness(overrides: Partial<CommandEnvironment> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  const appSources: boolean[] = [];
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
    appSource: (dev): AppSource => {
      appSources.push(dev);
      return { mode: 'static', dir: appDir };
    },
    ...overrides,
  };
  /** The address the program printed, once it runs. */
  const printedUrl = async () => {
    await expect.poll(() => out.some((line) => line.includes('http://'))).toBe(true);
    const line = out.find((printed) => printed.includes('http://')) ?? '';
    return new URL(line.slice(line.indexOf('http://')));
  };
  return { out, err, opened, appSources, signals, environment, printedUrl };
}

describe('parseCommandLine', () => {
  it('opens the current folder on any free port and opens the browser by default', () => {
    expect(parseCommandLine([])).toEqual({
      ok: true,
      value: { folder: '.', port: 0, open: true, dev: false, help: false },
    });
  });

  it('takes the folder, the port, --no-open and --dev', () => {
    expect(parseCommandLine([SAMPLE, '--port', '8080', '--no-open', '--dev'])).toEqual({
      ok: true,
      value: { folder: SAMPLE, port: 8080, open: false, dev: true, help: false },
    });
  });

  it.each([
    ['--port=0', 0],
    ['--port=65535', 65535],
    ['--port=080', 80],
  ])('reads %s as port %i', (option, port) => {
    expect(parseCommandLine([option])).toMatchObject({ ok: true, value: { port } });
  });

  it.each(['abc', '-1', '65536', '1.5', '', ' 80', '0x50', '1e3', '+80', '８０'])(
    'refuses the port %j',
    (port) => {
      const parsed = parseCommandLine([`--port=${port}`]);
      expect(parsed).toEqual({
        ok: false,
        message: `--port takes an integer from 0 to 65535, not ${JSON.stringify(port)}.`,
      });
    },
  );

  it('refuses --port without a value', () => {
    expect(parseCommandLine(['--port']).ok).toBe(false);
  });

  it('refuses an option it does not know', () => {
    expect(parseCommandLine(['--verbose']).ok).toBe(false);
  });

  it('refuses a value for --no-open or --dev', () => {
    expect(parseCommandLine(['--no-open=false']).ok).toBe(false);
    expect(parseCommandLine(['--dev=yes']).ok).toBe(false);
  });

  it('refuses more than one folder', () => {
    expect(parseCommandLine(['one', 'two'])).toEqual({
      ok: false,
      message: 'Give at most one project folder, not 2: one two.',
    });
  });

  it.each(['--help', '-h'])('takes %s', (option) => {
    expect(parseCommandLine([option])).toMatchObject({ ok: true, value: { help: true } });
  });
});

describe('runCommand', () => {
  it('opens the browser at a URL whose fragment carries the token, and stops on SIGINT', async () => {
    const { opened, signals, environment } = harness();
    const exit = runCommand([SAMPLE], environment);

    await expect.poll(() => opened).toHaveLength(1);
    const url = new URL(opened[0] ?? '');
    expect(url.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(url.pathname).toBe('/');
    expect(url.search).toBe('');
    const token = new URLSearchParams(url.hash.slice(1)).get(TOKEN_PARAM) ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const outcome = await openLive(Number(url.port), {
      path: `${LIVE_PATH}?${TOKEN_PARAM}=${token}`,
      origin: url.origin,
    });
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    const message = decodeServerMessage(outcome.firstMessage);
    expect(message.type === 'project/opened' && message.project.project.name).toBe('My systems');
    outcome.socket.close();

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
    await expect(send(Number(url.port))).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('prints the project name and the whole URL, token included', async () => {
    const { out, opened, signals, environment } = harness();
    const exit = runCommand([SAMPLE], environment);

    await expect.poll(() => opened).toHaveLength(1);
    expect(out.some((line) => line.includes('"My systems"'))).toBe(true);
    expect(out.some((line) => line.endsWith(opened[0] ?? '-'))).toBe(true);

    signals.emit('SIGTERM');
    await expect(exit).resolves.toBe(0);
  });

  it('does not open the browser with --no-open', async () => {
    const { opened, signals, environment, printedUrl } = harness();
    const exit = runCommand([SAMPLE, '--no-open'], environment);

    const url = await printedUrl();
    expect(url.hash).toMatch(new RegExp(`^#${TOKEN_PARAM}=[A-Za-z0-9_-]{43}$`));
    expect(opened).toEqual([]);

    signals.emit('SIGTERM');
    await expect(exit).resolves.toBe(0);
  });

  it('listens on the port given with --port', async () => {
    const port = await freePort();
    const { signals, environment, printedUrl } = harness();
    const exit = runCommand([SAMPLE, '--no-open', '--port', String(port)], environment);

    expect((await printedUrl()).port).toBe(String(port));

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
  });

  it('takes the app from its sources with --dev', async () => {
    const { appSources, signals, environment, printedUrl } = harness();
    const exit = runCommand([SAMPLE, '--no-open', '--dev'], environment);

    await printedUrl();
    expect(appSources).toEqual([true]);

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
  });

  it('opens the folder it runs in when given none', async () => {
    const { out, signals, environment, printedUrl } = harness({
      cwd: join(REPOSITORY, SAMPLE),
    });
    const exit = runCommand(['--no-open'], environment);

    await printedUrl();
    expect(out.some((line) => line.includes('"My systems"'))).toBe(true);

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
  });

  it('keeps running when the browser cannot be opened', async () => {
    const { err, signals, environment, printedUrl } = harness({
      openBrowser: () => Promise.reject(new Error('no browser')),
    });
    const exit = runCommand([SAMPLE], environment);

    await printedUrl();
    await expect
      .poll(() => err)
      .toEqual(['Could not open the browser (no browser); open the address above by hand.']);

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
  });

  it('prints one line per error and exits with 1, without opening the browser', async () => {
    const broken = join(folder, 'broken');
    await mkdir(join(broken, 'views'), { recursive: true });
    await writeFile(
      join(broken, 'model.vamodel'),
      JSON.stringify({
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: [],
        relations: [],
      }),
    );
    await writeFile(join(broken, 'views', 'overview.vaview'), '{ "id": ');
    const { err, opened, environment } = harness();

    await expect(runCommand([broken], environment)).resolves.toBe(1);

    expect(err).toHaveLength(3);
    expect(err[0]).toBe(`Could not open the project in ${broken.replaceAll('\\', '/')}:`);
    expect(err[1]).toBe('.: The folder has no .vaproject file; a project has exactly one.');
    expect(err[2]).toMatch(/^views\/overview\.vaview: Not valid JSON: /);
    expect(opened).toEqual([]);
  });

  it('exits with 2 and prints the usage for arguments it does not understand', async () => {
    const { err, opened, environment } = harness();

    await expect(runCommand(['--port', 'abc'], environment)).resolves.toBe(2);

    expect(err).toEqual(['--port takes an integer from 0 to 65535, not "abc".', USAGE]);
    expect(opened).toEqual([]);
  });

  it('prints the usage for --help', async () => {
    const { out, environment } = harness();

    await expect(runCommand(['--help'], environment)).resolves.toBe(0);

    expect(out).toEqual([USAGE]);
  });

  it('exits with 1 when the port is in use', async () => {
    const taken = await listening();
    const port = portOf(taken);
    const { err, opened, environment } = harness();

    await expect(runCommand([SAMPLE, '--port', String(port)], environment)).resolves.toBe(1);

    expect(err).toEqual([
      `Port ${port} is already in use. Choose another with --port, or leave --port out to use any free port.`,
    ]);
    expect(opened).toEqual([]);
    await new Promise((resolve) => taken.close(resolve));
  });

  it('exits with 1 when the app is not built', async () => {
    const empty = join(folder, 'not-built');
    await mkdir(empty, { recursive: true });
    const { err, environment } = harness({ appSource: () => ({ mode: 'static', dir: empty }) });

    await expect(runCommand([SAMPLE], environment)).resolves.toBe(1);

    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/Run `pnpm build` first\.$/);
  });
});

function listening(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen({ port: 0, host: '127.0.0.1' }, () => resolve(server));
  });
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No TCP port.');
  return address.port;
}

async function freePort(): Promise<number> {
  const server = await listening();
  const port = portOf(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

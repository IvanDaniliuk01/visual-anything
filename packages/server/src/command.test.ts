import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAUNCH_PARAM,
  LIVE_PATH,
  PROTOCOL_VERSION,
  TOKEN_PARAM,
  decodeServerMessage,
} from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProgramBridge } from './claude/bridge';
import { listProgramRecords } from './claude/discovery';
import {
  USAGE,
  parseCommandLine,
  runCommand,
  type CommandEnvironment,
  type KeyInput,
} from './command';
import type { AppSource } from './server';
import { openSession } from './session';
import { openLive, send, testProject, textOf, writeProjectFolder } from './test-support';

const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url));
const SAMPLE = 'examples/my-systems';

/**
 * How long a test waits for the program to start: opening the sample takes a while the first time,
 * and longer on a loaded machine or a slow CI runner.
 */
const STARTING = { timeout: 10_000 };

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
    await expect.poll(() => out.some((line) => line.includes('http://')), STARTING).toBe(true);
    const line = out.find((printed) => printed.includes('http://')) ?? '';
    return new URL(line.slice(line.indexOf('http://')));
  };
  /** The launch addresses the program printed, once it printed `count` of them. */
  const printedLaunchUrls = async (count = 1) => {
    const lines = () => out.filter((line) => line.includes(`#${LAUNCH_PARAM}=`));
    await expect.poll(() => lines().length, STARTING).toBe(count);
    return lines().map((line) => new URL(line.slice(line.indexOf('http://'))));
  };
  return { out, err, opened, appSources, signals, environment, printedUrl, printedLaunchUrls };
}

/** The launch code of an address that carries one. */
function launchCodeOf(url: URL): string {
  return new URLSearchParams(url.hash.slice(1)).get(LAUNCH_PARAM) ?? '';
}

/** Opens the live connection with a launch code, as the page does. */
function redeem(url: URL) {
  return openLive(Number(url.port), {
    path: `${LIVE_PATH}?${LAUNCH_PARAM}=${launchCodeOf(url)}`,
    origin: url.origin,
  });
}

/** Keys to press, as in a terminal. */
function fakeKeys() {
  let listener: ((key: string) => void) | undefined;
  let released = false;
  const keys: KeyInput = {
    listen: (onKey) => {
      listener = onKey;
      return () => {
        released = true;
        listener = undefined;
      };
    },
  };
  return {
    keys,
    press: (key: string) => listener?.(key),
    listening: () => listener !== undefined,
    released: () => released,
  };
}

describe('parseCommandLine', () => {
  it('starts at home on any free port and opens the browser by default', () => {
    expect(parseCommandLine([])).toEqual({
      ok: true,
      value: { port: 0, open: true, dev: false, stopWhenIdle: false, help: false },
    });
    expect(parseCommandLine(['.'])).toMatchObject({ ok: true, value: { folder: '.' } });
  });

  it('takes the folder, the port, --no-open, --dev and --stop-when-idle', () => {
    expect(
      parseCommandLine([SAMPLE, '--port', '8080', '--no-open', '--dev', '--stop-when-idle']),
    ).toEqual({
      ok: true,
      value: {
        folder: SAMPLE,
        port: 8080,
        open: false,
        dev: true,
        stopWhenIdle: true,
        help: false,
      },
    });
  });

  it('takes --listen 127.0.0.1 or 0.0.0.0, and refuses any other address', () => {
    expect(parseCommandLine(['--listen', '0.0.0.0'])).toMatchObject({
      ok: true,
      value: { listen: '0.0.0.0' },
    });
    expect(parseCommandLine(['--listen=127.0.0.1'])).toMatchObject({
      ok: true,
      value: { listen: '127.0.0.1' },
    });
    for (const address of ['192.168.1.10', '::', 'localhost', '']) {
      expect(parseCommandLine(['--listen', address])).toEqual({
        ok: false,
        message: `--listen takes 127.0.0.1 or 0.0.0.0, not ${JSON.stringify(address)}.`,
      });
    }
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

describe('runCommand', { timeout: 20_000 }, () => {
  it('opens the browser at an address that works once, which hands the page the token, and stops on SIGINT', async () => {
    const { opened, signals, environment } = harness();
    const exit = runCommand([SAMPLE], environment);

    await expect.poll(() => opened, STARTING).toHaveLength(1);
    const url = new URL(opened[0] ?? '');
    expect(url.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(url.pathname).toBe('/');
    expect(url.search).toBe('');
    expect(url.hash).toMatch(new RegExp(`^#${LAUNCH_PARAM}=[A-Za-z0-9_-]{22}$`));

    const outcome = await redeem(url);
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    const message = decodeServerMessage(outcome.firstMessage);
    expect(message.type === 'project/opened' && message.project.project.name).toBe('My systems');
    const token = message.type === 'project/opened' ? (message.token ?? '') : '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    outcome.socket.close();

    expect(await redeem(url)).toEqual({ open: false, status: 401 });
    const again = await openLive(Number(url.port), {
      path: `${LIVE_PATH}?${TOKEN_PARAM}=${token}`,
      origin: url.origin,
    });
    expect(again.open).toBe(true);
    if (again.open) {
      const reopened = decodeServerMessage(again.firstMessage);
      expect(reopened.type === 'project/opened' && reopened.token).toBeUndefined();
      again.socket.close();
    }

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
    await expect(send(Number(url.port))).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('prints the project name and an address without any secret, and never the token', async () => {
    const { out, err, opened, signals, environment } = harness();
    const exit = runCommand([SAMPLE], environment);

    await expect.poll(() => opened, STARTING).toHaveLength(1);
    expect(out.some((line) => line.includes('"My systems"'))).toBe(true);
    const url = new URL(opened[0] ?? '');
    expect(out).toContain(`Visual Anything is running at ${url.origin}/`);
    const outcome = await redeem(url);
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    const message = decodeServerMessage(outcome.firstMessage);
    const token = message.type === 'project/opened' ? (message.token ?? '-') : '-';
    outcome.socket.close();
    expect([...out, ...err, ...opened].some((line) => line.includes(token))).toBe(false);
    expect(out.some((line) => line.includes(launchCodeOf(url)))).toBe(false);

    signals.emit('SIGTERM');
    await expect(exit).resolves.toBe(0);
  });

  it('prints one address that works once with --no-open, without opening the browser', async () => {
    const { opened, signals, environment, printedLaunchUrls } = harness();
    const exit = runCommand([SAMPLE, '--no-open'], environment);

    const [url] = await printedLaunchUrls();
    if (url === undefined) throw new Error('No launch address was printed.');
    expect(url.hash).toMatch(new RegExp(`^#${LAUNCH_PARAM}=[A-Za-z0-9_-]{22}$`));
    expect(opened).toEqual([]);
    expect((await redeem(url)).open).toBe(true);

    signals.emit('SIGTERM');
    await expect(exit).resolves.toBe(0);
  });

  it('warns in the terminal when a launch address is used twice', async () => {
    const { err, signals, environment, printedLaunchUrls } = harness();
    const exit = runCommand([SAMPLE, '--no-open'], environment);

    const [url] = await printedLaunchUrls();
    if (url === undefined) throw new Error('No launch address was printed.');
    const first = await redeem(url);
    if (first.open) first.socket.close();
    expect(await redeem(url)).toEqual({ open: false, status: 401 });
    expect(err).toEqual([
      'The launch address was used twice; if your tab did not open the project, something else on this computer used it first.',
    ]);

    signals.emit('SIGTERM');
    await expect(exit).resolves.toBe(0);
  });

  it('in a terminal, opens a new tab on o, prints a new address on a, and stops on Ctrl+C', async () => {
    const terminal = fakeKeys();
    const { out, opened, environment, printedLaunchUrls } = harness({ keys: terminal.keys });
    const exit = runCommand([SAMPLE], environment);

    await expect.poll(() => opened, STARTING).toHaveLength(1);
    await expect.poll(() => terminal.listening(), STARTING).toBe(true);
    expect(out).toContain(
      'Press o to open Visual Anything in a new tab, or a to print an address that works once.',
    );

    terminal.press('o');
    await expect.poll(() => opened, STARTING).toHaveLength(2);
    expect(opened[1]).not.toBe(opened[0]);

    terminal.press('a');
    const [printed] = await printedLaunchUrls(1);
    if (printed === undefined) throw new Error('No launch address was printed.');
    // Only the newest address works: making one ends the one before.
    expect(await redeem(new URL(opened[1] ?? ''))).toEqual({ open: false, status: 401 });
    const outcome = await redeem(printed);
    expect(outcome.open).toBe(true);
    if (outcome.open) outcome.socket.close();

    terminal.press('\u0003');
    await expect(exit).resolves.toBe(0);
    expect(terminal.released()).toBe(true);
  });

  it('leaves a record for Claude while it runs, and removes it when it stops', async () => {
    const runtime = join(folder, 'runtime');
    const { signals, environment, printedUrl } = harness({ runtimeFolder: runtime });
    const exit = runCommand([SAMPLE, '--no-open'], environment);

    const url = await printedUrl();
    const [record] = await listProgramRecords(runtime);
    expect(record).toMatchObject({
      format: 1,
      protocolVersion: PROTOCOL_VERSION,
      pid: process.pid,
      port: Number(url.port),
    });
    expect(record?.folder).toBe((await realpath(join(REPOSITORY, SAMPLE))).replaceAll('\\', '/'));
    expect(record?.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
    expect(await listProgramRecords(runtime)).toEqual([]);
  });

  it('with --stop-when-idle, stops once nothing has been connected for a while', async () => {
    // Two seconds idle, so that the tab connects before the program stops, on a loaded machine too.
    const { out, environment, printedLaunchUrls } = harness({ idleStopDelay: 2000 });
    const exit = runCommand([SAMPLE, '--no-open', '--stop-when-idle'], environment);

    const [url] = await printedLaunchUrls();
    if (url === undefined) throw new Error('No launch address was printed.');
    const outcome = await redeem(url);
    if (!outcome.open) throw new Error('The live connection was refused.');
    // Connected for longer than the delay: still running.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(out).not.toContain('Visual Anything stopped.');
    outcome.socket.close();

    await expect(exit).resolves.toBe(0);
    expect(out).toContain('Nothing has been connected for a while, so Visual Anything stops.');
  });

  it('with --stop-when-idle, waits for Claude’s proposal, then drops it and says so', async () => {
    const runtime = join(folder, 'runtime-proposal');
    const project = join(folder, 'proposal-project');
    await writeProjectFolder(project, testProject());
    // Two seconds idle, so that Claude's bridge attaches before the program stops: at 100 ms, a
    // loaded machine let it stop first, and the bridge found no program running.
    const { out, environment, printedUrl } = harness({
      runtimeFolder: runtime,
      idleStopDelay: 2000,
      proposalIdleLimit: 4000,
    });
    const exit = runCommand([project, '--no-open', '--stop-when-idle'], environment);
    await printedUrl();
    let stopped = false;
    void exit.then(() => {
      stopped = true;
    });

    // Claude proposes a change, then goes: nothing is connected, but the proposal waits.
    const bridge = new ProgramBridge({ folder: project, runtime, attachOnly: true });
    const answer = await bridge.execute(
      { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
      { propose: true },
    );
    expect(answer).toMatchObject({ ok: true, proposed: { changes: ['element:api changed'] } });
    const proposedAt = Date.now();
    bridge.close();
    // Past the idle delay, the proposal still holds the program.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(stopped).toBe(false);

    await expect(exit).resolves.toBe(0);
    expect(Date.now() - proposedAt).toBeGreaterThanOrEqual(3900);
    expect(out).toContain(
      'Nothing has been connected for a while, and Claude’s proposal has waited an hour since its last change, so Visual Anything stops.',
    );
    expect(
      out.some((line) => /proposal of 1 change was never accepted, so it is dropped/.test(line)),
    ).toBe(true);
    // Nothing of it reached the files.
    const reopened = await openSession(project, { watch: false, out: () => {}, err: () => {} });
    expect(reopened.ok && reopened.session.snapshot).toEqual(testProject());
    if (reopened.ok) await reopened.session.close();
  }, 60_000);

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

  it('opens the folder it runs in when given .', async () => {
    const { out, signals, environment, printedUrl } = harness({
      cwd: join(REPOSITORY, SAMPLE),
    });
    const exit = runCommand(['.', '--no-open'], environment);

    await printedUrl();
    expect(out.some((line) => line.includes('"My systems"'))).toBe(true);

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
  });

  it('starts at home when given no folder, and moves Claude\u2019s record with the project open', async () => {
    const runtime = join(folder, 'home-runtime');
    const projects = join(folder, 'home-projects');
    const { out, signals, environment, printedLaunchUrls } = harness({
      runtimeFolder: runtime,
      projectsFolder: projects,
    });
    const exit = runCommand(['--no-open'], environment);

    const [url] = await printedLaunchUrls();
    expect(out).toContain(
      `No project is open: choose one in the browser, or start one in ${projects.replaceAll('\\', '/')}.`,
    );
    // At home, a record lets Claude and visual-anything address reach the program (ADR 0099).
    const homeRecords = await listProgramRecords(runtime);
    expect(homeRecords.map((each) => each.home)).toEqual([true]);
    const outcome = await redeem(url as URL);
    if (!outcome.open) throw new Error('The tab was refused.');
    expect(decodeServerMessage(outcome.firstMessage).type).toBe('preferences/changed');
    const received: string[] = [];
    outcome.socket.on('message', (data) => received.push(textOf(data)));
    const types = () => received.map((text) => decodeServerMessage(text).type);
    await expect.poll(types, STARTING).toContain('home/offered');

    outcome.socket.send(JSON.stringify({ type: 'home/create', requestId: 'n', name: 'Mine' }));
    await expect.poll(types, STARTING).toContain('project/opened');
    await expect.poll(() => listProgramRecords(runtime)).toHaveLength(1);
    const [record] = await listProgramRecords(runtime);
    expect(record?.folder).toBe((await realpath(join(projects, 'Mine'))).replaceAll('\\', '/'));

    outcome.socket.send(JSON.stringify({ type: 'home/close', requestId: 'h' }));
    await expect.poll(() => types().filter((type) => type === 'home/offered').length).toBe(2);
    await expect
      .poll(async () => (await listProgramRecords(runtime)).map((each) => each.home))
      .toEqual([true]);
    outcome.socket.close();

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
  });

  it('refuses --view at home, which has no view to open', async () => {
    const { err, environment } = harness();
    await expect(runCommand(['--view', 'overview'], environment)).resolves.toBe(2);
    expect(err[0]).toMatch(/starts at home/);
  });

  it('keeps running when the browser cannot be opened', async () => {
    const { err, signals, environment, printedUrl } = harness({
      openBrowser: () => Promise.reject(new Error('no browser')),
    });
    const exit = runCommand([SAMPLE], environment);

    await printedUrl();
    await expect
      .poll(() => err)
      .toEqual([
        'Could not open the browser (no browser). Start Visual Anything again with --no-open to print an address that works once.',
      ]);

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

  it('prints each error of the core against its file and exits with 1', async () => {
    const broken = join(folder, 'broken-rules');
    const state = testProject();
    await writeProjectFolder(broken, {
      ...state,
      model: {
        ...state.model,
        elements: [
          ...state.model.elements,
          { id: 'ghost', component: 'shop.missing', name: 'Ghost' },
        ],
      },
    });
    const { err, opened, environment } = harness();

    await expect(runCommand([broken], environment)).resolves.toBe(1);

    expect(err).toEqual([
      `Could not open the project in ${broken.replaceAll('\\', '/')}:`,
      'model.vamodel /elements/5: The element "Ghost" is created from "shop.missing", which no package in use defines.',
    ]);
    expect(opened).toEqual([]);
  });

  it('prints the warnings of the project once it is open', async () => {
    const warned = join(folder, 'warned');
    const state = testProject();
    await writeProjectFolder(warned, {
      ...state,
      model: {
        ...state.model,
        relations: [
          ...state.model.relations,
          {
            id: 'api-reads-customer',
            relationType: 'systems.reads-from',
            from: 'api',
            to: 'customer',
          },
        ],
      },
    });
    const { out, err, signals, environment, printedUrl } = harness();
    const exit = runCommand([warned, '--no-open'], environment);

    await printedUrl();
    expect(out[0]).toBe(`Opened "Shop" from ${warned.replaceAll('\\', '/')}.`);
    expect(err).toEqual([
      'Warning: model.vamodel /elements/3: "reads from" expects its to end to be "Database" or "Object storage", but "Customer" is not.',
    ]);

    signals.emit('SIGINT');
    await expect(exit).resolves.toBe(0);
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

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../server';
import { openSession, type Session } from '../session';
import { openLiveClient, testProject, writeProjectFolder, type LiveClient } from '../test-support';
import {
  NoProgramRunningError,
  ProgramBridge,
  ProgramUnavailableError,
  type StartProgram,
} from './bridge';
import { currentContext, writeProgramRecord, type RuntimeContext } from './discovery';

/**
 * How long a poll waits for what the program sends: `expect.poll` gives up after 1 s by default,
 * which a loaded machine can take to carry one message.
 */
const POLL = { timeout: 10_000 };

let profile: string;
let runtime: string;
let context: RuntimeContext;
let project: string;
let appDir: string;
const running: { server: RunningServer; session: Session }[] = [];
const bridges: ProgramBridge[] = [];

beforeEach(async () => {
  profile = await realpath(await mkdtemp(join(tmpdir(), 'va-bridge-')));
  runtime = join(profile, 'run');
  context = { ...currentContext(), home: profile };
  project = join(profile, 'shop');
  await writeProjectFolder(project, testProject());
  appDir = join(profile, 'dist');
  await mkdir(appDir);
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
});

afterEach(async () => {
  for (const bridge of bridges.splice(0)) bridge.close();
  for (const { server, session } of running.splice(0)) {
    await server.close();
    await session.close();
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 10 });
});

/** Runs the program in this process, as the command does, and leaves its record. */
async function runProgram(
  options: { opened?: string[]; record?: Partial<Parameters<typeof writeProgramRecord>[1]> } = {},
) {
  const opened = await openSession(project, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The test project does not open.');
  const server = await startServer({
    session: opened.session,
    port: 0,
    app: { mode: 'static', dir: appDir },
    openBrowser: (url) => {
      options.opened?.push(url);
      return Promise.resolve();
    },
  });
  running.push({ server, session: opened.session });
  await writeProgramRecord(
    runtime,
    {
      format: 1,
      protocolVersion: PROTOCOL_VERSION,
      pid: process.pid,
      port: server.port,
      folder: opened.session.folder.replaceAll('\\', '/'),
      credential: server.credential,
      startedAt: new Date(Date.now() - 1000).toISOString(),
      ...options.record,
    },
    context,
  );
  return { server, session: opened.session };
}

function bridge(options: Partial<ConstructorParameters<typeof ProgramBridge>[0]> = {}) {
  const made = new ProgramBridge({ folder: project, runtime, context, ...options });
  bridges.push(made);
  return made;
}

describe('ProgramBridge', () => {
  it('attaches to the running program of the project and reads its project', async () => {
    await runProgram();
    const project = await bridge().project();
    expect(project.project.name).toBe('Shop');
  });

  it('runs Claude’s commands as Claude’s actions, and keeps its copy in step', async () => {
    const { session } = await runProgram();
    const program = bridge();

    const answer = await program.execute({
      type: 'update-element',
      id: 'api',
      changes: { name: 'Gateway' },
    });

    expect(answer).toEqual({
      ok: true,
      label: 'Rename "API" to "Gateway"',
      changed: true,
      created: [],
      warnings: [],
    });
    expect(session.history.undo).toEqual({ label: 'Rename "API" to "Gateway"', author: 'claude' });
    const copy = await program.project();
    expect(copy.model.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
  });

  it('says why a command was refused', async () => {
    await runProgram();
    const answer = await bridge().execute({ type: 'delete', elements: ['nobody'] });
    expect(answer).toEqual({
      ok: false,
      problems: [
        { code: 'unknown-element', message: 'There is no element "nobody".', subjects: ['nobody'] },
      ],
    });
  });

  it('sees the person’s changes too', async () => {
    const { server } = await runProgram();
    const program = bridge();
    await program.project();
    const app: LiveClient = await openLiveClient(server.port, server.token);
    try {
      app.send({
        type: 'command',
        requestId: 'r1',
        command: { type: 'update-element', id: 'db', changes: { name: 'Orders DB' } },
      });
      await expect
        .poll(
          async () => (await program.project()).model.elements.find((e) => e.id === 'db')?.name,
          POLL,
        )
        .toBe('Orders DB');
    } finally {
      await app.close();
    }
  });

  it('shows guidance in the open apps and says how many', async () => {
    const { server } = await runProgram();
    const program = bridge();
    expect(await program.guide({ kind: 'caption', text: 'Hello.' })).toBe(0);
    const app = await openLiveClient(server.port, server.token);
    try {
      expect(await program.guide({ kind: 'highlight', targets: ['api'] })).toBe(1);
      await expect
        .poll(() => app.messages.at(-1), POLL)
        .toEqual({
          type: 'guidance',
          guidance: { kind: 'highlight', targets: ['api'] },
        });
    } finally {
      await app.close();
    }
  });

  it('opens the app', async () => {
    const opened: string[] = [];
    await runProgram({ opened });
    await bridge().openApp();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/#launch=/);
  });

  it('opens the app at a view state', async () => {
    const opened: string[] = [];
    await runProgram({ opened });
    await bridge().openApp({ view: 'overview', select: ['api'] });
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/#launch=[\w-]+&view=overview&select=api$/);
  });

  it('says why the program would not open the app at a view state', async () => {
    const opened: string[] = [];
    await runProgram({ opened });
    await expect(bridge().openApp({ view: 'nowhere' })).rejects.toThrow(
      'The project has no view "nowhere".',
    );
    expect(opened).toEqual([]);
  });

  it('knows the address the program serves the app at', async () => {
    const { server } = await runProgram();
    expect(await bridge().address()).toBe(`http://127.0.0.1:${server.port}/`);
  });

  it('attaches only to a program that runs when asked to, and starts none', async () => {
    let starts = 0;
    const start: StartProgram = () => {
      starts += 1;
      return { exited: new Promise(() => {}) };
    };
    await expect(bridge({ start, attachOnly: true }).project()).rejects.toBeInstanceOf(
      NoProgramRunningError,
    );
    expect(starts).toBe(0);
    await runProgram();
    const project = await bridge({ start, attachOnly: true }).project();
    expect(project.project.name).toBe('Shop');
    expect(starts).toBe(0);
  });

  it('attaches to the only program running when it was given no folder', async () => {
    await runProgram();
    const project = await bridge({ folder: undefined }).project();
    expect(project.project.name).toBe('Shop');
  });

  it('says what to do when nothing runs and it was given no folder', async () => {
    await expect(bridge({ folder: undefined }).project()).rejects.toThrow(
      /Visual Anything is not running, and this MCP server was given no project folder/,
    );
  });

  it('starts the program when none runs, and attaches once it listens', async () => {
    const started: string[] = [];
    const start: StartProgram = (folder) => {
      started.push(folder);
      void runProgram();
      return { exited: new Promise(() => {}) };
    };
    const project = await bridge({ start }).project();
    expect(project.project.name).toBe('Shop');
    expect(started).toEqual([(await realpath(join(profile, 'shop'))).replaceAll('\\', '/')]);
  });

  it('starts a new program when the record names one that is gone', async () => {
    await mkdir(runtime, { recursive: true });
    await writeProgramRecord(
      runtime,
      {
        format: 1,
        protocolVersion: PROTOCOL_VERSION,
        pid: 2 ** 22 + 12345,
        port: 1,
        folder: (await realpath(project)).replaceAll('\\', '/'),
        credential: 'x'.repeat(43),
        startedAt: new Date(Date.now() - 1000).toISOString(),
      },
      context,
    );
    let starts = 0;
    const start: StartProgram = () => {
      starts += 1;
      void runProgram();
      return { exited: new Promise(() => {}) };
    };
    await bridge({ start }).project();
    expect(starts).toBe(1);
  });

  it('says why a program it started did not start, from its log', async () => {
    const start: StartProgram = (_folder, log) => {
      void writeFile(
        log,
        'The app is not built: dist/index.html is missing. Run `pnpm build` first.\n',
      );
      return { exited: new Promise((resolve) => setTimeout(() => resolve(1), 50)) };
    };
    await expect(bridge({ start }).project()).rejects.toThrow(
      /could not start on .*\nThe app is not built/s,
    );
  });

  it('refuses a program of another build', async () => {
    await runProgram({ record: { protocolVersion: PROTOCOL_VERSION + 1 } });
    await expect(bridge().project()).rejects.toThrow(/comes from another build/);
  });

  // The program starts again in this process, which takes a while on a loaded machine or a slow CI runner.
  it('attaches again after the program went away and came back', { timeout: 20_000 }, async () => {
    const first = await runProgram();
    const program = bridge({
      start: () => {
        void runProgram();
        return { exited: new Promise(() => {}) };
      },
    });
    await program.project();
    await first.server.close();
    await first.session.close();
    running.splice(0, 1);
    await expect
      .poll(async () => {
        try {
          return (await program.project()).project.name;
        } catch (error) {
          return error instanceof ProgramUnavailableError ? 'unavailable' : 'error';
        }
      }, POLL)
      .toBe('Shop');
  });
});

describe('ProgramBridge, for a new launch address and at home (ADR 0099)', () => {
  it('asks the program for a new launch address, which opens the live connection once', async () => {
    const { server } = await runProgram();
    const address = await bridge().launchAddress();
    expect(address).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${server.port}/#launch=[\\w-]+$`));
    expect(address).not.toContain(server.token);
    const code = new URLSearchParams(new URL(address).hash.slice(1)).get('launch') ?? '';
    const app = await openLiveClient(server.port, code, 'launch');
    await expect.poll(() => app.messages[0]?.type, POLL).toBe('project/opened');
    await app.close();
  });

  it('reaches a program at home: a new address and opening the app work, the tools say why not', async () => {
    const { HomeSession } = await import('../home-session');
    const home = new HomeSession({
      projectsFolder: profile,
      open: (folder) => openSession(folder, { watch: false, out: () => {}, err: () => {} }),
    });
    const opened: string[] = [];
    const server = await startServer({
      session: home,
      port: 0,
      app: { mode: 'static', dir: appDir },
      openBrowser: (url) => {
        opened.push(url);
        return Promise.resolve();
      },
    });
    try {
      await writeProgramRecord(
        runtime,
        {
          format: 1,
          protocolVersion: PROTOCOL_VERSION,
          pid: process.pid,
          port: server.port,
          folder: profile.replaceAll('\\', '/'),
          credential: server.credential,
          startedAt: new Date(Date.now() - 1000).toISOString(),
          home: true,
        },
        context,
      );
      const atHome = bridge({ folder: undefined, attachOnly: true });
      expect(await atHome.launchAddress()).toMatch(/#launch=[\w-]+$/);
      expect(await atHome.openApp()).toEqual({ how: 'browser' });
      expect(opened).toHaveLength(1);
      await expect(atHome.project()).rejects.toThrow(/No project is open/);
    } finally {
      await server.close();
      await home.close();
    }
  });
});

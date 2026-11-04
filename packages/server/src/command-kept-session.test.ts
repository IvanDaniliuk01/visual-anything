import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LAUNCH_PARAM, LIVE_PATH, TOKEN_PARAM, decodeServerMessage } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCommand, type CommandEnvironment } from './command';
import { currentContext } from './claude/discovery';
import { readKeptSession, sessionKey } from './kept-session';
import { sessionProof } from './security';
import { openLive, testProject, writeProjectFolder } from './test-support';

const STARTING = { timeout: 10_000 };

let profile: string;
let project: string;
let appDir: string;

beforeEach(async () => {
  profile = await realpath(await mkdtemp(join(tmpdir(), 'va-kept-')));
  project = join(profile, 'shop');
  await writeProjectFolder(project, testProject());
  appDir = join(profile, 'dist');
  await mkdir(appDir);
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
});

afterEach(async () => {
  await rm(profile, { recursive: true, force: true, maxRetries: 10 });
});

/** Runs the program on the project with --no-open, keeping its session in the profile. */
function run(extra: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const signals = new EventEmitter();
  const environment: CommandEnvironment = {
    cwd: profile,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    openBrowser: () => Promise.resolve(),
    signals,
    appSource: () => ({ mode: 'static', dir: appDir }),
    runtimeFolder: join(profile, 'run'),
    sessionsFolder: join(profile, 'run'),
  };
  const exited = runCommand([project, '--no-open', ...extra], environment);
  const launch = async () => {
    await expect
      .poll(() => out.some((line) => line.includes(`#${LAUNCH_PARAM}=`)), STARTING)
      .toBe(true);
    const line = out.find((each) => each.includes(`#${LAUNCH_PARAM}=`)) ?? '';
    return new URL(line.slice(line.indexOf('http://')));
  };
  const stop = async () => {
    signals.emit('SIGINT');
    expect(await exited).toBe(0);
  };
  return { out, err, launch, stop };
}

/** Redeems a launch address as a page does, and gives the session token it hands over. */
async function tokenOf(url: URL): Promise<string> {
  const code = new URLSearchParams(url.hash.slice(1)).get(LAUNCH_PARAM) ?? '';
  const live = await openLive(Number(url.port), {
    path: `${LIVE_PATH}?${LAUNCH_PARAM}=${code}`,
    origin: url.origin,
  });
  if (!live.open) throw new Error(`The launch address was refused with ${live.status}.`);
  const opened = decodeServerMessage(live.firstMessage);
  live.socket.close();
  if (opened.type !== 'project/opened' || opened.token === undefined) {
    throw new Error('The program handed over no token.');
  }
  return opened.token;
}

describe('the kept session (ADR 0099)', () => {
  it('lets a tab of the last run reconnect with its token, on the same port, after a restart', async () => {
    const first = run();
    const url = await first.launch();
    const token = await tokenOf(url);
    await first.stop();

    const kept = await readKeptSession(join(profile, 'run'), sessionKey({ project }), {
      context: { ...currentContext(), home: profile },
    });
    expect(kept).toMatchObject({ token, port: Number(url.port) });

    const second = run();
    const again = await second.launch();
    expect(again.port).toBe(url.port);
    expect(second.out.join('\n')).toMatch(/keeps the session of its last run/);
    const live = await openLive(Number(url.port), {
      path: `${LIVE_PATH}?${TOKEN_PARAM}=${token}`,
      origin: url.origin,
    });
    expect(live.open).toBe(true);
    if (live.open) live.socket.close();
    // Before the tab sends its token, the program proves it holds it.
    const challenge = 'ab'.repeat(16);
    const response = await fetch(`${url.origin}/session/proof?challenge=${challenge}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ proof: sessionProof(token, challenge) });
    expect((await fetch(`${url.origin}/session/proof?challenge=short`)).status).toBe(400);
    // Nothing printed holds the token.
    expect([...first.out, ...first.err, ...second.out, ...second.err].join('\n')).not.toContain(
      token,
    );
    await second.stop();
  });

  it('makes a new token when another port is asked for', async () => {
    const first = run();
    const url = await first.launch();
    const token = await tokenOf(url);
    await first.stop();

    const port = await freePort();
    const second = run(['--port', String(port)]);
    const again = await second.launch();
    expect(Number(again.port)).toBe(port);
    const live = await openLive(port, {
      path: `${LIVE_PATH}?${TOKEN_PARAM}=${token}`,
      origin: again.origin,
    });
    expect(live.open).toBe(false);
    await second.stop();
  });
});

/** A port free now, other than any the operating system gave before. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

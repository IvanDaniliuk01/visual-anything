import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  LIVE_PATH,
  PROTOCOL_VERSION,
  TOKEN_PARAM,
  decodeServerMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from './server';
import { openSession, type Session } from './session';
import { openLive, send, sendUpgrade, writeProjectFolder } from './test-support';

const project: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'Dev project', packages: [] },
  model: {
    world: { id: 'world', component: 'essence', name: 'World' },
    elements: [],
    relations: [],
  },
  packages: [],
  views: [],
  scenarios: [],
};

const INDEX = [
  '<!doctype html>',
  '<html><head><title>Dev</title></head>',
  '<body><div id="root"></div><script type="module" src="/main.js"></script></body></html>',
].join('\n');

let root: string;
let projectFolder: string;
let session: Session;
let server: RunningServer;
let origin: string;

/** Starts the local program in dev mode on the test's app sources. */
const startDevServer = () =>
  startServer({ session, port: 0, app: { mode: 'dev', root, configFile: false } });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'va-dev-'));
  await writeFile(join(root, 'index.html'), INDEX);
  await writeFile(join(root, 'main.js'), "document.title = 'Dev app';\n");
  projectFolder = await mkdtemp(join(tmpdir(), 'va-dev-project-'));
  await writeProjectFolder(projectFolder, project);
  const opened = await openSession(projectFolder, { watch: false });
  if (!opened.ok) throw new Error('The test project does not open.');
  session = opened.session;
  server = await startDevServer();
  origin = `http://127.0.0.1:${server.port}`;
}, 60_000);

afterAll(async () => {
  await server.close();
  await session.close();
  await rm(root, { recursive: true, force: true });
  await rm(projectFolder, { recursive: true, force: true });
}, 60_000);

describe('startServer in dev mode', { timeout: 30_000 }, () => {
  it('serves index.html through Vite, with hot reload and the security headers', async () => {
    const reply = await send(server.port);
    expect(reply.status, reply.body).toBe(200);
    expect(reply.headers['content-type']).toMatch(/^text\/html/);
    expect(reply.body).toContain('/@vite/client');
    expect(reply.headers['x-content-type-options']).toBe('nosniff');
    expect(reply.headers['referrer-policy']).toBe('no-referrer');
  });

  it('serves the sources to a module script of its own origin', async () => {
    const reply = await send(server.port, { path: '/main.js', headers: { Origin: origin } });
    expect(reply.status, reply.body).toBe(200);
    expect(reply.headers['content-type']).toMatch(/javascript/);
    expect(reply.body).toContain('Dev app');
  });

  it('refuses a foreign Host before Vite sees the request', async () => {
    const reply = await send(server.port, { headers: { Host: `evil.example:${server.port}` } });
    expect(reply.status).toBe(403);
    expect(reply.body).toContain('The local program answers only requests for');
  });

  it('refuses a foreign Origin before Vite sees the request', async () => {
    const reply = await send(server.port, {
      path: '/main.js',
      headers: { Origin: 'http://evil.example' },
    });
    expect(reply.status).toBe(403);
    expect(reply.body).toContain('other origins');
  });

  it('opens the live connection for the session token', async () => {
    const outcome = await openLive(server.port, {
      path: `${LIVE_PATH}?${TOKEN_PARAM}=${server.token}`,
      origin,
    });
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    expect(decodeServerMessage(outcome.firstMessage)).toEqual({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project,
      history: {},
    });
    outcome.socket.close();
  });

  it('refuses the live connection without the token', async () => {
    const outcome = await openLive(server.port, { path: LIVE_PATH, origin });
    expect(outcome).toEqual({ open: false, status: 401 });
  });

  it("passes Vite's own upgrades to Vite once they pass the checks", async () => {
    const outcome = await sendUpgrade(server.port, '/', {
      Origin: origin,
      'Sec-WebSocket-Protocol': 'vite-ping',
    });
    expect(outcome).toMatchObject({ upgraded: true, protocol: 'vite-ping' });
    if (outcome.upgraded) outcome.close();
  });

  it("refuses Vite's own upgrades from a foreign origin before Vite sees them", async () => {
    const outcome = await sendUpgrade(server.port, '/', {
      Origin: 'http://evil.example',
      'Sec-WebSocket-Protocol': 'vite-ping',
    });
    expect(outcome).toMatchObject({ upgraded: false, status: 403 });
  });

  it("refuses Vite's own upgrades for a foreign host before Vite sees them", async () => {
    const outcome = await sendUpgrade(server.port, '/', {
      Host: `evil.example:${server.port}`,
      Origin: origin,
      'Sec-WebSocket-Protocol': 'vite-ping',
    });
    expect(outcome).toMatchObject({ upgraded: false, status: 403 });
  });

  it('leaves other upgrades to Vite instead of destroying them', async () => {
    const pending = sendHangingUpgrade(server.port, '/elsewhere');
    await delay(300);
    expect(pending.events).toEqual([]);
    pending.destroy();
  });

  it('closes with an upgrade still pending', async () => {
    const running = await startDevServer();
    const pending = sendHangingUpgrade(running.port, '/elsewhere');
    await delay(100);

    await running.close();

    await expect.poll(() => pending.events).toContain('close');
  });
});

/** Sends an upgrade that no one answers, and records what happens to it. */
function sendHangingUpgrade(port: number, path: string) {
  const events: string[] = [];
  const outgoing = request({
    host: '127.0.0.1',
    port,
    path,
    agent: false,
    headers: {
      Origin: `http://127.0.0.1:${port}`,
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': Buffer.from('0123456789abcdef').toString('base64'),
    },
  });
  outgoing.on('response', () => events.push('response'));
  outgoing.on('upgrade', () => events.push('upgrade'));
  outgoing.on('error', () => events.push('error'));
  outgoing.on('close', () => events.push('close'));
  outgoing.end();
  return { events, destroy: () => outgoing.destroy() };
}

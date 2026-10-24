import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIVE_PATH,
  PROTOCOL_VERSION,
  TOKEN_PARAM,
  decodeServerMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadProject } from './project';
import { startServer, type RunningServer } from './server';
import { openLive, send, sendRaw, sendUpgrade, type Reply } from './test-support';

const SAMPLE = fileURLToPath(new URL('../../../examples/my-systems', import.meta.url));
const INDEX = '<!doctype html><title>Visual Anything</title><div id="root"></div>';
const SECRET = '{ "name": "outside the app folder" }';

/** A file of each type the built app may hold, with the content type it must be served with. */
const FILES: [path: string, contentType: string][] = [
  ['assets/app.js', 'text/javascript; charset=utf-8'],
  ['assets/worker.mjs', 'text/javascript; charset=utf-8'],
  ['assets/style.css', 'text/css; charset=utf-8'],
  ['assets/logo.svg', 'image/svg+xml'],
  ['assets/icon.png', 'image/png'],
  ['favicon.ico', 'image/x-icon'],
  ['assets/data.json', 'application/json; charset=utf-8'],
  ['assets/app.js.map', 'application/json; charset=utf-8'],
  ['assets/font.woff2', 'font/woff2'],
  ['robots.txt', 'text/plain; charset=utf-8'],
];

/** An IPv4 address of this machine other than the loopback, if it has one. */
const externalAddress = Object.values(networkInterfaces())
  .flat()
  .find((address) => address?.family === 'IPv4' && !address.internal)?.address;

let folder: string;
let appDir: string;
let snapshot: ProjectSnapshot;
let server: RunningServer;
let host: string;
let origin: string;

beforeAll(async () => {
  const loaded = await loadProject(SAMPLE);
  if (!loaded.ok) throw new Error('The sample project does not load.');
  snapshot = loaded.project;

  folder = await mkdtemp(join(tmpdir(), 'va-server-'));
  appDir = join(folder, 'dist');
  await mkdir(join(appDir, 'assets'), { recursive: true });
  await writeFile(join(folder, 'package.json'), SECRET);
  await writeFile(join(appDir, 'index.html'), INDEX);
  for (const [path] of FILES) await writeFile(join(appDir, path), `contents of ${path}`);

  server = await startServer({ project: snapshot, port: 0, app: { mode: 'static', dir: appDir } });
  host = `127.0.0.1:${server.port}`;
  origin = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.close();
  await rm(folder, { recursive: true, force: true });
});

function expectSecurityHeaders(reply: Reply) {
  expect(reply.headers['x-content-type-options']).toBe('nosniff');
  expect(reply.headers['referrer-policy']).toBe('no-referrer');
  expect(reply.headers['content-security-policy']).toBe("frame-ancestors 'none'");
  expect(reply.headers['x-frame-options']).toBe('DENY');
}

describe('startServer', () => {
  it('listens on 127.0.0.1 and gives a URL that carries the token in its fragment', async () => {
    expect(server.port).toBeGreaterThan(0);
    expect(server.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/#${TOKEN_PARAM}=${server.token}`);
    expect((await send(server.port)).status).toBe(200);
  });

  it.skipIf(externalAddress === undefined)(
    'cannot be reached through the other network interfaces',
    async () => {
      const reached = await new Promise<boolean>((resolve) => {
        const socket = connect({ host: externalAddress, port: server.port });
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => resolve(false));
      });
      expect(reached).toBe(false);
    },
    15_000,
  );

  it('serves index.html for / without letting it be stored', async () => {
    const reply = await send(server.port, { headers: { Host: host } });
    expect(reply.status).toBe(200);
    expect(reply.body).toBe(INDEX);
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(reply.headers['cache-control']).toBe('no-store');
    expectSecurityHeaders(reply);
  });

  it('serves index.html by its name too', async () => {
    const reply = await send(server.port, { path: '/index.html' });
    expect(reply.body).toBe(INDEX);
    expect(reply.headers['cache-control']).toBe('no-store');
  });

  it('answers requests that name it localhost', async () => {
    const reply = await send(server.port, { headers: { Host: `localhost:${server.port}` } });
    expect(reply.status).toBe(200);
  });

  it('answers a request from its own origin', async () => {
    const reply = await send(server.port, { path: '/assets/app.js', headers: { Origin: origin } });
    expect(reply.status).toBe(200);
  });

  it.each(FILES)('serves %s as %s', async (path, contentType) => {
    const reply = await send(server.port, { path: `/${path}` });
    expect(reply.status).toBe(200);
    expect(reply.body).toBe(`contents of ${path}`);
    expect(reply.headers['content-type']).toBe(contentType);
    expect(reply.headers['cache-control']).toBeUndefined();
    expectSecurityHeaders(reply);
  });

  it('answers HEAD with the headers of GET and no body', async () => {
    const reply = await send(server.port, { method: 'HEAD' });
    expect(reply.status).toBe(200);
    expect(reply.headers['content-length']).toBe(String(Buffer.byteLength(INDEX)));
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(reply.body).toBe('');
  });

  it.each(['/missing.js', '/assets', '/assets/', '/live'])(
    'answers 404 for %s, which is no file',
    async (path) => {
      const reply = await send(server.port, { path });
      expect(reply.status).toBe(404);
      expectSecurityHeaders(reply);
    },
  );

  it.each([
    ['another hostname', () => `evil.example:${server.port}`],
    ['a hostname that resolves to 127.0.0.1', () => `127.0.0.1.nip.io:${server.port}`],
    ['another port', () => `127.0.0.1:${server.port + 1}`],
    ['no port', () => 'localhost'],
  ])('refuses a request whose Host is %s with 403', async (_case, hostOf) => {
    const reply = await send(server.port, { headers: { Host: hostOf() } });
    expect(reply.status).toBe(403);
    expect(reply.body).not.toContain(INDEX);
    expectSecurityHeaders(reply);
  });

  it('refuses a request without a Host with 403', async () => {
    const reply = await sendRaw(server.port, 'GET / HTTP/1.0\r\n\r\n');
    expect(reply).toMatch(/^HTTP\/1\.1 403 /);
    expect(reply).not.toContain(INDEX);
  });

  it.each([
    ['another site', () => 'http://evil.example'],
    ['another port', () => `http://127.0.0.1:${server.port + 1}`],
    ['https', () => `https://127.0.0.1:${server.port}`],
    ['the opaque origin null', () => 'null'],
  ])('refuses a request from %s with 403', async (_case, originOf) => {
    const reply = await send(server.port, { headers: { Origin: originOf() } });
    expect(reply.status).toBe(403);
    expect(reply.body).not.toContain(INDEX);
    expectSecurityHeaders(reply);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('answers %s with 405', async (method) => {
    const reply = await send(server.port, { method, headers: { Origin: origin } });
    expect(reply.status).toBe(405);
    expect(reply.headers.allow).toBe('GET, HEAD');
    expectSecurityHeaders(reply);
  });

  it.each([
    '/../package.json',
    '/%2e%2e/package.json',
    '/%2E%2E/package.json',
    '/..%2fpackage.json',
    '/%2e%2e%2fpackage.json',
    '/assets/../../package.json',
    '/assets/%2e%2e/%2e%2e/package.json',
    '/..\\package.json',
    '/%5c..%5cpackage.json',
    '/%2Fpackage.json',
    '//package.json',
    '/package.json%00',
    '/%00/../package.json',
  ])('never serves a file outside its folder for %s', async (path) => {
    const reply = await send(server.port, { path });
    expect([400, 403, 404]).toContain(reply.status);
    expect(reply.body).not.toContain(SECRET);
  });

  it('never serves a file outside its folder for its absolute path', async () => {
    const absolute = join(folder, 'package.json').replaceAll('\\', '/');
    const path = absolute.startsWith('/') ? absolute : `/${absolute}`;
    const reply = await send(server.port, { path });
    expect([400, 403, 404]).toContain(reply.status);
    expect(reply.body).not.toContain(SECRET);
  });

  it('answers an upgrade on another path with 404 and closes the socket', async () => {
    const outcome = await sendUpgrade(server.port, '/socket', { Origin: origin });
    expect(outcome.upgraded).toBe(false);
    if (outcome.upgraded) return;
    expect(outcome.status).toBe(404);
    await outcome.closed;
  });

  it('refuses an upgrade with a foreign Host before looking at its path', async () => {
    const outcome = await sendUpgrade(server.port, '/socket', {
      Host: `evil.example:${server.port}`,
      Origin: origin,
    });
    expect(outcome).toMatchObject({ upgraded: false, status: 403 });
  });
});

describe('the live connection', () => {
  const live = (token: string | undefined) =>
    token === undefined ? LIVE_PATH : `${LIVE_PATH}?${TOKEN_PARAM}=${token}`;

  it('refuses a connection without the token with 401', async () => {
    const outcome = await openLive(server.port, { path: live(undefined), origin });
    expect(outcome).toEqual({ open: false, status: 401 });
  });

  it('refuses a connection with a wrong token with 401', async () => {
    const wrong = `${server.token.slice(0, -1)}${server.token.endsWith('A') ? 'B' : 'A'}`;
    const outcome = await openLive(server.port, { path: live(wrong), origin });
    expect(outcome).toEqual({ open: false, status: 401 });
  });

  it('refuses the right token from a foreign origin with 403', async () => {
    const outcome = await openLive(server.port, {
      path: live(server.token),
      origin: 'http://evil.example',
    });
    expect(outcome).toEqual({ open: false, status: 403 });
  });

  it('refuses the right token without an origin with 403', async () => {
    const outcome = await openLive(server.port, { path: live(server.token) });
    expect(outcome).toEqual({ open: false, status: 403 });
  });

  it('refuses the right token for a foreign host with 403', async () => {
    const outcome = await openLive(server.port, {
      path: live(server.token),
      origin,
      host: `evil.example:${server.port}`,
    });
    expect(outcome).toEqual({ open: false, status: 403 });
  });

  it('sends the open project as soon as the connection opens', async () => {
    const outcome = await openLive(server.port, { path: live(server.token), origin });
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    expect(decodeServerMessage(outcome.firstMessage)).toEqual({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: snapshot,
    });
    outcome.socket.close();
  });

  it('accepts the origin that names it localhost', async () => {
    const outcome = await openLive(server.port, {
      path: live(server.token),
      origin: `http://localhost:${server.port}`,
      host: `localhost:${server.port}`,
    });
    expect(outcome.open).toBe(true);
    if (outcome.open) outcome.socket.close();
  });

  it('ignores messages from the app and stays open', async () => {
    const outcome = await openLive(server.port, { path: live(server.token), origin });
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    const { socket } = outcome;
    socket.send(JSON.stringify({ type: 'element/create', name: 'Ignored until M1' }));
    socket.send('not even JSON');
    const pong = new Promise<void>((resolve) => socket.once('pong', () => resolve()));
    socket.ping();
    await pong;
    expect(socket.readyState).toBe(socket.OPEN);
    socket.close();
  });
});

describe('closing', () => {
  it('closes the live connections and stops listening', async () => {
    const running = await startServer({
      project: snapshot,
      port: 0,
      app: { mode: 'static', dir: appDir },
    });
    const outcome = await openLive(running.port, {
      path: `${LIVE_PATH}?${TOKEN_PARAM}=${running.token}`,
      origin: `http://127.0.0.1:${running.port}`,
    });
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    const closed = new Promise<void>((resolve) => outcome.socket.once('close', () => resolve()));

    await running.close();

    await closed;
    await expect(send(running.port)).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    await expect(running.close()).resolves.toBeUndefined();
  });

  it('closes while a browser keeps an idle connection open', async () => {
    const running = await startServer({
      project: snapshot,
      port: 0,
      app: { mode: 'static', dir: appDir },
    });
    const socket = connect({ host: '127.0.0.1', port: running.port });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));

    await running.close();
    await closed;
  });
});

describe('starting', () => {
  it('refuses to start when the app is not built', async () => {
    const empty = join(folder, 'empty');
    await mkdir(empty, { recursive: true });
    await expect(
      startServer({ project: snapshot, port: 0, app: { mode: 'static', dir: empty } }),
    ).rejects.toThrow(/is missing\. Run `pnpm build` first\.$/);
  });

  it('reports a port that is already in use', async () => {
    await expect(
      startServer({ project: snapshot, port: server.port, app: { mode: 'static', dir: appDir } }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});

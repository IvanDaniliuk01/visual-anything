import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAUNCH_PARAM,
  LIVE_PATH,
  PROTOCOL_VERSION,
  TOKEN_PARAM,
  decodeServerMessage,
  readViewState,
  type ProjectSnapshot,
  type ServerMessage,
} from '@visual-anything/core';
import type { ModelFile } from '@visual-anything/schema';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WORKER_POLICY, pagePolicy } from './policies';
import { startServer, type RunningServer } from './server';
import { openSession, type Session } from './session';
import {
  openClaudeClient,
  openLive,
  openLiveClient,
  readText,
  send,
  sendRaw,
  sendUpgrade,
  textOf,
  type ClaudeClient,
  type LiveClient,
  type Reply,
} from './test-support';

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
let session: Session;
let snapshot: ProjectSnapshot;
let server: RunningServer;
let host: string;
let origin: string;

/** Opens a session on a copy of the sample project, so that commands never touch the sample. */
async function openSample(into: string): Promise<Session> {
  await cp(SAMPLE, into, { recursive: true });
  const opened = await openSession(into, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The sample project does not open.');
  return opened.session;
}

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-server-'));
  session = await openSample(join(folder, 'project'));
  snapshot = session.snapshot;

  appDir = join(folder, 'dist');
  await mkdir(join(appDir, 'assets'), { recursive: true });
  await writeFile(join(folder, 'package.json'), SECRET);
  await writeFile(join(appDir, 'index.html'), INDEX);
  for (const [path] of FILES) await writeFile(join(appDir, path), `contents of ${path}`);

  server = await startServer({ session, port: 0, app: { mode: 'static', dir: appDir } });
  host = `127.0.0.1:${server.port}`;
  origin = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.close();
  await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

/**
 * The headers every response carries. Its content security policy is the page's for HTML, the
 * worker policy for JavaScript, and `frame-ancestors 'none'` for everything else.
 */
function expectSecurityHeaders(reply: Reply) {
  expect(reply.headers['x-content-type-options']).toBe('nosniff');
  expect(reply.headers['referrer-policy']).toBe('no-referrer');
  const type = reply.headers['content-type'] ?? '';
  expect(reply.headers['content-security-policy']).toBe(
    type.startsWith('text/html')
      ? pagePolicy(server.port, { trustedTypes: true, scriptHashes: [] })
      : type.startsWith('text/javascript')
        ? WORKER_POLICY
        : "frame-ancestors 'none'",
  );
  expect(reply.headers['x-frame-options']).toBe('DENY');
}

describe('startServer', () => {
  it('listens on 127.0.0.1 at an address that holds no secret', async () => {
    expect(server.port).toBeGreaterThan(0);
    expect(server.address).toBe(`http://127.0.0.1:${server.port}/`);
    expect(server.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(server.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(server.credential).not.toBe(server.token);
    expect((await send(server.port)).status).toBe(200);
  });

  it('makes launch addresses that carry a launch code, never the token', () => {
    const url = new URL(server.launchUrl());
    expect(url.origin).toBe(`http://127.0.0.1:${server.port}`);
    expect(url.hash).toMatch(new RegExp(`^#${LAUNCH_PARAM}=[A-Za-z0-9_-]{22}$`));
    expect(server.launchUrl()).not.toContain(server.token);
  });

  it('cannot be reached through the other network interfaces', async (context) => {
    context.skip(
      externalAddress === undefined,
      'This machine has no IPv4 address but the loopback, so there is no other interface to try.',
    );
    const reached = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: externalAddress, port: server.port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    expect(reached).toBe(false);
  }, 15_000);

  it('listens on every interface with --listen 0.0.0.0 and still answers only 127.0.0.1 and localhost', async (context) => {
    context.skip(
      externalAddress === undefined,
      'This machine has no IPv4 address but the loopback, so there is no other interface to try.',
    );
    const everywhere = await startServer({
      session,
      port: 0,
      listen: '0.0.0.0',
      app: { mode: 'static', dir: appDir },
    });
    try {
      expect(everywhere.address).toBe(`http://127.0.0.1:${everywhere.port}/`);
      const ask = (hostHeader: string) =>
        new Promise<string>((resolve, reject) => {
          const socket = connect({ host: externalAddress, port: everywhere.port });
          let reply = '';
          socket.setEncoding('utf8');
          socket.once('connect', () =>
            socket.write(`GET / HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`),
          );
          socket.on('data', (chunk: string) => (reply += chunk));
          socket.once('end', () => resolve(reply));
          socket.once('error', reject);
        });
      expect(await ask(`${externalAddress}:${everywhere.port}`)).toMatch(/^HTTP\/1\.1 403 /);
      expect(await ask(`127.0.0.1:${everywhere.port}`)).toMatch(/^HTTP\/1\.1 200 /);
    } finally {
      await everywhere.close();
    }
  }, 15_000);

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
      history: {},
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

  it('ignores a message that has no request id, and stays open', async () => {
    const outcome = await openLive(server.port, { path: live(server.token), origin });
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    const { socket } = outcome;
    const answers: string[] = [];
    socket.on('message', (data) => answers.push(textOf(data)));
    socket.send(JSON.stringify({ type: 'element/create', name: 'No request id' }));
    socket.send('not even JSON');
    socket.send(Buffer.from([0xff, 0xfe]), { binary: true });
    const pong = new Promise<void>((resolve) => socket.once('pong', () => resolve()));
    socket.ping();
    await pong;
    expect(socket.readyState).toBe(socket.OPEN);
    expect(answers).toEqual([]);
    socket.close();
  });
});

describe('launch addresses with a theme', () => {
  it('carry the theme the person chose beside the launch code, and ask for it each time', async () => {
    let theme: 'light' | 'dark' | undefined = 'dark';
    const themed = await startServer({
      session,
      port: 0,
      app: { mode: 'static', dir: appDir },
      themeHint: () => theme,
    });
    try {
      const fragment = new URLSearchParams(new URL(themed.launchUrl()).hash.slice(1));
      expect(fragment.get('theme')).toBe('dark');
      expect(fragment.get(LAUNCH_PARAM)).toMatch(/^[A-Za-z0-9_-]{22}$/);
      theme = undefined;
      expect(new URL(themed.launchUrl()).hash).not.toContain('theme');
    } finally {
      await themed.close();
    }
  });
});

describe('launch addresses', () => {
  const codeOf = (url: string) =>
    new URLSearchParams(new URL(url).hash.slice(1)).get(LAUNCH_PARAM) ?? '';
  const launch = (code: string) => `${LIVE_PATH}?${LAUNCH_PARAM}=${code}`;

  it('open the live connection once, handing the page the session token', async () => {
    const code = codeOf(server.launchUrl());
    const outcome = await openLive(server.port, { path: launch(code), origin });
    if (!outcome.open) throw new Error(`The live connection was refused: ${outcome.status}`);
    expect(decodeServerMessage(outcome.firstMessage)).toEqual({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: snapshot,
      history: {},
      token: server.token,
    });
    outcome.socket.close();

    expect(await openLive(server.port, { path: launch(code), origin })).toEqual({
      open: false,
      status: 401,
    });
  });

  it('end when a newer one is made', async () => {
    const older = codeOf(server.launchUrl());
    const newer = codeOf(server.launchUrl());
    expect(await openLive(server.port, { path: launch(older), origin })).toEqual({
      open: false,
      status: 401,
    });
    const outcome = await openLive(server.port, { path: launch(newer), origin });
    expect(outcome.open).toBe(true);
    if (outcome.open) outcome.socket.close();
  });

  it('are refused from another origin, which does not spend them', async () => {
    const code = codeOf(server.launchUrl());
    expect(
      await openLive(server.port, { path: launch(code), origin: 'http://evil.example' }),
    ).toEqual({ open: false, status: 403 });
    const outcome = await openLive(server.port, { path: launch(code), origin });
    expect(outcome.open).toBe(true);
    if (outcome.open) outcome.socket.close();
  });
});

describe('the Claude endpoint', () => {
  let projectFolder: string;
  let live: Session;
  let running: RunningServer;
  let app: LiveClient;
  let claude: ClaudeClient;
  let opened: string[];
  let counts: number[];

  beforeEach(async () => {
    projectFolder = await mkdtemp(join(tmpdir(), 'va-claude-'));
    live = await openSample(projectFolder);
    opened = [];
    counts = [];
    running = await startServer({
      session: live,
      port: 0,
      app: { mode: 'static', dir: appDir },
      openBrowser: (url) => {
        opened.push(url);
        return Promise.resolve();
      },
      onConnections: (count) => counts.push(count),
    });
    app = await openLiveClient(running.port, running.token);
    claude = await openClaudeClient(running.port, running.credential);
    await expect.poll(() => [app.messages.length, claude.messages.length]).toEqual([1, 1]);
  });

  afterEach(async () => {
    await claude.close();
    await app.close();
    await running.close();
    await live.close();
    await rm(projectFolder, { recursive: true, force: true, maxRetries: 10 });
  });

  const claudePath = '/claude';

  it('greets Claude with the project, without the session token', () => {
    expect(claude.messages[0]).toEqual({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: live.snapshot,
      history: {},
    });
  });

  it('counts the apps and Claudes connected', () => {
    expect(counts).toEqual([1, 2]);
  });

  it.each([
    ['our own origin', () => ({ Origin: origin, Authorization: `Bearer ${running.credential}` })],
    [
      'a foreign origin',
      () => ({ Origin: 'http://evil.example', Authorization: `Bearer ${running.credential}` }),
    ],
  ])('refuses %s with 403, since only browsers send an origin', async (_case, headersOf) => {
    const outcome = await sendUpgrade(running.port, claudePath, headersOf());
    expect(outcome).toMatchObject({ upgraded: false, status: 403 });
  });

  it.each([
    ['without the credential', () => ({})],
    ['with the session token instead', () => ({ Authorization: `Bearer ${running.token}` })],
    ['with the credential in the query', () => ({})],
  ])('refuses Claude %s with 401', async (name, headersOf) => {
    const path = name.includes('query') ? `${claudePath}?token=${running.credential}` : claudePath;
    const outcome = await sendUpgrade(running.port, path, headersOf());
    expect(outcome).toMatchObject({ upgraded: false, status: 401 });
  });

  it('refuses a foreign host before anything else', async () => {
    const outcome = await sendUpgrade(running.port, claudePath, {
      Host: `evil.example:${running.port}`,
      Authorization: `Bearer ${running.credential}`,
    });
    expect(outcome).toMatchObject({ upgraded: false, status: 403 });
  });

  it('runs Claude’s command as Claude’s action, which the app sees and the person can undo', async () => {
    claude.send({
      type: 'command',
      requestId: 'c1',
      command: { type: 'update-element', id: 'patient', changes: { name: 'Client' } },
    });

    const [answer] = await claude.answers('c1');
    expect(answer).toMatchObject({
      type: 'project/changed',
      kind: 'do',
      author: 'claude',
      label: 'Rename "Patient" to "Client"',
      requestId: 'c1',
    });
    await expect.poll(() => app.messages.length).toBe(2);
    expect(app.messages[1]).toMatchObject({ type: 'project/changed', author: 'claude' });
    expect(app.messages[1] && 'requestId' in app.messages[1]).toBe(false);

    app.send({ type: 'undo', requestId: 'u1' });
    await expect.poll(() => claude.messages.length).toBe(3);
    expect(claude.messages[2]).toMatchObject({
      type: 'project/changed',
      kind: 'undo',
      author: 'claude',
    });
  });

  it('runs a command as Claude’s whatever author it names', async () => {
    claude.send({
      type: 'command',
      requestId: 'c2',
      author: 'user',
      command: { type: 'update-element', id: 'patient', changes: { name: 'Client' } },
    });
    const [answer] = await claude.answers('c2');
    expect(answer).toMatchObject({ type: 'project/changed', author: 'claude' });
  });

  it.each([
    ['undo', { type: 'undo', requestId: 'x1' }],
    ['redo', { type: 'redo', requestId: 'x1' }],
    ['preferences', { type: 'preferences/set', requestId: 'x1', changes: { theme: 'dark' } }],
  ])('refuses %s, which are the person’s, and changes nothing', async (_case, message) => {
    claude.send(message);
    const [answer] = await claude.answers('x1');
    expect(answer).toMatchObject({
      type: 'command/rejected',
      requestId: 'x1',
      problems: [{ code: 'invalid-command' }],
    });
    expect(app.messages).toHaveLength(1);
  });

  it('shows guidance in the apps only, and says how many it reached', async () => {
    const guidance = { kind: 'highlight', targets: ['patient'] };
    claude.send({ type: 'guidance', requestId: 'g1', guidance });

    expect(await claude.answers('g1')).toEqual([
      { type: 'guidance/shown', requestId: 'g1', apps: 1 },
    ]);
    await expect.poll(() => app.messages.length).toBe(2);
    expect(app.messages[1]).toEqual({ type: 'guidance', guidance });
    expect(claude.messages.some((message) => message.type === 'guidance')).toBe(false);
    expect(live.history).toEqual({});
  });

  it('refuses guidance it cannot read', async () => {
    claude.send({ type: 'guidance', requestId: 'g2', guidance: { kind: 'explode' } });
    const [answer] = await claude.answers('g2');
    expect(answer).toMatchObject({
      type: 'command/rejected',
      problems: [{ code: 'invalid-command' }],
    });
    expect(app.messages).toHaveLength(1);
  });

  it('opens the app at an address that works once', async () => {
    claude.send({ type: 'open-app', requestId: 'o1' });
    expect(await claude.answers('o1')).toEqual([{ type: 'app/opened', requestId: 'o1' }]);
    expect(opened).toHaveLength(1);
    const url = new URL(opened[0] ?? '');
    const code = new URLSearchParams(url.hash.slice(1)).get(LAUNCH_PARAM) ?? '';
    const outcome = await openLive(running.port, {
      path: `${LIVE_PATH}?${LAUNCH_PARAM}=${code}`,
      origin: `http://127.0.0.1:${running.port}`,
    });
    expect(outcome.open).toBe(true);
    if (outcome.open) outcome.socket.close();
  });

  it('opens the app at a view state, which the launch address carries after its code', async () => {
    claude.send({
      type: 'open-app',
      requestId: 'o2',
      state: { view: 'system-overview', select: ['appointments-api'] },
    });
    expect(await claude.answers('o2')).toEqual([{ type: 'app/opened', requestId: 'o2' }]);
    expect(opened).toHaveLength(1);
    const fragment = new URLSearchParams(new URL(opened[0] ?? '').hash.slice(1));
    expect(fragment.get(LAUNCH_PARAM)).toMatch(/^[\w-]{16,}$/);
    expect(fragment.get('view')).toBe('system-overview');
    expect(fragment.get('select')).toBe('appointments-api');
    expect(opened[0]).not.toContain(running.token);
  });

  it('opens the app at a view state whose filters hold a time range', async () => {
    const range = { of: 'elements', attribute: 'sizeGb', kind: 'number', from: 2, to: 20 };
    claude.send({
      type: 'open-app',
      requestId: 'o5',
      state: { view: 'system-overview', filters: { range } },
    });
    expect(await claude.answers('o5')).toEqual([{ type: 'app/opened', requestId: 'o5' }]);
    const hash = new URL(opened[0] ?? '').hash;
    expect(readViewState(hash)).toEqual({
      ok: true,
      state: {
        view: 'system-overview',
        filters: { components: [], relationTypes: [], conditions: [], range },
      },
    });
  });

  it('refuses to open the app at a view state the project does not hold, or cannot be one', async () => {
    claude.send({ type: 'open-app', requestId: 'o3', state: { view: 'nowhere' } });
    expect(await claude.answers('o3')).toEqual([
      {
        type: 'command/rejected',
        requestId: 'o3',
        problems: [{ code: 'invalid-command', message: 'The project has no view "nowhere".' }],
      },
    ]);
    claude.send({ type: 'open-app', requestId: 'o4', state: { view: 'system-overview', zoom: 2 } });
    const [answer] = await claude.answers('o4');
    expect(answer).toMatchObject({
      type: 'command/rejected',
      problems: [{ code: 'invalid-command' }],
    });
    expect(opened).toEqual([]);
  });

  it('tells Claude about the person’s changes too', async () => {
    app.send({
      type: 'command',
      requestId: 'r1',
      command: { type: 'update-element', id: 'patient', changes: { name: 'Client' } },
    });
    await expect.poll(() => claude.messages.length).toBe(2);
    expect(claude.messages[1]).toMatchObject({ type: 'project/changed', author: 'user' });
    expect(claude.messages[1] && 'requestId' in claude.messages[1]).toBe(false);
  });
});

describe('commands over the live connection', () => {
  let projectFolder: string;
  let live: Session;
  let running: RunningServer;
  let apps: LiveClient[];

  beforeEach(async () => {
    projectFolder = await mkdtemp(join(tmpdir(), 'va-live-'));
    live = await openSample(projectFolder);
    running = await startServer({ session: live, port: 0, app: { mode: 'static', dir: appDir } });
    apps = [
      await openLiveClient(running.port, running.token),
      await openLiveClient(running.port, running.token),
    ];
    await expect.poll(() => apps.every((app) => app.messages.length === 1)).toBe(true);
  });

  afterEach(async () => {
    for (const app of apps) await app.close();
    await running.close();
    await live.close();
    await rm(projectFolder, { recursive: true, force: true, maxRetries: 10 });
  });

  /** The messages each app got after the project, once both have as many as expected. */
  async function after(counts: [number, number]): Promise<ServerMessage[][]> {
    await expect
      .poll(() => apps.map((app) => app.messages.length - 1), { timeout: 5000 })
      .toEqual(counts);
    return apps.map((app) => app.messages.slice(1));
  }

  const rename = { type: 'update-element', id: 'patient', changes: { name: 'Client' } };

  it('runs a command from one app and tells both, only the sender with its request id', async () => {
    const [sender, other] = apps as [LiveClient, LiveClient];

    sender.send({ type: 'command', requestId: 'r1', command: rename });

    const [toSender, toOther] = await after([1, 1]);
    const change = {
      type: 'project/changed',
      kind: 'do',
      label: 'Rename "Patient" to "Client"',
      author: 'user',
      history: { undo: { label: 'Rename "Patient" to "Client"', author: 'user' } },
      warnings: [],
      created: [],
    };
    expect(toSender).toMatchObject([{ ...change, requestId: 'r1' }]);
    expect(toOther).toMatchObject([change]);
    expect(toOther?.[0] && 'requestId' in toOther[0]).toBe(false);
    expect(other.messages).toHaveLength(2);
    const saved = JSON.parse(await readText(projectFolder, 'model.vamodel')) as ModelFile;
    expect(saved.elements.find((element) => element.id === 'patient')?.name).toBe('Client');
  });

  it('answers a rejected command to its sender only', async () => {
    const [sender] = apps as [LiveClient, LiveClient];

    sender.send({
      type: 'command',
      requestId: 'r2',
      command: { type: 'delete', elements: ['nobody'] },
    });

    const [toSender] = await after([1, 0]);
    expect(toSender).toEqual([
      {
        type: 'command/rejected',
        requestId: 'r2',
        problems: [
          {
            code: 'unknown-element',
            message: 'There is no element "nobody".',
            subjects: ['nobody'],
          },
        ],
      },
    ]);
  });

  it('tells both apps about an undo and a redo', async () => {
    const [first, second] = apps as [LiveClient, LiveClient];

    first.send({ type: 'command', requestId: 'r1', command: rename });
    await after([1, 1]);
    second.send({ type: 'undo', requestId: 'u1' });
    await after([2, 2]);
    first.send({ type: 'redo', requestId: 'u2' });

    const [toFirst, toSecond] = await after([3, 3]);
    const summary = (messages: ServerMessage[] | undefined) =>
      (messages ?? []).map((message) =>
        message.type === 'project/changed' ? [message.kind, message.requestId] : [message.type],
      );
    expect(summary(toFirst)).toEqual([
      ['do', 'r1'],
      ['undo', undefined],
      ['redo', 'u2'],
    ]);
    expect(summary(toSecond)).toEqual([
      ['do', undefined],
      ['undo', 'u1'],
      ['redo', undefined],
    ]);
  });

  it('answers a malformed message that has a request id with command/rejected', async () => {
    const [sender] = apps as [LiveClient, LiveClient];

    sender.send({ type: 'command', requestId: 'm1', command: 'delete everything' });
    sender.send('not JSON');
    sender.send({ type: 'undo', requestId: 'm2' });

    const [toSender] = await after([2, 0]);
    expect(toSender).toEqual([
      {
        type: 'command/rejected',
        requestId: 'm1',
        problems: [{ code: 'invalid-command', message: 'The message has no command.' }],
      },
      {
        type: 'command/rejected',
        requestId: 'm2',
        problems: [{ code: 'nothing-to-undo', message: 'There is nothing to undo.' }],
      },
    ]);
  });
});

describe('closing', () => {
  it('closes the live connections and stops listening', async () => {
    const running = await startServer({
      session,
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
      session,
      port: 0,
      app: { mode: 'static', dir: appDir },
    });
    const socket = connect({ host: '127.0.0.1', port: running.port });
    // Closing may reset the connection, as macOS does; that is the close this test waits for.
    socket.on('error', () => undefined);
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
      startServer({ session, port: 0, app: { mode: 'static', dir: empty } }),
    ).rejects.toThrow(/is missing\. Run `pnpm build` first\.$/);
  });

  it('reports a port that is already in use', async () => {
    await expect(
      startServer({ session, port: server.port, app: { mode: 'static', dir: appDir } }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});

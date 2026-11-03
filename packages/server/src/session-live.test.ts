/**
 * Live values in the session (ADR 0057, ADR 0063): kept in memory only, sent to every app, forgotten
 * with what the model loses; fetched for approved package code granted an origin, through the
 * program, which checks the origin; and never a command, a file or an action of the history.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PREFERENCES,
  encodeMessage,
  packageCodeOf,
  type CodeApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreferencesStore } from './preferences';
import { startServer } from './server';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, filesIn, testProject, writeProjectFolder } from './test-support';

let folder: string;
const opened: Session[] = [];
let approvals: CodeApproval[] = [];
let turnedOff: string[] = [];

const preferences: PreferencesStore = {
  current: () => ({ ...DEFAULT_PREFERENCES, codeApprovals: approvals, codeTurnedOff: turnedOff }),
  set: () => Promise.reject(new Error('Not in these tests.')),
  close: () => Promise.resolve(),
};

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-live-'));
  approvals = [];
  turnedOff = [];
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function open(project: ProjectSnapshot = testProject(), options: SessionOptions = {}) {
  await writeProjectFolder(folder, project);
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    preferences,
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return result.session;
}

const CLAUDE = { kind: 'claude' } as const;

describe('live values in the session', () => {
  it('sends them to every app, and greets a new one with them, writing nothing', async () => {
    const session = await open();
    const before = await filesIn(folder);
    const app = new FakeClient();
    session.connect(app);
    const kept = session.setLive({}, CLAUDE, [
      { target: 'api', attribute: 'latency', value: 120 },
      { target: 'api-reads-db', attribute: 'calls', value: 3 },
    ]);
    expect(kept).toMatchObject({ kept: 2, unknown: [], refused: [] });
    expect(app.ofType('live/values')).toHaveLength(1);
    const later = new FakeClient();
    session.connect(later);
    expect(later.ofType('live/values')[0]?.values.map((each) => each.target)).toEqual([
      'api',
      'api-reads-db',
    ]);
    await session.idle();
    expect(session.history).toEqual({});
    expect(await filesIn(folder)).toEqual(before);
  });

  it('forgets the values of what a change takes away, and says so to every app', async () => {
    const session = await open();
    const app = new FakeClient();
    session.connect(app);
    session.setLive({}, CLAUDE, [
      { target: 'cart', attribute: 'items', value: 5 },
      { target: 'api', attribute: 'latency', value: 1 },
    ]);
    await session.execute({ type: 'delete', elements: ['cart'] }, 'user');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.ofType('live/values').at(-1)?.removed).toEqual([
      { target: 'cart', attribute: 'items' },
    ]);
    // Undo brings the element back, not its live value: the next one comes from its sender.
    await session.undo();
    const greeted = new FakeClient();
    session.connect(greeted);
    expect(greeted.ofType('live/values')[0]?.values.map((each) => each.target)).toEqual(['api']);
  });

  it('clears them', async () => {
    const session = await open();
    session.setLive({}, CLAUDE, [{ target: 'api', attribute: 'latency', value: 1 }]);
    expect(session.clearLive({ sender: CLAUDE })).toBe(1);
    expect(session.clearLive({})).toBe(0);
  });

  it('takes live values only of what the code of a package runs on, once approved with an origin', async () => {
    const session = await open(withCode(['network:https://status.example.com']));
    const app = new FakeClient();
    session.connect(app);
    const values = [
      { target: 'cart', attribute: 'items', value: 4 },
      { target: 'api', attribute: 'latency', value: 1 },
    ];
    const send = () =>
      session.receive(
        app,
        encodeMessage({ type: 'live/set', requestId: 'r1', package: 'shop', values }),
      );
    await send();
    expect(app.ofType('command/rejected').at(-1)?.problems[0]?.message).toBe(
      'The code of “Shop” is not approved as it is now, so it reaches nothing.',
    );
    approve(session, []);
    await send();
    expect(app.ofType('command/rejected').at(-1)?.problems[0]?.message).toBe(
      'The code of “Shop” is granted no origin, so it fetches nothing and sends no live values.',
    );
    approve(session, ['network:https://status.example.com']);
    await send();
    expect(app.ofType('live/kept').at(-1)).toEqual({
      type: 'live/kept',
      requestId: 'r1',
      kept: 1,
      waiting: 0,
      dropped: 0,
      unknown: [],
      refused: [{ at: 1, reason: 'is of something the code of “Shop” does not run on' }],
    });
    expect(app.ofType('live/values').at(-1)?.values[0]).toMatchObject({
      target: 'cart',
      sender: { kind: 'package', package: 'shop' },
    });
  });
});

describe('fetching for package code', () => {
  let server: Server;
  let origin: string;
  let requests: { url: string; headers: Record<string, unknown>; method: string }[];

  beforeEach(async () => {
    requests = [];
    server = createServer((request, response) => {
      requests.push({
        url: request.url ?? '',
        headers: { ...request.headers },
        method: request.method ?? '',
      });
      if (request.url === '/latency') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"api": 120}');
      } else if (request.url === '/elsewhere') {
        response.writeHead(302, { location: 'https://other.example.com/' });
        response.end('moved');
      } else if (request.url === '/large') {
        response.writeHead(200);
        response.end('x'.repeat(2048));
      } else if (request.url === '/slow') {
        setTimeout(() => response.end('late'), 2_000);
      } else {
        response.writeHead(404);
        response.end('none');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  async function fetchAs(session: Session, app: FakeClient, url: string, requestId: string) {
    await session.receive(
      app,
      encodeMessage({ type: 'live/fetch', requestId, package: 'shop', url }),
    );
    return (
      app.ofType('live/fetched').find((each) => each.requestId === requestId) ??
      app.ofType('command/rejected').find((each) => each.requestId === requestId)
    );
  }

  it('fetches an address on the origin granted, as a plain GET, and hands back its text', async () => {
    const session = await open(withCode([`network:${origin}`]), {
      fetcher: { limits: { timeoutMs: 500, bytes: 1024 } },
    });
    approve(session, [`network:${origin}`]);
    const app = new FakeClient();
    session.connect(app);
    expect(await fetchAs(session, app, `${origin}/latency#part`, 'r1')).toEqual({
      type: 'live/fetched',
      requestId: 'r1',
      status: 200,
      text: '{"api": 120}',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.headers.cookie).toBeUndefined();
    expect(requests[0]?.headers.authorization).toBeUndefined();
  });

  it('follows no redirect, reads no more than its cap and waits no longer than its time', async () => {
    const session = await open(withCode([`network:${origin}`]), {
      fetcher: { limits: { timeoutMs: 300, bytes: 1024 } },
    });
    approve(session, [`network:${origin}`]);
    const app = new FakeClient();
    session.connect(app);
    expect(await fetchAs(session, app, `${origin}/elsewhere`, 'r1')).toMatchObject({
      type: 'live/fetched',
      status: 302,
    });
    expect(requests.map((each) => each.url)).toEqual(['/elsewhere']);
    const large = await fetchAs(session, app, `${origin}/large`, 'r2');
    expect(large).toMatchObject({ type: 'command/rejected' });
    expect(JSON.stringify(large)).toMatch(/answered with more than 1 KiB/);
    const slow = await fetchAs(session, app, `${origin}/slow`, 'r3');
    expect(JSON.stringify(slow)).toMatch(/did not answer within 0.3 seconds/);
  });

  it('refuses any origin not granted, and code that is not approved as it is now', async () => {
    const session = await open(withCode([`network:${origin}`, 'network:https://a.example.com']), {
      fetcher: { limits: { timeoutMs: 300, bytes: 1024 } },
    });
    const app = new FakeClient();
    session.connect(app);
    expect(JSON.stringify(await fetchAs(session, app, `${origin}/latency`, 'r0'))).toMatch(
      /not approved as it is now/,
    );
    // The person granted only one of the two origins it declares.
    approve(session, ['network:https://a.example.com']);
    for (const [at, url] of [
      `${origin}/latency`,
      'file:///etc/passwd',
      `http://user:secret@127.0.0.1:${new URL(origin).port}/latency`,
      'http://localhost/latency',
    ].entries()) {
      const answer = await fetchAs(session, app, url, `r${at + 1}`);
      expect(answer?.type, url).toBe('command/rejected');
    }
    expect(requests).toEqual([]);
    const other = await session.receive(
      app,
      encodeMessage({ type: 'live/fetch', requestId: 'r9', package: 'nothing', url: origin }),
    );
    expect(other).toBeUndefined();
    expect(app.ofType('command/rejected').at(-1)?.problems[0]?.message).toBe(
      'The package "nothing" holds no code.',
    );
  });

  it('neither fetches nor takes live values for code turned off on this computer (M14’s review)', async () => {
    const session = await open(withCode([`network:${origin}`]));
    const app = new FakeClient();
    session.connect(app);
    approve(session, [`network:${origin}`]);
    turnedOff = ['shop'];
    const off =
      'The code of the package "Shop" is turned off on this computer: it runs again once it is turned on in Packages….';
    expect(await fetchAs(session, app, `${origin}/latency`, 'r1')).toMatchObject({
      type: 'command/rejected',
      problems: [{ code: 'code-off', message: off }],
    });
    await session.receive(
      app,
      encodeMessage({
        type: 'live/set',
        requestId: 'r2',
        package: 'shop',
        values: [{ target: 'cart', attribute: 'items', value: 4 }],
      }),
    );
    expect(app.ofType('command/rejected').at(-1)?.problems[0]?.message).toBe(off);
    expect(requests).toEqual([]);
    // Turned on again, the approval it kept holds.
    turnedOff = [];
    expect(await fetchAs(session, app, `${origin}/latency`, 'r3')).toMatchObject({
      type: 'live/fetched',
    });
  });

  it('never fetches from the program itself, whatever is granted', async () => {
    // A port free now, which the program then listens on, and which the code declares and is granted.
    const free = createServer();
    await new Promise<void>((resolve) => free.listen(0, '127.0.0.1', resolve));
    const programPort = (free.address() as AddressInfo).port;
    await new Promise((resolve) => free.close(resolve));
    const own = `http://127.0.0.1:${programPort}`;
    const session = await open(withCode([`network:${own}`]));
    const appDir = await mkdtemp(join(tmpdir(), 'va-live-dist-'));
    await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
    const program = await startServer({
      session,
      port: programPort,
      app: { mode: 'static', dir: appDir },
    });
    try {
      approve(session, [`network:${own}`]);
      const app = new FakeClient();
      session.connect(app);
      const answer = await fetchAs(session, app, `${own}/`, 'own');
      expect(answer?.type).toBe('command/rejected');
      expect(JSON.stringify(answer)).toMatch(/leads to Visual Anything itself/);
    } finally {
      await program.close();
      await rm(appDir, { recursive: true, force: true, maxRetries: 10 });
    }
  });

  it('keeps at most four of a package’s fetches under way', async () => {
    const session = await open(withCode([`network:${origin}`]), {
      fetcher: { limits: { timeoutMs: 1_000, bytes: 1024 } },
    });
    approve(session, [`network:${origin}`]);
    const app = new FakeClient();
    session.connect(app);
    const all = Array.from({ length: 5 }, (_, at) =>
      fetchAs(session, app, `${origin}/slow`, `s${at}`),
    );
    const answers = await Promise.all(all);
    const busy = answers.filter((each) =>
      JSON.stringify(each).includes('fetches under way already'),
    );
    expect(busy).toHaveLength(1);
  });
});

/** The test project, with code in its Shop package that declares these capabilities. */
function withCode(capabilities: string[]): ProjectSnapshot {
  const project = testProject();
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'shop'
        ? { ...file, code: ['export function attributes() { return {}; }'], capabilities }
        : file,
    ),
  };
}

/** What the person does in the app: approve the Shop package's code as it is now. */
function approve(session: Session, capabilities: string[]): void {
  const file = session.snapshot.packages.find((each) => each.id === 'shop');
  const code = file === undefined ? undefined : packageCodeOf(file);
  if (code === undefined) throw new Error('The Shop package holds no code.');
  approvals = [{ hash: code.hash, package: 'shop', capabilities }];
}

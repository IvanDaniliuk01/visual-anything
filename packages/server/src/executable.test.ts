import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  APP_ASSET_PREFIX,
  DEV_IN_EXECUTABLE,
  embeddedAppFiles,
  isExecutable,
  startProgramWith,
} from './executable';
import { WORKER_POLICY, inlineScriptHashes, pagePolicy } from './policies';
import { startServer, type RunningServer } from './server';
import { openSession, type Session } from './session';
import { AppNotBuiltError, memoryFiles } from './static';
import { send } from './test-support';

const SAMPLE = fileURLToPath(new URL('../../../examples/my-systems', import.meta.url));
const THEME_SCRIPT = "document.documentElement.dataset.theme = 'dark';";
const INDEX = `<!doctype html><title>Visual Anything</title><script>${THEME_SCRIPT}</script><div id="root"></div>`;

/** Reads assets by key as `node:sea` does, throwing its error for a key the executable lacks. */
function assetsOf(assets: Record<string, string>) {
  return (key: string): ArrayBuffer => {
    const text = assets[key];
    if (text === undefined) {
      throw Object.assign(new Error(`Cannot find asset ${key} for the single executable`), {
        code: 'ERR_SINGLE_EXECUTABLE_APPLICATION_ASSET_NOT_FOUND',
      });
    }
    const bytes = Buffer.from(text, 'utf8');
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  };
}

describe('isExecutable', () => {
  it('is false when the local program runs from its sources, as here', () => {
    expect(isExecutable()).toBe(false);
  });
});

describe('embeddedAppFiles', () => {
  it(`reads each file of the built app from the asset under ${APP_ASSET_PREFIX}`, async () => {
    const files = embeddedAppFiles(assetsOf({ 'app/index.html': INDEX, 'app/assets/a.js': 'a' }));
    expect(Buffer.from((await files.read('index.html')) ?? []).toString('utf8')).toBe(INDEX);
    expect(Buffer.from((await files.read('assets/a.js')) ?? []).toString('utf8')).toBe('a');
  });

  it('reads nothing for a file the executable does not hold', async () => {
    const files = embeddedAppFiles(
      assetsOf({ 'app/index.html': INDEX, 'notes.txt': 'not the app' }),
    );
    expect(await files.read('missing.js')).toBeUndefined();
    expect(await files.read('../notes.txt')).toBeUndefined();
  });

  it('lets any other failure through', async () => {
    const files = embeddedAppFiles(() => {
      throw new Error('The executable is damaged.');
    });
    await expect(files.read('index.html')).rejects.toThrow('The executable is damaged.');
  });
});

describe('the local program serving the app the executable holds', () => {
  let folder: string;
  let session: Session;
  let server: RunningServer;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'va-executable-'));
    await cp(SAMPLE, join(folder, 'project'), { recursive: true });
    const opened = await openSession(join(folder, 'project'), {
      watch: false,
      out: () => {},
      err: () => {},
    });
    if (!opened.ok) throw new Error('The sample project does not open.');
    session = opened.session;
    const files = embeddedAppFiles(
      assetsOf({
        'app/index.html': INDEX,
        'app/assets/app.js': 'app',
        'app/assets/style.css': 'style',
        'app/favicon.ico': 'icon',
      }),
    );
    server = await startServer({ session, port: 0, app: { mode: 'embedded', files } });
  });

  afterAll(async () => {
    await server.close();
    await session.close();
    await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  });

  it('serves its page for /, allowing its inline script by the hash read from the page it holds', async () => {
    const reply = await send(server.port);
    expect(reply.status).toBe(200);
    expect(reply.body).toBe(INDEX);
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.headers['content-security-policy']).toBe(
      pagePolicy(server.port, {
        trustedTypes: true,
        scriptHashes: inlineScriptHashes(INDEX),
        framePort: server.framePort,
      }),
    );
    expect(reply.headers['x-content-type-options']).toBe('nosniff');
    expect(reply.headers['x-frame-options']).toBe('DENY');
  });

  it.each([
    ['/assets/app.js', 'text/javascript; charset=utf-8', WORKER_POLICY],
    ['/assets/style.css', 'text/css; charset=utf-8', "frame-ancestors 'none'"],
    ['/favicon.ico', 'image/x-icon', "frame-ancestors 'none'"],
  ])('serves %s as %s, with its policy', async (path, type, policy) => {
    const reply = await send(server.port, { path });
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toBe(type);
    expect(reply.headers['content-security-policy']).toBe(policy);
    expect(reply.headers['cache-control']).toBeUndefined();
  });

  it.each([
    ['/missing.js', 404],
    ['/assets/', 404],
    ['/../app/index.html', 403],
    ['/%2e%2e/notes.txt', 403],
    ['/assets%5capp.js', 403],
    ['/%00', 400],
  ])('refuses %s with %i', async (path, status) => {
    expect((await send(server.port, { path })).status).toBe(status);
  });

  it('answers HEAD without a body, and refuses POST', async () => {
    const head = await send(server.port, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength(INDEX)));
    expect(head.body).toBe('');
    const origin = `http://127.0.0.1:${server.port}`;
    expect((await send(server.port, { method: 'POST', headers: { Origin: origin } })).status).toBe(
      405,
    );
  });

  it('checks the Host and Origin of every request, as from a folder', async () => {
    const host = await send(server.port, { headers: { Host: `evil.example:${server.port}` } });
    expect(host.status).toBe(403);
    const origin = await send(server.port, { headers: { Origin: 'http://evil.example' } });
    expect(origin.status).toBe(403);
  });

  it('refuses to start when the executable holds no built app', async () => {
    await expect(
      startServer({ session, port: 0, app: { mode: 'embedded', files: memoryFiles(new Map()) } }),
    ).rejects.toThrow(AppNotBuiltError);
  });
});

describe('startProgramWith', () => {
  let folder: string;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'va-start-'));
  });

  afterAll(async () => {
    await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  });

  it('starts the program in the background on the folder, without opening the browser, its output in the log', async () => {
    const log = join(folder, 'program.log');
    // This Node.js stands in for the executable: it prints the arguments and the runtime folder.
    const script =
      'console.log(JSON.stringify({ args: process.argv.slice(1), runtime: process.env.VISUAL_ANYTHING_RUNTIME }))';
    const start = startProgramWith(join(folder, 'run'), process.execPath, ['-e', script]);
    const { exited } = start(join(folder, 'project'), log);
    expect(await exited).toBe(0);
    expect(JSON.parse(await readFile(log, 'utf8'))).toEqual({
      args: [join(folder, 'project'), '--no-open', '--stop-when-idle'],
      runtime: join(folder, 'run'),
    });
  });
});

describe('dev mode in the executable', () => {
  it('is refused with a reason that says where it works', () => {
    expect(DEV_IN_EXECUTABLE).toMatch(/--dev/);
    expect(DEV_IN_EXECUTABLE).toMatch(/pnpm dev/);
  });
});

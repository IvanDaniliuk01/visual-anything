import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LIVE_PATH,
  TOKEN_PARAM,
  decodeServerMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { toForwardSlashes } from './paths';
import {
  LIVE_MAX_PAYLOAD,
  CODE_WORKER_POLICY,
  WORKER_POLICY,
  isCodeWorkerPath,
  inlineScriptHashes,
  pagePolicy,
  servesProjectFile,
} from './policies';
import { startServer, type RunningServer } from './server';
import { openSession, type Session } from './session';
import { send, textOf, writeProjectFolder } from './test-support';

const PROJECT: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'Policies', packages: [] },
  model: {
    world: { id: 'world', component: 'essence', name: 'World' },
    elements: [],
    relations: [],
  },
  packages: [],
  views: [],
  scenarios: [],
  tours: [],
  comments: [],
};

const THEME_SCRIPT = "document.documentElement.dataset.theme = 'dark';";
const INDEX = `<!doctype html><html><head><script>${THEME_SCRIPT}</script><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>`;

/** How a request names a file through Vite's `/@fs/`. */
function fsPath(path: string): string {
  return `/@fs/${toForwardSlashes(path).replace(/^\//, '')}`;
}

describe('pagePolicy', () => {
  it('lets the built page run only its own scripts, connect only to the local program, and make HTML only through its Trusted Types policy', () => {
    expect(pagePolicy(47715, { trustedTypes: true })).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; " +
        "font-src 'self'; connect-src 'self' ws://127.0.0.1:47715 ws://localhost:47715; worker-src 'self'; " +
        "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
        "require-trusted-types-for 'script'; trusted-types default",
    );
  });

  it('in dev mode, leaves Trusted Types out and allows the scripts that carry the nonce', () => {
    const policy = pagePolicy(5000, { trustedTypes: false, nonce: 'abc123==' });
    expect(policy).toContain("script-src 'self' 'nonce-abc123=='");
    expect(policy).not.toContain('trusted-types');
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('allows inline scripts by their hashes', () => {
    expect(pagePolicy(1, { trustedTypes: true, scriptHashes: ['sha256-x'] })).toContain(
      "script-src 'self' 'sha256-x'",
    );
  });
});

describe('inlineScriptHashes', () => {
  it('hashes the inline scripts of a page, not the ones it loads', () => {
    const hash = createHash('sha256').update(THEME_SCRIPT).digest('base64');
    expect(inlineScriptHashes(INDEX)).toEqual([`sha256-${hash}`]);
    expect(inlineScriptHashes('<script src="/a.js"></script>')).toEqual([]);
  });
});

describe('servesProjectFile', () => {
  let folder: string;
  let root: string;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'va-guard-'));
    root = join(folder, 'app');
    await mkdir(root);
    await writeFile(join(root, 'main.js'), '');
  });

  afterAll(async () => {
    await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  });

  it.each(['Juan (Work)', 'a{b,c}', '[x]*?'.replace(/[*?]/g, '_')])(
    'refuses every way of naming a file of a project in a folder named %s',
    async (name) => {
      const project = join(folder, name);
      await mkdir(project, { recursive: true });
      await writeFile(join(project, 'model.vamodel'), '{}');
      const folders = { project, root };
      const refuses = (url: string) => servesProjectFile({ url }, folders);
      const file = join(project, 'model.vamodel');
      expect(await refuses(fsPath(file))).toBe(true);
      expect(await refuses(encodeURI(fsPath(file)))).toBe(true);
      expect(await refuses(`${encodeURI(fsPath(file))}?raw`)).toBe(true);
      expect(await refuses(fsPath(join(project, 'packages', 'missing.vapackage')))).toBe(true);
      expect(await refuses(fsPath(project))).toBe(true);
      expect(await refuses(`/@id/${toForwardSlashes(file).replace(/^\//, '')}`)).toBe(true);
      expect(await refuses(fsPath(join(root, '..', name, 'model.vamodel')))).toBe(true);
      // Neither a sibling whose name starts the same, nor the app's own files.
      expect(await refuses(fsPath(join(folder, `${name}2`, 'model.vamodel')))).toBe(false);
      expect(await refuses(fsPath(join(root, 'main.js')))).toBe(false);
      expect(await refuses('/main.js')).toBe(false);
    },
  );

  it('refuses a project inside the app folder, under its own path', async () => {
    const project = join(root, 'examples', 'Juan (Work)');
    await mkdir(project, { recursive: true });
    const refuses = (url: string) => servesProjectFile({ url }, { project, root });
    expect(await refuses('/examples/Juan%20(Work)/model.vamodel')).toBe(true);
    expect(await refuses('/examples/model.vamodel')).toBe(false);
  });

  it('refuses a link from outside that leads into the project', async (context) => {
    const project = join(folder, 'linked project');
    await mkdir(project, { recursive: true });
    const link = join(folder, 'link');
    try {
      await symlink(project, link, 'junction');
    } catch {
      context.skip('This user may not make a link to a folder here.');
    }
    expect(
      await servesProjectFile({ url: fsPath(join(link, 'model.vamodel')) }, { project, root }),
    ).toBe(true);
  });
});

describe('the built app', () => {
  let folder: string;
  let session: Session;
  let server: RunningServer;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'va-policies-'));
    const project = join(folder, 'project');
    await writeProjectFolder(project, PROJECT);
    const opened = await openSession(project, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The test project does not open.');
    session = opened.session;
    const dist = join(folder, 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), INDEX);
    await writeFile(join(dist, 'assets', 'app.js'), 'export {};');
    await writeFile(join(dist, 'assets', 'layout.worker.js'), 'self.onmessage = () => {};');
    await writeFile(join(dist, 'assets', 'code.worker-AbC_12-x.js'), 'self.onmessage = () => {};');
    await writeFile(join(dist, 'assets', 'style.css'), 'body {}');
    server = await startServer({ session, port: 0, app: { mode: 'static', dir: dist } });
  });

  afterAll(async () => {
    await server.close();
    await session.close();
    await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  });

  it('serves its page with the page policy, its inline script allowed by its hash', async () => {
    const reply = await send(server.port);
    expect(reply.headers['content-security-policy']).toBe(
      pagePolicy(server.port, { trustedTypes: true, scriptHashes: inlineScriptHashes(INDEX) }),
    );
  });

  it('serves every JavaScript file with the worker policy, which allows no connection', async () => {
    for (const path of ['/assets/app.js', '/assets/layout.worker.js']) {
      const reply = await send(server.port, { path });
      expect(reply.headers['content-security-policy']).toBe(WORKER_POLICY);
    }
  });

  it('serves the code worker with its own policy, which compiles WebAssembly and connects nowhere', async () => {
    const reply = await send(server.port, { path: '/assets/code.worker-AbC_12-x.js' });
    expect(reply.headers['content-security-policy']).toBe(CODE_WORKER_POLICY);
    expect(CODE_WORKER_POLICY).toContain("'wasm-unsafe-eval'");
    expect(CODE_WORKER_POLICY).toContain("connect-src 'none'");
    expect(CODE_WORKER_POLICY).not.toContain("'unsafe-eval'");
    expect(WORKER_POLICY).not.toContain('wasm-unsafe-eval');
  });

  it('keeps frame-ancestors on everything else', async () => {
    for (const path of ['/assets/style.css', '/missing.png']) {
      const reply = await send(server.port, { path });
      expect(reply.headers['content-security-policy']).toBe("frame-ancestors 'none'");
    }
  });

  it('takes a 3 MiB message on the live connection, and closes it with code 1009 for a 5 MiB one', async () => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.port}${LIVE_PATH}?${TOKEN_PARAM}=${server.token}`,
      {
        origin: `http://127.0.0.1:${server.port}`,
      },
    );
    const messages: string[] = [];
    socket.on('message', (data) => messages.push(textOf(data)));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    const message = (size: number) =>
      JSON.stringify({ type: 'nothing', requestId: 'r1', padding: 'x'.repeat(size) });
    expect(message(3 * 1024 * 1024).length).toBeLessThan(LIVE_MAX_PAYLOAD);
    socket.send(message(3 * 1024 * 1024));
    await expect
      .poll(() => messages.map((each) => decodeServerMessage(each).type))
      .toContain('command/rejected');

    const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
    socket.send(message(5 * 1024 * 1024));
    expect(await closed).toBe(1009);
  });
});

describe('isCodeWorkerPath', () => {
  it('names the code worker built and in dev mode, and nothing else', () => {
    expect(isCodeWorkerPath('/assets/code.worker-BKa9oldY.js')).toBe(true);
    expect(isCodeWorkerPath('/src/code/code.worker.ts?worker_file&type=module')).toBe(true);
    for (const path of [
      '/assets/layout.worker-BVII4DNO.js',
      '/assets/index-DicLD6-D.js',
      '/assets/code.worker-x.js/evil.js',
      '/assets/mycode.worker.js',
      '/assets/app.js?/code.worker.js',
      undefined,
    ]) {
      expect(isCodeWorkerPath(path)).toBe(false);
    }
  });
});

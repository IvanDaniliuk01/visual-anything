import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toForwardSlashes } from './paths';
import { WORKER_POLICY } from './policies';
import { startServer, type RunningServer } from './server';
import { openSession, type Session } from './session';
import { send, writeProjectFolder } from './test-support';

const PROJECT: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'Dev policies', packages: [] },
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

const INDEX = [
  '<!doctype html>',
  '<html><head><title>Dev</title><script>document.title = "theme";</script></head>',
  '<body><div id="root"></div><script type="module" src="/main.js"></script></body></html>',
].join('\n');

/** Text with every character percent-encoded. */
function percentEncoded(text: string): string {
  return [...text].map((char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`).join('');
}

/** How a request names a file through Vite's `/@fs/`. */
function fsPath(path: string): string {
  return `/@fs/${toForwardSlashes(path).replace(/^\//, '')}`;
}

describe.each(['Juan (Work)', 'a{b,c}'])(
  'dev mode, with the project in a folder named %s inside the app folder',
  { timeout: 30_000 },
  (name) => {
    let root: string;
    let project: string;
    let session: Session;
    let server: RunningServer;

    beforeAll(async () => {
      root = await realpath(await mkdtemp(join(tmpdir(), 'va-dev-policies-')));
      await writeFile(join(root, 'index.html'), INDEX);
      await writeFile(join(root, 'main.js'), "document.title = 'Dev app';\n");
      project = join(root, name);
      await writeProjectFolder(project, PROJECT);
      const opened = await openSession(project, { watch: false, out: () => {}, err: () => {} });
      if (!opened.ok) throw new Error('The test project does not open.');
      session = opened.session;
      server = await startServer({
        session,
        port: 0,
        app: { mode: 'dev', root, configFile: false },
      });
    }, 60_000);

    afterAll(async () => {
      await server.close();
      await session.close();
      await rm(root, { recursive: true, force: true, maxRetries: 10 });
    }, 60_000);

    it.each([
      ['through /@fs/', () => encodeURI(fsPath(join(project, 'model.vamodel')))],
      [
        'through /@fs/, every character of its folder encoded',
        () => `${encodeURI(fsPath(root))}/${percentEncoded(name)}/project.vaproject`,
      ],
      ['under the app folder', () => `/${encodeURIComponent(name)}/model.vamodel`],
      ['as raw text', () => `/${encodeURIComponent(name)}/model.vamodel?raw`],
      [
        'as a module id',
        () =>
          encodeURI(`/@id/${toForwardSlashes(join(project, 'model.vamodel')).replace(/^\//, '')}`),
      ],
    ])('refuses a project file named %s', async (_how, path) => {
      const reply = await send(server.port, { path: path() });
      expect(reply.status).toBe(403);
      expect(reply.body).toContain('Dev mode serves no file of the open project.');
      expect(reply.body).not.toContain('schemaVersion');
    });

    it('still serves the app', async () => {
      const reply = await send(server.port, { path: '/main.js' });
      expect(reply.status).toBe(200);
      expect(reply.headers['content-security-policy']).toBe(WORKER_POLICY);
    });

    it('serves the page with the dev policy: no Trusted Types, and a nonce on the scripts Vite writes', async () => {
      const reply = await send(server.port);
      expect(reply.status).toBe(200);
      const policy = String(reply.headers['content-security-policy'] ?? '');
      expect(policy).not.toContain('trusted-types');
      expect(policy).toContain(`connect-src 'self' ws://127.0.0.1:${server.port}`);
      const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
      expect(nonce).toBeDefined();
      expect(reply.body).toContain(`nonce="${nonce ?? ''}"`);
      // The page's own inline script carries the nonce too.
      expect(reply.body).toMatch(
        new RegExp(
          `<script nonce="${(nonce ?? '').replace(/[+/=]/g, '\\$&')}">document\\.title = "theme"`,
        ),
      );
    });
  },
);

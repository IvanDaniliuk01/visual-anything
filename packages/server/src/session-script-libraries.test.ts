/**
 * Script libraries in the local program (ADR 0107): asked for by the person or by Claude, fetched
 * from a stand-in for the npm registry on 127.0.0.1 only after the person approved the registry's two
 * addresses, checked against the registry's integrity, read strictly, kept as
 * `script-libraries/<sha256>.js` beside its license, and defined by the program's own command; the
 * files no package names, listed and removed.
 */
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  encodeMessage,
  explorablesIn,
  registryAddresses,
  type AppMessage,
  type ScriptLibraryAsk,
} from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSession, type Session } from './session';
import {
  startRegistryStub,
  tarball,
  versionDocument,
  type RegistryStub,
} from './script-libraries/test/registry-stub';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

const D3 = `// https://d3js.org v7.9.0
(function (global, factory) {
(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.d3 = global.d3 || {}));
})(this, (function (exports) { 'use strict'; exports.version = "7.9.0"; }));`;
const LICENSE = 'Copyright 2010-2023 Mike Bostock\n\nPermission to use, copy, modify…';

let folders: string[] = [];
const sessions: Session[] = [];
let stub: RegistryStub | undefined;

afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
  await stub?.close();
  stub = undefined;
  for (const each of folders) await rm(each, { recursive: true, force: true, maxRetries: 10 });
  folders = [];
});

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The registry's answers for a package: its version's document and its tarball. */
function published(
  npm: string,
  version: string,
  files: Record<string, string>,
  fields: Record<string, unknown> = {},
  document?: (bytes: Buffer) => string,
): RegistryStub['routes'] {
  const bytes = tarball(files);
  const { document: documentUrl, tarball: tarballUrl } = registryAddresses(npm, version);
  return new Map([
    [
      new URL(documentUrl).pathname,
      { body: document?.(bytes) ?? versionDocument(npm, version, bytes, fields) },
    ],
    [new URL(tarballUrl).pathname, { body: bytes }],
  ]);
}

const D3_FILES = {
  'package.json': '{"name":"d3","version":"7.9.0"}',
  'dist/d3.min.js': D3,
  'src/index.js': 'export * from "d3-array";',
  LICENSE,
};

async function open(routes: RegistryStub['routes']): Promise<Session> {
  stub = await startRegistryStub(routes);
  const folder = await mkdtemp(join(tmpdir(), 'va-script-libraries-'));
  folders.push(folder);
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    registry: { request: stub.request, resolve: stub.resolve },
  });
  if (!result.ok) throw new Error('The test project does not open.');
  sessions.push(result.session);
  return result.session;
}

function ask(session: Session, app: FakeClient, message: AppMessage): Promise<void> {
  return session.receive(app, encodeMessage(message));
}

const FETCH: AppMessage = {
  type: 'script-library/fetch',
  requestId: 'r1',
  package: 'shop',
  npm: 'd3',
  version: '7.9.0',
};

async function consentAsked(app: FakeClient) {
  await vi.waitFor(() => expect(app.ofType('script-library/consent')).toHaveLength(1));
  return app.ofType('script-library/consent')[0];
}

describe('a script library the person asks for', () => {
  it('asks with the registry’s two addresses, fetches only once approved, then keeps and defines it', async () => {
    const session = await open(
      published('d3', '7.9.0', D3_FILES, { unpkg: 'dist/d3.min.js', main: 'src/index.js' }),
    );
    const app = new FakeClient();
    session.connect(app);
    const asking = ask(session, app, FETCH);
    expect(await consentAsked(app)).toEqual({
      type: 'script-library/consent',
      requestId: 'r1',
      asker: 'person',
      package: 'shop',
      npm: 'd3',
      version: '7.9.0',
      document: 'https://registry.npmjs.org/d3/7.9.0',
      tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
    });
    expect(stub?.asked).toEqual([]);
    await ask(session, app, { type: 'script-library/consented', requestId: 'r1', approved: true });
    await asking;
    expect(stub?.asked).toEqual(['/d3/7.9.0', '/d3/-/d3-7.9.0.tgz']);
    const hash = sha256(D3);
    const [kept] = app.ofType('script-library/kept');
    expect(kept?.library).toEqual({
      id: 'shop.d3',
      npm: 'd3',
      version: '7.9.0',
      tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
      integrity: expect.stringMatching(/^sha512-/) as string,
      path: 'dist/d3.min.js',
      license: 'ISC',
      global: 'd3',
      hash,
      bytes: Buffer.byteLength(D3),
    });
    const folder = session.folder;
    expect(await readFile(join(folder, 'script-libraries', `${hash}.js`), 'utf8')).toBe(D3);
    expect(await readFile(join(folder, 'script-libraries', `${hash}.license.txt`), 'utf8')).toBe(
      LICENSE,
    );
    expect(explorablesIn(session.snapshot).scriptLibrary('shop.d3')?.definition.hash).toBe(hash);
    expect(session.actions.map(({ label, author }) => ({ label, author }))).toEqual([
      { label: 'Add the script library "d3" 7.9.0', author: 'user' },
    ]);
    expect(session.warnings()).toEqual([]);
  });

  it('fetches nothing when the person declines, or when the app that was asked goes', async () => {
    const session = await open(published('d3', '7.9.0', D3_FILES, { unpkg: 'dist/d3.min.js' }));
    const app = new FakeClient();
    session.connect(app);
    const asking = ask(session, app, FETCH);
    await consentAsked(app);
    await ask(session, app, { type: 'script-library/consented', requestId: 'r1', approved: false });
    await asking;
    expect(app.ofType('script-library/refused')).toMatchObject([
      { requestId: 'r1', code: 'fetch-refused' },
    ]);

    const other = new FakeClient();
    const disconnect = session.connect(other);
    const again = ask(session, other, { ...FETCH, requestId: 'r2' });
    await consentAsked(other);
    // Another app's answer is not the one asked.
    await ask(session, app, { type: 'script-library/consented', requestId: 'r2', approved: true });
    disconnect();
    await again;
    expect(other.ofType('script-library/refused')).toMatchObject([{ requestId: 'r2' }]);
    expect(stub?.asked).toEqual([]);
    expect(session.actions).toEqual([]);
  });

  it('refuses a tarball that does not match the registry’s integrity, and keeps nothing', async () => {
    const routes = published('d3', '7.9.0', D3_FILES, { unpkg: 'dist/d3.min.js' }, () =>
      versionDocument('d3', '7.9.0', tarball({ 'dist/d3.min.js': 'other' }), {
        unpkg: 'dist/d3.min.js',
      }),
    );
    const session = await open(routes);
    const app = new FakeClient();
    session.connect(app);
    const asking = ask(session, app, FETCH);
    await consentAsked(app);
    await ask(session, app, { type: 'script-library/consented', requestId: 'r1', approved: true });
    await asking;
    const [refused] = app.ofType('script-library/refused');
    expect(refused?.code).toBe('invalid-script-library');
    expect(refused?.message).toMatch(/integrity/);
    expect(await lstat(join(session.folder, 'script-libraries')).catch(() => undefined)).toBe(
      undefined,
    );
    expect(session.actions).toEqual([]);
  });

  it('refuses a tarball the registry names anywhere else, without fetching it', async () => {
    const routes = published('d3', '7.9.0', D3_FILES, {}, (bytes) =>
      JSON.stringify({
        name: 'd3',
        version: '7.9.0',
        dist: {
          tarball: 'https://evil.example/d3-7.9.0.tgz',
          integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        },
      }),
    );
    const session = await open(routes);
    const app = new FakeClient();
    session.connect(app);
    const asking = ask(session, app, FETCH);
    await consentAsked(app);
    await ask(session, app, { type: 'script-library/consented', requestId: 'r1', approved: true });
    await asking;
    expect(app.ofType('script-library/refused')[0]?.code).toBe('fetch-refused');
    expect(stub?.asked).toEqual(['/d3/7.9.0']);
  });

  it('refuses a package with only modules, such as three.js, with that reason', async () => {
    const session = await open(
      published(
        'three',
        '0.170.0',
        {
          'build/three.cjs': "'use strict';\nexports.REVISION = '170';",
          'build/three.module.js': "export const REVISION = '170';",
          LICENSE: 'MIT',
        },
        { type: 'module', main: './build/three.cjs', module: './build/three.module.js' },
      ),
    );
    const app = new FakeClient();
    session.connect(app);
    const asking = ask(session, app, { ...FETCH, npm: 'three', version: '0.170.0' });
    await consentAsked(app);
    await ask(session, app, { type: 'script-library/consented', requestId: 'r1', approved: true });
    await asking;
    const [refused] = app.ofType('script-library/refused');
    expect(refused?.code).toBe('invalid-script-library');
    expect(refused?.message).toMatch(/single-file build that sets a global \(UMD or IIFE\)/);
    expect(refused?.message).toMatch(/three\.js/);
  });

  it('refuses a package the project does not own', async () => {
    const session = await open(new Map());
    const app = new FakeClient();
    session.connect(app);
    await ask(session, app, { ...FETCH, package: 'systems' });
    expect(app.ofType('script-library/refused')[0]?.code).toBe('unknown-package');
    expect(app.ofType('script-library/consent')).toEqual([]);
  });
});

describe('a script library Claude asks for', () => {
  const D3_ASK: ScriptLibraryAsk = { package: 'shop', npm: 'd3', version: '7.9.0' };

  it('asks every open app, takes the first answer, and tells them all what was kept', async () => {
    const session = await open(published('d3', '7.9.0', D3_FILES, { unpkg: 'dist/d3.min.js' }));
    const one = new FakeClient();
    const two = new FakeClient();
    session.connect(one);
    session.connect(two);
    const asking = session.requestScriptLibrary(D3_ASK);
    const consent = await consentAsked(two);
    expect(consent?.asker).toBe('claude');
    expect(one.ofType('script-library/consent')[0]?.requestId).toBe(consent?.requestId);
    await ask(session, two, {
      type: 'script-library/consented',
      requestId: consent?.requestId ?? '',
      approved: true,
    });
    const outcome = await asking;
    expect(outcome.ok).toBe(true);
    expect(one.ofType('script-library/kept')).toHaveLength(1);
    expect(two.ofType('script-library/kept')).toHaveLength(1);
    expect(session.actions.map((each) => each.author)).toEqual(['claude']);
  });

  it('fetches nothing with no app open to ask', async () => {
    const session = await open(published('d3', '7.9.0', D3_FILES, { unpkg: 'dist/d3.min.js' }));
    const outcome = await session.requestScriptLibrary(D3_ASK);
    expect(outcome).toMatchObject({ ok: false, code: 'fetch-refused' });
    expect(stub?.asked).toEqual([]);
  });
});

describe('the files of script-libraries/ no package names', () => {
  it('are listed, and removed with their license only when the person asks', async () => {
    const session = await open(published('d3', '7.9.0', D3_FILES, { unpkg: 'dist/d3.min.js' }));
    const app = new FakeClient();
    session.connect(app);
    const asking = ask(session, app, FETCH);
    await consentAsked(app);
    await ask(session, app, { type: 'script-library/consented', requestId: 'r1', approved: true });
    await asking;
    const hash = sha256(D3);
    expect(await session.listUnnamedScriptLibraryFiles()).toEqual([]);
    expect(await session.removeUnnamedScriptLibraryFiles([hash])).toMatchObject({
      removed: [],
      kept: [{ hash }],
    });
    await session.execute({ type: 'remove-script-library', id: 'shop.d3' }, 'user');
    expect(await session.listUnnamedScriptLibraryFiles()).toEqual([
      { hash, bytes: Buffer.byteLength(D3) },
    ]);
    expect(await session.removeUnnamedScriptLibraryFiles([hash, '../x'])).toMatchObject({
      removed: [hash],
      kept: [{ hash: '../x' }],
      files: [],
    });
    const folder = join(session.folder, 'script-libraries');
    expect(await lstat(join(folder, `${hash}.js`)).catch(() => undefined)).toBeUndefined();
    expect(await lstat(join(folder, `${hash}.license.txt`)).catch(() => undefined)).toBeUndefined();
    // An app lists them, and removes them by hash, through protocol 15's messages.
    await ask(session, app, { type: 'script-library-files/list', requestId: 'l1' });
    expect(app.ofType('script-library-files/listed')).toEqual([
      { type: 'script-library-files/listed', requestId: 'l1', files: [] },
    ]);
    await ask(session, app, {
      type: 'script-library-files/remove',
      requestId: 'l2',
      hashes: [hash],
    });
    expect(app.ofType('script-library-files/listed')[1]).toEqual({
      type: 'script-library-files/listed',
      requestId: 'l2',
      files: [],
      removed: [],
      kept: [{ hash, message: expect.any(String) }],
    });
    // Undo brings the definition back; its file is warned about as missing.
    await session.undo();
    expect(session.warnings().map((each) => each.message)).toEqual([
      'The file of the script library "d3" 7.9.0 is missing from "script-libraries/"; the explorables that use it show their cards.',
    ]);
  });
});

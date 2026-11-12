/**
 * Explorables in the local program (ADR 0107): their files read as the project opens, written after
 * every action, undo and redo, watched for changes saved outside the app; the approvals Claude's
 * writes continue; the frame the listener serves only when the hash of exactly what it serves is
 * approved; and the commands only the program runs, refused from every other channel.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PREFERENCES,
  approvalHashOf,
  applyPreferenceChanges,
  encodeMessage,
  explorableTextHash,
  type AppMessage,
  type Command,
  type ExplorableApproval,
  type PreferenceChanges,
  type Preferences,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile, ScriptLibraryDefinition } from '@visual-anything/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startToolHarness } from './claude/tool-harness';
import type { PreferencesStore, SetPreferencesResult } from './preferences';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, SHOP, testProject, writeProjectFolder } from './test-support';

const PAGE = '<!DOCTYPE html><title>Quadratic</title><script>va.ready()</script>';
const EDITED = '<!DOCTYPE html><title>Quadratic, edited</title><p>by the person</p>';
const CLAUDES = '<!DOCTYPE html><title>Quadratic, by Claude</title><style>p{color:red}</style>';
const APP_ORIGIN = 'http://127.0.0.1:47800';
const RUNTIME = 'window.vaRuntime = 1;';

let folders: string[] = [];
const sessions: Session[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
  for (const each of folders) await rm(each, { recursive: true, force: true, maxRetries: 10 });
  folders = [];
});

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The test project with an explorable in its own package, defined with a text's hash. */
function withExplorable(
  hash = explorableTextHash(PAGE),
  extra: Partial<PackageFile> = {},
  scriptLibraries?: string[],
): ProjectSnapshot {
  const project = testProject();
  const shop: PackageFile = {
    ...SHOP,
    explorables: [
      {
        id: 'shop.quadratic',
        name: 'Quadratic',
        file: 'quadratic.html',
        api: 1,
        hash,
        ...(scriptLibraries === undefined ? {} : { scriptLibraries }),
      },
    ],
    ...extra,
  };
  return {
    ...project,
    packages: project.packages.map((each) => (each.id === 'shop' ? shop : each)),
  };
}

async function folderWith(project: ProjectSnapshot, text: string | null = PAGE): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'va-explorables-'));
  folders.push(folder);
  await writeProjectFolder(folder, project);
  if (text !== null) await writeExplorable(folder, text);
  return folder;
}

async function writeExplorable(folder: string, text: string | Buffer): Promise<void> {
  await mkdir(join(folder, 'explorables'), { recursive: true });
  await writeFile(join(folder, 'explorables', 'quadratic.html'), text);
}

function readExplorable(folder: string): Promise<string> {
  return readFile(join(folder, 'explorables', 'quadratic.html'), 'utf8');
}

async function open(folder: string, options: SessionOptions = {}): Promise<Session> {
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  sessions.push(result.session);
  await result.session.idle();
  return result.session;
}

/** A store in memory, as the person's preferences file holds them. */
class Store implements PreferencesStore {
  preferences: Preferences;
  readonly asked: PreferenceChanges[] = [];

  constructor(approvals: ExplorableApproval[] = []) {
    this.preferences = { ...DEFAULT_PREFERENCES, explorableApprovals: approvals };
  }

  current(): Preferences {
    return applyPreferenceChanges(this.preferences, {});
  }

  set(changes: PreferenceChanges): Promise<SetPreferencesResult> {
    this.asked.push(changes);
    this.preferences = applyPreferenceChanges(this.preferences, changes);
    return Promise.resolve({ preferences: this.current(), saved: true });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function approvalOf(text: string, libraries: string[] = []): string {
  return approvalHashOf(explorableTextHash(text), libraries);
}

const WRITE: (text: string) => Command = (text) => ({
  type: 'write-explorable',
  id: 'shop.quadratic',
  text,
});

describe('reading the explorables’ files as the project opens', () => {
  it('holds each file that hashes to its definition as read, and records nothing', async () => {
    const session = await open(await folderWith(withExplorable()));
    expect(session.snapshot.explorableTexts).toEqual([
      { id: 'shop.quadratic', text: PAGE, read: true },
    ]);
    expect(session.actions).toEqual([]);
    expect(session.warnings()).toEqual([]);
  });

  it('records a file that no longer hashes to its definition as the person’s action', async () => {
    const folder = await folderWith(withExplorable(), EDITED);
    const session = await open(folder);
    expect(session.actions.map(({ label, author }) => ({ label, author }))).toEqual([
      { label: 'The file of "Quadratic" changed', author: 'user' },
    ]);
    expect(session.snapshot.explorableTexts).toEqual([
      { id: 'shop.quadratic', text: EDITED, read: true },
    ]);
    const saved = await readFile(join(folder, 'packages', 'shop.vapackage'), 'utf8');
    expect(saved).toContain(explorableTextHash(EDITED));
    // Undoing it never writes the person's file back.
    await session.undo();
    expect(await readExplorable(folder)).toBe(EDITED);
    await session.redo();
    expect(await readExplorable(folder)).toBe(EDITED);
  });

  it('warns of a file that is missing, past 512 KiB or not UTF-8, and holds none of them', async () => {
    const missing = await open(await folderWith(withExplorable(), null));
    expect(missing.warnings().map((each) => each.message)).toEqual([
      'The file "explorables/quadratic.html" of the explorable "Quadratic" is missing; it shows its card.',
    ]);
    expect(missing.snapshot.explorableTexts).toBeUndefined();

    const large = `<!DOCTYPE html><p>${'x'.repeat(512 * 1024)}</p>`;
    const tooLarge = await open(await folderWith(withExplorable(explorableTextHash(large)), large));
    expect(tooLarge.warnings().map((each) => each.message)).toEqual([
      'The file "explorables/quadratic.html" of the explorable "Quadratic" is past 512 KiB; it is kept and never runs.',
    ]);
    expect(tooLarge.snapshot.explorableTexts).toBeUndefined();

    const folder = await folderWith(withExplorable(), null);
    await writeExplorable(folder, Buffer.from([0x3c, 0xff, 0xfe, 0x3e]));
    const notText = await open(folder);
    expect(notText.warnings().map((each) => each.message)).toEqual([
      'The file "explorables/quadratic.html" of the explorable "Quadratic" is not UTF-8 text; it never runs.',
    ]);
    expect(notText.actions).toEqual([]);
  });
});

describe('writing the explorables’ files', () => {
  it('writes a text an action changes, and the one before it on undo, atomically', async () => {
    const folder = await folderWith(withExplorable());
    const session = await open(folder);
    expect((await session.execute(WRITE(CLAUDES), 'claude')).ok).toBe(true);
    expect(await readExplorable(folder)).toBe(CLAUDES);
    await session.undo();
    expect(await readExplorable(folder)).toBe(PAGE);
    await session.redo();
    expect(await readExplorable(folder)).toBe(CLAUDES);
  });

  it('writes the person’s text back when Claude’s write over it is undone', async () => {
    const folder = await folderWith(withExplorable(), EDITED);
    const session = await open(folder);
    await session.execute(WRITE(CLAUDES), 'claude');
    expect(await readExplorable(folder)).toBe(CLAUDES);
    await session.undo();
    expect(await readExplorable(folder)).toBe(EDITED);
  });

  it('writes a new explorable’s file, and never deletes one', async () => {
    const folder = await folderWith(withExplorable());
    const session = await open(folder);
    const defined = await session.execute(
      {
        type: 'define-explorable',
        package: 'shop',
        explorable: { name: 'Sine wave', file: 'sine.html' },
        text: CLAUDES,
      },
      'claude',
    );
    expect(defined.ok).toBe(true);
    const sine = join(folder, 'explorables', 'sine.html');
    expect(await readFile(sine, 'utf8')).toBe(CLAUDES);
    await session.undo();
    expect(await readFile(sine, 'utf8')).toBe(CLAUDES);
    await session.redo();
    const removed = await session.execute(
      { type: 'remove-explorable', id: 'shop.quadratic' },
      'user',
    );
    expect(removed.ok).toBe(true);
    expect(await readExplorable(folder)).toBe(PAGE);
  });

  it('never writes over a change saved on disk meanwhile, and records it instead', async () => {
    const folder = await folderWith(withExplorable());
    const session = await open(folder);
    await writeExplorable(folder, EDITED);
    const outcome = await session.execute(WRITE(CLAUDES), 'claude');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problems[0]?.code).toBe('changed-on-disk');
    await session.idle();
    expect(await readExplorable(folder)).toBe(EDITED);
    expect(session.actions.map((each) => each.label)).toEqual(['The file of "Quadratic" changed']);
  });

  it('never writes over a file of explorables/ that no explorable named', async () => {
    const folder = await folderWith(withExplorable());
    await writeFile(join(folder, 'explorables', 'sine.html'), 'the person’s own');
    const session = await open(folder);
    const defined = await session.execute(
      {
        type: 'define-explorable',
        package: 'shop',
        explorable: { name: 'Sine', file: 'sine.html' },
        text: CLAUDES,
      },
      'claude',
    );
    expect(defined.ok).toBe(false);
    expect(await readFile(join(folder, 'explorables', 'sine.html'), 'utf8')).toBe(
      'the person’s own',
    );
  });
});

describe('the watch on explorables/', () => {
  it('records a file saved outside, after a quiet moment, and not the program’s own writes', async () => {
    const folder = await folderWith(withExplorable());
    const session = await open(folder, { watch: { delay: 30 } });
    await writeExplorable(folder, EDITED);
    await vi.waitFor(
      () =>
        expect(session.actions.map((each) => each.label)).toEqual([
          'The file of "Quadratic" changed',
        ]),
      { timeout: 5000, interval: 25 },
    );
    expect(session.snapshot.explorableTexts).toEqual([
      { id: 'shop.quadratic', text: EDITED, read: true },
    ]);
    await session.execute(WRITE(CLAUDES), 'claude');
    // Some time for the watcher to hear of the program's own write, which comes to nothing.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await session.idle();
    await session.scanExplorableFiles();
    expect(session.actions.map((each) => each.author)).toEqual(['user', 'claude']);
  });
});

describe('approvals (ADR 0107)', () => {
  it('continues the person’s approval when Claude writes over an approved text, and tells the apps', async () => {
    const store = new Store([
      { hash: approvalOf(PAGE), explorable: 'shop.quadratic', by: 'person' },
    ]);
    const session = await open(await folderWith(withExplorable()), { preferences: store });
    const app = new FakeClient();
    session.connect(app);
    await session.execute(WRITE(CLAUDES), 'claude');
    expect(store.current().explorableApprovals).toEqual([
      { hash: approvalOf(CLAUDES), explorable: 'shop.quadratic', by: 'claude' },
      { hash: approvalOf(PAGE), explorable: 'shop.quadratic', by: 'person' },
    ]);
    expect(app.ofType('preferences/changed').at(-1)?.preferences.explorableApprovals).toHaveLength(
      2,
    );
    expect(session.isExplorableApproved('shop.quadratic')).toBe(true);
    // Undo returns to a text already approved; redo to one Claude's write approved.
    await session.undo();
    expect(session.isExplorableApproved('shop.quadratic')).toBe(true);
  });

  it('never approves a text the person’s editor wrote, a new explorable, or Claude’s write over one not approved', async () => {
    const store = new Store([
      { hash: approvalOf(PAGE), explorable: 'shop.quadratic', by: 'person' },
    ]);
    const folder = await folderWith(withExplorable());
    const session = await open(folder, { preferences: store });
    await writeExplorable(folder, EDITED);
    await session.scanExplorableFiles();
    expect(session.isExplorableApproved('shop.quadratic')).toBe(false);
    await session.execute(WRITE(CLAUDES), 'claude');
    await session.execute(
      {
        type: 'define-explorable',
        package: 'shop',
        explorable: { name: 'Sine', file: 'sine.html' },
        text: PAGE,
      },
      'claude',
    );
    expect(store.asked).toEqual([]);
    expect(session.isExplorableApproved('shop.quadratic')).toBe(false);
  });

  it('never continues an approval for the person’s own write', async () => {
    const store = new Store([
      { hash: approvalOf(PAGE), explorable: 'shop.quadratic', by: 'person' },
    ]);
    const session = await open(await folderWith(withExplorable()), { preferences: store });
    await session.execute(WRITE(CLAUDES), 'user');
    expect(store.asked).toEqual([]);
  });
});

describe('the frame the listener serves', () => {
  const D3 = 'var d3 = (function () { return { version: "7" }; })();';

  function library(hash: string, bytes: number): ScriptLibraryDefinition {
    return {
      id: 'shop.d3',
      npm: 'd3',
      version: '7.9.0',
      tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
      integrity: `sha512-${'A'.repeat(86)}==`,
      path: 'dist/d3.min.js',
      license: 'ISC',
      global: 'd3',
      hash,
      bytes,
    };
  }

  async function withLibrary(fileText: string, defined = sha256(D3)) {
    const project = withExplorable(
      explorableTextHash(PAGE),
      { scriptLibraries: [library(defined, Buffer.byteLength(D3))] },
      ['shop.d3'],
    );
    const folder = await folderWith(project);
    await mkdir(join(folder, 'script-libraries'), { recursive: true });
    await writeFile(join(folder, 'script-libraries', `${defined}.js`), fileText);
    return folder;
  }

  it('serves an approved frame built from the text and the library bytes it hashed', async () => {
    const hash = approvalOf(PAGE, [sha256(D3)]);
    const store = new Store([{ hash, explorable: 'shop.quadratic', by: 'person' }]);
    const session = await open(await withLibrary(D3), { preferences: store });
    const answer = await session.serveExplorableFrame('shop.quadratic', hash, APP_ORIGIN, RUNTIME);
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.html).toContain(D3);
    expect(answer.html).toContain('<title>Quadratic</title>');
    expect(answer.html.indexOf(RUNTIME)).toBeLessThan(answer.html.indexOf(D3));
    expect(answer.policy).toContain(`frame-ancestors ${APP_ORIGIN}`);
    expect(answer.policy).toContain('sandbox allow-scripts');
  });

  it('refuses a frame not approved, or whose address names another hash', async () => {
    const hash = approvalOf(PAGE, [sha256(D3)]);
    const session = await open(await withLibrary(D3), { preferences: new Store() });
    expect(
      await session.serveExplorableFrame('shop.quadratic', hash, APP_ORIGIN, RUNTIME),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await session.serveExplorableFrame('shop.quadratic', 'b'.repeat(64), APP_ORIGIN, RUNTIME),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      await session.serveExplorableFrame('shop.nothing', hash, APP_ORIGIN, RUNTIME),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it('trusts no definition’s hash: a library file whose bytes are not its name’s is not served', async () => {
    const tampered = 'var d3 = { stolen: document.cookie };';
    // The approval the definitions alone give, as the app works it out, is approved.
    const fromDefinitions = approvalOf(PAGE, [sha256(D3)]);
    const store = new Store([
      { hash: fromDefinitions, explorable: 'shop.quadratic', by: 'person' },
    ]);
    const session = await open(await withLibrary(tampered), { preferences: store });
    const answer = await session.serveExplorableFrame(
      'shop.quadratic',
      fromDefinitions,
      APP_ORIGIN,
      RUNTIME,
    );
    expect(answer).toMatchObject({ ok: false, status: 404 });
  });

  it('trusts no definition’s hash: a definition naming an approved hash for another text is not served', async () => {
    const approved = approvalOf(CLAUDES);
    const store = new Store([{ hash: approved, explorable: 'shop.quadratic', by: 'person' }]);
    // The definition claims the approved text's hash; its file holds another text.
    const session = await open(
      await folderWith(withExplorable(explorableTextHash(CLAUDES)), EDITED),
      { preferences: store },
    );
    expect(
      await session.serveExplorableFrame('shop.quadratic', approved, APP_ORIGIN, RUNTIME),
    ).toMatchObject({ ok: false });
    expect(session.isExplorableApproved('shop.quadratic')).toBe(false);
  });
});

describe('explorables/listen', () => {
  it('answers the listener’s port and the run’s nonce, never the token', async () => {
    const session = await open(await folderWith(withExplorable()));
    const app = new FakeClient();
    session.connect(app, { token: 'the-session-token' });
    const listen: AppMessage = { type: 'explorables/listen', requestId: 'r1' };
    await session.receive(app, encodeMessage(listen));
    expect(app.ofType('command/rejected')).toHaveLength(1);
    session.servesExplorablesAt({ port: 47801, nonce: 'n'.repeat(32) });
    await session.receive(app, encodeMessage({ ...listen, requestId: 'r2' }));
    const listening = app.ofType('explorables/listening');
    expect(listening).toEqual([
      { type: 'explorables/listening', requestId: 'r2', port: 47801, nonce: 'n'.repeat(32) },
    ]);
    expect(JSON.stringify(listening)).not.toContain('the-session-token');
  });
});

describe('the commands only the program runs (ADR 0107)', () => {
  const RECORD: Command = { type: 'record-explorable-file', id: 'shop.quadratic', text: EDITED };
  const DEFINE: Command = {
    type: 'define-script-library',
    package: 'shop',
    library: {
      id: 'shop.d3',
      npm: 'd3',
      version: '7.9.0',
      tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
      integrity: `sha512-${'A'.repeat(86)}==`,
      path: 'dist/d3.min.js',
      global: 'd3',
      hash: 'c'.repeat(64),
      bytes: 10,
    },
  };

  it('refuses them from an app, alone or in a batch', async () => {
    const session = await open(await folderWith(withExplorable()));
    const app = new FakeClient();
    session.connect(app);
    let n = 0;
    for (const command of [
      RECORD,
      DEFINE,
      { type: 'batch', label: 'Sneak', commands: [RECORD] } as Command,
      { type: 'batch', label: 'Sneak', commands: [DEFINE] } as Command,
    ]) {
      n += 1;
      await session.receive(app, encodeMessage({ type: 'command', requestId: `r${n}`, command }));
    }
    const refused = app.ofType('command/rejected');
    expect(refused).toHaveLength(4);
    for (const each of refused) expect(each.problems.map((p) => p.code)).toContain('program-only');
    expect(session.actions).toEqual([]);
  });

  it('refuses them from Claude, applied or proposed, and from the command line', async () => {
    const session = await open(await folderWith(withExplorable()));
    for (const command of [RECORD, DEFINE]) {
      for (const outcome of [
        await session.execute(command, 'claude'),
        await session.execute(command, 'claude', undefined, { propose: true }),
        await session.execute(command, 'user'),
        await session.executePlanned(() => ({ ok: true, command }), 'user'),
      ]) {
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.problems.map((p) => p.code)).toContain('program-only');
      }
    }
    expect(session.actions).toEqual([]);
  });

  it('refuses them through Claude’s run_commands tool', async () => {
    const tools = await startToolHarness(withExplorable());
    try {
      for (const command of [RECORD, DEFINE]) {
        const message = await tools.failure('run_commands', {
          label: 'Sneak',
          commands: [command],
        });
        expect(message).toMatch(/Only Visual Anything itself runs/);
      }
    } finally {
      await tools.close();
    }
  });
});

describe('the frame listener in the running program', () => {
  it('starts with the program, answers explorables/listen, and serves an approved frame over HTTP', async () => {
    const hash = approvalOf(PAGE);
    const store = new Store([{ hash, explorable: 'shop.quadratic', by: 'person' }]);
    const tools = await startToolHarness(withExplorable(), { preferences: store });
    try {
      await writeExplorable(tools.session.folder, PAGE);
      await tools.session.scanExplorableFiles();
      const port = new URL(tools.address).port;
      const page = await fetch(tools.address);
      const policy = page.headers.get('content-security-policy') ?? '';
      const framePort = Number(/frame-src http:\/\/\*\.localhost:(\d+)(;|$)/.exec(policy)?.[1]);
      expect(framePort).toBeGreaterThan(0);
      expect(String(framePort)).not.toBe(port);

      const app = await tools.openApp();
      app.send({ type: 'explorables/listen', requestId: 'listen' });
      await vi.waitFor(() =>
        expect(app.messages.some((each) => each.type === 'explorables/listening')).toBe(true),
      );
      const listening = app.messages.find((each) => each.type === 'explorables/listening');
      if (listening?.type !== 'explorables/listening') throw new Error('No answer.');
      expect(listening.port).toBe(framePort);

      const address = `/${listening.nonce}/frame/shop.quadratic/${hash}`;
      const reply = await new Promise<{ status: number; policy?: string; body: string }>(
        (resolve, reject) => {
          const sent = request(
            {
              host: '127.0.0.1',
              port: framePort,
              path: address,
              headers: { host: `k3f9q2xz8w7v6u5t.localhost:${framePort}` },
              agent: false,
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on('data', (chunk: Buffer) => chunks.push(chunk));
              response.on('end', () =>
                resolve({
                  status: response.statusCode ?? 0,
                  policy: String(response.headers['content-security-policy']),
                  body: Buffer.concat(chunks).toString('utf8'),
                }),
              );
            },
          );
          sent.on('error', reject);
          sent.end();
        },
      );
      expect(reply.status).toBe(200);
      expect(reply.policy).toContain(`frame-ancestors http://127.0.0.1:${port}`);
      expect(reply.body).toContain('<title>Quadratic</title>');
      await app.close();
    } finally {
      await tools.close();
    }
  });
});

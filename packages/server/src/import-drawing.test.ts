/**
 * HTML imported as a drawing (ADR 0068), outside the app: `visual-anything import` with an `.html`
 * file, alone and through the program that runs on the project, and the live request an app sends.
 * Each lands as one action of the person's, `Import "card.html" as a drawing`, with the drawing
 * stored as a cleaned SVG image and shown by an element.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION, type ServerMessage } from '@visual-anything/core';
import type { ModelFile, PackageFile } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentContext, writeProgramRecord } from './claude/discovery';
import { parseImportCommandLine, runImport } from './import-command';
import { startServer } from './server';
import { openSession, type SessionClient } from './session';
import { openLiveClient, testProject, writeProjectFolder } from './test-support';

const CARD = `<!doctype html><style>.card { padding: 12px; border: 2px solid #1D4F91 }</style>
<div class="card" onclick="alert(1)"><h2>Basic</h2><p>$10 a month</p><script>alert(2)</script></div>`;

let root: string;
let folder: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-drawing-')));
  folder = join(root, 'project');
  await writeProjectFolder(folder, testProject());
  await writeFile(join(root, 'card.html'), CARD);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

function environment() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    env: {
      cwd: root,
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
    },
  };
}

async function model(): Promise<ModelFile> {
  return JSON.parse(await readFile(join(folder, 'model.vamodel'), 'utf8')) as ModelFile;
}

async function shopPackage(): Promise<PackageFile> {
  return JSON.parse(await readFile(join(folder, 'packages', 'shop.vapackage'), 'utf8')) as PackageFile;
}

describe('visual-anything import with an HTML file', () => {
  it('reads the drawing’s options, and refuses a width out of range', () => {
    const parsed = parseImportCommandLine([
      'p',
      'card.html',
      '--width',
      '400',
      '--component',
      'shop.cart',
      '--view',
      'overview',
    ]);
    expect(parsed.ok && 'value' in parsed && parsed.value.request).toEqual({
      width: 400,
      component: 'shop.cart',
      view: 'overview',
    });
    expect(parseImportCommandLine(['p', 'card.html', '--width', '20'])).toEqual({
      ok: false,
      message: '--width takes a whole number of pixels from 64 to 2000, not "20".',
    });
  });

  it('imports the drawing as one action, shown by a new Box, with what it dropped', async () => {
    const { out, err, env } = environment();
    expect(await runImport(['project', 'card.html', '--width', '400'], env)).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toMatch(/^Made a drawing of "card.html", 400 × \d+ pixels\.$/);
    expect(out).toEqual(
      expect.arrayContaining([
        'What making it dropped:',
        '  1 event handler attribute',
        '  1 script element',
        'It is shown by a new element of "Box".',
        'Done: Import "card.html" as a drawing, as one action you can undo in the app.',
      ]),
    );
    const image = (await shopPackage()).images?.[0];
    expect(image).toMatchObject({ kind: 'svg', name: 'card', source: 'card.html', width: 400 });
    expect(image?.kind === 'svg' && image.svg).not.toMatch(/script|onclick/);
    const card = (await model()).elements.find((element) => element.name === 'card');
    expect(card).toMatchObject({
      component: 'systems.box',
      appearance: { image: { image: image?.id, placement: 'drawing' } },
    });
  }, 60_000);

  it('shows the drawing on the element asked for', async () => {
    const { env } = environment();
    expect(await runImport(['project', 'card.html', '--element', 'api'], env)).toBe(0);
    const api = (await model()).elements.find((element) => element.id === 'api');
    expect(api?.appearance?.image).toMatchObject({ placement: 'drawing' });
  }, 60_000);

  it('says what it would do with --dry-run, and changes nothing', async () => {
    const before = await readFile(join(folder, 'model.vamodel'), 'utf8');
    const { out, env } = environment();
    expect(await runImport(['project', 'card.html', '--dry-run', '--view', 'overview'], env)).toBe(
      0,
    );
    expect(out).toContain('It is shown by a new element of "Box" in the view "Overview".');
    expect(out.at(-1)).toBe('Dry run: nothing was imported.');
    expect(await readFile(join(folder, 'model.vamodel'), 'utf8')).toBe(before);
  }, 60_000);

  it('refuses options of the other kind of import, and an element the project lacks', async () => {
    const mixed = environment();
    expect(await runImport(['project', 'card.html', '--no-view'], mixed.env)).toBe(2);
    expect(mixed.err[0]).toBe(
      '--map, --nesting, --key and --no-view are for diagrams and spreadsheets: an HTML file is imported as a drawing.',
    );
    await writeFile(join(root, 'a.mmd'), 'flowchart LR\n  a --> b');
    const other = environment();
    expect(await runImport(['project', 'a.mmd', '--width', '400'], other.env)).toBe(2);
    expect(other.err[0]).toBe(
      '--width, --component, --element and --view are for HTML files, which are imported as drawings.',
    );
    const missing = environment();
    expect(await runImport(['project', 'card.html', '--element', 'nothing'], missing.env)).toBe(1);
    expect(missing.err).toEqual([
      'Could not import "card.html":',
      '  There is no element "nothing".',
    ]);
  }, 60_000);

  it('goes through the program that runs on the project, which makes the drawing itself', async () => {
    const opened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The project does not open.');
    const { session } = opened;
    const appDir = join(root, 'dist');
    await mkdir(appDir);
    await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
    const server = await startServer({ session, port: 0, app: { mode: 'static', dir: appDir } });
    const runtime = join(root, 'run');
    const context = { ...currentContext(), home: root };
    await writeProgramRecord(
      runtime,
      {
        format: 1,
        protocolVersion: PROTOCOL_VERSION,
        pid: process.pid,
        port: server.port,
        folder: session.folder.replaceAll('\\', '/'),
        credential: server.credential,
        startedAt: new Date(Date.now() - 1000).toISOString(),
      },
      context,
    );
    const app = await openLiveClient(server.port, server.token);
    try {
      const { out, err, env } = environment();
      expect(
        await runImport(['project', 'card.html', '--component', 'shop.cart'], {
          ...env,
          runtimeFolder: runtime,
          context,
        }),
      ).toBe(0);
      expect(err).toEqual([]);
      expect(out).toContain('Visual Anything runs on "Shop", so the import goes through it.');
      expect(session.actions).toMatchObject([
        { label: 'Import "card.html" as a drawing', author: 'user', undone: false },
      ]);
      expect(session.snapshot.model.elements.at(-1)).toMatchObject({
        component: 'shop.cart',
        name: 'card',
      });
      expect(app.messages.some((message) => message.type === 'project/changed')).toBe(true);
    } finally {
      await app.close();
      await server.close();
      await session.close();
    }
  }, 60_000);
});

describe('making a drawing for an app', () => {
  it('answers drawing/make with the cleaned drawing and its report, changing nothing', async () => {
    const opened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The project does not open.');
    const { session } = opened;
    const said: ServerMessage[] = [];
    const client: SessionClient = { send: (message) => said.push(message) };
    try {
      await session.receive(
        client,
        JSON.stringify({
          type: 'drawing/make',
          requestId: 'r1',
          name: 'card.html',
          html: CARD,
          width: 300,
        }),
      );
      expect(said).toEqual([
        {
          type: 'drawing/made',
          requestId: 'r1',
          svg: expect.stringMatching(/^<svg /) as unknown as string,
          width: 300,
          height: expect.any(Number) as unknown as number,
          report: ['1 event handler attribute', '1 script element'],
        },
      ]);
      expect(session.actions).toEqual([]);
      await session.receive(
        client,
        JSON.stringify({
          type: 'drawing/make',
          requestId: 'r2',
          name: 'x.html',
          html: '<div>'.repeat(200),
          width: 300,
        }),
      );
      expect(said[1]).toEqual({
        type: 'command/rejected',
        requestId: 'r2',
        problems: [{ code: 'image-too-large', message: 'The HTML nests elements over 128 deep.' }],
      });
    } finally {
      await session.close();
    }
  }, 60_000);

  it('makes the drawings asked for one at a time, and refuses past four waiting', async () => {
    let running = 0;
    let most = 0;
    const opened = await openSession(folder, {
      watch: false,
      out: () => {},
      err: () => {},
      makeDrawing: async () => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 20));
        running -= 1;
        return { ok: true, svg: '<svg viewBox="0 0 1 1"/>', width: 1, height: 1, report: [] };
      },
    });
    if (!opened.ok) throw new Error('The project does not open.');
    const { session } = opened;
    const said: ServerMessage[] = [];
    const client: SessionClient = { send: (message) => said.push(message) };
    try {
      await Promise.all(
        Array.from({ length: 5 }, (_, at) =>
          session.receive(
            client,
            JSON.stringify({
              type: 'drawing/make',
              requestId: `r${at}`,
              name: 'a.html',
              html: 'x',
              width: 64,
            }),
          ),
        ),
      );
      expect(most).toBe(1);
      expect(said.filter((message) => message.type === 'drawing/made')).toHaveLength(4);
      expect(said.find((message) => message.type === 'command/rejected')).toMatchObject({
        problems: [
          {
            code: 'program-failed',
            message: 'Visual Anything is making 4 drawings already: ask again once they are made.',
          },
        ],
      });
    } finally {
      await session.close();
    }
  });
});

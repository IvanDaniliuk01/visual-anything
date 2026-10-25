/**
 * `visual-anything import` (ADR-0042, ADR-0049): it imports a file into a project as one action of the
 * person's, through the program that runs on the project, or by opening the project and saving; it
 * says what the import does and what matched nothing, and with `--dry-run` imports nothing.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION } from '@visual-anything/core';
import type { ModelFile } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentContext, writeProgramRecord } from './claude/discovery';
import { IMPORT_USAGE, parseImportCommandLine, runImport } from './import-command';
import { entryOf } from './main';
import { startServer } from './server';
import { openSession } from './session';
import { openLiveClient, testProject, writeProjectFolder } from './test-support';

const FLOWCHART = `flowchart LR
  shopper((Shopper)) --> web[Web shop]
  web --> stock[(Stock)]
  subgraph back [Back end]
    stock
  end
  click web "https://example.com"
`;

let root: string;
let folder: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-import-')));
  folder = join(root, 'project');
  await writeProjectFolder(folder, testProject());
  await writeFile(join(root, 'checkout.mmd'), FLOWCHART);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
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

describe('the import command line', () => {
  it('is the import subcommand', () => {
    expect(entryOf(['import', 'a', 'b'])).toEqual({ kind: 'import', argv: ['a', 'b'] });
  });

  it('reads its maps, and refuses what it does not understand', () => {
    const parsed = parseImportCommandLine([
      'p',
      'f.csv',
      '--map',
      'a=b=c',
      '--map',
      'x=systems.box',
      '--key',
      'name',
    ]);
    expect(parsed.ok && 'value' in parsed && parsed.value.request).toEqual({
      map: { 'a=b': 'c', x: 'systems.box' },
      key: 'name',
    });
    expect(parseImportCommandLine(['p'])).toEqual({
      ok: false,
      message: 'Give the project folder and the file to import, not p.',
    });
    expect(parseImportCommandLine(['p', 'f', '--map', 'nothing'])).toEqual({
      ok: false,
      message: '--map takes <kind>=<id>, not "nothing".',
    });
  });

  it('prints its help', async () => {
    const { out, env } = environment();
    expect(await runImport(['--help'], env)).toBe(0);
    expect(out).toEqual([IMPORT_USAGE]);
  });
});

describe('importing with no program running', () => {
  it('opens the project, imports as one action and saves', async () => {
    const { out, err, env } = environment();
    expect(await runImport(['project', 'checkout.mmd'], env)).toBe(0);
    expect(err).toEqual([]);
    expect(out).toContain(
      'Read "checkout.mmd" as mermaid-flowchart (Mermaid): it creates 4 elements, 3 relations and 1 view.',
    );
    expect(out).toContain('  "cylinder" ([( )]) ×1 → systems.database');
    expect(out).toContain('What matched nothing:');
    expect(out.at(-1)).toBe('Done: Import "checkout.mmd", as one action you can undo in the app.');
    const saved = await model();
    expect(saved.elements.map((element) => element.name)).toEqual(
      expect.arrayContaining(['Shopper', 'Web shop', 'Stock', 'Back end']),
    );
    const stock = saved.elements.find((element) => element.name === 'Stock');
    expect(stock?.component).toBe('systems.database');
  });

  it('maps kinds as asked, and refuses a kind the file does not have', async () => {
    const mapped = environment();
    expect(
      await runImport(
        ['project', 'checkout.mmd', '--map', 'cylinder=systems.object-storage', '--no-view'],
        mapped.env,
      ),
    ).toBe(0);
    expect((await model()).elements.find((element) => element.name === 'Stock')?.component).toBe(
      'systems.object-storage',
    );
    const wrong = environment();
    expect(
      await runImport(['project', 'checkout.mmd', '--map', 'triangle=systems.box'], wrong.env),
    ).toBe(1);
    expect(wrong.err[1]).toMatch(
      /^ {2}The file has no kind "triangle"; its kinds are "rectangle", "circle", /,
    );
  });

  it('says what it would do with --dry-run, and changes nothing', async () => {
    const before = await readFile(join(folder, 'model.vamodel'), 'utf8');
    const { out, env } = environment();
    expect(await runImport(['project', 'checkout.mmd', '--dry-run'], env)).toBe(0);
    expect(out.at(-1)).toBe('Dry run: nothing was imported.');
    expect(await readFile(join(folder, 'model.vamodel'), 'utf8')).toBe(before);
  });

  it('refuses a file it cannot read, and one too large', async () => {
    const missing = environment();
    expect(await runImport(['project', 'nothing.mmd'], missing.env)).toBe(1);
    expect(missing.err[0]).toMatch(/^Could not read .*nothing\.mmd: /);
    await writeFile(join(root, 'words.txt'), 'Just some words.');
    const unknown = environment();
    expect(await runImport(['project', 'words.txt'], unknown.env)).toBe(1);
    expect(unknown.err).toEqual([
      'Could not import "words.txt":',
      '  Visual Anything cannot tell what this file is: name its format.',
    ]);
  });

  it('imports a draw.io picture and a Structurizr workspace, told apart by what they hold', async () => {
    const fixtures = fileURLToPath(new URL('../../core/src/import/fixtures/', import.meta.url));
    await writeFile(
      join(root, 'checkout.png'),
      await readFile(join(fixtures, 'checkout.drawio.png')),
    );
    await writeFile(
      join(root, 'workspace.json'),
      await readFile(join(fixtures, 'big-bank.structurizr.json')),
    );
    const picture = environment();
    expect(await runImport(['project', 'checkout.png'], picture.env)).toBe(0);
    expect(picture.out[0]).toMatch(/^Read "checkout.png" as drawio-png \(draw.io file\)/);
    const workspace = environment();
    expect(await runImport(['project', 'workspace.json', '--dry-run'], workspace.env)).toBe(0);
    expect(workspace.out[0]).toMatch(
      /^Read "workspace.json" as structurizr \(Structurizr workspace\)/,
    );
  });

  it('imports a spreadsheet again by its key, updating what it matched', async () => {
    await writeFile(
      join(root, 'again.csv'),
      'id,name,owner\napi,API v2,Team B\nnew,New service,Team C\n',
    );
    const { env } = environment();
    expect(await runImport(['project', 'again.csv', '--map', '=systems.service'], env)).toBe(0);
    const saved = await model();
    expect(saved.elements.find((element) => element.id === 'api')).toMatchObject({
      name: 'API v2',
      attributes: { owner: 'Team B' },
    });
    expect(saved.elements.find((element) => element.name === 'New service')?.component).toBe(
      'systems.service',
    );
  });
});

describe('importing into the program that runs on the project', () => {
  it('goes through it, as one action of the person’s that the app sees', async () => {
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
        await runImport(['project', 'checkout.mmd'], { ...env, runtimeFolder: runtime, context }),
      ).toBe(0);
      expect(err).toEqual([]);
      expect(out).toContain('Visual Anything runs on "Shop", so the import goes through it.');
      expect(session.actions).toMatchObject([
        { label: 'Import "checkout.mmd"', author: 'user', undone: false },
      ]);
      expect(session.snapshot.model.elements.some((element) => element.name === 'Web shop')).toBe(
        true,
      );
      expect(app.messages.some((message) => message.type === 'project/changed')).toBe(true);
    } finally {
      await app.close();
      await server.close();
      await session.close();
    }
  });
});

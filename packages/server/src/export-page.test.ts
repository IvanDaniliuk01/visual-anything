import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFile } from '@visual-anything/schema/validate';
import { PAGE_DATA_ID, readPageData } from '@visual-anything/app/src/viewer/data';
import { LARGE_PAGE } from '@visual-anything/app/src/viewer/page';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXPORT_USAGE, builtViewer, parseExportCommandLine, runExport } from './export-page';
import { entryOf } from './main';
import { memoryFiles } from './static';
import { testProject, writeProjectFolder, writeText } from './test-support';

const VIEWER = { script: 'document.title = "viewer";', style: 'body{margin:0}' };
const MADE = new Date('2026-10-25T12:00:00Z');

let folder = '';
let out: string[] = [];
let err: string[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-export-page-'));
  out = [];
  err = [];
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Runs `export`, with the viewer given, or with none for `null`. */
function run(argv: string[], viewer: typeof VIEWER | null = VIEWER) {
  return runExport(argv, {
    cwd: folder,
    write: (text) => out.push(text),
    err: (line) => err.push(line),
    viewer: () => Promise.resolve(viewer ?? undefined),
    now: () => MADE,
  });
}

/** The project a page holds, read back as the viewer reads it. */
function pageProject(html: string) {
  const match = new RegExp(
    `<script type="application/json" id="${PAGE_DATA_ID}">([^<]*)</script>`,
  ).exec(html);
  const read = readPageData(match?.[1] ?? '', validateFile);
  if (!read.ok) throw new Error(read.problems.join('\n'));
  return read;
}

describe('visual-anything export --format page', () => {
  it('is its own entry point', () => {
    expect(entryOf(['export', 'shop', '--format', 'page'])).toEqual({
      kind: 'export',
      argv: ['shop', '--format', 'page'],
    });
    expect(entryOf(['./export'])).toEqual({ kind: 'program', argv: ['./export'] });
  });

  it('writes the page of the whole project to the file given, and says how large it is', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    expect(await run(['shop', '--format', 'page', '--out', 'shop.html'])).toBe(0);
    expect(out).toEqual([]);
    const html = await readFile(join(folder, 'shop.html'), 'utf8');
    expect(html).toContain('<title>Shop · Visual Anything</title>');
    const read = pageProject(html);
    expect(read.project.model).toEqual(testProject().model);
    expect(read.project.views.map((view) => view.id)).toEqual(['overview']);
    expect(read.made).toBe(MADE.toISOString());
    expect(read.start).toBeUndefined();
    expect(err).toEqual([
      expect.stringMatching(/^Wrote the read-only page of "Shop" to shop\.html: 0\.\d MB\.$/),
    ]);
    // Only the file asked for is written, and no temporary file is left.
    expect((await readdir(folder)).sort()).toEqual(['shop', 'shop.html']);
  });

  it('opens at the view asked for, and writes the page to stdout without --out', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    expect(await run(['shop', '--format', 'page', '--view', 'overview'])).toBe(0);
    expect(out).toHaveLength(1);
    expect(pageProject(out[0] ?? '').start).toBe('view=overview');
  });

  it('refuses a view the project does not hold, and writes nothing', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    expect(await run(['shop', '--format', 'page', '--view', 'nowhere', '--out', 'x.html'])).toBe(2);
    expect(err).toEqual(['The project has no view "nowhere".']);
    expect(await readdir(folder)).toEqual(['shop']);
  });

  it('refuses a project that does not open, saying why', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    await writeText(join(folder, 'shop'), 'model.vamodel', '{ "world": 1 }');
    expect(await run(['shop', '--format', 'page'])).toBe(1);
    expect(err[0]).toBe('The project in shop cannot be opened:');
    expect(err.length).toBeGreaterThan(1);
    expect(out).toEqual([]);
  });

  it('says what to do when the build holds no viewer', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    expect(await run(['shop', '--format', 'page'], null)).toBe(1);
    expect(err[0]).toMatch(/Run `pnpm build`/);
  });

  it('says so before writing a page past 25 MB', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    const big = { ...VIEWER, script: `/*${'x'.repeat(LARGE_PAGE)}*/` };
    expect(await run(['shop', '--format', 'page', '--out', 'big.html'], big)).toBe(0);
    expect(err[0]).toMatch(/^The page is 25\.\d MB, past 25\.0 MB: it may open slowly/);
    expect(err[1]).toMatch(/^Wrote the read-only page/);
  });

  it('refuses what it does not understand, with its usage', () => {
    expect(parseExportCommandLine(['shop'])).toEqual({ ok: false, message: 'Give --format page.' });
    expect(parseExportCommandLine(['--format', 'page'])).toEqual({
      ok: false,
      message: 'Give the project folder to export.',
    });
    expect(parseExportCommandLine(['shop', '--format', 'gif'])).toEqual({
      ok: false,
      message: 'This build exports --format page; it has no format "gif".',
    });
    expect(parseExportCommandLine(['shop', '--format', 'page', '--wat']).ok).toBe(false);
  });

  it('shows its usage after a refusal', async () => {
    expect(await run(['shop'])).toBe(2);
    expect(err).toEqual(['Give --format page.', EXPORT_USAGE]);
  });
});

describe('The viewer the build holds', () => {
  it('is read from the build’s files, and is missing when either file is', async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const both = memoryFiles(
      new Map([
        ['viewer/viewer.js', encode('js')],
        ['viewer/viewer.css', encode('css')],
      ]),
    );
    expect(await builtViewer(both)).toEqual({ script: 'js', style: 'css' });
    const one = memoryFiles(new Map([['viewer/viewer.js', encode('js')]]));
    expect(await builtViewer(one)).toBeUndefined();
  });
});

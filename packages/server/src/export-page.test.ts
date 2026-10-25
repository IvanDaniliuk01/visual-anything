import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFile } from '@visual-anything/schema/validate';
import { PAGE_DATA_ID, readPageData } from '@visual-anything/app/src/viewer/data';
import { LARGE_PAGE, type ViewerAssets } from '@visual-anything/app/src/viewer/page';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseExportCommandLine, runExport } from './export-command';
import { NO_VIEWER, builtViewer } from './export-page';
import { memoryFiles } from './static';
import { testProject, writeProjectFolder, writeText } from './test-support';

const VIEWER: ViewerAssets = { script: 'document.title = "viewer";', style: 'body{margin:0}' };
const MADE = new Date('2026-10-25T12:00:00Z');

let folder = '';
let out: (string | Uint8Array)[] = [];
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
function run(argv: string[], viewer: ViewerAssets | null = VIEWER) {
  return runExport(argv, {
    cwd: folder,
    stdout: (data) => out.push(data),
    stdoutIsTerminal: false,
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
    expect(err).toEqual([expect.stringMatching(/^Wrote .*shop\.html \(\d+(\.\d)? KB\)\.$/)]);
    // Only the file asked for is written, and no temporary file is left.
    expect((await readdir(folder)).sort()).toEqual(['shop', 'shop.html']);
  });

  it('opens at the view asked for, and writes the page to stdout without --out', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    expect(await run(['shop', '--format', 'page', '--view', 'overview'])).toBe(0);
    expect(out).toHaveLength(1);
    expect(pageProject(String(out[0])).start).toBe('view=overview');
  });

  it('refuses a view the project does not hold, and writes nothing', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    expect(await run(['shop', '--format', 'page', '--view', 'nowhere', '--out', 'x.html'])).toBe(1);
    expect(err).toEqual(['The project has no view "nowhere". Its views: overview.']);
    expect(await readdir(folder)).toEqual(['shop']);
  });

  it('refuses a project that does not open, saying why', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    await writeText(join(folder, 'shop'), 'model.vamodel', '{ "world": 1 }');
    expect(await run(['shop', '--format', 'page'])).toBe(1);
    expect(err[0]).toMatch(/^The project in .*shop does not open:$/);
    expect(out).toEqual([]);
  });

  it('says what to do when the build holds no viewer', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    expect(await run(['shop', '--format', 'page'], null)).toBe(1);
    expect(err).toEqual([NO_VIEWER]);
  });

  it('says so before writing a page past 25 MB', async () => {
    await writeProjectFolder(join(folder, 'shop'), testProject());
    const big = { ...VIEWER, script: `/*${'x'.repeat(LARGE_PAGE)}*/` };
    expect(await run(['shop', '--format', 'page', '--out', 'big.html'], big)).toBe(0);
    expect(err[0]).toMatch(/^The page is 25\.\d MB, past 25\.0 MB: it may open slowly/);
    expect(err[1]).toMatch(/^Wrote .*big\.html/);
  });

  it('takes the page without a view, and the other formats only with one', () => {
    expect(parseExportCommandLine(['shop', '--format', 'page'])).toMatchObject({
      ok: true,
      value: { folder: 'shop', format: 'page' },
    });
    expect(parseExportCommandLine(['shop', '--format', 'svg'])).toEqual({
      ok: false,
      message: 'Give the view to export with --view <id>.',
    });
    expect(parseExportCommandLine(['shop', '--view', 'overview', '--format', 'gif'])).toEqual({
      ok: false,
      message:
        '"gif" is no format to export to; give one of svg, pdf, md, mermaid, structurizr, page.',
    });
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

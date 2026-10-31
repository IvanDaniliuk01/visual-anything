import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeBase64, solidHash } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import { PAGE_DATA_ID, readPageData } from '@visual-anything/app/src/viewer/data';
import {
  LARGE_PAGE,
  SOLID_WORKER_ID,
  type ViewerAssets,
} from '@visual-anything/app/src/viewer/page';
import { ARM_FILE, withSolids } from '@visual-anything/app/src/test/solids';
import { workcell } from '@visual-anything/app/src/test/space';
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
    // The solid worker beside the viewer, when the build holds it (ADR 0075).
    const three = memoryFiles(
      new Map([
        ['viewer/viewer.js', encode('js')],
        ['viewer/viewer.css', encode('css')],
        ['viewer/solid-worker.js', encode('worker')],
      ]),
    );
    expect(await builtViewer(three)).toEqual({ script: 'js', style: 'css', solidWorker: 'worker' });
  });
});

describe('visual-anything export --format page, with solids', () => {
  const WITH_WORKER: ViewerAssets = { ...VIEWER, solidWorker: 'self.onmessage = () => {};' };

  async function robotFolder(withFile: boolean): Promise<void> {
    await writeProjectFolder(join(folder, 'robot'), withSolids());
    if (withFile) {
      await mkdir(join(folder, 'robot', 'solids'), { recursive: true });
      await writeFile(join(folder, 'robot', 'solids', `${solidHash(ARM_FILE)}.glb`), ARM_FILE);
    }
  }

  it('holds the files of the solids its views show, read from the project, with the solid worker', async () => {
    await robotFolder(true);
    expect(await run(['robot', '--format', 'page', '--out', 'robot.html'], WITH_WORKER)).toBe(0);
    const html = await readFile(join(folder, 'robot.html'), 'utf8');
    const read = pageProject(html);
    expect(read.solids).toEqual({
      form: 'files',
      files: { [solidHash(ARM_FILE)]: encodeBase64(ARM_FILE) },
    });
    expect(html).toContain(`id="${SOLID_WORKER_ID}"`);
    expect(html).toContain('worker-src blob:');
    expect(err.some((line) => line.startsWith('Its solids take '))).toBe(true);
  });

  it('draws a solid whose file it cannot read as its placeholder, and says so', async () => {
    await robotFolder(false);
    expect(await run(['robot', '--format', 'page', '--out', 'robot.html'], WITH_WORKER)).toBe(0);
    expect(err).toContain(
      'One solid’s file could not be read, and the page draws it as its placeholder.',
    );
    // It could read no solid's file, so the page holds no solids and no worker for nothing.
    const html = await readFile(join(folder, 'robot.html'), 'utf8');
    expect(pageProject(html).solids).toBeUndefined();
    expect(html).not.toContain(`id="${SOLID_WORKER_ID}"`);
    expect(html).toContain("worker-src 'none'");
  });

  it('holds no solids without the solid worker, and says so', async () => {
    await robotFolder(true);
    expect(await run(['robot', '--format', 'page', '--out', 'robot.html'])).toBe(0);
    expect(err.some((line) => line.startsWith('The page draws its solids as placeholders'))).toBe(
      true,
    );
    const html = await readFile(join(folder, 'robot.html'), 'utf8');
    expect(pageProject(html).solids).toBeUndefined();
    expect(html).toContain("worker-src 'none'");
  });
});

describe('visual-anything export --format page, with poses (ADR 0076)', () => {
  const WITH_WORKER: ViewerAssets = { ...VIEWER, solidWorker: 'self.onmessage = () => {};' };

  // The workcell's arm shows a solid whose file the folder does not hold.
  it('holds the solid worker from no files for its physical-space panel', async () => {
    await writeProjectFolder(join(folder, 'cell'), workcell());
    expect(await run(['cell', '--format', 'page', '--out', 'cell.html'], WITH_WORKER)).toBe(0);
    const html = await readFile(join(folder, 'cell.html'), 'utf8');
    expect(pageProject(html).solids).toEqual({ form: 'files', files: {} });
    expect(html).toContain(`id="${SOLID_WORKER_ID}"`);
    expect(html).toContain('worker-src blob:');
    expect(err.some((line) => line.startsWith('Its physical-space panel takes '))).toBe(true);
  });

  it('has no panel without the solid worker, and says so', async () => {
    await writeProjectFolder(join(folder, 'cell'), workcell());
    expect(await run(['cell', '--format', 'page', '--out', 'cell.html'])).toBe(0);
    expect(err.some((line) => line.startsWith('The page has no physical-space panel'))).toBe(true);
    const html = await readFile(join(folder, 'cell.html'), 'utf8');
    expect(pageProject(html).solids).toBeUndefined();
    expect(html).toContain("worker-src 'none'");
  });

  it('holds nothing when it could read no solid’s file and has no poses', async () => {
    await writeProjectFolder(join(folder, 'cell'), workcell({ posed: false }));
    expect(await run(['cell', '--format', 'page', '--out', 'cell.html'], WITH_WORKER)).toBe(0);
    const html = await readFile(join(folder, 'cell.html'), 'utf8');
    expect(pageProject(html).solids).toBeUndefined();
    expect(html).toContain("worker-src 'none'");
  });
});

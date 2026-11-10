/**
 * Math in the command line's exports (ADR 0106): its SVG, PDF and read-only page are the app's, made
 * from the same functions: formulas drawn as glyph outlines, which it loads itself, and a page that
 * holds the KaTeX fonts its Math uses, and only those, read from the build beside the viewer.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeBase64, type MathFont, type ProjectSnapshot } from '@visual-anything/core';
import { exportView } from '@visual-anything/app/src/export/exports';
import { PAGE_DATA_ID, pageDataOf } from '@visual-anything/app/src/viewer/data';
import { MATH_FAMILIES, mathFontFile } from '@visual-anything/app/src/viewer/math-families';
import { pageTitle, writePage, type ViewerAssets } from '@visual-anything/app/src/viewer/page';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runExport } from './export-command';
import { builtViewer } from './export-page';
import { loadProject } from './project';
import { memoryFiles } from './static';
import { testProject, writeProjectFolder } from './test-support';

const MADE = new Date('2026-11-10T12:00:00Z');
const FORMULA = '$\\frac{1}{n}\\sum_i x_i$';

/** A stand-in for a family's woff2 file: its signature, then its name. */
const fontBytes = (font: MathFont) =>
  new Uint8Array([0x77, 0x4f, 0x46, 0x32, ...new TextEncoder().encode(font)]);

const VIEWER: ViewerAssets = {
  script: 'document.title = "viewer";',
  style: 'body{margin:0}',
  mathFonts: Object.fromEntries(MATH_FAMILIES.map((font) => [font, fontBytes(font)])),
};

/** The test project, its overview's note holding a formula. */
function withFormula(): ProjectSnapshot {
  const project = testProject();
  return {
    ...project,
    views: project.views.map((view) => ({
      ...view,
      freeShapes: view.freeShapes.map((shape) =>
        shape.kind === 'note' ? { ...shape, text: `The mean ${FORMULA}` } : shape,
      ),
    })),
  };
}

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-export-math-'));
  await writeProjectFolder(join(folder, 'shop'), withFormula());
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function run(argv: string[]): Promise<number> {
  return runExport(argv, {
    cwd: folder,
    stdout: () => undefined,
    stdoutIsTerminal: false,
    err: () => undefined,
    viewer: () => Promise.resolve(VIEWER),
    now: () => MADE,
  });
}

/** The project as the command line opens it. */
async function opened(): Promise<ProjectSnapshot> {
  const loaded = await loadProject(join(folder, 'shop'));
  if (!loaded.ok) throw new Error('The project does not open.');
  return loaded.project;
}

describe('Math in the command line’s exports (ADR 0106)', () => {
  it('writes the SVG the app writes, its formulas as glyph outlines', async () => {
    expect(await run(['shop', '--view', 'overview', '--format', 'svg', '--out', 'o.svg'])).toBe(0);
    const svg = await readFile(join(folder, 'o.svg'), 'utf8');
    expect(svg).toContain(`data-tex="${FORMULA}"`);
    expect(svg).toMatch(/<use href="#va-math-Math-Italic-/);
    expect(svg).not.toContain('KaTeX');
    expect(svg).toBe((await exportView(await opened(), 'overview', 'svg')).text);
  });

  it('writes a PDF with its formulas', async () => {
    expect(await run(['shop', '--view', 'overview', '--format', 'pdf', '--out', 'o.pdf'])).toBe(0);
    const pdf = await readFile(join(folder, 'o.pdf'));
    const app = await exportView(await opened(), 'overview', 'pdf', { date: MADE });
    // The same drawing, in a file of the same size: only its dates and ids may differ.
    expect(Math.abs(pdf.byteLength - (app.bytes?.byteLength ?? 0))).toBeLessThan(200);
  }, 60_000);

  it('writes the page the app writes, with the fonts its Math uses alone', async () => {
    expect(await run(['shop', '--format', 'page', '--out', 'shop.html'])).toBe(0);
    const html = await readFile(join(folder, 'shop.html'), 'utf8');
    const held = new RegExp(
      `<script type="application/json" id="${PAGE_DATA_ID}">([^<]*)</script>`,
    ).exec(html);
    const data = JSON.parse(held?.[1] ?? '{}') as { mathFonts?: Record<string, string> };
    expect(data.mathFonts).toEqual({
      'Main-Regular': encodeBase64(fontBytes('Main-Regular')),
      'Math-Italic': encodeBase64(fontBytes('Math-Italic')),
      'Size1-Regular': encodeBase64(fontBytes('Size1-Regular')),
    });
    // As the app's Export → Read-only page writes it (`makePage`).
    const project = await opened();
    const app = await writePage({
      assets: VIEWER,
      data: pageDataOf(project, { made: MADE }),
      title: pageTitle(project.project.name),
    });
    expect(html).toBe(app.html);
  });
});

describe('The viewer the build holds, with KaTeX’s fonts', () => {
  it('reads the fonts its build writes beside it', async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const files = memoryFiles(
      new Map([
        ['viewer/viewer.js', encode('js')],
        ['viewer/viewer.css', encode('css')],
        [`viewer/${mathFontFile('Main-Regular')}`, fontBytes('Main-Regular')],
      ]),
    );
    expect(await builtViewer(files)).toEqual({
      script: 'js',
      style: 'css',
      mathFonts: { 'Main-Regular': fontBytes('Main-Regular') },
    });
  });
});

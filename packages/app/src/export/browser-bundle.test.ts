// @vitest-environment node
// The exports bundled for the browser, as the app's build bundles them: PDFKit's browser build, and
// nothing that only Node has.
import { build } from 'esbuild';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the exports in the browser', () => {
  it('bundle with PDFKit’s browser build and no module of Node', async () => {
    const result = await build({
      entryPoints: [join(import.meta.dirname, 'exports.ts')],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      splitting: true,
      outdir: 'out',
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    expect(result.errors).toEqual([]);
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.some((input) => input.endsWith('pdfkit/js/pdfkit.browser.mjs'))).toBe(true);
    expect(inputs.some((input) => input.includes('pdfkit.node'))).toBe(false);
    expect(inputs.some((input) => /node_modules\/(pixi\.js|react-dom)\//.test(input))).toBe(false);
    // PDFKit, the converter and the fonts load only when a PDF is made: in chunks of their own.
    const entry = Object.entries(result.metafile.outputs).find(([, output]) => output.entryPoint);
    const imported = entry?.[1].imports ?? [];
    expect(imported.filter((each) => each.kind === 'dynamic-import').length).toBeGreaterThanOrEqual(
      3,
    );
    expect(Object.keys(entry?.[1].inputs ?? {}).some((input) => input.includes('pdfkit'))).toBe(
      false,
    );
  }, 180_000);
});

describe('a comparison’s exports in the browser', () => {
  it('bundle with neither PixiJS nor React DOM, and PDFKit only when a PDF is made', async () => {
    const result = await build({
      entryPoints: ['comparison.ts', 'comparison-summary.ts'].map((file) =>
        join(import.meta.dirname, file),
      ),
      bundle: true,
      platform: 'browser',
      format: 'esm',
      splitting: true,
      outdir: 'out',
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    expect(result.errors).toEqual([]);
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((input) => /node_modules\/(pixi\.js|react-dom)\//.test(input))).toEqual(
      [],
    );
    for (const output of Object.values(result.metafile.outputs)) {
      // The chunks PDFKit loads in are entry points of their own, which the files import when needed.
      if (!/comparison(-summary)?\.ts$/.test(output.entryPoint ?? '')) continue;
      expect(Object.keys(output.inputs).filter((input) => input.includes('pdfkit'))).toEqual([]);
    }
  }, 180_000);
});

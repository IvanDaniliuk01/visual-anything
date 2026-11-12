// @vitest-environment node
// The solid worker's bundle (ADR 0075): three.js and three-mesh-bvh are imported by the worker's
// modules alone, and the worker, bundled as Vite bundles it into one script of its own, holds
// everything it runs, loads no code of its own, and has nothing that makes a connection, as the
// policy of every worker forbids (ADR 0027, ADR 0054).
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
const WORKER = join(import.meta.dirname, 'solid.worker.ts');

// Read at once: awaiting each of a thousand files in turn took past the test's time on a loaded
// machine, where each wait for the event loop could take a timer's step of about 16 ms.
function sources(folder: string): string[] {
  const entries = readdirSync(folder, { withFileTypes: true, recursive: true });
  return entries
    .filter(
      (entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('the solid worker’s bundle', () => {
  it('is the only place that imports three.js or three-mesh-bvh', () => {
    const importers: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (/from '(three|three-mesh-bvh)(\/[^']*)?'/.test(text)) {
        importers.push(relative(SRC, file).replaceAll('\\', '/'));
      }
    }
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((file) => !file.startsWith('solids/worker/'))).toEqual([]);
  });

  it('holds three.js and three-mesh-bvh in one script, with nothing that connects or loads code', async () => {
    const result = await build({
      entryPoints: [WORKER],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      metafile: true,
      logLevel: 'silent',
      outdir: 'out',
    });
    expect(result.errors).toEqual([]);
    expect(result.outputFiles).toHaveLength(1);
    // What the bundle holds: a package esbuild reads and leaves out, such as KaTeX through the
    // core's index, is not in it.
    const held = Object.values(result.metafile.outputs).flatMap((output) =>
      Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput > 0)
        .map(([path]) => path),
    );
    const packages = new Set(
      held
        .filter((input) => input.includes('node_modules/'))
        .map((input) => input.replace(/.*node_modules\//, '').split('/')[0]),
    );
    expect([...packages].sort()).toEqual(['three', 'three-mesh-bvh']);
    const text = result.outputFiles[0]?.text ?? '';
    for (const forbidden of [
      /\bfetch\(/,
      /new XMLHttpRequest\b/,
      /new WebSocket\b/,
      /new EventSource\b/,
      /\bimportScripts\(/,
      /\bsendBeacon\(/,
      /\bimport\(/,
      /new Worker\b/,
      /\beval\(/,
      /new Function\b/,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
  }, 300_000);
});

// @vitest-environment node
// three.js runs only in the solid worker (ADR 0075): nothing of the solids' seam, the scene, the
// client, the protocol or the stand-in, brings it, or the worker's module, into the app's first
// chunk. The client starts the worker by its address only, which Vite bundles on its own.
import { build, type Plugin } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

/** What Vite reads that esbuild does not: imports with a query, styles and fonts, left out here. */
const viteOnly: Plugin = {
  name: 'vite-only',
  setup(context) {
    context.onResolve({ filter: /\?(url|raw|worker|inline)$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
    context.onResolve({ filter: /\.(css|woff2?|ttf|png|svg)$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

/** Whether a module is three.js, or the solid worker's own. */
function isThreeOrWorker(input: string): boolean {
  const path = input.replaceAll('\\', '/');
  return /node_modules\/(three|three-mesh-bvh)\//.test(path) || path.includes('src/solids/worker/');
}

async function bundled(entryPoints: string[]) {
  const result = await build({
    entryPoints,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    splitting: true,
    outdir: 'out',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [viteOnly],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  });
  expect(result.errors).toEqual([]);
  return result.metafile;
}

describe('the solids’ seam in the app’s bundle', () => {
  it('keeps three.js and the solid worker out of the app’s first chunk', async () => {
    const metafile = await bundled([join(SRC, 'main.tsx')]);
    const entry = Object.values(metafile.outputs).find((output) =>
      output.entryPoint?.endsWith('main.tsx'),
    );
    expect(entry).toBeDefined();
    // The first chunk is the entry and every chunk it imports statically.
    const first = new Set<string>();
    const visit = (path: string) => {
      if (first.has(path)) return;
      first.add(path);
      for (const each of metafile.outputs[path]?.imports ?? []) {
        if (each.kind === 'import-statement' && !each.external) visit(each.path);
      }
    };
    const [entryPath] =
      Object.entries(metafile.outputs).find(([, output]) => output === entry) ?? [];
    visit(entryPath as string);
    const inputs = [...first].flatMap((path) => Object.keys(metafile.outputs[path]?.inputs ?? {}));
    // The scene's seam for solids is in it, and brings neither.
    expect(inputs.some((input) => input.endsWith('canvas/shape-solids.ts'))).toBe(true);
    expect(inputs.filter(isThreeOrWorker)).toEqual([]);
    expect(Object.keys(metafile.inputs).filter(isThreeOrWorker)).toEqual([]);
  }, 300_000);

  it('brings neither three.js nor the worker’s module in with the scene, the client and the protocol', async () => {
    const metafile = await bundled(
      ['canvas/scene.ts', 'canvas/shape-solids.ts', 'solids/client.ts', 'solids/protocol.ts'].map(
        (file) => join(SRC, file),
      ),
    );
    expect(Object.keys(metafile.inputs).filter(isThreeOrWorker)).toEqual([]);
    expect(
      Object.keys(metafile.inputs).filter((input) => /node_modules\/pixi\.js\//.test(input)),
    ).toEqual([]);
  }, 300_000);

  it('starts the worker by its address, never by importing it', async () => {
    const client = await readFile(join(SRC, 'solids', 'client.ts'), 'utf8');
    expect(client).toContain("new Worker(new URL('./worker/solid.worker.ts', import.meta.url)");
    expect(client).not.toMatch(/from '\.\/worker\//);
    const worker = await readFile(join(SRC, 'solids', 'worker', 'solid.worker.ts'), 'utf8');
    expect(worker).not.toMatch(/from 'three/);
  });
});

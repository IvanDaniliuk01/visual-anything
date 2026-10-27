// @vitest-environment node
/**
 * Neither the app's page nor the read-only page holds the converter that makes drawings of HTML
 * (ADR 0068): parse5, satori and its WebAssembly, and the server's drawing code with its Roboto are
 * loaded only by the local program's worker. This bundles the app's page, its workers and the
 * read-only page's script as the build does, and reads which modules they hold. The read-only page's
 * own bundle test (`viewer/bundle.test.ts`) checks its build too.
 */
import { join } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '..');

/** What only the local program's worker may hold. */
const CONVERTER =
  /node_modules[\\/](\.pnpm[\\/])?(parse5|satori|harfbuzzjs)[@\\/]|packages[\\/]server[\\/]/;

/** Vite's own imports, `?url` and the virtual modules, stood in for by empty ones. */
const viteImports: Plugin = {
  name: 'vite-imports',
  setup(builder) {
    builder.onResolve({ filter: /^virtual:|\?(url|raw|worker|inline)$/ }, (args) => ({
      path: args.path,
      namespace: 'vite-import',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'vite-import' }, () => ({
      contents: 'export default ""',
      loader: 'js',
    }));
  },
};

describe('the pages’ bundles', () => {
  it('hold no part of the converter that makes drawings of HTML', async () => {
    const result = await build({
      entryPoints: [
        join(SOURCE, 'main.tsx'),
        join(SOURCE, 'viewer', 'main.tsx'),
        join(SOURCE, 'canvas', 'layout', 'layout.worker.ts'),
        join(SOURCE, 'canvas', 'routing', 'avoid.worker.ts'),
        join(SOURCE, 'code', 'code.worker.ts'),
      ],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      splitting: true,
      outdir: 'out',
      write: false,
      metafile: true,
      logLevel: 'silent',
      loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.png': 'empty' },
      plugins: [viteImports],
    });
    expect(result.errors).toEqual([]);
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.some((input) => input.includes('ImportControl.tsx'))).toBe(true);
    expect(inputs.filter((input) => CONVERTER.test(input))).toEqual([]);
  }, 180_000);
});

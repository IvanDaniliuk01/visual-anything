/**
 * The cleaner's worker bundle (ADR 0075): it holds the glTF reader and meshoptimizer, and evaluates
 * them only when it cleans, so that checking a solid's file loads neither.
 */
import { describe, expect, it } from 'vitest';
import { bundleSolidWorker } from './bundle';

describe('the cleaner’s worker bundle', () => {
  it('holds the reader and meshoptimizer, loaded only for cleaning', async () => {
    const { code, metafile } = await bundleSolidWorker();
    // What the bundle holds: a package esbuild reads and leaves out, such as KaTeX through the
    // core's index, is not in it.
    const held = Object.values(metafile.outputs).flatMap((output) =>
      Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput > 0)
        .map(([path]) => path),
    );
    const packages = new Set(
      held
        .filter((input) => input.includes('node_modules'))
        .map((input) => {
          const parts = input.split(/[\\/]/);
          const at = parts.lastIndexOf('node_modules');
          const scoped = parts[at + 1]?.startsWith('@') === true;
          return parts.slice(at + 1, at + (scoped ? 3 : 2)).join('/');
        }),
    );
    expect([...packages].sort()).toEqual([
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      'ktx-parse',
      'meshoptimizer',
      'property-graph',
    ]);
    // The cleaner, with the reader, is a module the bundle starts only when it is imported.
    expect(code).toMatch(/var init_clean = __esm\(/);
  }, 60_000);
});

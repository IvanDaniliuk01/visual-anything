import { isBuiltin } from 'node:module';
import { describe, expect, it } from 'vitest';
import { bundleDrawingWorker } from './bundle';

describe('the drawing’s worker, bundled', () => {
  it('is one script that holds parse5, satori and Roboto and needs nothing but Node.js', async () => {
    const { code, metafile } = await bundleDrawingWorker();
    expect(code.length).toBeGreaterThan(500_000);
    const inputs = Object.keys(metafile.inputs);
    for (const held of [
      'node_modules/parse5/',
      'node_modules/satori/',
      'packages/server/src/drawings/fonts/roboto.json',
      'packages/server/src/drawings/worker.ts',
    ]) {
      expect(inputs.some((input) => input.replaceAll('\\', '/').includes(held))).toBe(true);
    }
    const outside = Object.values(metafile.outputs)
      .flatMap((output) => output.imports)
      .filter((each) => each.external && !isBuiltin(each.path));
    expect(outside).toEqual([]);
  }, 120_000);
});

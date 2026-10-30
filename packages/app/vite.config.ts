import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * libavoid's WebAssembly as a file of its own beside the app, `libavoid.wasm`, unhashed, so that the
 * person can replace it with a build of their own, as its license (LGPL-2.1-or-later) lets them
 * (ADR 0080's consequences): served as it is in dev mode, and copied into the build.
 */
function libavoidWasm(): Plugin {
  const file = join(
    dirname(createRequire(import.meta.url).resolve('libavoid-js')),
    'libavoid.wasm',
  );
  return {
    name: 'visual-anything:libavoid-wasm',
    configureServer(server) {
      server.middlewares.use('/libavoid.wasm', (_request, response) => {
        response.setHeader('Content-Type', 'application/wasm');
        response.end(readFileSync(file));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'libavoid.wasm', source: readFileSync(file) });
    },
  };
}

export default defineConfig({
  plugins: [react(), libavoidWasm()],
  // The app's page alone is scanned for dependencies: the read-only page and its benchmark import
  // the validators that only their own build makes (`vite.viewer.config.ts`).
  optimizeDeps: { entries: ['index.html'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    unstubGlobals: true,
    // Tests run beside other builds and test runs: a loaded machine stretches them past 5 seconds.
    testTimeout: 20_000,
  },
});

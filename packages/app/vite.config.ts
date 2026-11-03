import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { shippedModules } from './vite.shipped.ts';

export default defineConfig({
  plugins: [react(), shippedModules('app')],
  // Each worker is a build of its own: it lists what it ships too (`vite.shipped.ts`).
  worker: { plugins: () => [shippedModules('worker')] },
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

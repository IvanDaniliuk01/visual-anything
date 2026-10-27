import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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

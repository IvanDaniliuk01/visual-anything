import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    unstubGlobals: true,
    // Tests run beside other builds and test runs: a loaded machine stretches them past 5 seconds.
    testTimeout: 20_000,
  },
});

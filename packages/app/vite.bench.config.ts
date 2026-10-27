// The benchmark pages built for production, the build their official numbers come from. React's
// profiling build stands in for react-dom/client, so that the app benchmark's Profiler still reports.
// `pnpm bench` builds them into dist-bench and serves them on 127.0.0.1:47707, and stops when that
// port is taken rather than serving them on another; paths are the app package's.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { validators } from './vite.viewer.config';

export default defineConfig({
  // The read-only page's benchmark reads its data with the validators the page is built with.
  plugins: [react(), validators()],
  resolve: { alias: [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] },
  build: {
    outDir: 'dist-bench',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        canvas: 'bench.html',
        app: 'app-bench.html',
        exports: 'exports-bench.html',
        page: 'page-bench.html',
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 47707,
    strictPort: true,
    // Cross-origin isolated, so that Chrome reads its clock finer than 0.1 ms: pointing is held to
    // 1 ms (W60). The pages load nothing from another origin.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});

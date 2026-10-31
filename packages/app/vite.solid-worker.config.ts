// The solid worker as a read-only page holds it (ADR 0075, ADR 0041): one classic script,
// `dist/viewer/solid-worker.js`, with three.js and three-mesh-bvh in it and nothing it loads. The
// export writes it into a page whose views show solids, as data the browser never runs, and the
// page starts it from a `blob:` address; a page without solids holds none of it. The app's own build
// emits the same worker as a module of its own (`solids/client.ts`).
//
// `pnpm build` builds it after the viewer, into the viewer's folder, which it leaves as it is.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist/viewer',
    emptyOutDir: false,
    assetsInlineLimit: () => true,
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 8192,
    rolldownOptions: {
      input: 'src/solids/worker/solid.worker.ts',
      output: {
        format: 'iife',
        entryFileNames: 'solid-worker.js',
        codeSplitting: false,
        // The licenses of what it bundles travel with it, in every page that holds it.
        postBanner:
          '/*! Visual Anything’s solid worker. three.js 0.186.1, Copyright © 2010-2026 three.js authors, MIT License. three-mesh-bvh 0.9.16, Copyright (c) 2018 Garrett Johnson, MIT License. */',
      },
    },
  },
});

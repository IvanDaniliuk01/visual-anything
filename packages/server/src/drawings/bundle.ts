/**
 * The drawing's worker as one CommonJS script (ADR 0068): `worker.ts` with parse5, satori, its
 * WebAssembly, Roboto and the core's few parts it uses. The single executable holds it as an asset
 * (`scripts/package.ts`), and the sources run it too, built once a process, so that the worker
 * the tests and `pnpm dev` start is the one the executable starts.
 *
 * esbuild comes with the repository, as tsx's own; the executable never builds anything.
 */
import { fileURLToPath } from 'node:url';
import type { Metafile } from 'esbuild';

/** The worker's entry point. */
export const DRAWING_WORKER_ENTRY = fileURLToPath(new URL('./worker.ts', import.meta.url));

/** Bundles the worker into one script, written to `outfile` or given back as text. */
export async function bundleDrawingWorker(
  outfile?: string,
): Promise<{ code: string; metafile: Metafile }> {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [DRAWING_WORKER_ENTRY],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    metafile: true,
    logLevel: 'warning',
    // The licenses the packages' code carries stay with it, at the script's end.
    legalComments: 'eof',
    ...(outfile === undefined ? { write: false, outdir: 'out' } : { outfile }),
  });
  const code =
    outfile === undefined
      ? (result.outputFiles?.[0]?.text ?? '')
      : (await import('node:fs/promises')).readFile(outfile, 'utf8');
  return { code: await code, metafile: result.metafile };
}

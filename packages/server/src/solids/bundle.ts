/**
 * The solid cleaner's worker as one CommonJS script (ADR 0075): `worker.ts` with the glTF reader,
 * meshoptimizer and its WebAssembly, and the core's parts it uses. The single executable holds it as
 * an asset (`scripts/package.ts`), and the sources run it too, built once a process, so that the
 * worker the tests and `pnpm dev` start is the one the executable starts.
 *
 * esbuild comes with the repository, as tsx's own; the executable never builds anything.
 */
import { fileURLToPath } from 'node:url';
import type { Metafile } from 'esbuild';

/** The worker's entry point. */
export const SOLID_WORKER_ENTRY = fileURLToPath(new URL('./worker.ts', import.meta.url));

/** Bundles the worker into one script, written to `outfile` or given back as text. */
export async function bundleSolidWorker(
  outfile?: string,
): Promise<{ code: string; metafile: Metafile }> {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [SOLID_WORKER_ENTRY],
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

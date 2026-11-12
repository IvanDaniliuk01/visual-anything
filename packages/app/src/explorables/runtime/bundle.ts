/**
 * Bundles the `va` runtime (`entry.ts`) into one plain script with no imports, as the frame builder
 * inlines it (ADR 0107): an immediately run function, minified, with no comment left in it. esbuild
 * comes with the repository, as tsx's own; nothing builds it at run time: `generate.ts` writes it
 * into `va-runtime.generated.ts`, and a test fails while that file differs from a fresh bundle.
 */
import { fileURLToPath } from 'node:url';

/** The runtime's entry point. */
export const RUNTIME_ENTRY = fileURLToPath(new URL('./entry.ts', import.meta.url));

/** The repository's root, which the modules' paths are written from. */
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** The runtime as one script, and the modules whose code it holds. */
export async function bundleRuntime(): Promise<{ code: string; modules: string[] }> {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [RUNTIME_ENTRY],
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    outdir: 'out',
    platform: 'browser',
    format: 'iife',
    target: ['chrome127', 'firefox128', 'safari17'],
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    metafile: true,
    logLevel: 'warning',
  });
  const code = (result.outputFiles[0]?.text ?? '').trim();
  // The modules that put something in the script: what tree shaking left of the core is its own.
  const modules = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([path]) => path),
  );
  return { code, modules };
}

/**
 * The parts of making the single executable (ADR 0037) that can be checked on their own: bundling the
 * server into one CommonJS script, collecting the built app's files as the executable's assets, and
 * the sea-config Node.js reads to prepare what it injects. `package.ts` runs them in order.
 */
import { existsSync } from 'node:fs';
import { lstat, readdir, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Metafile } from 'esbuild';
import { bundleDrawingWorker } from '../src/drawings/bundle';
import { DRAWING_WORKER_ASSET, DRAWING_WORKER_FILE } from '../src/drawings/make';
import { bundleSolidWorker } from '../src/solids/bundle';
import { SOLID_WORKER_ASSET, SOLID_WORKER_FILE } from '../src/solids/cleaner';
import { APP_ASSET_PREFIX, NOTICES_ASSET } from '../src/executable';
import { bundledPackages, noticeText, packageFolders } from './notices';

/** The repository's root folder. */
export const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url));

/** The command the executable runs: the local program, and with `mcp` Claude's entry point. */
export const SERVER_ENTRY = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The built app, which `pnpm build` writes. */
export const APP_DIST = join(REPOSITORY, 'packages', 'app', 'dist');

/** Where `pnpm package` writes the executable; git and the linters ignore it. */
export const OUT_DIR = join(REPOSITORY, 'dist-exe');

/** The sentinel Node.js looks for to know that it holds an injected application. */
export const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

/** The resource the preparation blob is injected as, and on macOS the segment that holds it. */
export const SEA_RESOURCE = 'NODE_SEA_BLOB';
export const MACHO_SEGMENT = 'NODE_SEA';

/** The executable's file name on a system. */
export function executableName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'visual-anything.exe' : 'visual-anything';
}

/**
 * What stands for `import.meta.url` in the bundle, which CommonJS lacks: the file URL of the script
 * that runs, which in the executable is the executable itself.
 */
const IMPORT_META_URL = '__visualAnythingImportMetaUrl';

/**
 * Modules the bundle leaves out, all of them never loaded in the executable: Vite, which only dev mode
 * imports, the optional native add-ons that `ws` tries and does without, and esbuild, with which the
 * sources build the drawing's worker (ADR 0068), which the executable holds already built.
 */
const LEFT_OUT = ['vite', 'bufferutil', 'utf-8-validate', 'esbuild'];

/** The file the notice of the code an executable bundles is written to, beside it. */
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';

/**
 * Bundles the server, with everything it imports from core, schema and its dependencies, into one
 * CommonJS script, as single executable applications run their main script.
 */
export async function bundleServer(outfile: string): Promise<Metafile> {
  const result = await build({
    entryPoints: [SERVER_ENTRY],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: LEFT_OUT,
    define: { 'import.meta.url': IMPORT_META_URL },
    banner: {
      js: `const ${IMPORT_META_URL} = require("node:url").pathToFileURL(__filename).href;`,
    },
    metafile: true,
    logLevel: 'warning',
  });
  return result.metafile;
}

/**
 * The drawing's worker (ADR 0068), bundled beside the server's bundle, where the bundle run by Node.js
 * finds it; the executable holds it as the asset {@link DRAWING_WORKER_ASSET}.
 */
export async function bundleDrawingWorkerBeside(
  serverBundle: string,
): Promise<{ file: string; metafile: Metafile }> {
  const file = join(dirname(serverBundle), DRAWING_WORKER_FILE);
  const { metafile } = await bundleDrawingWorker(file);
  return { file, metafile };
}

/**
 * Writes the notice of the code the bundles hold, every npm package with its license and source, and
 * Node.js's, beside them (ADR 0037's clarification of 2026-10-26).
 */
export async function writeNotices(
  metafiles: readonly Metafile[],
  outfile: string,
  nodeVersion: string = process.versions.node,
): Promise<string> {
  const packages = await bundledPackages(packageFolders(metafiles, process.cwd()));
  const text = noticeText(packages, nodeVersion);
  await writeFile(outfile, text);
  return text;
}

/**
 * The solid cleaner's worker (ADR 0075), with the glTF reader and meshoptimizer, bundled beside the
 * server's bundle, where the bundle run by Node.js finds it; the executable holds it as the asset
 * {@link SOLID_WORKER_ASSET}.
 */
export async function bundleSolidWorkerBeside(
  serverBundle: string,
): Promise<{ file: string; metafile: Metafile }> {
  const file = join(dirname(serverBundle), SOLID_WORKER_FILE);
  const { metafile } = await bundleSolidWorker(file);
  return { file, metafile };
}

/** The executable's assets besides the app: the drawing's worker, the solid cleaner's and the notice. */
export function programAssets(
  worker: string,
  solidWorker: string,
  notices: string,
): Record<string, string> {
  return {
    [DRAWING_WORKER_ASSET]: worker,
    [SOLID_WORKER_ASSET]: solidWorker,
    [NOTICES_ASSET]: notices,
  };
}

/**
 * The files of the built app as the executable's assets, by key: `app/` and each file's path in the
 * build. Only regular files are taken, and a link anywhere in the build is refused, so that nothing
 * from elsewhere on this computer ends up in the executable.
 */
export async function collectAppAssets(dist: string): Promise<Record<string, string>> {
  const index = join(dist, 'index.html');
  const page = await lstat(index).catch(() => undefined);
  if (page === undefined || !page.isFile()) {
    throw new Error(`${index} is missing or not a file: run \`pnpm build\` first.`);
  }
  const assets: [key: string, file: string][] = [];
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      const name = relative(dist, file).split(sep).join('/');
      if (entry.isSymbolicLink()) {
        throw new Error(
          `${name} is a link: the executable holds only the regular files of the build.`,
        );
      }
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) assets.push([`${APP_ASSET_PREFIX}${name}`, file]);
      else throw new Error(`${name} is not a regular file, and the executable holds only those.`);
    }
  };
  await walk(dist);
  assets.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(assets);
}

/** What the sea-config names. */
export interface SeaConfigInput {
  /** The bundled script. */
  main: string;
  /** Where Node.js writes the preparation blob. */
  output: string;
  /** The executable's assets, by key. */
  assets: Record<string, string>;
  /** Whether to compile the script into V8's code cache now, so that it starts faster. */
  codeCache?: boolean;
}

/**
 * The sea-config of the executable: its script, with V8's code cache unless told otherwise, and the
 * app as assets. The executable takes no Node.js options from its command line, and prints no
 * warning that single executables are experimental.
 */
export function seaConfig(input: SeaConfigInput) {
  return {
    main: input.main,
    output: input.output,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: input.codeCache ?? true,
    assets: input.assets,
  };
}

/** A search path without the folders that hold Node.js, so that a program run with it finds none. */
export function withoutNode(path: string, platform: NodeJS.Platform = process.platform): string {
  const node = platform === 'win32' ? 'node.exe' : 'node';
  return path
    .split(delimiter)
    .filter((folder) => folder !== '' && !existsSync(join(folder, node)))
    .join(delimiter);
}

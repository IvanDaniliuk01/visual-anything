/**
 * Makes the single executable of the local program for this system and processor (ADR 0037), in
 * `dist-exe/`, following Node.js's documented steps for single executable applications:
 *
 * 1. bundle the server, with what it imports from core and schema, into one CommonJS script;
 * 2. write a sea-config that embeds that script, with V8's code cache, and every file of the built
 *    app as an asset;
 * 3. have this Node.js prepare the blob to inject (`node --experimental-sea-config`);
 * 4. copy this Node.js and inject the blob into the copy with postject; on macOS, remove its
 *    signature first and sign it ad hoc afterwards, so that it runs at all. On Windows it stays
 *    unsigned: postject rewrites the file without Node.js's signature, which no longer matched.
 *
 * The executable holds the Node.js that runs this script. `pnpm package` builds the app first; run
 * on its own, this script expects the app already built in `packages/app/dist`.
 *
 *   tsx packages/server/scripts/package.ts [--no-code-cache]
 */
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { inject } from 'postject';
import {
  APP_DIST,
  MACHO_SEGMENT,
  OUT_DIR,
  REPOSITORY,
  SEA_FUSE,
  SEA_RESOURCE,
  bundleServer,
  collectAppAssets,
  executableName,
  seaConfig,
} from './sea';

const { values } = parseArgs({ options: { 'no-code-cache': { type: 'boolean' } } });
const started = performance.now();
const shown = (path: string) => relative(REPOSITORY, path).replaceAll('\\', '/');
const say = (line: string) => console.log(`[package] ${line}`);

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  throw new Error(`Visual Anything needs Node.js 22.13 or later, and this is ${process.version}.`);
}

const build = join(OUT_DIR, 'build');
await rm(build, { recursive: true, force: true });
await mkdir(build, { recursive: true });
const main = join(build, 'visual-anything.cjs');
const blob = join(build, 'sea-prep.blob');
const config = join(build, 'sea-config.json');
const executable = join(OUT_DIR, executableName(process.platform));

say(`Bundling the server into ${shown(main)}`);
await bundleServer(main);

const assets = await collectAppAssets(APP_DIST);
say(`Embedding the ${Object.keys(assets).length} files of ${shown(APP_DIST)}`);
const codeCache = values['no-code-cache'] !== true;
await writeFile(
  config,
  `${JSON.stringify(seaConfig({ main, output: blob, assets, codeCache }), null, 2)}\n`,
);

say(
  `Preparing the blob with Node.js ${process.versions.node}${codeCache ? ', with its code cache' : ''}`,
);
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });

say(`Copying Node.js to ${shown(executable)} and injecting the blob`);
await rm(executable, { force: true });
await copyFile(process.execPath, executable);
if (process.platform !== 'win32') await chmod(executable, 0o755);
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--remove-signature', executable], { stdio: 'inherit' });
}
await inject(executable, SEA_RESOURCE, await readFile(blob), {
  sentinelFuse: SEA_FUSE,
  ...(process.platform === 'darwin' ? { machoSegmentName: MACHO_SEGMENT } : {}),
});

if (process.platform === 'darwin') {
  say('Signing it ad hoc, as macOS runs no executable without a signature');
  execFileSync('codesign', ['--sign', '-', executable], { stdio: 'inherit' });
}

const size = (await stat(executable)).size / 1024 / 1024;
const seconds = (performance.now() - started) / 1000;
say(
  `Made ${shown(executable)}, ${size.toFixed(1)} MiB, for ${process.platform} ${process.arch}, in ${seconds.toFixed(0)} s.`,
);

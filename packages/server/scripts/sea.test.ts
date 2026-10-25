import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Metafile } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ASSET_PREFIX } from '../src/executable';
import {
  SEA_FUSE,
  bundleServer,
  collectAppAssets,
  executableName,
  seaConfig,
  withoutNode,
} from './sea';

const run = promisify(execFile);

let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-sea-'));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

describe('executableName', () => {
  it('ends in .exe on Windows only', () => {
    expect(executableName('win32')).toBe('visual-anything.exe');
    expect(executableName('darwin')).toBe('visual-anything');
    expect(executableName('linux')).toBe('visual-anything');
  });
});

describe('the fuse', () => {
  it('is the sentinel Node.js looks for, as its documentation names it', () => {
    expect(SEA_FUSE).toBe('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2');
  });
});

describe('collectAppAssets', () => {
  it('holds every file of the build under its path, in order, and nothing else', async () => {
    const dist = join(folder, 'dist');
    await mkdir(join(dist, 'assets', 'fonts'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<!doctype html>');
    await writeFile(join(dist, 'assets', 'index-3f2a.js'), 'app');
    await writeFile(join(dist, 'assets', 'fonts', 'inter.woff2'), 'font');
    expect(await collectAppAssets(dist)).toEqual({
      [`${APP_ASSET_PREFIX}assets/fonts/inter.woff2`]: join(dist, 'assets', 'fonts', 'inter.woff2'),
      [`${APP_ASSET_PREFIX}assets/index-3f2a.js`]: join(dist, 'assets', 'index-3f2a.js'),
      [`${APP_ASSET_PREFIX}index.html`]: join(dist, 'index.html'),
    });
  });

  it('refuses a build without its page', async () => {
    const empty = join(folder, 'empty');
    await mkdir(empty);
    await expect(collectAppAssets(empty)).rejects.toThrow(/index\.html.*pnpm build/);
  });

  it('refuses a link in the build, which could carry a file from elsewhere into the executable', async (context) => {
    const dist = join(folder, 'linked');
    await mkdir(dist);
    await writeFile(join(dist, 'index.html'), '<!doctype html>');
    await writeFile(join(folder, 'secret.txt'), 'secret');
    try {
      await symlink(join(folder, 'secret.txt'), join(dist, 'secret.txt'), 'file');
    } catch {
      context.skip(
        'This user may not make symbolic links here: Windows lets only Developer Mode or an administrator make them.',
      );
    }
    await expect(collectAppAssets(dist)).rejects.toThrow(/secret\.txt is a link/);
  });
});

describe('seaConfig', () => {
  it('embeds the bundle with its code cache, and the app as assets, without the experimental warning', () => {
    const assets = { 'app/index.html': '/build/dist/index.html' };
    expect(seaConfig({ main: '/b/main.cjs', output: '/b/prep.blob', assets })).toEqual({
      main: '/b/main.cjs',
      output: '/b/prep.blob',
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
      assets,
    });
    expect(
      seaConfig({ main: '/b/main.cjs', output: '/b/prep.blob', assets, codeCache: false }),
    ).toMatchObject({ useCodeCache: false });
  });
});

describe('withoutNode', () => {
  it('leaves out every folder that holds Node.js', async () => {
    const withNode = join(folder, 'with-node');
    const other = join(folder, 'other');
    await mkdir(withNode);
    await mkdir(other);
    await writeFile(join(withNode, process.platform === 'win32' ? 'node.exe' : 'node'), '');
    const delimiter = process.platform === 'win32' ? ';' : ':';
    expect(withoutNode([withNode, other].join(delimiter))).toBe(other);
  });
});

describe('bundleServer', () => {
  let bundle: string;
  let metafile: Metafile;

  beforeAll(async () => {
    bundle = join(folder, 'bundle', 'visual-anything.cjs');
    metafile = await bundleServer(bundle);
  }, 60_000);

  it('makes one CommonJS script that needs nothing but Node.js built-ins', () => {
    const imports = Object.values(metafile.outputs).flatMap((output) => output.imports);
    const outside = imports
      .filter((each) => each.external && !isBuiltin(each.path))
      .map((each) => `${each.kind} ${each.path}`);
    // Only what is never loaded in the executable: Vite for dev mode, and ws's optional add-ons.
    expect(outside.sort()).toEqual([
      'dynamic-import vite',
      'require-call bufferutil',
      'require-call utf-8-validate',
    ]);
  });

  it('runs as the command, and as Claude’s entry point', async () => {
    const help = await run(process.execPath, [bundle, '--help']);
    expect(help.stdout).toMatch(/^Usage: visual-anything \[open\] \[folder\]/);
    expect(help.stdout).toContain('visual-anything mcp [folder]');
    const mcp = await run(process.execPath, [bundle, 'mcp', '--help']);
    expect(mcp.stderr).toMatch(/^Usage: visual-anything mcp \[folder\]/);
  }, 30_000);
});

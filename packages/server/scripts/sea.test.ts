import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Metafile } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ASSET_PREFIX } from '../src/executable';
import { box, inputGlb } from '../src/solids/test/gltf';
import { testProject, writeProjectFolder } from '../src/test-support';
import { repositoryAddress } from './notices';
import {
  SEA_FUSE,
  bundleDrawingWorkerBeside,
  bundleServer,
  bundleSolidWorkerBeside,
  collectAppAssets,
  executableName,
  programAssets,
  seaConfig,
  withoutNode,
  writeNotices,
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

describe('repositoryAddress', () => {
  it('gives an address a browser opens for each way package.json writes a repository', () => {
    expect(repositoryAddress('git+https://github.com/vercel/satori.git')).toBe(
      'https://github.com/vercel/satori',
    );
    expect(repositoryAddress('git://github.com/opentypejs/opentype.js')).toBe(
      'https://github.com/opentypejs/opentype.js',
    );
    expect(repositoryAddress('ajv-validator/ajv')).toBe('https://github.com/ajv-validator/ajv');
    expect(repositoryAddress('github:inikulin/parse5')).toBe('https://github.com/inikulin/parse5');
    expect(repositoryAddress('git@gitlab.com:a/b.git')).toBe('https://gitlab.com/a/b');
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

  it('holds none of the converter that makes drawings, which its worker holds (ADR 0068)', () => {
    const inputs = Object.keys(metafile.inputs).map((input) => input.replaceAll('\\', '/'));
    expect(
      inputs.filter((input) => /node_modules\/(parse5|satori|harfbuzzjs)\//.test(input)),
    ).toEqual([]);
    expect(inputs.some((input) => input.endsWith('src/drawings/make.ts'))).toBe(true);
  });

  it('holds none of the glTF reader nor meshoptimizer, which the cleaner’s worker holds (ADR 0075)', () => {
    const inputs = Object.keys(metafile.inputs).map((input) => input.replaceAll('\\', '/'));
    expect(
      inputs.filter((input) =>
        /node_modules\/(@gltf-transform|meshoptimizer|property-graph)\//.test(input),
      ),
    ).toEqual([]);
    expect(inputs.some((input) => input.endsWith('src/solids/cleaner.ts'))).toBe(true);
  });

  describe('with the solid cleaner’s worker beside it', () => {
    let worker: { file: string; metafile: Metafile };

    beforeAll(async () => {
      worker = await bundleSolidWorkerBeside(bundle);
    }, 120_000);

    it('imports a glTF file as a solid, as the executable does', async () => {
      const project = join(folder, 'solid-project');
      await writeProjectFolder(project, testProject());
      await writeFile(
        join(folder, 'part.glb'),
        inputGlb({ nodes: [{ name: 'part', mesh: 0 }], meshes: [box()] }),
      );
      const imported = await run(
        process.execPath,
        [bundle, 'import', project, join(folder, 'part.glb')],
        {
          env: { ...process.env, VISUAL_ANYTHING_RUNTIME: join(folder, 'run') },
        },
      );
      expect(imported.stdout).toContain(
        'Done: Import "part.glb" as a solid, as one action you can undo in the app.',
      );
    }, 60_000);

    it('writes the glTF reader and meshoptimizer into the notice', async () => {
      const text = await writeNotices(
        [metafile, worker.metafile],
        join(folder, 'SOLID-NOTICES.txt'),
        '24.0.0',
      );
      expect(text).toMatch(/@gltf-transform\/core 4\.5\.1\n {2}License: MIT/);
      expect(text).toMatch(/@gltf-transform\/extensions 4\.5\.1\n {2}License: MIT/);
      expect(text).toMatch(
        /meshoptimizer 1\.3\.0\n {2}License: MIT\n {2}Source: https:\/\/github\.com\/zeux\/meshoptimizer/,
      );
      expect(text).toContain('the WebAssembly of its decoder and simplifier');
      expect(text).toMatch(/property-graph \d/);
    });
  });

  describe('with the drawing’s worker beside it', () => {
    let worker: { file: string; metafile: Metafile };

    beforeAll(async () => {
      worker = await bundleDrawingWorkerBeside(bundle);
    }, 120_000);

    it('makes a drawing of an HTML file, as the executable does', async () => {
      const project = join(folder, 'drawing-project');
      await writeProjectFolder(project, testProject());
      await writeFile(
        join(folder, 'card.html'),
        '<div style="padding: 8px; border: 1px solid #000"><b>Card</b><script>x()</script></div>',
      );
      const imported = await run(
        process.execPath,
        [bundle, 'import', project, join(folder, 'card.html')],
        {
          env: { ...process.env, VISUAL_ANYTHING_RUNTIME: join(folder, 'run') },
        },
      );
      expect(imported.stdout).toContain('  1 script element');
      expect(imported.stdout).toContain(
        'Done: Import "card.html" as a drawing, as one action you can undo in the app.',
      );
    }, 60_000);

    it('writes the notice of the code they bundle, satori’s source among it', async () => {
      const text = await writeNotices(
        [metafile, worker.metafile],
        join(folder, 'NOTICES.txt'),
        '24.0.0',
      );
      expect(text).toMatch(
        /satori 0\.47\.1\n {2}License: MPL-2\.0\n {2}Source: https:\/\/github\.com\/vercel\/satori/,
      );
      expect(text).toMatch(/parse5 8\.0\.1\n {2}License: MIT/);
      expect(text).toMatch(/ws \d/);
      expect(text).toContain('Node.js 24.0.0');
      expect(text).toContain('Roboto 2.137 Regular, Medium, Bold, Italic and Bold Italic');
      expect(text).toMatch(
        /Roboto Mono 3\.000 Regular, which the PDF export writes code in\n {2}License: Apache-2\.0/,
      );
      expect(programAssets(worker.file, 's.cjs', 'n.txt')).toEqual({
        'drawings/worker.cjs': worker.file,
        'solids/worker.cjs': 's.cjs',
        'NOTICES.txt': 'n.txt',
      });
    });
  });
});

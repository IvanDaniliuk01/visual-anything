/**
 * The notice of the code a single executable bundles (ADR 0037, ADR 0068, ADR 0075): every npm
 * package esbuild put in the server's bundle, the drawing's worker or the solid cleaner's worker,
 * with its version, its license and where its source is, then Node.js and the fonts. MPL-2.0 asks
 * those who ship satori in an executable to say where its source can be had; this says so for every
 * package. `pnpm package` writes it beside the executable and holds it as an asset, which
 * `visual-anything notices` prints.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Metafile } from 'esbuild';

/** A package the bundles hold, as its package.json says. */
export interface BundledPackage {
  name: string;
  version: string;
  license: string;
  /** Where its source is: its repository, or its npm package. */
  source: string;
}

/** The folder of each npm package the bundles' inputs come from, by `name@version`. */
export function packageFolders(metafiles: readonly Metafile[], root: string): string[] {
  const folders = new Set<string>();
  for (const metafile of metafiles) {
    for (const input of Object.keys(metafile.inputs)) {
      const parts = input.split(/[\\/]/);
      const at = parts.lastIndexOf('node_modules');
      if (at < 0) continue;
      const scoped = parts[at + 1]?.startsWith('@') === true;
      const end = at + (scoped ? 3 : 2);
      if (parts.length < end) continue;
      folders.add(join(root, ...parts.slice(0, end)));
    }
  }
  return [...folders].sort();
}

/** What each package's package.json says of it. */
export async function bundledPackages(folders: readonly string[]): Promise<BundledPackage[]> {
  const found = new Map<string, BundledPackage>();
  for (const folder of folders) {
    const manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8')) as {
      name?: string;
      version?: string;
      license?: string | { type?: string };
      repository?: string | { url?: string };
      homepage?: string;
    };
    if (manifest.name === undefined || manifest.version === undefined) continue;
    const license =
      typeof manifest.license === 'string'
        ? manifest.license
        : (manifest.license?.type ?? 'see its files');
    const repository =
      typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    const tarball = `https://registry.npmjs.org/${manifest.name}/-/${manifest.name.split('/').pop() ?? manifest.name}-${manifest.version}.tgz`;
    found.set(`${manifest.name}@${manifest.version}`, {
      name: manifest.name,
      version: manifest.version,
      license,
      source:
        repository === undefined ? tarball : `${repositoryAddress(repository)}, and ${tarball}`,
    });
  }
  return [...found.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * A repository as an address a browser opens: `git+https://host/a/b.git`, `git://host/a/b`,
 * `git@host:a/b`, `github:a/b` and npm's shorthand `a/b` all become `https://host/a/b`, GitHub's
 * for the last two.
 */
export function repositoryAddress(repository: string): string {
  const plain = repository
    .trim()
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
  const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(plain);
  if (shorthand) return `https://github.com/${shorthand[1] ?? ''}`;
  const ssh = /^git@([\w.-]+):(.+)$/.exec(plain);
  if (ssh) return `https://${ssh[1] ?? ''}/${ssh[2] ?? ''}`;
  return plain.replace(/^(git|ssh):\/\/(git@)?/, 'https://');
}

/** The notice, as text. */
export function noticeText(packages: readonly BundledPackage[], nodeVersion: string): string {
  const lines = [
    'Visual Anything, single executable: the code it bundles',
    '',
    'This executable holds Node.js and the npm packages below, bundled unchanged by esbuild, each',
    "under its own license. Each package's source, its license text included, is at the address",
    'given, and in its npm package. satori is under the Mozilla Public License 2.0: its source code',
    'form is at those addresses, as section 3.2 of that license asks.',
    '',
  ];
  for (const each of packages) {
    lines.push(
      `${each.name} ${each.version}`,
      `  License: ${each.license}`,
      `  Source: ${each.source}`,
      '',
    );
    // What meshoptimizer's own files hold, compiled: its decoder and simplifier (ADR 0075).
    if (each.name === 'meshoptimizer') {
      lines.push(
        '  It holds, in its own files, the WebAssembly of its decoder and simplifier, built from',
        '  its own C++ sources, under the same license, at the same address.',
        '',
      );
    }
    // What satori's own files hold, compiled: its layout engine and its text shaping.
    if (each.name === 'satori') {
      lines.push(
        '  It holds, in its own files, the WebAssembly of HarfBuzz, from harfbuzzjs (MIT,',
        '  https://github.com/harfbuzz/harfbuzzjs), and of its layout engine, Taffy (MIT,',
        '  https://github.com/DioxusLabs/taffy).',
        '',
      );
    }
  }
  lines.push(
    `Node.js ${nodeVersion}`,
    '  License: MIT, with the licenses of what it bundles in its LICENSE file',
    `  Source: https://github.com/nodejs/node/tree/v${nodeVersion}`,
    '',
    'Roboto 2.137 Regular, Bold, Italic and Bold Italic, which drawings of HTML and the PDF export are written in',
    '  License: Apache-2.0',
    '  Source: the npm package roboto-fontface 0.10.0, https://registry.npmjs.org/roboto-fontface/-/roboto-fontface-0.10.0.tgz',
    '',
    'Roboto Mono 3.000 Regular, which the PDF export writes code in',
    '  License: Apache-2.0',
    '  Source: the npm package typeface-roboto-mono 1.1.13, https://registry.npmjs.org/typeface-roboto-mono/-/typeface-roboto-mono-1.1.13.tgz',
    '',
  );
  return lines.join('\n');
}

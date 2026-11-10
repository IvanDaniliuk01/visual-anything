/**
 * The notice of the third-party code, data and pictures Visual Anything ships (ADR 0047's
 * clarification of 2026-11-03), written to `THIRD-PARTY-NOTICES.md` at the repository's root by
 * `pnpm notices` (`notices-write.ts`). It names every npm package that a production build put in
 * what ships: the app and its workers, the read-only page and its solid worker (from the lists the
 * Vite builds write, `app/vite.shipped.ts`), and the single executable's server, drawing worker and
 * solid cleaner (from esbuild's metafiles). Each package comes with its version, its license, where
 * its source is, which part ships it, and the license and NOTICE files its package holds, as MIT,
 * BSD, ISC and Apache-2.0 ask. The text depends on nothing but those packages, so it is stable.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledPackages, type BundledPackage } from './notices';

/** The file at the repository's root. */
export const THIRD_PARTY_FILE = 'THIRD-PARTY-NOTICES.md';

/** The parts of Visual Anything that ship code, by the label each build lists its modules under. */
export const PARTS: Record<string, string> = {
  app: 'the app',
  worker: "the app's workers",
  viewer: 'the read-only page',
  'viewer-solid-worker': "the read-only page's solid worker",
  server: 'the single executable',
  'drawing-worker': "the single executable's drawing worker",
  'solid-cleaner': "the single executable's solid cleaner",
};

const ORDER = Object.keys(PARTS);

/** The npm package folder each path under `node_modules` is in, query and null prefix taken off. */
export function packageFoldersOfPaths(paths: Iterable<string>, root: string): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    const plain = path.replace(/^\0/, '').replace(/\?.*$/, '');
    const parts = plain.split(/[\\/]/);
    const at = parts.lastIndexOf('node_modules');
    if (at < 0) continue;
    const scoped = parts[at + 1]?.startsWith('@') === true;
    const end = at + (scoped ? 3 : 2);
    if (parts.length < end) continue;
    const kept = parts.slice(0, end);
    // An absolute path keeps its root: `C:` on Windows, the empty first part elsewhere.
    folders.add(isAbsolute(plain) ? kept.join('/') : join(root, ...kept));
  }
  return [...folders].sort();
}

/** A package that ships, with the parts that ship it and the files its license asks to keep. */
export interface ShippedPackage extends BundledPackage {
  parts: string[];
  /** Each license or NOTICE file of its package, by file name, as the package has it. */
  files: { name: string; text: string }[];
  /** Its package.json's author, the copyright holder of a package that holds no license file. */
  author?: string;
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** The license and NOTICE files at the top of a package's folder, by name. */
export async function licenseFiles(folder: string): Promise<{ name: string; text: string }[]> {
  const names = (await readdir(folder)).filter((name) => LICENSE_FILE.test(name)).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      text: (await readFile(join(folder, name), 'utf8')).replace(/\r\n?/g, '\n').trimEnd(),
    })),
  );
}

/** The packages each part ships, merged: one entry per package, with every part that ships it. */
export async function shippedPackages(
  foldersByPart: Readonly<Record<string, readonly string[]>>,
): Promise<ShippedPackage[]> {
  const merged = new Map<string, ShippedPackage>();
  for (const [part, folders] of Object.entries(foldersByPart)) {
    for (const folder of folders) {
      const [each] = await bundledPackages([folder]);
      if (each === undefined) continue;
      const key = `${each.name}@${each.version}`;
      const known = merged.get(key);
      if (known) {
        if (!known.parts.includes(part)) known.parts.push(part);
        continue;
      }
      const files = await licenseFiles(folder);
      const manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8')) as {
        author?: string | { name?: string };
      };
      const author = typeof manifest.author === 'string' ? manifest.author : manifest.author?.name;
      // A package.json that names no license, whose license file is the MIT License, as png-js's.
      const license =
        each.license === 'see its files' && /^\s*(The )?MIT License/i.test(files[0]?.text ?? '')
          ? 'MIT'
          : each.license;
      merged.set(key, {
        ...each,
        license,
        parts: [part],
        files,
        ...(author === undefined ? {} : { author }),
      });
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1,
  );
}

/**
 * What a package's license or its make-up asks the notice to say beyond its files: where the source
 * of copyleft code is, what was changed, and what a package holds compiled from others.
 */
export const PACKAGE_NOTES: Record<string, string> = {
  elkjs:
    'Offered under EPL-2.0 or GPL-3.0-or-later; Visual Anything takes it under the Eclipse Public License 2.0. It ships unchanged, as the JavaScript its npm package holds. Its Source Code is available at https://github.com/kieler/elkjs, and that of the Eclipse Layout Kernel it is compiled from at https://github.com/eclipse/elk, as section 3 of the license asks.',
  satori:
    'Mozilla Public License 2.0. It ships unchanged; its source code form is at the addresses above, as section 3.2 of the license asks. It holds, in its own files, the WebAssembly of HarfBuzz, from harfbuzzjs (MIT, https://github.com/harfbuzz/harfbuzzjs), and of its layout engine, Taffy (MIT, https://github.com/DioxusLabs/taffy).',
  'pixi.js':
    'Changed by Visual Anything: `patches/pixi.js@8.22.0.patch` in this repository measures the kerning of a pair of characters in the order they are drawn, in `DynamicBitmapFont`.',
  meshoptimizer:
    'It holds, in its own files, the WebAssembly of its decoder and simplifier, built from its own C++ sources, under the same license, at the same address.',
  '@jitl/quickjs-singlefile-browser-release-sync':
    'It holds QuickJS (MIT, Copyright (c) 2017-2021 Fabrice Bellard and Charlie Gordon, https://bellard.org/quickjs/) compiled to WebAssembly by quickjs-emscripten, with the Emscripten runtime (MIT, https://github.com/emscripten-core/emscripten).',
};

/** What ships that is not npm code: fonts, pictures, solids and data. */
export function contentSection(robotoLicense: string, katexFontsLicense: string): string {
  return [
    '## Fonts, pictures and data',
    '',
    'Only content under a license on ADR 0047’s list ships (CC0-1.0, CC-BY-4.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, CC-PDM-1.0 and the public domain), and fonts under the SIL Open Font License 1.1, unchanged and with their license (ADR 0108).',
    '',
    '### Roboto 2.137 Regular, Medium, Bold, Italic and Bold Italic',
    '',
    '- License: Apache-2.0',
    '- Source: the npm package roboto-fontface 0.10.0, https://registry.npmjs.org/roboto-fontface/-/roboto-fontface-0.10.0.tgz, taken unchanged.',
    '- Ships in: the PDF export (`packages/app/src/export/fonts/`) and drawings of HTML (`packages/server/src/drawings/fonts/`), each with this license beside it as `LICENSE-roboto.txt`. The canvas names Roboto but ships no font for it.',
    '',
    '### Roboto Mono 3.000 Regular',
    '',
    '- License: Apache-2.0, as the font’s name table gives it; the npm package’s own files are MIT.',
    '- Source: the npm package typeface-roboto-mono 1.1.13, https://registry.npmjs.org/typeface-roboto-mono/-/typeface-roboto-mono-1.1.13.tgz, taken unchanged.',
    '- Ships in: the PDF export, which writes code in it (`packages/app/src/export/fonts/roboto-emphasis.json`).',
    '',
    'The license of both fonts, as `LICENSE-roboto.txt` holds it:',
    '',
    '```text',
    robotoLicense,
    '```',
    '',
    '### KaTeX fonts 0.19.1',
    '',
    '- License: OFL-1.1, as each font’s name table gives it; the code of the npm package katex is MIT and is named above.',
    '- Source: the npm package katex 0.19.1, https://registry.npmjs.org/katex/-/katex-0.19.1.tgz, its twenty fonts taken unchanged.',
    '- Ships in: the app (the woff2 files, for the canvas and the panels) and the read-only page (the families its project uses); and, read from the TrueType files, the tables of advance widths and glyph outlines in `packages/core/src/math/advances.json` and `outlines.json`, under the same license, which Math lays out and exports with (ADR 0106). SVG and PDF exports that draw glyphs from them are documents, which the license does not reach.',
    '',
    'Their license, as `packages/core/src/math/LICENSE-katex-fonts.txt` holds it:',
    '',
    '```text',
    katexFontsLicense,
    '```',
    '',
    '### Icons, pictures, solids and samples',
    '',
    '- The built-in packages (Systems, Data modeling and the starter packages), their icons, and every sample in `examples/`, its pictures and its solids (`examples/robot-arm/solids/*.glb`, made by `packages/server/scripts/robot-arm-solid.ts` and `workcell-solids.ts`), are written and drawn for Visual Anything and are CC0-1.0, credited to "Visual Anything contributors". Each records its license and source in its package file, and `core/src/builtin/licenses.test.ts` holds them to ADR 0047’s list.',
    '- No third-party icon set, picture or glTF file ships.',
    '',
  ].join('\n');
}

/** The packages in a notice, by the headings it writes: `name version` each. */
export function namedPackages(markdown: string): { name: string; version: string }[] {
  return [...markdown.matchAll(/^### `(\S+)` (\S+)$/gm)].map((match) => ({
    name: match[1] ?? '',
    version: match[2] ?? '',
  }));
}

/** The packages, as `name@version`, that a notice does not name. */
export function unnamedPackages(
  packages: readonly { name: string; version: string }[],
  markdown: string,
): string[] {
  const named = new Set(namedPackages(markdown).map((each) => `${each.name}@${each.version}`));
  return packages.map((each) => `${each.name}@${each.version}`).filter((key) => !named.has(key));
}

/**
 * The permissive licenses, which ask only that their notice travel: a package under any other is
 * flagged at the top of the notice, not removed.
 */
export const PERMISSIVE = new Set([
  'MIT',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'CC0-1.0',
  'Unlicense',
  'Zlib',
]);

const MIT_TEXT = `MIT License

Copyright (c) <the author named for the package>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** The notice, as Markdown. */
export function thirdPartyMarkdown(packages: readonly ShippedPackage[], content: string): string {
  const flagged = packages.filter((each) => !PERMISSIVE.has(each.license));
  const lines = [
    '# Third-party notices',
    '',
    '<!-- Written by `pnpm notices` (packages/server/scripts/notices-write.ts). Do not edit by hand. -->',
    '',
    'Visual Anything is under the MIT License (`LICENSE`). What it ships from others is below, each under its own license: every npm package a production build puts in the app, its workers, the read-only page it exports, or the single executable, and the fonts, pictures and data it ships. The single executable also holds Node.js, under the MIT License with the licenses of what Node.js bundles; its notice, `THIRD-PARTY-NOTICES.txt` beside it, names the version.',
    '',
    `## Code from npm (${packages.length} packages)`,
    '',
    flagged.length === 0
      ? 'Every package is under a permissive license.'
      : `Not under a permissive license, and shipped as their licenses allow: ${flagged.map((each) => `\`${each.name}\` (${each.license})`).join(', ')}. The notes under each say how.`,
    '',
  ];
  for (const each of packages) {
    lines.push(
      `### \`${each.name}\` ${each.version}`,
      '',
      `- License: ${each.license}`,
      `- Source: ${each.source}`,
      `- Ships in: ${[...each.parts]
        .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
        .map((part) => PARTS[part] ?? part)
        .join(', ')}`,
    );
    const note = PACKAGE_NOTES[each.name];
    if (note !== undefined) lines.push(`- Note: ${note}`);
    lines.push('');
    if (each.files.length === 0) {
      lines.push(
        `Its package holds no license file; its package.json gives the license as ${each.license}${each.author === undefined ? '' : `, and its author as ${each.author}`}.${each.license === 'MIT' ? ' The MIT License’s text is under "The MIT License" below.' : ''}`,
        '',
      );
    }
    for (const file of each.files) {
      lines.push(`<details><summary>${file.name}</summary>`, '', '```text', file.text, '```', '');
      lines.push('</details>', '');
    }
  }
  if (packages.some((each) => each.files.length === 0 && each.license === 'MIT')) {
    lines.push(
      '### The MIT License',
      '',
      'For the packages above that hold no license file, with the author named for each as the copyright holder:',
      '',
      '```text',
      MIT_TEXT,
      '```',
      '',
    );
  }
  lines.push(content);
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The license of KaTeX's fonts, which ship unchanged under the SIL Open Font License (ADR 0108). */
const KATEX_FONTS_LICENSE = fileURLToPath(
  new URL('../../core/src/math/LICENSE-katex-fonts.txt', import.meta.url),
);

/** Reads what `bundledPackages` needs from `foldersByPart` and writes the whole notice. */
export async function thirdPartyNotice(
  foldersByPart: Readonly<Record<string, readonly string[]>>,
  robotoLicensePath: string,
): Promise<string> {
  const read = async (path: string) =>
    (await readFile(path, 'utf8')).replace(/\r\n?/g, '\n').trimEnd();
  return thirdPartyMarkdown(
    await shippedPackages(foldersByPart),
    contentSection(await read(robotoLicensePath), await read(KATEX_FONTS_LICENSE)),
  );
}

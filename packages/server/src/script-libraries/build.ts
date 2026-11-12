/**
 * Choosing the file a script library keeps from its tarball (ADR 0107): version 1 takes a single file
 * that runs as a classic script and sets a global, a UMD or IIFE build, which the frame inlines.
 *
 * The file is the one the asker named, or else the first of the version's `unpkg`, `jsdelivr`,
 * `browser` and `main` that is such a build. Whether it is one is read, never run: V8 parses it as a
 * classic script (`vm.Script`, which compiles and runs nothing), so that a module, with its `import`
 * and `export`, fails; and the global is the asker's, the one a well-known library sets, or the one
 * its UMD or IIFE wrapper assigns. A package with only modules, ESM or CommonJS, such as three.js, is
 * refused with that reason.
 */
import { Script } from 'node:vm';
import { LIBRARY_GLOBAL } from '@visual-anything/core';

/** The globals the libraries ADR 0107 names set, by their npm packages. */
export const KNOWN_GLOBALS: Readonly<Record<string, string>> = {
  d3: 'd3',
  'plotly.js-dist': 'Plotly',
  'plotly.js-dist-min': 'Plotly',
  'plotly.js': 'Plotly',
  'function-plot': 'functionPlot',
  jsxgraph: 'JXG',
  'chart.js': 'Chart',
  katex: 'katex',
  mathjs: 'math',
};

/** What a candidate file is. */
export type BuildRead =
  | { ok: true; global: string }
  | { ok: false; kind: 'module' | 'commonjs' | 'no-global' | 'not-script'; reason: string };

/** How far into a file its wrapper is looked for. */
const HEAD_CHARS = 64 * 1024;

/** The paths the version's document offers, in the order they are tried. */
export function candidatePaths(document: Record<string, unknown>): string[] {
  const paths: string[] = [];
  for (const field of ['unpkg', 'jsdelivr', 'browser', 'main']) {
    const value = document[field];
    if (typeof value === 'string' && value !== '') paths.push(normalizePath(value));
  }
  paths.push('index.js');
  return [...new Set(paths)];
}

/** A path as a package's document writes it, made a path inside the package. */
export function normalizePath(path: string): string {
  return path.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
}

/** Whether a file is a single-file build that sets a global, and which. */
export function readBuild(
  path: string,
  text: string,
  options: { npm: string; global?: string; packageType?: unknown },
): BuildRead {
  // A `.mjs` file is a module by its name; a `.js` one in a package of modules is one unless its
  // wrapper sets a global, as a UMD build does.
  if (
    path.endsWith('.mjs') ||
    (options.packageType === 'module' && path.endsWith('.js') && wrapperGlobal(text) === undefined)
  ) {
    return {
      ok: false,
      kind: 'module',
      reason: `"${path}" is an ES module, which the frame cannot load`,
    };
  }
  try {
    new Script(text, { filename: path });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/import|export|module/i.test(message)) {
      return {
        ok: false,
        kind: 'module',
        reason: `"${path}" is an ES module, which the frame cannot load`,
      };
    }
    return {
      ok: false,
      kind: 'not-script',
      reason: `"${path}" is not JavaScript the frame can run`,
    };
  }
  const global = options.global ?? KNOWN_GLOBALS[options.npm] ?? wrapperGlobal(text);
  if (global !== undefined && LIBRARY_GLOBAL.test(global)) return { ok: true, global };
  if (path.endsWith('.cjs') || /\bmodule\.exports\b|\bexports\.[A-Za-z_$]/.test(text)) {
    return {
      ok: false,
      kind: 'commonjs',
      reason: `"${path}" is a CommonJS module that sets no global`,
    };
  }
  return {
    ok: false,
    kind: 'no-global',
    reason: `"${path}" sets no global that can be told; name the global it sets`,
  };
}

/**
 * The global a UMD or IIFE wrapper assigns, from the start of the file: `global.d3 = …`,
 * `root["katex"] = …`, `self.Chart = …`, or `var JXG = (function …`.
 */
export function wrapperGlobal(text: string): string | undefined {
  const head = text.slice(0, HEAD_CHARS);
  const patterns = [
    /\b(?:global|root|self|globalThis|window)\.([A-Za-z_$][\w$]*)\s*=(?!=)/,
    /\b(?:global|root|self|globalThis|window)\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]\s*=(?!=)/,
    /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\s*)*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(head)?.[1];
    if (found !== undefined && LIBRARY_GLOBAL.test(found) && !NOT_GLOBALS.has(found)) return found;
  }
  return undefined;
}

/** Names a wrapper assigns that are not the library's global. */
const NOT_GLOBALS = new Set(['exports', 'module', 'define', 'prototype', 'constructor']);

/** The license text at the top of a package: `LICENSE`, `LICENCE`, `COPYING`, with any extension. */
export function licenseText(files: ReadonlyMap<string, Buffer>): Buffer | undefined {
  const names = [...files.keys()]
    .filter((path) => !path.includes('/') && /^(?:licen[cs]e|copying)(?:[.-][\w.-]*)?$/i.test(path))
    .sort();
  const first = names[0];
  return first === undefined ? undefined : files.get(first);
}

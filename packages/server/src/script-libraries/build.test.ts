/**
 * Choosing a script library's build (ADR 0107): a single file that runs as a classic script and sets
 * a global, read and never run; modules, ESM or CommonJS, refused with that reason.
 */
import { describe, expect, it } from 'vitest';
import { candidatePaths, licenseText, readBuild, wrapperGlobal } from './build';

const ROLLUP_UMD = `// https://d3js.org v7.9.0 Copyright 2010-2023 Mike Bostock
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
typeof define === 'function' && define.amd ? define(['exports'], factory) :
(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.d3 = global.d3 || {}));
})(this, (function (exports) { 'use strict'; exports.version = "7.9.0"; }));`;

const WEBPACK_UMD = `(function webpackUniversalModuleDefinition(root, factory) {
  if(typeof exports === 'object' && typeof module === 'object') module.exports = factory();
  else if(typeof define === 'function' && define.amd) define([], factory);
  else if(typeof exports === 'object') exports["katex"] = factory();
  else root["katex"] = factory();
})((typeof self !== 'undefined' ? self : this), function() { return {}; });`;

const IIFE = `/*! JSXGraph */\nvar JXG = (function () { return { version: '1.8' }; })();`;
const ESM = `export const REVISION = '170';\nexport class Scene {}`;
const CJS = `'use strict';\nObject.defineProperty(exports, '__esModule', { value: true });\nexports.REVISION = '170';`;

describe('readBuild', () => {
  it('takes UMD and IIFE builds and tells the global they set', () => {
    expect(readBuild('dist/d3.min.js', ROLLUP_UMD, { npm: 'something' })).toEqual({
      ok: true,
      global: 'd3',
    });
    expect(readBuild('dist/katex.js', WEBPACK_UMD, { npm: 'other' })).toEqual({
      ok: true,
      global: 'katex',
    });
    expect(readBuild('distrib/jsxgraphcore.js', IIFE, { npm: 'x' })).toEqual({
      ok: true,
      global: 'JXG',
    });
  });

  it('takes the asker’s global first, then the one a well-known library sets', () => {
    expect(readBuild('a.js', IIFE, { npm: 'x', global: 'Mine' })).toEqual({
      ok: true,
      global: 'Mine',
    });
    expect(readBuild('dist/chart.umd.js', '(function(){})();', { npm: 'chart.js' })).toEqual({
      ok: true,
      global: 'Chart',
    });
  });

  it('refuses an ES module, a CommonJS module, and a script whose global cannot be told', () => {
    expect(readBuild('build/three.module.js', ESM, { npm: 'three' })).toMatchObject({
      ok: false,
      kind: 'module',
    });
    expect(readBuild('build/three.module.min.mjs', IIFE, { npm: 'three' })).toMatchObject({
      ok: false,
      kind: 'module',
    });
    expect(readBuild('build/three.cjs', CJS, { npm: 'three' })).toMatchObject({
      ok: false,
      kind: 'commonjs',
    });
    expect(readBuild('a.js', '(function(){ return 1; })();', { npm: 'x' })).toMatchObject({
      ok: false,
      kind: 'no-global',
    });
    expect(readBuild('a.js', 'this is not javascript {', { npm: 'x' })).toMatchObject({
      ok: false,
      kind: 'not-script',
    });
  });

  it('never runs what it reads', () => {
    const marker = '__visualAnythingRan';
    const text = `globalThis.${marker} = true; var Lib = {};`;
    expect(readBuild('a.js', text, { npm: 'x' })).toEqual({ ok: true, global: marker });
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });
});

describe('candidatePaths', () => {
  it('tries unpkg, jsdelivr, browser and main, in that order, then index.js', () => {
    expect(
      candidatePaths({
        main: './build/three.cjs',
        browser: { './x': false },
        jsdelivr: './dist/chart.umd.js',
        unpkg: 'dist/chart.umd.js',
      }),
    ).toEqual(['dist/chart.umd.js', 'build/three.cjs', 'index.js']);
  });
});

describe('wrapperGlobal and licenseText', () => {
  it('passes over names a wrapper assigns that are no library’s global', () => {
    expect(wrapperGlobal('root.exports = factory();')).toBeUndefined();
  });

  it('finds the license text at the top of the package', () => {
    const files = new Map([
      ['dist/LICENSE', Buffer.from('deep')],
      ['LICENSE.md', Buffer.from('ISC')],
      ['README.md', Buffer.from('readme')],
    ]);
    expect(licenseText(files)?.toString()).toBe('ISC');
    expect(licenseText(new Map([['index.js', Buffer.from('x')]]))).toBeUndefined();
  });
});
